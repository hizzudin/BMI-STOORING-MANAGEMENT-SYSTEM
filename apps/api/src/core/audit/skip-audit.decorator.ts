import { SetMetadata } from '@nestjs/common';

/** Metadata key marking a mutating-method route as not needing an audit record. */
export const SKIP_AUDIT = 'skip_audit';

/**
 * Mark a route to be skipped by the global {@link AuditInterceptor} even though
 * it uses a mutating HTTP method.
 *
 * The interceptor audits by HTTP method (POST/PUT/PATCH/DELETE change state and
 * are audited; GET/HEAD/OPTIONS are not — NFR-02). A handful of endpoints are
 * **read-only computations that must be POST** because they take a structured
 * request body rather than query params — for example the live composer check
 * (`POST /registry/composer/check`, REQ-REG-004), which the Create WO screen
 * runs on every edit and which changes no state. Auditing those would spam the
 * append-only log with no value. This decorator opts such a route out, mirroring
 * the {@link Public} pattern; it never affects a state-changing call.
 */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT, true);
