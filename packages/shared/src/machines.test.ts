import { describe, it, expect } from 'vitest';
import { InvalidTransitionError } from './state-machine.js';
import {
  smWorkOrder,
  WorkOrderEvent,
  smStep,
  StepEvent,
  smDocument,
  DocumentEvent,
  smTyre,
  TyreEvent,
  DEMOUNT_TARGETS,
  smGoodsReceipt,
  GoodsReceiptEvent,
  smStockOpname,
  StockOpnameEvent,
  smTyreCount,
  TyreCountEvent,
  smTyreReceipt,
  TyreReceiptEvent,
  smRetreadDispatch,
  RetreadDispatchEvent,
  smChangeRequest,
  ChangeRequestEvent,
  smSchedule,
  ScheduleEvent,
  smInvoice,
  InvoiceEvent,
  deriveVehicleStatus,
  VEHICLE_STATUS_PRECEDENCE,
} from './machines.js';
import {
  WorkOrderStatus,
  StepStatus,
  DocumentStatus,
  TyreStatus,
  VehicleStatus,
  GoodsReceiptStatus,
  StockOpnameStatus,
  TyreCountStatus,
  TyreReceiptStatus,
  RetreadDispatchStatus,
  ChangeRequestStatus,
  ScheduleStatus,
  InvoiceStatus,
} from './states.js';

/**
 * Generic exhaustiveness harness. Given a machine, the full set of its states
 * and events, assert (a) every listed transition resolves to its tabled target,
 * and (b) every (state, event) pair NOT listed is refused. This is the
 * TASK-101 _Verify_ contract: "reject every transition not in the PRD §3 tables."
 */
function assertExhaustive<S extends string, E extends string>(
  machine: {
    name: string;
    transitions: readonly { from: S; event: E; to: S }[];
    transition(from: S, event: E): S;
    can(from: S, event: E): boolean;
  },
  states: readonly S[],
  events: readonly E[],
): void {
  const allowed = new Map<string, S>();
  for (const t of machine.transitions) {
    allowed.set(`${t.from}\u0000${t.event}`, t.to);
  }

  // (a) every listed transition is allowed and lands on the tabled target.
  for (const t of machine.transitions) {
    expect(machine.transition(t.from, t.event)).toBe(t.to);
    expect(machine.can(t.from, t.event)).toBe(true);
  }

  // (b) every other (state, event) combination is refused.
  for (const from of states) {
    for (const event of events) {
      if (allowed.has(`${from}\u0000${event}`)) continue;
      expect(machine.can(from, event)).toBe(false);
      expect(() => machine.transition(from, event)).toThrow(
        InvalidTransitionError,
      );
    }
  }
}

const allWoStatuses = Object.values(WorkOrderStatus);
const allWoEvents = Object.values(WorkOrderEvent);

describe('SM-WO — Work Order lifecycle (PRD §3.2)', () => {
  it('allows every tabled transition and refuses all others', () => {
    assertExhaustive(smWorkOrder, allWoStatuses, allWoEvents);
  });

  it('allows the documented happy path T2->T3->T7->T11->T13', () => {
    expect(smWorkOrder.transition(WorkOrderStatus.Draft, WorkOrderEvent.Submit)).toBe(
      WorkOrderStatus.PendingApproval,
    );
    expect(
      smWorkOrder.transition(WorkOrderStatus.PendingApproval, WorkOrderEvent.Approve),
    ).toBe(WorkOrderStatus.Active);
    expect(
      smWorkOrder.transition(WorkOrderStatus.Active, WorkOrderEvent.FirstStepStarted),
    ).toBe(WorkOrderStatus.InProgress);
    expect(
      smWorkOrder.transition(WorkOrderStatus.InProgress, WorkOrderEvent.LastStepSubmitted),
    ).toBe(WorkOrderStatus.PendingVerification);
    expect(
      smWorkOrder.transition(
        WorkOrderStatus.PendingVerification,
        WorkOrderEvent.CompletionApproved,
      ),
    ).toBe(WorkOrderStatus.Completed);
  });

  it('refuses transitions out of the final states Completed and Cancelled', () => {
    // Iterate the events the machine actually accepts (bootstrap event `Create`
    // has no from-state and is intentionally outside the machine's event type).
    const woEvents = new Set(smWorkOrder.transitions.map((t) => t.event));
    for (const event of woEvents) {
      expect(smWorkOrder.can(WorkOrderStatus.Completed, event)).toBe(false);
      expect(smWorkOrder.can(WorkOrderStatus.Cancelled, event)).toBe(false);
    }
  });

  it('refuses representative illegal moves (not in §3.2)', () => {
    // Cannot approve a Draft (must Submit first).
    expect(smWorkOrder.can(WorkOrderStatus.Draft, WorkOrderEvent.Approve)).toBe(false);
    // Cannot complete a WO still Active.
    expect(
      smWorkOrder.can(WorkOrderStatus.Active, WorkOrderEvent.CompletionApproved),
    ).toBe(false);
    // Cannot cancel a Completed WO (final).
    expect(smWorkOrder.can(WorkOrderStatus.Completed, WorkOrderEvent.Cancel)).toBe(false);
  });
});

