import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Role } from '@bmi/shared';
import { AppModule } from './app.module.js';
import { API_PREFIX } from './app.constants.js';
import { AuditService } from './core/audit/audit.service.js';

/**
 * End-to-end coverage of the TASK-103 scaffold cross-cutting concerns, booting
 * the full `AppModule` (real guard, interceptors, middleware, DI gateway).
 *
 * Proves the task's _Verify_ gate:
 *   - `/health` responds (public, unauthenticated).
 *   - An unauthorized role is refused with a **server-side 403** (NFR-04).
 *   - Every **mutating** call writes an audit record (NFR-02), and a refused
 *     call writes none.
 *   - An `Idempotency-Key` replay returns the first response without a second
 *     effect (NFR-01).
 */
describe('API scaffold (TASK-103) — guard, audit, idempotency, health', () => {
  let app: INestApplication;
  let audit: AuditService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    audit = app.get(AuditService);
  });

  afterAll(async () => {
    await app.close();
  });

  const base = `/${API_PREFIX}`;

  it('serves a public /health endpoint without authentication', async () => {
    const res = await request(app.getHttpServer()).get(`${base}/health`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('@bmi/api');
  });

  it('refuses an unauthenticated mutating call with 401', async () => {
    const res = await request(app.getHttpServer())
      .post(`${base}/work-orders/scaffold-check`)
      .send({ hello: 'world' });
    expect(res.status).toBe(401);
  });

  it('refuses an unauthorized role with a server-side 403 (NFR-04)', async () => {
    // Accounting has a blank §2.2 cell for wo.create → must be refused.
    const res = await request(app.getHttpServer())
      .post(`${base}/work-orders/scaffold-check`)
      .set('x-user-id', '7')
      .set('x-user-role', Role.Accounting)
      .send({ hello: 'world' });
    expect(res.status).toBe(403);
  });

  it('writes NO audit record for a refused (403) mutating call', async () => {
    const before = audit.count();
    await request(app.getHttpServer())
      .post(`${base}/work-orders/scaffold-check`)
      .set('x-user-id', '7')
      .set('x-user-role', Role.Driver) // blank wo.create cell
      .send({ a: 1 });
    expect(audit.count()).toBe(before);
  });

  it('allows an authorized role and writes exactly one audit record (NFR-02)', async () => {
    const before = audit.count();
    const res = await request(app.getHttpServer())
      .post(`${base}/work-orders/scaffold-check`)
      .set('x-user-id', '1')
      .set('x-user-role', Role.Planner) // wo.create granted
      .send({ title: 'demo' });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(audit.count()).toBe(before + 1);

    const record = audit.all().at(-1)!;
    expect(record.userId).toBe(1);
    expect(record.userRole).toBe(Role.Planner);
    expect(record.action).toContain('POST');
    expect(record.at).toBeInstanceOf(Date);
  });

  it('does NOT write an audit record for a read-only (GET) call', async () => {
    const before = audit.count();
    await request(app.getHttpServer())
      .get(`${base}/work-orders/scaffold-count`)
      .set('x-user-id', '1')
      .set('x-user-role', Role.Planner);
    expect(audit.count()).toBe(before);
  });

  it('reads through the injected DataGateway seam', async () => {
    const res = await request(app.getHttpServer())
      .get(`${base}/work-orders/scaffold-count`)
      .set('x-user-id', '1')
      .set('x-user-role', Role.Planner);
    expect(res.status).toBe(200);
    // The dummy gateway is seeded with the PRD example WO-0142.
    expect(res.body.workOrders).toBeGreaterThanOrEqual(1);
  });

  it('replays an Idempotency-Key without a second effect (NFR-01)', async () => {
    const key = 'task103-e2e-key-001';
    const auditBefore = audit.count();

    const first = await request(app.getHttpServer())
      .post(`${base}/work-orders/scaffold-check`)
      .set('x-user-id', '1')
      .set('x-user-role', Role.Planner)
      .set('Idempotency-Key', key)
      .send({ n: 1 });
    expect(first.status).toBe(201);
    expect(audit.count()).toBe(auditBefore + 1);

    const replay = await request(app.getHttpServer())
      .post(`${base}/work-orders/scaffold-check`)
      .set('x-user-id', '1')
      .set('x-user-role', Role.Planner)
      .set('Idempotency-Key', key)
      .send({ n: 1 });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    // No second audit record: the replay short-circuited before the handler.
    expect(audit.count()).toBe(auditBefore + 1);
  });
});
