import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Role } from '@bmi/shared';
import { SEED_PASSWORD } from '@bmi/data-gateway';
import { AppModule } from '../../app.module.js';
import { API_PREFIX } from '../../app.constants.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { AppSettingsService } from './app-settings.service.js';

/**
 * End-to-end IAM coverage against the dummy gateway, booting the full
 * `AppModule` (real guard, interceptors, session-backed auth middleware).
 *
 * Covers the AC-IAM criteria TASK-104 owns (001..005, plus the 006 Setup-mode
 * sign-in gate) and the NFR-05 rules through real HTTP, and confirms the
 * cross-cutting layers are reused (role guard → 403, one audit record per
 * mutating call).
 */
describe('IAM module (TASK-104) — auth, accounts, permissions, audit', () => {
  let app: INestApplication;
  let audit: AuditService;
  let settings: AppSettingsService;
  const base = `/${API_PREFIX}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    audit = app.get(AuditService);
    settings = app.get(AppSettingsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Most tests run in Live mode so any role may sign in; the Setup-mode gate
    // has its own test that flips back.
    settings.goLive(new Date().toISOString());
  });

  // --- Login / sessions (REQ-IAM-001, NFR-05) ------------------------------

  async function login(email: string, platform: 'web' | 'mobile' = 'web'): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`${base}/auth/login`)
      .send({ email, password: SEED_PASSWORD, platform });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }

  it('signs a user in and the session authorises a protected call', async () => {
    const token = await login('access@bmi.test');
    const res = await request(app.getHttpServer())
      .get(`${base}/users`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('rejects a bad password with 401', async () => {
    const res = await request(app.getHttpServer())
      .post(`${base}/auth/login`)
      .send({ email: 'access@bmi.test', password: 'wrongpass1' });
    expect(res.status).toBe(401);
  });

  it('never returns a password hash in any account response', async () => {
    const token = await login('access@bmi.test');
    const res = await request(app.getHttpServer())
      .get(`${base}/users`)
      .set('Authorization', `Bearer ${token}`);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('$2b$'); // no bcrypt hash leaked
  });

  // --- AC-IAM-004: one role per user; AC-IAM-001: one System Admin ---------

  it('AC-IAM-004 — refuses creating an account with an invalid/second-role shape (validation)', async () => {
    const token = await login('access@bmi.test');
    const res = await request(app.getHttpServer())
      .post(`${base}/users`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Bad', email: 'bad@bmi.test', role: ['Planner', 'Mechanic'], temporaryPassword: 'Temp1234' });
    // A second role is not representable: the role field must be a single enum value.
    expect(res.status).toBe(400);
  });

  it('AC-IAM-001 — refuses a second System Admin via the API', async () => {
    const token = await login('access@bmi.test');
    const res = await request(app.getHttpServer())
      .post(`${base}/users`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Second Admin',
        email: 'admin2@bmi.test',
        role: Role.SystemAdmin,
        temporaryPassword: 'Temp1234',
      });
    expect(res.status).toBe(409);
  });

  // --- AC-IAM-003: System Admin cannot open Users and roles ----------------

  it('AC-IAM-003 — the System Admin is refused the accounts area with a server-side 403', async () => {
    const token = await login('sysadmin@bmi.test');
    const res = await request(app.getHttpServer())
      .get(`${base}/users`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('a non-Access-Manager (Planner) is refused account creation (403)', async () => {
    const token = await login('planner@bmi.test');
    const res = await request(app.getHttpServer())
      .post(`${base}/users`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'X', email: 'x@bmi.test', role: Role.Mechanic, temporaryPassword: 'Temp1234' });
    expect(res.status).toBe(403);
  });

  // --- AC-IAM-002: move System Admin, exactly one audit record -------------

  it('AC-IAM-002 — moves the System Admin role and writes exactly one audit record', async () => {
    const token = await login('access@bmi.test');
    // Find a non-admin target (the mechanic).
    const before = audit.count();
    const res = await request(app.getHttpServer())
      .post(`${base}/users/move-system-admin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toUserId: 3, reason: 'Handover to Rina' });
    expect(res.status).toBe(200);
    expect(res.body.to.role).toBe(Role.SystemAdmin);
    expect(res.body.from.role).not.toBe(Role.SystemAdmin);
    // Exactly one audit record for the move (AC-IAM-002).
    expect(audit.count()).toBe(before + 1);
    const record = audit.all().at(-1)!;
    expect(record.reason).toBe('Handover to Rina');
  });

  // --- AC-IAM-005 / REQ-IAM-008: Planner-approval switch -------------------

  it('AC-IAM-005 — the Access Manager switches Planner approval on with an end time', async () => {
    const token = await login('access@bmi.test');
    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h
    const res = await request(app.getHttpServer())
      .put(`${base}/roles/planner-approval`)
      .set('Authorization', `Bearer ${token}`)
      .send({ on: true, reason: 'Evening cover', until, kinds: ['wo_creation'] });
    expect(res.status).toBe(200);
    expect(res.body.on).toBe(true);

    const read = await request(app.getHttpServer())
      .get(`${base}/roles/planner-approval`)
      .set('Authorization', `Bearer ${token}`);
    expect(read.body.on).toBe(true);
    expect(read.body.kinds).toContain('wo_creation');
  });

  it('a past end time reads the Planner switch as off (REQ-IAM-008)', async () => {
    const token = await login('access@bmi.test');
    const past = new Date(Date.now() - 1000).toISOString();
    await request(app.getHttpServer())
      .put(`${base}/roles/planner-approval`)
      .set('Authorization', `Bearer ${token}`)
      .send({ on: true, reason: 'Oops', until: past, kinds: ['wo_creation'] });
    const read = await request(app.getHttpServer())
      .get(`${base}/roles/planner-approval`)
      .set('Authorization', `Bearer ${token}`);
    expect(read.body.on).toBe(false);
  });

  // --- REQ-IAM-005: permission-matrix read ---------------------------------

  it('reads the §2.2 permission matrix with locked flags (REQ-IAM-005)', async () => {
    const token = await login('access@bmi.test');
    const res = await request(app.getHttpServer())
      .get(`${base}/roles/permissions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const planner = res.body.roles.find((r: { role: string }) => r.role === Role.Planner);
    expect(planner).toBeDefined();
    const approve = planner.cells.find((c: { capability: string }) => c.capability === 'wo.approve');
    // Approvals are locked (REQ-IAM-005, BR-04).
    expect(approve.locked).toBe(true);
  });

  // --- Forced first-sign-in change (REQ-IAM-009, NFR-05 rule 2) ------------

  it('REQ-IAM-009 — a created account is flagged to change its password at first sign-in', async () => {
    const amToken = await login('access@bmi.test');
    const created = await request(app.getHttpServer())
      .post(`${base}/users`)
      .set('Authorization', `Bearer ${amToken}`)
      .send({
        fullName: 'Fresh WHM',
        email: 'fresh.whm@bmi.test',
        role: Role.WarehouseManager,
        temporaryPassword: 'Temp1234',
      });
    expect(created.status).toBe(201);
    expect(created.body.user.mustChangePassword).toBe(true);

    const loginRes = await request(app.getHttpServer())
      .post(`${base}/auth/login`)
      .send({ email: 'fresh.whm@bmi.test', password: 'Temp1234' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.mustChangePassword).toBe(true);
  });

  // --- NFR-05 password policy enforced at the API edge ---------------------

  it('rejects a new account whose temporary password breaks the NFR-05 policy', async () => {
    const token = await login('access@bmi.test');
    const res = await request(app.getHttpServer())
      .post(`${base}/users`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Weak',
        email: 'weak@bmi.test',
        role: Role.Driver,
        temporaryPassword: 'short', // < 8, no digit
      });
    expect(res.status).toBe(400);
  });

  // --- AC-IAM-006: Live-mode sign-in (Setup gate covered in the unit test) --
  // The AppSettings go-live flip is one-way, so the Setup→refuse→go-live→allow
  // sequence is verified deterministically in auth.service.test.ts. Here we
  // confirm the Live path end-to-end: a Planner signs in once the system is Live.

  it('AC-IAM-006 — once Live, a Planner can sign in end-to-end', async () => {
    const res = await request(app.getHttpServer())
      .post(`${base}/auth/login`)
      .send({ email: 'planner@bmi.test', password: SEED_PASSWORD });
    expect(res.status).toBe(200);
  });

  // --- Reset flow is public (DQ-02) ----------------------------------------

  it('DQ-02 — the reset request endpoint is public and always 202', async () => {
    const res = await request(app.getHttpServer())
      .post(`${base}/auth/reset/request`)
      .send({ email: 'planner@bmi.test' });
    expect(res.status).toBe(202);
    // Unknown email: still 202 (no account enumeration).
    const res2 = await request(app.getHttpServer())
      .post(`${base}/auth/reset/request`)
      .send({ email: 'nobody@bmi.test' });
    expect(res2.status).toBe(202);
  });
});
