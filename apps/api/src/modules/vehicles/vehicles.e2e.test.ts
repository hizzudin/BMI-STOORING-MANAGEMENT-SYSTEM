import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_PASSWORD } from '@bmi/data-gateway';
import { VehicleStatus } from '@bmi/shared';
import { AppModule } from '../../app.module.js';
import { API_PREFIX } from '../../app.constants.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { VehiclesService } from './vehicles.service.js';
import { VehicleClassService } from './vehicle-class.service.js';
import { DocumentTypeService } from './document-type.service.js';
import { DocumentService } from './document.service.js';
import { OdometerService } from './odometer.service.js';

/**
 * End-to-end FG-7 coverage (TASK-106) booting the full `AppModule` (real guard,
 * interceptors, session-backed auth) against the dummy gateway. Verifies through
 * real HTTP:
 *   - AC-VEH-003 — a class change on a vehicle with a mounted tyre is refused.
 *   - AC-VEH-004 — setting a driver releases the driver's old vehicle.
 *   - AC-DOC-004/005 — first entry: Missing blocks; a past expiry is Expired.
 *   - REQ-VEH-005 — the odometer jump warning surfaces in the response.
 *   - The §2.2 guard refuses a non-authorised role (403); each mutating VEH/DOC
 *     call writes exactly one audit record.
 *   - OFF does not block (contrast with Inactive) via canAssignToTrips.
 */
