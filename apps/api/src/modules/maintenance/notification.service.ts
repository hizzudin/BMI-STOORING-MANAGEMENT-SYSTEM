import { Injectable } from '@nestjs/common';
import { Role } from '@bmi/shared';

/**
 * The event kinds an in-app notification is created for (REQ-NTF-001). These
 * mirror the notification matrix rows (REQ-NTF-005); the schedule late-alert
 * (REQ-SCH-007) and the daily schedule change (REQ-SCH-004) reuse the
 * `ScheduleChange` / `Alert` kinds.
 */
export const NotificationKind = {
  ApprovalWaiting: 'Approval_Waiting',
  StepOpened: 'Step_Opened',
  StepReturned: 'Step_Returned',
  WoRejected: 'WO_Rejected',
  ChangeRequest: 'Change_Request',
  Alert: 'Alert',
  ScheduleChange: 'Schedule_Change',
  ScheduleLate: 'Schedule_Late',
} as const;
export type NotificationKind =
  (typeof NotificationKind)[keyof typeof NotificationKind];

/** A delivered in-app notification record (`notifications`, PRD §9). */
export interface Notification {
  readonly id: number;
  readonly kind: NotificationKind;
  /** The recipient user (PRD §9 `notifications.user_id`). */
  readonly userId: number;
  /** Short human-readable line (bilingual rendering is the client's job). */
  readonly message: string;
  /** Optional WO this notification is about (for de-duplication / linking). */
  readonly workOrderId: number | null;
  /** De-duplication key — one notification per (kind, user, dedupeKey). */
  readonly dedupeKey: string | null;
  readonly isRead: boolean;
  readonly createdAt: string;
}

export interface CreateNotificationInput {
  kind: NotificationKind;
  userId: number;
  message: string;
  workOrderId?: number | null;
  /**
   * When set, a second create with the same (kind, user, dedupeKey) is a no-op,
   * so a daily job re-run or a repeated event yields exactly one notification
   * (REQ-SCH-004 "exactly one alert", REQ-SCH-007 "one late alert").
   */
  dedupeKey?: string | null;
}

/**
 * **In-app notifications** (FG-12, REQ-NTF-001..005).
 *
 * The in-app notice the header bell opens (REQ-NTF-001). Push / WhatsApp / email
 * channels (REQ-NTF-002..004) are later-release adapters (P1/P2); Phase 1 keeps
 * only the in-app record and the recipient routing of the matrix (REQ-NTF-005).
 *
 * **Phase-1 modelling (not a data-model change):** the dummy gateway (TASK-102)
 * models only the nine business aggregates and carries no `notifications` /
 * `notification_deliveries` tables, so — following the TASK-103..113 precedent
 * for cross-cutting Phase-1 state — notifications live in this API-layer
 * in-memory service; TASK-201/202 re-home it behind the real PRD §9 tables
 * unchanged.
 */
@Injectable()
export class NotificationService {
  private readonly notifications = new Map<number, Notification>();
  private nextId = 1;

  /**
   * Create one in-app notification, honouring the de-duplication key: when a
   * (kind, user, dedupeKey) already exists, nothing is created and the existing
   * record is returned (idempotent — a daily-job re-run never doubles up).
   */
  create(input: CreateNotificationInput, now: Date = new Date()): Notification {
    const dedupeKey = input.dedupeKey ?? null;
    if (dedupeKey !== null) {
      const existing = this.find(input.kind, input.userId, dedupeKey);
      if (existing) {
        return existing;
      }
    }
    const notification: Notification = {
      id: this.nextId++,
      kind: input.kind,
      userId: input.userId,
      message: input.message,
      workOrderId: input.workOrderId ?? null,
      dedupeKey,
      isRead: false,
      createdAt: now.toISOString(),
    };
    this.notifications.set(notification.id, notification);
    return notification;
  }

  /**
   * Fan a single event out to several recipients, each as its own in-app
   * notification sharing the de-dupe key (so each recipient gets exactly one).
   */
  createForMany(
    userIds: readonly number[],
    input: Omit<CreateNotificationInput, 'userId'>,
    now: Date = new Date(),
  ): readonly Notification[] {
    // One per distinct recipient (REQ-SCH-007 "each get one late alert").
    const seen = new Set<number>();
    const created: Notification[] = [];
    for (const userId of userIds) {
      if (seen.has(userId)) {
        continue;
      }
      seen.add(userId);
      created.push(this.create({ ...input, userId }, now));
    }
    return created;
  }

  /** Every notification for a user, newest first (the bell list, REQ-NTF-001). */
  listForUser(userId: number): readonly Notification[] {
    return [...this.notifications.values()]
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.id - a.id);
  }

  /** Unread count for the bell badge. */
  unreadCount(userId: number): number {
    return this.listForUser(userId).filter((n) => !n.isRead).length;
  }

  /** Mark one notification read. Returns the updated record, or `null` if absent. */
  markRead(id: number, userId: number): Notification | null {
    const existing = this.notifications.get(id);
    if (!existing || existing.userId !== userId) {
      return null;
    }
    const next: Notification = { ...existing, isRead: true };
    this.notifications.set(id, next);
    return next;
  }

  /** Every notification (for the daily-job / test assertions). */
  listAll(): readonly Notification[] {
    return [...this.notifications.values()].sort((a, b) => a.id - b.id);
  }

  private find(
    kind: NotificationKind,
    userId: number,
    dedupeKey: string,
  ): Notification | undefined {
    return [...this.notifications.values()].find(
      (n) => n.kind === kind && n.userId === userId && n.dedupeKey === dedupeKey,
    );
  }

  /** Test-only reset of the in-memory notification store. */
  resetForTests(): void {
    this.notifications.clear();
    this.nextId = 1;
  }
}

/** The recipient routing the daily job / schedule use (REQ-NTF-005 subset). */
export const SCHEDULE_ALERT_ROLES: readonly Role[] = [Role.FieldCoordinator];
