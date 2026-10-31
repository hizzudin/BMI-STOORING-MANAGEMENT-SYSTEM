import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Role,
  WorkOrderStatus,
  WORK_ORDER_PRIORITY_ORDER,
  idValue,
  type PartAgeSignal,
  type WorkOrderDto,
  type WorkOrderPriority,
} from '@bmi/shared';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import type { CurrentUser } from '../../core/auth/current-user.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { ChangeRequestsService } from '../change-requests/change-requests.service.js';
import { PartsInventoryService } from '../inventory/parts-inventory.service.js';
import { TyreRegisterService } from '../inventory/tyre-register.service.js';
import { computePartAgeSignal, type PartAgeInput } from './part-age.js';

/** The four kinds of item an Approver decides (REQ-APR-002/003). */
export type ApprovalKind = 'Creation' | 'Amendment' | 'Completion' | 'StockOpname' | 'TyreCount';

/** The tab a kind shows under in the inbox UI (REQ-APR-002/003). */
export type ApprovalTab = 'WorkOrders' | 'Warehouse';

/** One row of the unified approvals inbox (REQ-APR-001/002/003). */
export interface ApprovalInboxItem {
  /** `kind:id` — the id the decider routes a decision to. */
  readonly ref: string;
  readonly kind: ApprovalKind;
  readonly tab: ApprovalTab;
  /** The WO/plate/document label shown in the list. */
  readonly title: string;
  readonly requestedBy: number;
  readonly submittedAt: string | null;
  /** Urgency for ordering — Urgent/High first (REQ-WO-015); null for warehouse items. */
  readonly priority: WorkOrderPriority | null;
  /** True when the viewer raised/counted it (REQ-APR-006 — hidden unless System Admin). */
  readonly isMine: boolean;
  /** The part-age / early-failure signals for a part-replacing WO/CR (DQ-07, REQ-APR-011). */
  readonly partAge: readonly PartAgeSignal[];
}

/** The decision payload the inbox routes to the owning service. */
export interface DecideInput {
  action: 'approve' | 'reject';
  /** Required when `action === 'reject'` (REQ-APR-004, AC-APR-004). */
  reason?: string;
  version?: number;
  /** Optional part-age inputs the reviewer confirmed (DQ-07) — passed through on read. */
}

/**
 * **Approvals inbox** (FG-10, REQ-APR, BR-03, BR-04, DQ-07).
 *
 * A unified **read / aggregation + routing** surface over the owning services —
 * it never duplicates their approve/reject logic. It lists everything awaiting
 * a decider's decision: WO **creation** approvals, **amendment** approvals (the
 * change requests of FG-9), **completion** approvals and **warehouse count**
 * approvals (stock opname + tyre count from FG-8). Items are ordered with
 * Urgent/High first (REQ-WO-015) where a WO priority applies.
 *
 * Four-eyes visibility (REQ-APR-006, BR-03): a user does not see the items they
 * created/counted, **except** a System Admin, who sees them marked `isMine`
 * (and may self-approve). When one Approver decides an item it leaves every
 * Approver's list (REQ-APR-005) — a consequence of reading live state from the
 * owning services, not a cached copy.
 *
 * Part-age / early-failure (DQ-07, REQ-APR-011): when a reviewed WO/CR replaces
 * a part or tyre, the review surfaces the part-age signal (days/km used, normal
 * life, life-used %, Early-failure flag) computed by {@link computePartAgeSignal}
 * from the replacement facts the WO carries (life-used = max(km, days) ÷ normal
 * life; flag when below tolerance, REQ-BSL-009). The flag never blocks the WO.
 *
 * The actual approve/reject calls are routed to the owning services:
 * {@link WorkOrdersService} (creation/completion), {@link ChangeRequestsService}
 * (amendment), {@link PartsInventoryService} (stock opname) and
 * {@link TyreRegisterService} (tyre count). The tyre-count decision runs inside
 * the gateway's `unitOfWork` (its SM-TYRE writes need it).
 */
