import { SetMetadata } from '@nestjs/common';
import type { Capability } from './permission-matrix.js';

/** Metadata key under which a route's required capability is stored. */
export const REQUIRE_CAPABILITY = 'require_capability';

/**
 * Declare the PRD §2.2 capability a route requires. The global
 * {@link RolesGuard} reads this and refuses (403) any role whose matrix cell
 * does not grant it. A route with no `@RequireCapability` is treated as not
 * requiring a specific capability (still requires an authenticated principal).
 *
 * @example
 *   @RequireCapability(Capabilities.WoCreate)
 *   @Post()
 *   create() { ... }
 */
export const RequireCapability = (capability: Capability) =>
  SetMetadata(REQUIRE_CAPABILITY, capability);
