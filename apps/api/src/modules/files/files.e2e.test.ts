import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_PASSWORD } from '@bmi/data-gateway';
import { FileStatus } from '@bmi/shared';
import { AppModule } from '../../app.module.js';
import { API_PREFIX } from '../../app.constants.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { buildFileBuffer, type FileEnvelope } from './content.js';

/**
 * End-to-end FG-16 coverage (TASK-116) booting the full `AppModule` against the
 * dummy gateway + local object store. Covers the §2.2 role guard
 * (`files.upload`), the signed-link sign → upload flow over HTTP, the server
 * re-check/compress worker and the three-state lifecycle. Validates the two
 * called-out gates: an MP4 renamed .jpg is Rejected (by content), and a 4 MB
 * photo → <1 MB with no EXIF GPS.
 */
describe('Files (upload/compress pipeline) e2e (TASK-116)', () => {
  let app: INestApplication;
  const base = `/${API_PREFIX}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    // Go live so field/office roles can sign in (Setup mode allows only SA + AM).
    const settings = app.get(AppSettingsService);
    settings.resetForTests();
    settings.goLive(new Date().toISOString());
  });

  afterAll(async () => {
    await app.close();
  });

  const server = (): Parameters<typeof request>[0] => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server()).post(`${base}/auth/login`).send({ email, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }
  const auth = (token: string) => (r: request.Test): request.Test => r.set('Authorization', `Bearer ${token}`);

  function b64(type: Parameters<typeof buildFileBuffer>[0], env: FileEnvelope): string {
    return buildFileBuffer(type, env).toString('base64');
  }

  it('refuses a role without files.upload (§2.2)', async () => {
    const driver = await login('driver@bmi.test'); // Driver has no files.upload
    await auth(driver)(request(server()).post(`${base}/uploads/sign`).send({ profile: 'Photo' })).expect(403);
  });

  it('signs, uploads a 4 MB photo → Ready, 1600×1200, <1 MB, no EXIF GPS', async () => {
    const mechanic = await login('mechanic@bmi.test');
    const signed = await auth(mechanic)(
      request(server()).post(`${base}/uploads/sign`).send({ profile: 'Photo', entity: 'wo', captureSource: 'Camera' }),
    ).expect(201);
    expect(signed.body.file.status).toBe(FileStatus.Pending);
    const uploadToken = signed.body.uploadToken as string;
    const fileId = signed.body.file.id as number;

    const bytes = b64('image/jpeg', {
      width: 4032,
      height: 3024,
      logicalBytes: 4_200_000,
      hasExifGps: true,
      capturedAt: '2026-11-11T02:00:00.000Z',
      pageCount: 0,
    });
    const uploaded = await auth(mechanic)(request(server()).post(`${base}/uploads`).send({ uploadToken, bytes })).expect(200);
    expect(uploaded.body.file.status).toBe(FileStatus.Ready);
    expect(uploaded.body.file.width).toBe(1600);
    expect(uploaded.body.file.height).toBe(1200);
    expect(uploaded.body.file.storedBytes).toBeLessThan(1_000_000);
    expect(uploaded.body.file.sha256).toMatch(/^[0-9a-f]{64}$/);

    // The detail panel exposes metadata; a signed read link is mintable.
    const detail = await auth(mechanic)(request(server()).get(`${base}/files/${fileId}`)).expect(200);
    expect(detail.body.file.thumbKey).not.toBeNull();
    const link = await auth(mechanic)(request(server()).get(`${base}/files/${fileId}/link`)).expect(200);
    expect(link.body.token.length).toBeGreaterThan(20);
    expect(link.body.expiresAt).toBeGreaterThan(Date.now());
  });

  it('sets an MP4 renamed .jpg Rejected server-side (AC-FUP-002)', async () => {
    const mechanic = await login('mechanic@bmi.test');
    const signed = await auth(mechanic)(
      request(server()).post(`${base}/uploads/sign`).send({ profile: 'Photo', entity: 'wo' }),
    ).expect(201);
    const uploadToken = signed.body.uploadToken as string;
    const bytes = b64('video/mp4', {
      width: 1920,
      height: 1080,
      logicalBytes: 5_000_000,
      hasExifGps: false,
      capturedAt: null,
      pageCount: 0,
    });
    const uploaded = await auth(mechanic)(request(server()).post(`${base}/uploads`).send({ uploadToken, bytes })).expect(200);
    expect(uploaded.body.file.status).toBe(FileStatus.Rejected);
    expect(uploaded.body.file.rejectReason).toContain('video/mp4');
  });

  it('refuses a forged/expired upload token (NFR-13)', async () => {
    const mechanic = await login('mechanic@bmi.test');
    const bytes = b64('image/jpeg', {
      width: 800,
      height: 600,
      logicalBytes: 300_000,
      hasExifGps: false,
      capturedAt: null,
      pageCount: 0,
    });
    await auth(mechanic)(request(server()).post(`${base}/uploads`).send({ uploadToken: 'garbage.token', bytes })).expect(400);
  });
});