describe('SM-STEP — step / assignment (PRD §3.3)', () => {
  it('allows every tabled transition and refuses all others', () => {
    assertExhaustive(
      smStep,
      Object.values(StepStatus),
      Object.values(StepEvent),
    );
  });

  it('requires Start before Submit (Open cannot Submit directly)', () => {
    expect(smStep.can(StepStatus.Open, StepEvent.Submit)).toBe(false);
    expect(smStep.transition(StepStatus.Open, StepEvent.Start)).toBe(
      StepStatus.InProgress,
    );
    expect(smStep.transition(StepStatus.InProgress, StepEvent.Submit)).toBe(
      StepStatus.Submitted,
    );
  });

  it('Return sends a Submitted step back to Open', () => {
    expect(smStep.transition(StepStatus.Submitted, StepEvent.Return)).toBe(
      StepStatus.Open,
    );
  });

  it('refuses Start on a Locked step (needs WO approval / prev submit first)', () => {
    expect(smStep.can(StepStatus.Locked, StepEvent.Start)).toBe(false);
    expect(
      smStep.transition(StepStatus.Locked, StepEvent.WoApprovedOrPrevSubmitted),
    ).toBe(StepStatus.Open);
  });
});

describe('SM-VEH — derived vehicle status (PRD §3.4, DEC-92)', () => {
  it('precedence is Inactive > OFF > Blocked > Repair > Active', () => {
    expect(VEHICLE_STATUS_PRECEDENCE[VehicleStatus.Inactive]).toBe(1);
    expect(VEHICLE_STATUS_PRECEDENCE[VehicleStatus.OFF]).toBe(2);
    expect(VEHICLE_STATUS_PRECEDENCE[VehicleStatus.Blocked]).toBe(3);
    expect(VEHICLE_STATUS_PRECEDENCE[VehicleStatus.Repair]).toBe(4);
    expect(VEHICLE_STATUS_PRECEDENCE[VehicleStatus.Active]).toBe(5);
  });

  it('Inactive wins over everything, including OFF (entry precedence)', () => {
    expect(
      deriveVehicleStatus({
        isDeactivated: true,
        hasOverrunWhileInRepair: true,
        hasBlockingDocument: true,
        hasActiveRepair: true,
      }),
    ).toBe(VehicleStatus.Inactive);
  });

  it('OFF outranks Blocked/Repair when the WO overran while in Repair (DEC-92)', () => {
    expect(
      deriveVehicleStatus({
        isDeactivated: false,
        hasOverrunWhileInRepair: true,
        hasBlockingDocument: true,
        hasActiveRepair: true,
      }),
    ).toBe(VehicleStatus.OFF);
  });

  it('OFF requires an overrun-while-in-repair fact; plain Repair stays Repair', () => {
    expect(
      deriveVehicleStatus({
        isDeactivated: false,
        hasOverrunWhileInRepair: false,
        hasBlockingDocument: false,
        hasActiveRepair: true,
      }),
    ).toBe(VehicleStatus.Repair);
  });

  it('Blocked outranks Repair; Active is the floor', () => {
    expect(
      deriveVehicleStatus({
        isDeactivated: false,
        hasOverrunWhileInRepair: false,
        hasBlockingDocument: true,
        hasActiveRepair: true,
      }),
    ).toBe(VehicleStatus.Blocked);
    expect(
      deriveVehicleStatus({
        isDeactivated: false,
        hasOverrunWhileInRepair: false,
        hasBlockingDocument: false,
        hasActiveRepair: false,
      }),
    ).toBe(VehicleStatus.Active);
  });
});

