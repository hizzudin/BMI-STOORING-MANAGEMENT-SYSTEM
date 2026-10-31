import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  idValue,
  InvalidTransitionError,
  smTyre,
  TyreEvent,
  TyreStatus,
  TyreType,
  type TyreDto,
} from '@bmi/shared';
import type { TransactionRepositories } from '@bmi/data-gateway';
import { createDefaultNumberGenerator } from '@bmi/config';

/**
 * The `tyre_statuses` rows are seeded densely in SM-TYRE declaration order
 * (PRD §9.9): In_Stock = 1, Issued = 2, Mounted = 3, Needs_Retread = 4,
 * Worn_Out = 5, On_Retread = 6, Scrapped = 7, Lost = 8. Map a status code to its
 * seeded id so a status write fills `statusId` consistently with the seed.
 */
const STATUS_ID: Record<TyreStatus, number> = {
  [TyreStatus.InStock]: 1,
  [TyreStatus.Issued]: 2,
  [TyreStatus.Mounted]: 3,
  [TyreStatus.NeedsRetread]: 4,
  [TyreStatus.WornOut]: 5,
  [TyreStatus.OnRetread]: 6,
  [TyreStatus.Scrapped]: 7,
  [TyreStatus.Lost]: 8,
};

/**
 * The SM-TYRE events the warehouse lifecycle drives (all have a from-state in
 * §3.6, so they are valid arguments to `smTyre.transition`). Receive is the
 * fromless `(new) → In_Stock` and is handled outside {@link TyreRegisterService.drive}.
 */
type WarehouseTyreEvent =
  | typeof TyreEvent.WornOutDialog
  | typeof TyreEvent.ScrapDialog
  | typeof TyreEvent.RetreadDispatch
  | typeof TyreEvent.RetreadAccepted
  | typeof TyreEvent.RetreadRejected
  | typeof TyreEvent.CountMissing;

/** One tyre-history event (`tyre_events`, PRD §9.9; REQ-TYR-013). */
export interface TyreEventRow {
  readonly id: number;
  readonly tyreId: number;
  readonly event: TyreEvent;
  readonly fromStatus: TyreStatus | null;
  readonly toStatus: TyreStatus;
  /** The document that caused the change (receipt/dispatch/count number, BR-06). */
  readonly referenceDoc: string;
  readonly reason: string | null;
  readonly at: string;
  readonly byUserId: number;
}

/** A retread dispatch (`retread_orders`, PRD §9.9; SM-RD). */
export interface RetreadDispatch {
  readonly id: number;
  readonly rdNumber: string;
  readonly vendor: string;
  status: 'Sent' | 'Partial' | 'Closed';
  readonly tyreIds: readonly number[];
  readonly results: Map<number, 'Accepted' | 'Rejected' | 'NotReturnedYet'>;
  readonly deliveryNoteNumber: string | null;
  readonly expectedReturn: string | null;
  readonly dispatchedBy: number;
  readonly dispatchedAt: string;
}

/** A tyre count (`tyre_counts`, PRD §9.9; SM-TC). */
export interface TyreCount {
  readonly id: number;
  readonly tcNumber: string;
  status: 'Draft' | 'Pending_Approval' | 'Approved';
  readonly createdBy: number;
  submittedBy: number | null;
  approvedBy: number | null;
  approvedAt: string | null;
  selfApproved: boolean;
  returnedReason: string | null;
  readonly rows: readonly TyreCountRow[];
}

/** One tyre-count row (`tyre_count_items`, PRD §9.9). */
export interface TyreCountRow {
  readonly tyreId: number;
  readonly result: 'Found' | 'Missing';
  readonly reason: string | null;
  readonly note: string | null;
}

