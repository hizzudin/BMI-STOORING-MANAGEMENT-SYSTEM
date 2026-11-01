import 'server-only';
import { cookies } from 'next/headers';

/**
 * Server-side API client — the ONLY path the web app uses to reach data
 * (NFR-18, DEC-66: web never touches the DB, only the NestJS `/api/v1` REST
 * surface over JSON). Every call runs in a Server Component or Route Handler,
 * so the base URL and the session token stay on the server and are never
 * shipped to the browser.
 *
 * Auth: the opaque session token (from `POST /auth/login`) lives in an
 * httpOnly cookie; this client reads it and sends it as
 * `Authorization: Bearer <token>`, matching `SessionAuthMiddleware`.
 */

export const SESSION_COOKIE = 'bmi_session';
export const ROLE_COOKIE = 'bmi_role';
export const UID_COOKIE = 'bmi_uid';

/** The API base URL is server-only config; default to the local dev API. */
function apiBaseUrl(): string {
  return process.env.BMI_API_URL ?? 'http://localhost:3000/api/v1';
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  /** Send the current session token (default true). */
  readonly auth?: boolean;
  /** Next.js cache hint; reads are no-store by default (always live data). */
  readonly cache?: RequestCache;
}

function sessionToken(): string | undefined {
  return cookies().get(SESSION_COOKIE)?.value;
}

/**
 * Perform a typed API call. Throws {@link ApiError} on a non-2xx response so
 * callers (or an `error.tsx` boundary) can react; a 401 is surfaced distinctly
 * so the shell can redirect to sign-in.
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, cache = 'no-store' } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth) {
    const token = sessionToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers,
    cache,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  const parsed: unknown = text ? safeJson(text) : null;

  if (!res.ok) {
    const message =
      (isRecord(parsed) && typeof parsed.message === 'string' && parsed.message) ||
      `API ${method} ${path} failed (${res.status})`;
    throw new ApiError(res.status, message, parsed);
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Is there a live session cookie? (cheap guard for layout/redirect). */
export function hasSession(): boolean {
  return Boolean(sessionToken());
}