describe('SM-DOC — vehicle document status (PRD §3.5)', () => {
  it('allows every tabled transition and refuses all others', () => {
    assertExhaustive(
      smDocument,
      Object.values(DocumentStatus),
      Object.values(DocumentEvent),
    );
  });

  it('renewal from Warning or Expired returns to Valid', () => {
    expect(
      smDocument.transition(DocumentStatus.Warning, DocumentEvent.RenewalVerified),
    ).toBe(DocumentStatus.Valid);
    expect(
      smDocument.transition(DocumentStatus.Expired, DocumentEvent.RenewalVerified),
    ).toBe(DocumentStatus.Valid);
  });

  it('refuses skipping the warning window (Valid cannot jump to Expired)', () => {
    expect(smDocument.can(DocumentStatus.Valid, DocumentEvent.ReachExpiry)).toBe(
      false,
    );
  });
});

describe('SM-TYRE — tyre status (PRD §3.6)', () => {
  it('allows every tabled transition and refuses all others', () => {
    assertExhaustive(
      smTyre,
      Object.values(TyreStatus),
      Object.values(TyreEvent),
    );
  });

  it('Scrapped and Lost are final (no outgoing transition)', () => {
    // `ReceiveNew` / `BoughtOutside` are (new)-origin bootstrap events with no
    // from-state, so they are outside the machine's event type; iterate the
    // from-state events the machine accepts.
    const tyreEvents = new Set(smTyre.transitions.map((t) => t.event));
    for (const event of tyreEvents) {
      expect(smTyre.can(TyreStatus.Scrapped, event)).toBe(false);
      expect(smTyre.can(TyreStatus.Lost, event)).toBe(false);
    }
  });

  it('exposes the three legal Demount targets', () => {
    expect(DEMOUNT_TARGETS).toEqual([
      TyreStatus.NeedsRetread,
      TyreStatus.WornOut,
      TyreStatus.InStock,
    ]);
  });

  it('refuses mounting an In_Stock tyre straight to Issued via the wrong event', () => {
    expect(smTyre.can(TyreStatus.InStock, TyreEvent.MountFromIssued)).toBe(false);
    expect(
      smTyre.transition(TyreStatus.InStock, TyreEvent.MountFromBaseline),
    ).toBe(TyreStatus.Mounted);
  });
});

describe('SM-GR — Goods Receipt (PRD §3.7)', () => {
  it('allows every tabled transition and refuses all others', () => {
    assertExhaustive(
      smGoodsReceipt,
      Object.values(GoodsReceiptStatus),
      Object.values(GoodsReceiptEvent),
    );
  });

  it('a Posted receipt is final to this machine', () => {
    expect(smGoodsReceipt.can(GoodsReceiptStatus.Posted, GoodsReceiptEvent.Post)).toBe(
      false,
    );
  });
});

describe('SM-SA — Stock opname (PRD §3.7)', () => {
  it('allows every tabled transition and refuses all others', () => {
    assertExhaustive(
      smStockOpname,
      Object.values(StockOpnameStatus),
      Object.values(StockOpnameEvent),
    );
  });

  it('Reject returns Pending_Approval to Draft (shown as Returned)', () => {
    expect(
      smStockOpname.transition(
        StockOpnameStatus.PendingApproval,
        StockOpnameEvent.Reject,
      ),
    ).toBe(StockOpnameStatus.Draft);
  });

  it('refuses approving a Draft directly (must Submit first)', () => {
    expect(smStockOpname.can(StockOpnameStatus.Draft, StockOpnameEvent.Approve)).toBe(
      false,
    );
  });
});