/**
 * **Tyre register** (FG-8, REQ-TYR, SM-TYRE, BR-11): the warehouse-side tyre
 * lifecycle — receive → retread dispatch → retread return (accepted/rejected) →
 * worn-out → scrap → count — with generated `TY-xxxx` codes and `tyre_events`.
 *
 * A tyre is an **individual asset, never a catalog part** (REQ-TYR-001): no SKU,
 * no quantity, no stock card, never in a Goods Receipt or stock opname. Every
 * status move goes through `@bmi/shared`'s {@link smTyre} guard, so a transition
 * not in PRD §3.6 is refused; the status write is a real gateway `tyres` write
 * done **inside the caller's `unitOfWork`**, so it is atomic + optimistic-locked
 * with the register write (BR-06).
 *
 * **Mount / rotate / demount on the chassis is owned by TASK-111 (Part
 * Replacement)** — this service deliberately does NOT reimplement placement. It
 * owns receive/retread/worn-out/scrap/count and the tyre-event history.
 *
 * Phase-1 modelling (recorded in design.md): the dummy gateway (TASK-102) carries
 * `tyres` as a real aggregate (status always a genuine gateway write), but no
 * `tyre_events` / `tyre_receipts` / `retread_orders` / `tyre_counts` tables, so —
 * as with TASK-111 — the event history and the receipt/dispatch/count documents
 * live here as API-layer in-memory state; the `TY-xxxx` codes come from the
 * `@bmi/config` never-reused generator (NFR-15). TASK-201/202 re-home them behind
 * the real PRD §9.9 tables unchanged.
 */
@Injectable()
export class TyreRegisterService {
  private readonly numbers = createDefaultNumberGenerator();
  private readonly events: TyreEventRow[] = [];
  private dispatches: RetreadDispatch[] = [];
  private counts: TyreCount[] = [];
  private nextEventId = 1;
  private nextDispatchId = 1;
  private nextCountId = 1;
  /** Highest TY sequence already issued in the seed, so new codes never collide. */
  private tyreSequenceSynced = false;

  // --- receive tyres (REQ-TYR-006, SM-TYRE (new) → In_Stock) ---------------

  /**
   * Receive one or more New/Existing tyres (REQ-TYR-006). Each tyre gets a
   * generated `TY-xxxx` code (never typed, edited or reused — NFR-15), is
   * inserted into the gateway `tyres` aggregate as In_Stock, and records a
   * ReceiveNew `tyre_events` row (SM-TYRE (new) → In_Stock). A Supplier source
   * requires an invoice number; Existing (go-live) requires none. All rows are
   * inserted in the caller's `unitOfWork`, so a bad row receives nothing.
   */
  async receive(
    repos: TransactionRepositories,
    userId: number,
    input: {
      source: 'Supplier' | 'Existing';
      invoiceNumber?: string;
      tyres: readonly {
        serialNumber: string;
        brand: string;
        size: string;
        tyreType: string;
        treadMm?: number;
        cost?: number;
        rack?: string;
      }[];
    },
  ): Promise<readonly TyreDto[]> {
    if (input.tyres.length === 0) {
      throw new BadRequestException('Receive tyres needs at least one tyre (REQ-TYR-006).');
    }
    if (input.source === 'Supplier' && !input.invoiceNumber) {
      throw new BadRequestException(
        'A Supplier tyre receipt requires an invoice number (REQ-TYR-006).',
      );
    }
    await this.syncTyreSequence(repos);
    const trNumber = this.numbers.next('TR');
    const at = new Date().toISOString();
    const received: TyreDto[] = [];
    for (const line of input.tyres) {
      if (line.tyreType !== TyreType.Tube && line.tyreType !== TyreType.Tubeless) {
        throw new BadRequestException(`Invalid tyre type: ${line.tyreType}`);
      }
      // SM-TYRE "(new) → In_Stock" (ReceiveNew) has no from-state — a receive
      // creates the tyre already In_Stock, so there is no guard move to apply;
      // the event is recorded below for the history (REQ-TYR-013).
      const code = this.numbers.next('TY');
      const inserted = await repos.tyres.insert({
        code,
        serialNumber: line.serialNumber,
        brand: line.brand,
        size: line.size,
        tyreType: line.tyreType,
        statusId: toId(STATUS_ID[TyreStatus.InStock]),
        status: TyreStatus.InStock,
        issuedWorkOrderId: null,
      } as Omit<TyreDto, 'id' | 'version'>);
      this.appendEvent({
        tyreId: idValue(inserted.id),
        event: TyreEvent.ReceiveNew,
        fromStatus: null,
        toStatus: TyreStatus.InStock,
        referenceDoc: trNumber,
        reason: null,
        at,
        byUserId: userId,
      });
      received.push(inserted);
    }
    return received;
  }

  // --- worn out / scrap (REQ-TYR-010, SM-TYRE) -----------------------------

