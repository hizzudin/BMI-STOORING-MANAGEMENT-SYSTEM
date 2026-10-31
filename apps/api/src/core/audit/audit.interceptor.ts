import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { AuthenticatedRequest } from '../auth/current-user.js';
import { AuditService } from './audit.service.js';
import { readAuditContext } from './audit-context.js';
import { SKIP_AUDIT } from './skip-audit.decorator.js';

/** HTTP methods that do not change state and therefore need no audit record. */
const READ_ONLY_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The global audit interceptor (NFR-02): every **mutating** HTTP call
 * (POST/PUT/PATCH/DELETE) that completes successfully appends one append-only
 * `audit_logs` record. Read-only calls (GET/HEAD/OPTIONS) are skipped.
 *
 * At scaffold stage the record captures the actor (from the resolved
 * principal), the action (`METHOD path`) and the request path as the entity;
 * feature modules refine `entity`/`entity_id`/`before`/`after`/`reason` as they
 * are built. Writing after the handler resolves means a failed/refused request
 * (e.g. a 403 from the role guard) produces no audit record.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const method = request.method.toUpperCase();

    if (READ_ONLY_METHODS.has(method)) {
      return next.handle();
    }

    // A read-only computation forced onto a mutating method (e.g. the live
    // composer check, REQ-REG-004) opts out via @SkipAudit — it changes no state.
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const principal = request.currentUser;
    const path = request.originalUrl ?? request.url;

    return next.handle().pipe(
      tap(() => {
        // A handler/service may have enriched the record with precise domain
        // fields (before/after/reason/entity/self_decision). Absent enrichment,
        // fall back to the generic scaffold record (method + path). Either way
        // this is the ONE record for the call (AC-IAM-002).
        const ctx = readAuditContext(request);
        this.audit.append({
          entity: ctx?.entity ?? path,
          entityId: ctx?.entityId,
          action: `${method} ${path}`,
          before: ctx?.before,
          after: ctx?.after,
          reason: ctx?.reason,
          userId: principal?.userId ?? null,
          userRole: ctx?.userRole ?? principal?.role ?? null,
          selfDecision: ctx?.selfDecision,
        });
      }),
    );
  }
}
