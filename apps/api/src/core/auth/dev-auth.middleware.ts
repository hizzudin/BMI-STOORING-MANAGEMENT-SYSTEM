import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { Role } from '@bmi/shared';
import type { AuthenticatedRequest, CurrentUser } from './current-user.js';

const ROLE_VALUES: ReadonlySet<string> = new Set(Object.values(Role));

/**
 * Phase-1 dev authentication shim.
 *
 * Real authentication — login, hashed passwords, sessions, lockout (NFR-05) —
 * is TASK-104 (IAM). Until then this middleware resolves the principal from two
 * request headers so the role guard, audit interceptor and idempotency layer are
 * fully exercisable now:
 *
 *   - `x-user-id`   → the numeric `users.id`.
 *   - `x-user-role` → the single `role_t` value the account holds (BR-14).
 *
 * A missing or malformed header leaves `currentUser` unset; the global
 * {@link RolesGuard} then refuses with 401. When TASK-104 lands, only this
 * resolver is replaced (by a verified session) — its consumers are unchanged.
 */
@Injectable()
export class DevAuthMiddleware implements NestMiddleware {
  use(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
    const rawId = req.header('x-user-id');
    const rawRole = req.header('x-user-role');

    if (rawId && rawRole && ROLE_VALUES.has(rawRole)) {
      const userId = Number.parseInt(rawId, 10);
      if (Number.isInteger(userId) && userId > 0) {
        const principal: CurrentUser = { userId, role: rawRole as Role };
        req.currentUser = principal;
      }
    }

    next();
  }
}