  /**
   * Mark a Needs_Retread tyre Worn_Out (REQ-TYR-010, SM-TYRE Needs_Retread →
   * Worn_Out via the Worn out dialog). Refused from any other status by the
   * guard.
   */
  async markWornOut(
    repos: TransactionRepositories,
    tyreId: number,
    userId: number,
    input: { reason: string; note?: string },
  ): Promise<TyreDto> {
    return this.drive(repos, tyreId, TyreEvent.WornOutDialog, userId, {
      referenceDoc: 'WORN-OUT',
      reason: input.reason,
      note: input.note ?? null,
    });
  }

  /**
   * Scrap a Needs_Retread or Worn_Out tyre (REQ-TYR-010, SM-TYRE Scrap dialog →
   * Scrapped, final). Refused from any status the §3.6 scrap-dialog row does not
   * list.
   */
  async scrap(
    repos: TransactionRepositories,
    tyreId: number,
    userId: number,
    input: { reason: string; note?: string; disposalReference?: string },
  ): Promise<TyreDto> {
    return this.drive(repos, tyreId, TyreEvent.ScrapDialog, userId, {
      referenceDoc: input.disposalReference ?? 'SCRAP',
      reason: input.reason,
      note: input.note ?? null,
    });
  }

  // --- retread dispatch & return (REQ-TYR-008/009, SM-TYRE, SM-RD) ---------

  /**
   * Send Needs_Retread tyres to a vendor (REQ-TYR-008). Each tyre moves
   * Needs_Retread → On_Retread (SM-TYRE RetreadDispatch) and the dispatch gets a
   * generated RD number; no approval, no WO. All tyre writes run in the caller's
   * `unitOfWork`.
   */
  async dispatchRetread(
    repos: TransactionRepositories,
    userId: number,
    input: {
      vendor: string;
      tyreIds: readonly number[];
      deliveryNoteNumber?: string;
      expectedReturn?: string;
    },
  ): Promise<RetreadDispatch> {
    if (input.tyreIds.length === 0) {
      throw new BadRequestException('A retread dispatch needs at least one tyre (REQ-TYR-008).');
    }
    const rdNumber = this.numbers.next('RD');
    const at = new Date().toISOString();
    for (const tyreId of input.tyreIds) {
      await this.drive(repos, tyreId, TyreEvent.RetreadDispatch, userId, {
        referenceDoc: rdNumber,
        reason: null,
        note: null,
      });
    }
    const dispatch: RetreadDispatch = {
      id: this.nextDispatchId++,
      rdNumber,
      vendor: input.vendor,
      status: 'Sent',
      tyreIds: [...input.tyreIds],
      results: new Map(),
      deliveryNoteNumber: input.deliveryNoteNumber ?? null,
      expectedReturn: input.expectedReturn ?? null,
      dispatchedBy: userId,
      dispatchedAt: at,
    };
    this.dispatches.push(dispatch);
    return dispatch;
  }

  /**
   * Confirm a retread return against a dispatch (REQ-TYR-009, SM-TYRE). Per
   * tyre: Accepted → In_Stock (retread count +1); Rejected → Scrapped (reason
   * required); NotReturnedYet → stays On_Retread. The dispatch stays open
   * (Partial) while any tyre is unreturned and closes when every tyre is
   * Accepted or Rejected. All status writes run in the caller's `unitOfWork`.
   */
  async confirmRetreadReturn(
    repos: TransactionRepositories,
    dispatchId: number,
    userId: number,
    results: readonly {
      tyreId: number;
      result: 'Accepted' | 'Rejected' | 'NotReturnedYet';
      cost?: number;
      newTreadMm?: number;
      invoiceNumber?: string;
      rejectReason?: string;
    }[],
  ): Promise<RetreadDispatch> {
    const dispatch = this.dispatches.find((d) => d.id === dispatchId);
    if (!dispatch) {
      throw new NotFoundException(`Unknown retread dispatch: ${dispatchId}`);
    }
    if (dispatch.status === 'Closed') {
      throw new ConflictException(`Retread dispatch ${dispatch.rdNumber} is already closed.`);
    }
    for (const r of results) {
      if (!dispatch.tyreIds.includes(r.tyreId)) {
        throw new BadRequestException(
          `Tyre ${r.tyreId} is not on retread dispatch ${dispatch.rdNumber}.`,
        );
      }
      if (r.result === 'NotReturnedYet') {
        dispatch.results.set(r.tyreId, 'NotReturnedYet');
        continue;
      }
      if (r.result === 'Rejected' && !r.rejectReason) {
        throw new BadRequestException(
          `A rejected retread return needs a reason (REQ-TYR-009, AC-TYR-004).`,
        );
      }
      const event = r.result === 'Accepted' ? TyreEvent.RetreadAccepted : TyreEvent.RetreadRejected;
      await this.drive(repos, r.tyreId, event, userId, {
        referenceDoc: dispatch.rdNumber,
        reason: r.result === 'Rejected' ? (r.rejectReason ?? null) : null,
        note: null,
      });
      dispatch.results.set(r.tyreId, r.result);
    }
    // SM-RD: open while any tyre is not yet resolved; closed when all are.
    const allResolved = dispatch.tyreIds.every((id) => {
      const res = dispatch.results.get(id);
      return res === 'Accepted' || res === 'Rejected';
    });
    dispatch.status = allResolved ? 'Closed' : 'Partial';
    return dispatch;
  }

