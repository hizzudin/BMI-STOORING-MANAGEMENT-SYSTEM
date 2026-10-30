import { SetMetadata } from '@nestjs/common';

/** Metadata key marking a route as not requiring authentication. */
export const IS_PUBLIC = 'is_public';

/**
 * Mark a route public — it bypasses the authentication check in the global
 * {@link RolesGuard}. Used for unauthenticated endpoints such as `/health` and
 * (later) `POST /auth/login`. Everything else requires a resolved principal.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
