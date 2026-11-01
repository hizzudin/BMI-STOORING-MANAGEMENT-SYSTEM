/**
 * Runtime configuration for the mobile client. The API base URL is read from an
 * Expo public env var (`EXPO_PUBLIC_API_BASE_URL`) with a dev default pointing
 * at the local NestJS API's versioned prefix (`/api/v1`, design.md). Mobile
 * reaches data ONLY through this API — never a database directly (steering).
 *
 * Kept free of any Expo import so it is unit-testable; the screens read the same
 * resolved value.
 */

/** The versioned REST prefix the API mounts (apps/api `API_PREFIX`). */
export const API_PREFIX = '/api/v1';

/**
 * Resolve the API base URL. In a real Expo build `process.env.EXPO_PUBLIC_*`
 * is inlined at bundle time; the `10.0.2.2` default is the Android emulator's
 * alias for the host machine's `localhost`.
 */
export function resolveApiBaseUrl(
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): string {
  const configured = env['EXPO_PUBLIC_API_BASE_URL'];
  const origin = (configured && configured.trim().length > 0 ? configured : 'http://10.0.2.2:3000').replace(
    /\/+$/,
    '',
  );
  return `${origin}${API_PREFIX}`;
}