  // --- tyre count (REQ-TYR-011/012, SM-TC, SM-TYRE) ------------------------

  tyreCount(id: number): TyreCount | undefined {
    return this.counts.find((c) => c.id === id);
  }

  /**
   * Create a Draft tyre count (REQ-TYR-011): each warehouse tyre (In_Stock,
   * Needs_Retread, Worn_Out) is Found or Missing; Missing needs a reason. No
   * status changes until approval.
   */
  createCount(
    rows: readonly { tyreId: number; result: 'Found' | 'Missing'; reason?: string; note?: string }[],
    userId: number,
  ): TyreCount {
    if (rows.length === 0) {
      throw new BadRequestException('A tyre count needs at least one row (REQ-TYR-011).');
    }
    const countRows: TyreCountRow[] = rows.map((r) => ({
      tyreId: r.tyreId,
      result: r.result,
      reason: r.reason ?? null,
      note: r.note ?? null,
    }));
    const count: TyreCount = {
      id: this.nextCountId++,
      tcNumber: this.numbers.next('TC'),
      status: 'Draft',
      createdBy: userId,
      submittedBy: null,
      approvedBy: null,
      approvedAt: null,
      selfApproved: false,
      returnedReason: null,
      rows: countRows,
    };
    this.counts.push(count);
    return count;
  }

  /** Submit a Draft tyre count for approval (SM-TC). Missing rows need a reason. */
  submitCount(id: number, userId: number): TyreCount {
    const count = this.requireCount(id);
    if (count.status !== 'Draft') {
      throw new BadRequestException(`Tyre count ${count.tcNumber} is not a Draft.`);
    }
    const missing = count.rows.find((r) => r.result === 'Missing' && !r.reason);
    if (missing) {
      throw new BadRequestException(
        `Tyre ${missing.tyreId} is Missing with no reason (REQ-TYR-011).`,
      );
    }
    count.status = 'Pending_Approval';
    count.submittedBy = userId;
    return count;
  }

  /**
   * **Approve** a tyre count (REQ-TYR-012, BR-12): write a Missing event and set
   * each missing tyre Lost (SM-TYRE CountMissing → Lost), in the caller's
   * `unitOfWork`. Four-eyes (BR-03): the counter may not approve unless a System
   * Admin, who is marked self-approved.
   */
  async approveCount(
    repos: TransactionRepositories,
    id: number,
    approverId: number,
    isSystemAdmin: boolean,
  ): Promise<TyreCount> {
    const count = this.requireCount(id);
    if (count.status !== 'Pending_Approval') {
      throw new BadRequestException(`Tyre count ${count.tcNumber} is not awaiting approval.`);
    }
    const counter = count.submittedBy ?? count.createdBy;
    const isSelf = counter === approverId;
    if (isSelf && !isSystemAdmin) {
      throw new BadRequestException(
        'The person who counted cannot approve the tyre count (four-eyes, BR-03, AC-INV-004).',
      );
    }
    for (const row of count.rows) {
      if (row.result === 'Missing') {
        await this.drive(repos, row.tyreId, TyreEvent.CountMissing, approverId, {
          referenceDoc: count.tcNumber,
          reason: row.reason,
          note: row.note,
        });
      }
    }
    count.status = 'Approved';
    count.approvedBy = approverId;
    count.approvedAt = new Date().toISOString();
    count.selfApproved = isSelf && isSystemAdmin;
    return count;
  }

