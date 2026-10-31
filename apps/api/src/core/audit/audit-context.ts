import type { Role } from '@bmi/shared';
import type { AuthenticatedRequest } from '../auth/current-user.js';

/**
 * Per-request audit enrichment (NFR-02). A handler/service may attach precise
 * `entity`/`entityId`/`before`/`after`/`reason`/`selfDecision` for the single
 * audit record the {@link AuditInterceptor} writes for this mutating call, so a
 * domain action (e.g. "move System Admin") records the fields PRD §9 wants
 * WITHOUT writing a second record — the AC "exactly one audit record" invariant
 * (AC-IAM-002) stays intact.
 *
 * When a handler sets nothing, the interceptor falls back to the generic
 * scaffold record (method + path), exactly as before TASK-104.
 */
export interface AuditContext {
  entity?: string;
  entityId?: number;
  before?: unknown;
  after?: unknown;
  reason?: string;
  userRole?: Role;
  selfDecision?: boolean;
}

/** The symbol under which the audit context hangs off the request. */
const AUDIT_CONTEXT = Symbol('audit_context');

type RequestWithAudit = AuthenticatedRequest & { [AUDIT_CONTEXT]?: AuditContext };

/** Merge enrichment into this request's audit context (create it if absent). */
export function enrichAudit(req: AuthenticatedRequest, patch: AuditContext): void {
  const r = req as RequestWithAudit;
  r[AUDIT_CONTEXT] = { ...(r[AUDIT_CONTEXT] ?? {}), ...patch };
}

/** Read this request's audit context, or `undefined` if nothing was enriched. */
export function readAuditContext(req: AuthenticatedRequest): AuditContext | undefined {
  return (req as RequestWithAudit)[AUDIT_CONTEXT];
}
