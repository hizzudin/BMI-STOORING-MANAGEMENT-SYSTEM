import { describe, expect, it } from 'vitest';
import { ApiClient, ApiError, type FetchLike } from './client.js';

/** A recording fake `fetch` that returns a scripted response. */
function fakeFetch(
  status: number,
  body: unknown,
): { fetch: FetchLike; calls: Array<{ url: string; init: RequestInit | undefined }> } {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({ url, init });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(text),
    } as Response);
  };
  return { fetch: fetchImpl, calls };
}

const BASE = 'http://localhost:3000/api/v1';

describe('ApiClient.login (REQ-IAM-001)', () => {
  it('posts to /auth/login with the mobile platform and stores the session', async () => {
    const { fetch, calls } = fakeFetch(200, {
      token: 'sess-123',
      role: 'Driver',
      userId: 4,
      mustChangePassword: false,
    });
    const client = new ApiClient({ baseUrl: BASE, fetch });
    const session = await client.login('driver@bmi.test', 'Bmi12345');

    expect(session.role).toBe('Driver');
    expect(client.getSession()?.token).toBe('sess-123');
    const call = calls[0];
    expect(call?.url).toBe(`${BASE}/auth/login`);
    expect(JSON.parse(String(call?.init?.body))).toMatchObject({
      email: 'driver@bmi.test',
      platform: 'mobile',
    });
  });

  it('sends the bearer token on subsequent requests', async () => {
    const login = fakeFetch(200, { token: 't', role: 'Mechanic', userId: 3, mustChangePassword: false });
    const client = new ApiClient({ baseUrl: BASE, fetch: login.fetch });
    await client.login('mechanic@bmi.test', 'Bmi12345');

    const vehicles = fakeFetch(200, []);
    // Swap the fetch to the vehicles stub by building a fresh client with the session.
    const authed = new ApiClient({ baseUrl: BASE, fetch: vehicles.fetch });
    authed.setSession(client.getSession());
    await authed.listVehicles();
    const headers = vehicles.calls[0]?.init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer t');
  });
});

describe('ApiClient dev-header shim', () => {
  it('sends x-user-id / x-user-role when a dev user is configured and no session', async () => {
    const { fetch, calls } = fakeFetch(200, []);
    const client = new ApiClient({ baseUrl: BASE, fetch, devUser: { userId: 3, role: 'Mechanic' } });
    await client.listWorkOrders();
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['x-user-id']).toBe('3');
    expect(headers['x-user-role']).toBe('Mechanic');
  });
});

describe('ApiClient.reportBreakdown (REQ-PM-005, REQ-MBL-002, REQ-WO-016)', () => {
  it('sends the captured location + mandatory note and returns the auto-drafted Mobilisasi WO', async () => {
    const drafted = {
      report: { id: 1, vehicleId: 1, findingNote: 'Engine overheating on the toll road' },
      draftedWorkOrder: {
        id: 7,
        number: 'WO-0199',
        source: 'Driver_Breakdown',
        status: 'Draft',
        findingNote: 'Engine overheating on the toll road',
      },
    };
    const { fetch, calls } = fakeFetch(201, drafted);
    const client = new ApiClient({ baseUrl: BASE, fetch, devUser: { userId: 6, role: 'System_Admin' } });

    const result = await client.reportBreakdown({
      vehicleId: 1,
      driverId: 4,
      description: 'Engine overheating on the toll road',
      locationLat: -6.2,
      locationLng: 106.8,
    });

    const call = calls[0];
    expect(call?.url).toBe(`${BASE}/maintenance/breakdowns`);
    const sent = JSON.parse(String(call?.init?.body));
    // The location is captured once and sent with the mandatory note.
    expect(sent).toMatchObject({ vehicleId: 1, driverId: 4, locationLat: -6.2, locationLng: 106.8 });
    expect(sent.description).toBe('Engine overheating on the toll road');
    // The server pre-seeds the Mobilisasi draft and copies the note to finding_note.
    expect(result.draftedWorkOrder.status).toBe('Draft');
    expect(result.draftedWorkOrder.source).toBe('Driver_Breakdown');
    expect(result.draftedWorkOrder.findingNote).toBe('Engine overheating on the toll road');
  });
});

describe('ApiClient error handling', () => {
  it('throws an ApiError carrying the status and the server message', async () => {
    const { fetch } = fakeFetch(401, { message: 'Invalid email or password.' });
    const client = new ApiClient({ baseUrl: BASE, fetch });
    await expect(client.login('x@bmi.test', 'bad')).rejects.toBeInstanceOf(ApiError);
    await expect(client.login('x@bmi.test', 'bad')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password.',
    });
  });

  it('joins an array validation message', async () => {
    const { fetch } = fakeFetch(400, { message: ['vehicleId must be positive', 'description required'] });
    const client = new ApiClient({ baseUrl: BASE, fetch, devUser: { userId: 6, role: 'System_Admin' } });
    await expect(
      client.reportBreakdown({ vehicleId: 0, driverId: 4, description: '' }),
    ).rejects.toMatchObject({ status: 400, message: 'vehicleId must be positive, description required' });
  });
});
