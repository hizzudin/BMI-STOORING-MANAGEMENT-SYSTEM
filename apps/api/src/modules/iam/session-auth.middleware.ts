import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { Role } from '@bmi/shared';
import type { AuthenticatedRequest, CurrentUser } from '../../core/auth/current-user.js';
import { SessionService } from './session.service.js';
import { extractBearer } from './auth.controller.js';

const ROLE_VALUES: ReadonlySet<string> = new Set(Object.values(Role));

/**
 * The real, session-backed principal resolver (TASK-104) that supersedes the
 * Phase-1 `DevAuthMiddleware` header shim. It fills the SAME stable
 * {@link CurrentUser} shape the global role guard and audit interceptor already
 * consume (TASK-103 named this the extension point), so nothing downstream
 * changes.
 *
 * Resolution order on every request:
 *   1. **Session** — an `Authorization: Bearer <token>` that resolves to a live
 *      session (web idle / mobile absolute expiry enforced in
 *      {@link SessionService}). This is the production path.
 *   2. **Dev header shim** — `x-user-id` + `x-user-role`, retained so the
 *      existing scaffold tests and local tooling keep working against dummy
 *      data. This fallback is Phase-1 only and is dropped at go-live.
 *
 * A request that matches neither leaves `currentUser` unset; the guard then
 * refuses with 401.
 */
@Injectable()
export class SessionAuthMiddleware implements NestMiddleware {
  constructor(private readonly sessions: SessionService) {}

  use(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
    const principal = this.fromSession(req) ?? this.fromDevHeaders(req);
    if (principal) {
      req.currentUser = principal;
    }
    next();
  }

  /** Production path: resolve the bearer session token to its principal. */
  private fromSession(req: AuthenticatedRequest): CurrentUser | null {
    const token = extractBearer(req.header('authorization'));
    const resolved = this.sessions.resolve(token);
    if (!resolved) {
      return null;
    }
    return { userId: resolved.userId, role: resolved.role };
  }

  /** Phase-1 dev fallback: the `x-user-id` / `x-user-role` header shim. */
  private fromDevHeaders(req: AuthenticatedRequest): CurrentUser | null {
    const rawId = req.header('x-user-id');
    const rawRole = req.header('x-user-role');
    if (rawId && rawRole && ROLE_VALUES.has(rawRole)) {
      const userId = Number.parseInt(rawId, 10);
      if (Number.isInteger(userId) && userId > 0) {
        return { userId, role: rawRole as Role };
      }
    }
    return null;
  }
}
