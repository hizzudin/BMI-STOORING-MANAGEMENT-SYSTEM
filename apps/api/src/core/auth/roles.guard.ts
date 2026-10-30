import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './current-user.js';
import { IS_PUBLIC } from './public.decorator.js';
import { REQUIRE_CAPABILITY } from './require-capability.decorator.js';
import { type Capability, roleHasCapability } from './permission-matrix.js';

/**
 * The global, server-authoritative role guard (NFR-04 / REQ-IAM-006).
 *
 * Applied to every route (registered as an `APP_GUARD` in `AppModule`), so the
 * role is checked on every action on the server — not only in the interface.
 *
 * Decision order:
 *   1. `@Public()` routes pass without authentication (e.g. `/health`).
 *   2. A request with no resolved principal is rejected 401.
 *   3. A route with no `@RequireCapability` needs only authentication.
 *   4. Otherwise the principal's role must be granted the required capability in
 *      the PRD §2.2 matrix, else 403 (server-side refusal, default-deny).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.currentUser;
    if (!principal) {
      throw new UnauthorizedException('Authentication required.');
    }

    const requiredCapability = this.reflector.getAllAndOverride<Capability | undefined>(
      REQUIRE_CAPABILITY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredCapability) {
      // Authenticated, but no specific capability demanded by this route.
      return true;
    }

    if (!roleHasCapability(principal.role, requiredCapability)) {
      throw new ForbiddenException(
        `Role '${principal.role}' is not permitted to perform '${requiredCapability}'.`,
      );
    }
    return true;
  }
}