@Injectable()
export class ApprovalsService {
  /**
   * Phase-1: the part-age facts a WO carries for its replacements, keyed by WO
   * id. The dummy gateway does not model `vehicle_part_items` / `part_item_types`
   * / `early_failure_events` (REQ-BSL master data is not built yet), so — per the
   * TASK-103..112 precedent — the reviewer's part-age inputs live here as
   * API-layer in-memory state; TASK-201/202 re-home them behind PRD §9 BSL tables
   * unchanged, and the computation rule (REQ-BSL-009) stays in {@link part-age}.
   */
  private readonly partAgeByWorkOrder = new Map<number, PartAgeInput[]>();

  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly workOrders: WorkOrdersService,
    private readonly changeRequests: ChangeRequestsService,
    private readonly parts: PartsInventoryService,
    private readonly tyres: TyreRegisterService,
  ) {}

  /**
   * Register the part-age facts for a WO's replacement(s) so the creation /
   * amendment review can surface the DQ-07 signal (REQ-APR-011). In Phase 1 the
   * originating step/baseline supplies these; the daily job / BSL module fills
   * them from `vehicle_part_items` later. Idempotent per WO.
   */
  setPartAgeFacts(workOrderId: number, facts: readonly PartAgeInput[]): void {
    this.partAgeByWorkOrder.set(workOrderId, facts.map((f) => ({ ...f })));
  }

  // --- inbox (REQ-APR-001/002/003) -----------------------------------------

  /**
   * The unified approvals inbox for a decider, ordered Urgent/High first
   * (REQ-WO-015) then by submitted time. Hides a viewer's own items unless they
   * are a System Admin (REQ-APR-006, BR-03). Optionally filter by tab.
   */
  async inbox(user: CurrentUser, tab?: ApprovalTab): Promise<readonly ApprovalInboxItem[]> {
    const items: ApprovalInboxItem[] = [];
    items.push(...(await this.creationItems(user)));
    items.push(...(await this.amendmentItems(user)));
    items.push(...(await this.completionItems(user)));
    items.push(...this.stockOpnameItems(user));
    items.push(...(await this.tyreCountItems(user)));

    const visible = items.filter((it) => !it.isMine || user.role === Role.SystemAdmin);
    const scoped = tab ? visible.filter((it) => it.tab === tab) : visible;
    return [...scoped].sort((a, b) => this.compare(a, b));
  }

  /** The badge count for the Approvals sidebar item (REQ-APR-001). */
  async count(user: CurrentUser): Promise<number> {
    return (await this.inbox(user)).length;
  }

  // --- decide routing (REQ-APR-004/005) ------------------------------------

  /**
   * Route a decision (`approve` / `reject`) to the owning service for `ref`
   * (`kind:id`). A rejection needs a reason (REQ-APR-004, AC-APR-004). Approving
   * removes the item from every Approver's list (REQ-APR-005) because the inbox
   * reads live state. Four-eyes (BR-03) is enforced by each owning service.
   */
  async decide(user: CurrentUser, ref: string, input: DecideInput): Promise<unknown> {
    const { kind, id } = this.parseRef(ref);
    if (input.action === 'reject' && !input.reason?.trim()) {
      throw new BadRequestException('A rejection needs a reason (REQ-APR-004, AC-APR-004).');
    }
    switch (kind) {
      case 'Creation': {
        const version = await this.versionFor(id, input.version);
        return input.action === 'approve'
          ? this.workOrders.approve(id, user, version)
          : this.workOrders.reject(id, user, { version, reason: input.reason!.trim() });
      }
      case 'Completion': {
        const version = await this.versionFor(id, input.version);
        if (input.action === 'approve') {
          return this.workOrders.approveCompletion(id, user, version);
        }
        // A rejected completion keeps the WO Pending_Verification (SM-WO T14,
        // ASM-09); the completion request is withdrawn via the engine's return,
        // which is out of this inbox's scope — surface a clear refusal.
        throw new ConflictException(
          'Reject a completion by returning a step (SM-WO T14); the inbox only approves completion.',
        );
      }
      case 'Amendment': {
        return input.action === 'approve'
          ? this.changeRequests.approveRevision(id, user)
          : this.changeRequests.rejectRevision(id, user, input.reason!.trim());
      }
      case 'StockOpname': {
        return input.action === 'approve'
          ? this.parts.approveOpname(id, user.userId, user.role === Role.SystemAdmin)
          : this.parts.rejectOpname(id, input.reason!.trim());
      }
      case 'TyreCount': {
        if (input.action === 'reject') {
          return this.tyres.rejectCount(id, input.reason!.trim());
        }
        return this.gateway.unitOfWork((ctx) =>
          this.tyres.approveCount(ctx.repos, id, user.userId, user.role === Role.SystemAdmin),
        );
      }
      default: {
        const _exhaustive: never = kind;
        throw new NotFoundException(`Unknown approval kind: ${String(_exhaustive)}`);
      }
    }
  }

  /** Test-only reset. */
  resetForTests(): void {
    this.partAgeByWorkOrder.clear();
  }

  // --- aggregation helpers -------------------------------------------------

  private async creationItems(user: CurrentUser): Promise<ApprovalInboxItem[]> {
    const wos = await this.workOrders.list({ status: WorkOrderStatus.PendingApproval });
    return wos.map((wo) => this.woItem(wo, 'Creation', wo.createdAt, user));
  }

  private async completionItems(user: CurrentUser): Promise<ApprovalInboxItem[]> {
    const wos = await this.workOrders.list({ status: WorkOrderStatus.PendingVerification });
    return wos
      .filter((wo) => wo.completionRequestedAt !== null)
      .map((wo) => this.woItem(wo, 'Completion', wo.completionRequestedAt, user));
  }

  private async amendmentItems(user: CurrentUser): Promise<ApprovalInboxItem[]> {
    const crs = this.changeRequests.listAwaitingDecision();
    const items: ApprovalInboxItem[] = [];
    for (const cr of crs) {
      const wo = await this.workOrders.require(idValue(cr.workOrderId));
      items.push({
        ref: `Amendment:${idValue(cr.id)}`,
        kind: 'Amendment',
        tab: 'WorkOrders',
        title: `${wo.number} — ${wo.description}`,
        requestedBy: idValue(cr.raisedBy),
        submittedAt: cr.revisionSentAt,
        priority: wo.priority,
        // The amendment decision is the WO creator's (REQ-CR-001); "mine" when
        // the viewer raised the CR (hidden unless System Admin, BR-03).
        isMine: idValue(cr.raisedBy) === user.userId,
        partAge: this.partAgeOf(idValue(wo.id)),
      });
    }
    return items;
  }

  private stockOpnameItems(user: CurrentUser): ApprovalInboxItem[] {
    return this.parts
      .listOpnames()
      .filter((o) => o.status === 'Pending_Approval')
      .map((o) => {
        const counter = o.submittedBy ?? o.createdBy;
        return {
          ref: `StockOpname:${o.id}`,
          kind: 'StockOpname' as const,
          tab: 'Warehouse' as const,
          title: `${o.saNumber} — stock opname (${o.rows.length} rows)`,
          requestedBy: counter,
          submittedAt: null,
          priority: null,
          isMine: counter === user.userId,
          partAge: [],
        };
      });
  }

  private async tyreCountItems(user: CurrentUser): Promise<ApprovalInboxItem[]> {
    // TyreRegisterService exposes counts by id; list awaiting via the known ids.
    const counts = this.tyres.listCountsAwaitingApproval();
    return counts.map((c) => {
      const counter = c.submittedBy ?? c.createdBy;
      return {
        ref: `TyreCount:${c.id}`,
        kind: 'TyreCount' as const,
        tab: 'Warehouse' as const,
        title: `${c.tcNumber} — tyre count (${c.rows.length} rows)`,
        requestedBy: counter,
        submittedAt: null,
        priority: null,
        isMine: counter === user.userId,
        partAge: [],
      };
    });
  }

  private woItem(
    wo: WorkOrderDto,
    kind: Extract<ApprovalKind, 'Creation' | 'Completion'>,
    submittedAt: string | null,
    user: CurrentUser,
  ): ApprovalInboxItem {
    return {
      ref: `${kind}:${idValue(wo.id)}`,
      kind,
      tab: 'WorkOrders',
      title: `${wo.number} — ${wo.description}`,
      requestedBy: idValue(wo.createdBy),
      submittedAt,
      priority: wo.priority,
      // REQ-APR-006 / BR-03: the creator doesn't see their own item (unless SA).
      isMine: idValue(wo.createdBy) === user.userId,
      partAge: this.partAgeOf(idValue(wo.id)),
    };
  }

  /** The DQ-07 part-age signals for a WO's replacements (REQ-APR-011). */
  private partAgeOf(workOrderId: number): readonly PartAgeSignal[] {
    const facts = this.partAgeByWorkOrder.get(workOrderId) ?? [];
    return facts.map((f) => computePartAgeSignal(f));
  }

  /** Urgency-first ordering (REQ-WO-015): Urgent/High first, then newest submitted. */
  private compare(a: ApprovalInboxItem, b: ApprovalInboxItem): number {
    const pa = a.priority === null ? WORK_ORDER_PRIORITY_ORDER.length : WORK_ORDER_PRIORITY_ORDER.indexOf(a.priority);
    const pb = b.priority === null ? WORK_ORDER_PRIORITY_ORDER.length : WORK_ORDER_PRIORITY_ORDER.indexOf(b.priority);
    if (pa !== pb) {
      return pa - pb;
    }
    return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '');
  }

  private parseRef(ref: string): { kind: ApprovalKind; id: number } {
    const [kind, rawId] = ref.split(':');
    const id = Number(rawId);
    if (!kind || !Number.isInteger(id) || id <= 0) {
      throw new BadRequestException(`Malformed approval ref: ${ref}`);
    }
    const kinds: readonly ApprovalKind[] = ['Creation', 'Amendment', 'Completion', 'StockOpname', 'TyreCount'];
    if (!kinds.includes(kind as ApprovalKind)) {
      throw new BadRequestException(`Unknown approval kind in ref: ${ref}`);
    }
    return { kind: kind as ApprovalKind, id };
  }

  /** Resolve the optimistic-lock version for a WO decision (current if omitted). */
  private async versionFor(workOrderId: number, provided: number | undefined): Promise<number> {
    if (provided !== undefined) {
      return provided;
    }
    const wo = await this.workOrders.require(workOrderId);
    return wo.version;
  }
}