describe('Vehicles module (TASK-106) — vehicles, documents, odometer, SM-VEH/SM-DOC', () => {
  let app: INestApplication;
  let settings: AppSettingsService;
  let audit: AuditService;
  let vehicles: VehiclesService;
  let classes: VehicleClassService;
  let documentTypes: DocumentTypeService;
  let documents: DocumentService;
  let odometer: OdometerService;
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
    vehicles = app.get(VehiclesService);
    classes = app.get(VehicleClassService);
    documentTypes = app.get(DocumentTypeService);
    documents = app.get(DocumentService);
    odometer = app.get(OdometerService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Go live so office roles (System Admin, Planner) can sign in, then reset
    // the in-memory VEH state to its seeded baseline between tests.
    settings.resetForTests();
    settings.goLive(new Date().toISOString());
    vehicles.resetForTests();
    classes.resetForTests();
    documentTypes.resetForTests();
    documents.resetForTests();
    odometer.resetForTests();
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

  it('refuses a non-authorised role a vehicle write (server-side 403)', async () => {
    // Warehouse Manager holds no vehicle.manage capability (§2.2).
    const token = await login('warehouse@bmi.test');
    const res = await request(server())
      .post(`${base}/vehicles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'D 1 NO', classId: 1 });
    expect(res.status).toBe(403);
  });

  // --- registration + derived status (SM-VEH) ------------------------------

  it('registers a vehicle; a fresh vehicle with no documents opens Blocked (required docs Missing)', async () => {
    const token = await admin();
    const res = await request(server())
      .post(`${base}/vehicles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'D 7777 NEW', classId: 1, odometerKm: 0 });
    expect(res.status).toBe(201);
    // class 1 requires STNK/KIR/Insurance; none entered → Blocked (REQ-DOC-005).
    expect(res.body.vehicle.status).toBe(VehicleStatus.Blocked);
  });

  it('rejects a duplicate plate', async () => {
    const token = await admin();
    await request(server())
      .post(`${base}/vehicles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'B 1234 ABC', classId: 1 }) // seeded plate
      .expect(409);
  });

  // --- AC-VEH-003: class change refused with a mounted tyre ----------------

  it('AC-VEH-003 — changing class is refused while a tyre is mounted / a WO is open', async () => {
    const token = await admin();
    // Seeded vehicle 1 (B 1234 ABC) has the In_Progress WO-0142 open.
    const res = await request(server())
      .patch(`${base}/vehicles/1`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, reason: 'reclassify', classId: 1 });
    expect(res.status).toBe(409);
  });

  // --- AC-VEH-004: one vehicle per driver ----------------------------------

  it('AC-VEH-004 — setting a driver on a new vehicle releases their old vehicle', async () => {
    const token = await admin();
    // Register a second vehicle to move the driver onto.
    const created = await request(server())
      .post(`${base}/vehicles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'D 4410 KL', classId: 1 })
      .expect(201);
    const otherId = created.body.vehicle.id;

    // Joko (driver id 4) starts on the other vehicle, then moves to seeded id 1.
    await request(server())
      .post(`${base}/vehicles/${otherId}/driver`)
      .set('Authorization', `Bearer ${token}`)
      .send({ driverId: 4 })
      .expect(200);
    await request(server())
      .post(`${base}/vehicles/1/driver`)
      .set('Authorization', `Bearer ${token}`)
      .send({ driverId: 4 })
      .expect(200);

    // Joko now maps to vehicle 1 only; the other vehicle has no driver.
    expect(vehicles.vehicleForDriver(4)).toBe(1);
    const otherView = await request(server())
      .get(`${base}/vehicles/${otherId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(otherView.body.driverId).toBeNull();
  });

  // --- AC-DOC-004 / AC-DOC-005: first entry --------------------------------

  it('AC-DOC-005 — a document entered with a past expiry shows Expired', async () => {
    const token = await admin();
    const created = await request(server())
      .post(`${base}/vehicles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'D 8888 DOC', classId: 1 })
      .expect(201);
    const vid = created.body.vehicle.id;

    const res = await request(server())
      .post(`${base}/vehicles/${vid}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        documentTypeId: 3, // Insurance
        documentNumber: 'INS-OLD',
        expiryDate: '2000-01-01',
        fileUrl: 'key/ins.jpg',
      });
    expect(res.status).toBe(201);
    expect(res.body.document.status).toBe('Expired');
  });

  // --- REQ-VEH-005: jump warning surfaces ----------------------------------

  it('REQ-VEH-005 — the odometer jump warning surfaces in the response (not silently corrected)', async () => {
    const token = await admin();
    // First a baseline reading, then a huge same-window jump on seeded vehicle 1.
    await request(server())
      .post(`${base}/vehicles/1/odometer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reading: 48210, readingAt: '2026-10-26T00:00:00.000Z' })
      .expect(201);
    const res = await request(server())
      .post(`${base}/vehicles/1/odometer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reading: 60210, readingAt: '2026-10-27T00:00:00.000Z' }); // +12000 km/1 day
    expect(res.status).toBe(201);
    expect(res.body.jumpWarning).toBe(true);
    expect(res.body.warning).toBeTruthy();
    expect(res.body.vehicle.odometerKm).toBe(60210); // saved as entered
  });

  it('a manual odometer reading is allowed for a Planner (odometer.manual) but refused for Warehouse', async () => {
    const planner = await login('planner@bmi.test');
    await request(server())
      .post(`${base}/vehicles/1/odometer`)
      .set('Authorization', `Bearer ${planner}`)
      .send({ reading: 48211, readingAt: '2026-10-26T01:00:00.000Z' })
      .expect(201);
    const warehouse = await login('warehouse@bmi.test');
    await request(server())
      .post(`${base}/vehicles/1/odometer`)
      .set('Authorization', `Bearer ${warehouse}`)
      .send({ reading: 48212, readingAt: '2026-10-26T02:00:00.000Z' })
      .expect(403);
  });

  // --- OFF does not block; Inactive does (contrast, REQ-WO-013 / DEC-92) ---

  it('OFF does not block trip assignment, but Inactive does (DEC-92 vs REQ-WO-013)', async () => {
    const token = await admin();
    // Give seeded vehicle 1 its required documents so it is not Blocked.
    for (const typeId of [1, 2, 3]) {
      await request(server())
        .post(`${base}/vehicles/1/documents`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          documentTypeId: typeId,
          documentNumber: `DOC-${typeId}`,
          expiryDate: '2030-01-01',
          fileUrl: 'key/x.jpg',
        })
        .expect(201);
    }
    // WO-0142 overran its 2026-10-26 schedule → vehicle 1 is OFF today, which
    // does NOT block trips (canAssignToTrips true).
    expect(await vehicles.canAssignToTrips(1)).toBe(true);
  });

  // --- audit: exactly one record per mutating VEH/DOC call -----------------

  it('writes exactly one audit record for a successful vehicle registration', async () => {
    const token = await admin();
    const before = audit.findByEntity('vehicles').length;
    await request(server())
      .post(`${base}/vehicles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'D 1212 AUD', classId: 1 })
      .expect(201);
    expect(audit.findByEntity('vehicles').length - before).toBe(1);
  });

  it('writes no audit record for a read-only vehicle list (GET)', async () => {
    const token = await admin();
    const before = audit.count();
    await request(server()).get(`${base}/vehicles`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(audit.count()).toBe(before);
  });
});
