import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_PASSWORD } from '@bmi/data-gateway';
import { Role, WorkOrderCategory } from '@bmi/shared';
import { AppModule } from '../../app.module.js';
import { API_PREFIX } from '../../app.constants.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { ModuleRegistryService } from './module-registry.service.js';
import { PresetService } from './preset.service.js';

/**
 * End-to-end FG-3 coverage (TASK-107) booting the full `AppModule` (real guard,
 * interceptors, session-backed auth) against the dummy gateway. Verifies through
 * real HTTP:
 *   - the §2.2 `registry.manage` guard — Planner/System Admin may write, a
 *     Warehouse Manager is refused a server-side 403;
 *   - the headline AC-REG-003 — registering a 7th module over HTTP makes it
 *     appear in `GET /registry/modules` and accepted by the composer, no engine edit;
 *   - the live composer check (REQ-REG-004 / AC-REG-001) rejects an invalid
 *     composition over HTTP;
 *   - preset versioning (REQ-REG-003 / AC-REG-005) over HTTP;
 *   - exactly one audit record per mutating registry call, none for GET/check.
 */
describe('Registry module (TASK-107) — modules, presets, composer checks over HTTP', () => {
  let app: INestApplication;
  let settings: AppSettingsService;
  let audit: AuditService;
  let registry: ModuleRegistryService;
  let presets: PresetService;
  const base = `/${API_PREFIX}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    settings = app.get(AppSettingsService);
    audit = app.get(AuditService);
    registry = app.get(ModuleRegistryService);
    presets = app.get(PresetService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    settings.resetForTests();
    settings.goLive(new Date().toISOString());
    registry.resetForTests();
    presets.resetForTests();
  });

  const server = (): Parameters<typeof request>[0] => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server())
      .post(`${base}/auth/login`)
      .send({ email, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }

  const admin = (): Promise<string> => login('sysadmin@bmi.test');

  // --- §2.2 guard ----------------------------------------------------------

  it('refuses a Warehouse Manager a registry write (server-side 403)', async () => {
    const token = await login('warehouse@bmi.test'); // no registry.manage
    await request(server())
      .post(`${base}/registry/modules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'Nope',
        name: 'Nope',
        uiComponent: 'X',
        executorRoles: [Role.Mechanic],
        costKind: 'None',
      })
      .expect(403);
  });

  it('lets a Planner save a preset (registry.manage)', async () => {
    const token = await login('planner@bmi.test');
    await request(server())
      .post(`${base}/registry/presets`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Planner preset',
        category: WorkOrderCategory.Corrective,
        steps: [
          { module: 'Stock', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner },
        ],
      })
      .expect(201);
  });

  // --- HEADLINE: register a 7th module over HTTP, no engine edit -----------

  it('AC-REG-003 — a 7th module registered over HTTP appears in the composer with no engine edit', async () => {
    const token = await admin();
    // Baseline: the designer currently offers the seeded modules.
    const before = await request(server())
      .get(`${base}/registry/modules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(before.body.modules.map((m: { code: string }) => m.code)).not.toContain('Tyre_Scan');

    // Register the 7th module — just a new row through the same contract.
    await request(server())
      .post(`${base}/registry/modules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'Tyre_Scan',
        name: 'Tyre Scan',
        uiComponent: 'StepTyreScan',
        executorRoles: [Role.Mechanic],
        costKind: 'None',
      })
      .expect(201);

    // It now shows in the module list the designer offers.
    const after = await request(server())
      .get(`${base}/registry/modules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.modules.map((m: { code: string }) => m.code)).toContain('Tyre_Scan');

    // And the composer accepts a composition that uses it.
    const check = await request(server())
      .post(`${base}/registry/composer/check`)
      .set('Authorization', `Bearer ${token}`)
      .send({ steps: [{ module: 'Tyre_Scan' }] })
      .expect(200);
    expect(check.body.canSubmit).toBe(true);
  });

  // --- Live composer check (REQ-REG-004 / AC-REG-001) ----------------------

  it('AC-REG-001 — the composer rejects a no-step composition over HTTP', async () => {
    const token = await admin();
    const res = await request(server())
      .post(`${base}/registry/composer/check`)
      .set('Authorization', `Bearer ${token}`)
      .send({ steps: [] })
      .expect(200);
    expect(res.body.canSubmit).toBe(false);
    expect(res.body.findings.map((f: { code: string }) => f.code)).toContain('NO_STEP');
  });

  // --- Preset versioning (REQ-REG-003 / AC-REG-005) ------------------------

  it('AC-REG-005 — re-saving a preset over HTTP bumps the version; the old version is unchanged', async () => {
    const token = await admin();
    const v1 = await request(server())
      .post(`${base}/registry/presets`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'HTTP preset',
        category: WorkOrderCategory.PM,
        steps: [
          { module: 'Stock', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner },
        ],
      })
      .expect(201);
    expect(v1.body.preset.version).toBe(1);
    const v1Id = v1.body.preset.id;

    const v2 = await request(server())
      .post(`${base}/registry/presets`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'HTTP preset',
        category: WorkOrderCategory.PM,
        steps: [
          { module: 'Stock', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner },
          { module: 'Mechanic_Action', executorRoles: [Role.Mechanic], verifierRole: Role.Planner },
        ],
      })
      .expect(201);
    expect(v2.body.preset.version).toBe(2);

    // The v1 version is still readable and still has its single step.
    const stillV1 = await request(server())
      .get(`${base}/registry/presets/${v1Id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(stillV1.body.preset.version).toBe(1);
    expect(stillV1.body.preset.steps).toHaveLength(1);
  });

  // --- audit ---------------------------------------------------------------

  it('writes exactly one audit record for a module registration', async () => {
    const token = await admin();
    const before = audit.findByEntity('assignment_modules').length;
    await request(server())
      .post(`${base}/registry/modules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'Audited',
        name: 'Audited',
        uiComponent: 'X',
        executorRoles: [Role.Mechanic],
        costKind: 'None',
      })
      .expect(201);
    expect(audit.findByEntity('assignment_modules').length - before).toBe(1);
  });

  it('writes no audit record for a read-only module list or a composer check', async () => {
    const token = await admin();
    const before = audit.count();
    await request(server())
      .get(`${base}/registry/modules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(server())
      .post(`${base}/registry/composer/check`)
      .set('Authorization', `Bearer ${token}`)
      .send({ steps: [{ module: 'Stock' }] })
      .expect(200);
    expect(audit.count()).toBe(before);
  });
});
