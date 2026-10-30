import type { Role } from '@bmi/shared';

/**
 * One append-only audit record, mirroring the PRD §9 `audit_logs` table shape
 * exactly (NFR-02):
 *
 *   entity, entity_id, action, before JSONB, after JSONB, reason,
 *   user_id, user_role, self_decision, at TIMESTAMP DEFAULT now()
 *
 * The scaffold writes one record per mutating HTTP call; feature modules will
 * later supply precise `entity`/`entity_id`/`before`/`after`/`reason` values
 * through the audit context. Fields are read-only: records are never mutated,
 * only appended (append-only, PRD §9 "AO").
 */
export interface AuditLog {
  /** The aggregate/table affected (PRD §9 `entity VARCHAR(60)`). */
  readonly entity: string;
  /** The affected row id, or `0` when not yet known at scaffold stage. */
  readonly entityId: number;
  /** The action performed (PRD §9 `action VARCHAR(40)`), e.g. `POST /work-orders`. */
  readonly action: string;
  /** Prior state snapshot (PRD §9 `before JSONB`), when captured. */
  readonly before: unknown | null;
  /** New state snapshot (PRD §9 `after JSONB`), when captured. */
  readonly after: unknown | null;
  /** Optional reason text (PRD §9 `reason TEXT`). */
  readonly reason: string | null;
  /** The acting user's id (PRD §9 `user_id`), or `null` if unauthenticated. */
  readonly userId: number | null;
  /** The acting user's role (PRD §9 `user_role role_t`), or `null`. */
  readonly userRole: Role | null;
  /** Self-approved / self-verified flag (PRD §9 `self_decision`, BR-03). */
  readonly selfDecision: boolean;
  /** When it happened (PRD §9 `at TIMESTAMP`), stored UTC (NFR-14). */
  readonly at: Date;
}

/** The fields a caller supplies when appending a record; the rest default. */
export type AuditLogInput = Partial<Omit<AuditLog, 'at'>> &
  Pick<AuditLog, 'entity' | 'action'>;