describe('SM-TC — Tyre count (PRD §3.7)', () => {
  it('allows every tabled transition and refuses all others', () => {
    assertExhaustive(
      smTyreCount,
      Object.values(TyreCountStatus),
      Object.values(TyreCountEvent),
    );
  });
});

describe('SM-TR — Receive tyres (PRD §3.7)', () => {
  it('allows every tabled transition and refuses all others', () => {
    assertExhaustive(
      smTyreReceipt,
      Object.values(TyreReceiptStatus),
      Object.values(TyreReceiptEvent),
    );
  });
});

describe('SM-RD — Retread dispatch (PRD §3.7)', () => {
  it('allows every tabled transition and refuses all others', () => {
    assertExhaustive(
      smRetreadDispatch,
      Object.values(RetreadDispatchStatus),
      Object.values(RetreadDispatchEvent),
    );
  });

  it('follows Draft->Sent->Partial->Closed and refuses skipping Partial', () => {
    expect(
      smRetreadDispatch.transition(
        RetreadDispatchStatus.Draft,
        RetreadDispatchEvent.Confirm,
      ),
    ).toBe(RetreadDispatchStatus.Sent);
    expect(
      smRetreadDispatch.can(RetreadDispatchStatus.Sent, RetreadDispatchEvent.Close),
    ).toBe(false);
  });
});

describe('SM-CR — Change request (PRD §3.7)', () => {
  it('allows every tabled transition and refuses all others', () => {
    assertExhaustive(
      smChangeRequest,
      Object.values(ChangeRequestStatus),
      Object.values(ChangeRequestEvent),
    );
  });

  it('Approved and Rejected are final', () => {
    for (const event of Object.values(ChangeRequestEvent)) {
      expect(smChangeRequest.can(ChangeRequestStatus.Approved, event)).toBe(false);
      expect(smChangeRequest.can(ChangeRequestStatus.Rejected, event)).toBe(false);
    }
  });
});

describe('SM-SCH — schedule card (PRD §3.7, DEC-92)', () => {
  it('allows every tabled transition and refuses all others', () => {
    assertExhaustive(
      smSchedule,
      Object.values(ScheduleStatus),
      Object.values(ScheduleEvent),
    );
  });

  it('a Missed card rolls forward to Planned (unlimited roll-forward)', () => {
    expect(smSchedule.transition(ScheduleStatus.Missed, ScheduleEvent.RollForward)).toBe(
      ScheduleStatus.Planned,
    );
  });

  it('refuses placing an already-Planned card again', () => {
    expect(smSchedule.can(ScheduleStatus.Planned, ScheduleEvent.Place)).toBe(false);
  });
});

describe('SM-INV — invoice (PRD §3.7)', () => {
  it('allows every tabled transition and refuses all others', () => {
    assertExhaustive(
      smInvoice,
      Object.values(InvoiceStatus),
      Object.values(InvoiceEvent),
    );
  });

  it('both Draft and Issued may be Voided; Paid and Void are final', () => {
    expect(smInvoice.transition(InvoiceStatus.Draft, InvoiceEvent.Void)).toBe(
      InvoiceStatus.Void,
    );
    expect(smInvoice.transition(InvoiceStatus.Issued, InvoiceEvent.Void)).toBe(
      InvoiceStatus.Void,
    );
    for (const event of Object.values(InvoiceEvent)) {
      expect(smInvoice.can(InvoiceStatus.Paid, event)).toBe(false);
      expect(smInvoice.can(InvoiceStatus.Void, event)).toBe(false);
    }
  });

  it('refuses paying a Draft invoice directly (must Issue first)', () => {
    expect(smInvoice.can(InvoiceStatus.Draft, InvoiceEvent.Pay)).toBe(false);
  });
});
