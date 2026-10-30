import type { Request } from 'express';
import type { Role } from '@bmi/shared';

/**
 * The authenticated principal attached to every request.
 *
 * TASK-103 is the scaffold: real authentication (login, sessions, lockout) is
 * TASK-104 (IAM). Here the principal is resolved by {@link DevAuthMiddleware}
 * from request headers so the role guard, audit interceptor and idempotency
 * layer can be built and tested now. The *shape* is stable — TASK-104 swaps only
 * how it is populated (a verified session instead of a header), not its consumers.
 */
export interface CurrentUser {
  /** The user's numeric id (PRD §9 `users.id`). */
  readonly userId: number;
  /** The single role the account holds (BR-14, one role per user). */
  readonly role: Role;
}

/**
 * The Express request augmented with the resolved principal. `currentUser` is
 * set by {@link DevAuthMiddleware} and read by the guard/interceptor; it is
 * `undefined` for an unauthenticated request (the guard then refuses).
 */
export interface AuthenticatedRequest extends Request {
  currentUser?: CurrentUser;
}
