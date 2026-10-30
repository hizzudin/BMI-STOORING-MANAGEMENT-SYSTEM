import { Injectable } from '@nestjs/common';
import type { AuditLog, AuditLogInput } from './audit-log.js';

/**
 * The dummy, in-memory `audit_logs` sink for Phase 1 (NFR-02).
 *
 * The `DataGateway` (TASK-102) models the nine business aggregates only, not the
 * cross-cutting audit table; the audit log is an API-layer concern, so this
 * service is its Phase-1 backing store. It is **append-only**: `append` adds a
 * record, and there is no update/delete. TASK-104/TASK-201 move this behind the
 * real `audit_logs` table (PRD §9) without changing the interceptor's contract.
 */
@Injectable()
export class AuditService {
  private readonly records: AuditLog[] = [];

  /** Append one audit record, filling the defaults a caller omits. */
  append(input: AuditLogInput): AuditLog {
    const record: AuditLog = {
      entity: input.entity,
      entityId: input.entityId ?? 0,
      action: input.action,
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason ?? null,
      userId: input.userId ?? null,
      userRole: input.userRole ?? null,
      selfDecision: input.selfDecision ?? false,
      at: new Date(),
    };
    this.records.push(record);
    return record;
  }

  /** Every record appended so far (newest last). Read-only view for tests/reads. */
  all(): readonly AuditLog[] {
    return this.records;
  }

  /** Records for one entity id, matching the PRD §9 `ix_audit_entity` lookup. */
  findByEntity(entity: string, entityId?: number): readonly AuditLog[] {
    return this.records.filter(
      (r) => r.entity === entity && (entityId === undefined || r.entityId === entityId),
    );
  }

  /** Number of records appended. */
  count(): number {
    return this.records.length;
  }
}