  /** Reject a submitted tyre count with a reason (SM-TC, returns to Draft). */
  rejectCount(id: number, reason: string): TyreCount {
    const count = this.requireCount(id);
    if (count.status !== 'Pending_Approval') {
      throw new BadRequestException(`Tyre count ${count.tcNumber} is not awaiting approval.`);
    }
    count.status = 'Draft';
    count.returnedReason = reason;
    return count;
  }

  // --- reads ---------------------------------------------------------------

  /** The append-only event history of a tyre, in order (REQ-TYR-013). */
  historyOf(tyreId: number): readonly TyreEventRow[] {
    return this.events.filter((e) => e.tyreId === tyreId);
  }

  eventCount(): number {
    return this.events.length;
  }

  listDispatches(): readonly RetreadDispatch[] {
    return [...this.dispatches];
  }

  resetForTests(): void {
    this.events.length = 0;
    this.dispatches = [];
    this.counts = [];
    this.nextEventId = 1;
    this.nextDispatchId = 1;
    this.nextCountId = 1;
    this.tyreSequenceSynced = false;
  }

  // --- internals -----------------------------------------------------------

  /**
   * Drive a tyre through SM-TYRE on `event`, write the new status to the gateway
   * `tyres` aggregate (atomic in the caller's transaction) and append one
   * `tyre_events` row. An unlisted transition is refused (mapped to 409), never
   * silently applied — the register row and the status write stay consistent.
   */
  private async drive(
    repos: TransactionRepositories,
    tyreId: number,
    event: WarehouseTyreEvent,
    userId: number,
    doc: { referenceDoc: string; reason: string | null; note: string | null },
  ): Promise<TyreDto> {
    const tyre = await repos.tyres.getById(tyreId);
    if (!tyre) {
      throw new NotFoundException(`Unknown tyre: ${tyreId}`);
    }
    let nextStatus: TyreStatus;
    try {
      nextStatus = smTyre.transition(tyre.status, event);
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        throw new ConflictException(
          `Tyre ${tyre.code}: ${event} is not allowed from ${tyre.status} (SM-TYRE §3.6).`,
        );
      }
      throw err;
    }
    const updated = await repos.tyres.update({
      ...tyre,
      status: nextStatus,
      statusId: toId(STATUS_ID[nextStatus]),
      // A tyre that returns to the warehouse is no longer issued to a WO.
      issuedWorkOrderId: nextStatus === TyreStatus.InStock ? null : tyre.issuedWorkOrderId,
    });
    this.appendEvent({
      tyreId,
      event,
      fromStatus: tyre.status,
      toStatus: nextStatus,
      referenceDoc: doc.referenceDoc,
      reason: doc.reason,
      at: new Date().toISOString(),
      byUserId: userId,
    });
    return updated;
  }

  /**
   * Advance the in-memory TY sequence past the highest code already present in
   * the gateway (the seed issues TY-0101…TY-0110), so a newly received tyre gets
   * a fresh, never-reused code. Runs once per process (idempotent).
   */
  private async syncTyreSequence(repos: TransactionRepositories): Promise<void> {
    if (this.tyreSequenceSynced) {
      return;
    }
    const tyres = await repos.tyres.list();
    let highest = 0;
    for (const t of tyres) {
      const m = /^TY-0*(\d+)$/.exec(t.code);
      if (m && m[1]) {
        highest = Math.max(highest, Number(m[1]));
      }
    }
    for (let i = 0; i < highest; i += 1) {
      this.numbers.next('TY');
    }
    this.tyreSequenceSynced = true;
  }

  private appendEvent(input: Omit<TyreEventRow, 'id'>): TyreEventRow {
    const row: TyreEventRow = { id: this.nextEventId++, ...input };
    this.events.push(row);
    return row;
  }

  private requireCount(id: number): TyreCount {
    const count = this.tyreCount(id);
    if (!count) {
      throw new NotFoundException(`Unknown tyre count: ${id}`);
    }
    return count;
  }
}

/** Cast a raw number to a branded id for a gateway write (runtime no-op). */
function toId<T>(value: number): T {
  return value as unknown as T;
}
