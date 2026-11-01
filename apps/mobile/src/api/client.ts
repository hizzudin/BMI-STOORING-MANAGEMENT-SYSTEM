import type {
  ScheduleCardDto,
  VehicleDto,
  WorkOrderDto,
} from '@bmi/shared';

/**
 * Minimal, dependency-free REST client for the BMI API. The mobile app reaches
 * data ONLY through this client (steering: no direct DB). It is pure TypeScript
 * over the global `fetch`, so it runs unchanged on React Native (Hermes) and
 * under Node for unit tests with an injected `fetch`.
 *
 * Auth: Phase 1 the API accepts either a session bearer token (from
 * `POST /auth/login`) or the dev-header shim (`x-user-id` / `x-user-role`). The
 * client sends the bearer token once logged in and falls back to the dev headers
 * when a numeric user id + role are supplied (so the app works directly against
 * the seeded dummy gateway in development).
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The signed-in session the app holds after login. */
export interface Session {
  readonly token: string;
  readonly role: string;
  readonly userId: number;
  readonly mustChangePassword: boolean;
}

export interface LoginResponse {
  token: string;
  role: string;
  userId: number;
  mustChangePassword: boolean;
}

/** Input for a Driver breakdown report (REQ-PM-005, REQ-MBL-002, REQ-WO-016). */
export interface ReportBreakdownInput {
  vehicleId: number;
  driverId: number;
  /** The mandatory field-finding note → becomes the draft's `finding_note`. */
  description: string;
  /** The driver's location captured ONCE on report. */
  locationLat?: number;
  locationLng?: number;
  photoRef?: string;
}

/** The API's breakdown result: the report + the auto-drafted Mobilisasi WO. */
export interface ReportBreakdownResult {
  report: { id: number; vehicleId: number; findingNote: string };
  draftedWorkOrder: WorkOrderDto;
}

/** A raised API error carrying the HTTP status and the server message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly fetch?: FetchLike;
  /**
   * Phase-1 dev identity for the header shim. When set and no bearer token is
   * present, the client sends `x-user-id` / `x-user-role` so it works directly
   * against the seeded dummy gateway.
   */
  readonly devUser?: { userId: number; role: string };
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly doFetch: FetchLike;
  private session: Session | null = null;
  private devUser: { userId: number; role: string } | null;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    const injected = opts.fetch;
    // Bind to the global fetch when none is injected (RN / Node 20+).
    this.doFetch = injected ?? ((input, init) => fetch(input, init));
    this.devUser = opts.devUser ?? null;
  }

  /** The current session, or null when signed out. */
  getSession(): Session | null {
    return this.session;
  }

  setSession(session: Session | null): void {
    this.session = session;
    if (session) {
      // Once authenticated the server identifies us by the session; keep the
      // dev identity for the header fallback consistent with the logged-in user.
      this.devUser = { userId: session.userId, role: session.role };
    }
  }

  /** Sign in (REQ-IAM-001). Stores and returns the session. */
  async login(email: string, password: string): Promise<Session> {
    const body = await this.request<LoginResponse>('POST', '/auth/login', {
      email,
      password,
      platform: 'mobile',
    });
    const session: Session = {
      token: body.token,
      role: body.role,
      userId: body.userId,
      mustChangePassword: body.mustChangePassword,
    };
    this.setSession(session);
    return session;
  }

  /** Sign out: revoke the session server-side and clear local state. */
  async logout(): Promise<void> {
    try {
      await this.request<{ ok: true }>('POST', '/auth/logout', undefined);
    } finally {
      this.session = null;
    }
  }

  /** Vehicles the signed-in user can see (used to pick a vehicle on field flows). */
  listVehicles(): Promise<VehicleDto[]> {
    return this.request<VehicleDto[]>('GET', '/vehicles', undefined);
  }

  /** Work orders (used by the mechanic today list + driver history). */
  listWorkOrders(): Promise<WorkOrderDto[]> {
    return this.request<WorkOrderDto[]>('GET', '/work-orders', undefined);
  }

  /** The maintenance schedule cards (carry `isRolledOver` + `plannedDate`). */
  listScheduleCards(): Promise<ScheduleCardDto[]> {
    const res = this.request<{ cards: ScheduleCardDto[] } | ScheduleCardDto[]>(
      'GET',
      '/maintenance/schedule',
      undefined,
    );
    return res.then((body) => (Array.isArray(body) ? body : body.cards));
  }

  /** Save an odometer reading (REQ-VEH-005). Returns the saved reading. */
  saveOdometer(vehicleId: number, reading: number): Promise<{ odometerKm: number; jumpWarning: boolean }> {
    return this.request('POST', `/vehicles/${vehicleId}/odometer`, { reading });
  }

  /**
   * Report a breakdown (REQ-PM-005). The API pre-seeds exactly one Mobilisasi
   * step at the captured location and copies `description` into the draft's
   * `finding_note` — the client never re-implements the drafting.
   */
  reportBreakdown(input: ReportBreakdownInput): Promise<ReportBreakdownResult> {
    return this.request<ReportBreakdownResult>('POST', '/maintenance/breakdowns', input);
  }

  // --- internals -----------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.session) {
      headers['Authorization'] = `Bearer ${this.session.token}`;
    }
    // Phase-1 dev-header shim so the app works against the seeded dummy gateway.
    if (this.devUser) {
      headers['x-user-id'] = String(this.devUser.userId);
      headers['x-user-role'] = this.devUser.role;
    }

    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const res = await this.doFetch(`${this.baseUrl}${path}`, init);
    const text = await res.text();
    const parsed: unknown = text.length > 0 ? safeJson(text) : null;

    if (!res.ok) {
      throw new ApiError(res.status, extractMessage(parsed, res.status));
    }
    return parsed as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractMessage(parsed: unknown, status: number): string {
  if (parsed && typeof parsed === 'object' && 'message' in parsed) {
    const m = (parsed as { message: unknown }).message;
    if (typeof m === 'string') {
      return m;
    }
    if (Array.isArray(m) && m.length > 0 && typeof m[0] === 'string') {
      return m.join(', ');
    }
  }
  return `Request failed (${status}).`;
}
