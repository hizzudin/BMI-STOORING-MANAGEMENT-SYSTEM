import { ConflictException, Injectable } from '@nestjs/common';

/** System lifecycle mode (PRD §9.12 `app_settings.system_mode`, REQ-IAM-010). */
export type SystemMode = 'Setup' | 'Live';

/**
 * The Planner-approval switch state (REQ-IAM-008). `until` is the optional end
 * time; when it passes the switch is treated as off. `kinds` is the set of
 * approval kinds the Access Manager ticked.
 */
export interface PlannerApprovalState {
  readonly on: boolean;
  /** ISO-8601 UTC end time, or `null` for no end time. */
  readonly until: string | null;
  readonly kinds: readonly PlannerApprovalKind[];
}

/** Approval kinds the Planner switch can cover (REQ-IAM-008). */
export type PlannerApprovalKind =
  | 'wo_creation'
  | 'wo_amendment'
  | 'wo_completion'
  | 'stock_opname'
  | 'tyre_count';

/**
 * Global `app_settings` scalars that the IAM / Setup flows read and write
 * (PRD §9.12). Phase-1 dev keeps them in memory; TASK-201/202 move them to the
 * `app_settings` table behind the same contract.
 *
 * TASK-104 owns the Planner-approval switch (REQ-IAM-008) and reads the system
 * mode; TASK-105 owns the one-way Go-live transition that flips the mode to
 * `Live`. The mode starts at `Setup` per REQ-IAM-010.
 */
/**
 * The billing-related `app_settings` scalars (PRD §9.12, REQ-BIL-004/012,
 * DEC-92). Maintained by the System Admin in Settings > Invoices and tax. The
 * OFF-unit rate is owned by FG-11 (TASK-115) — the daily job (FG-12) and the
 * `Off_Unit` invoice line are its only consumers.
 */
export interface BillingSettings {
  /** PPN rate as a percent (default 11, may be 0) — `invoice_tax_pct`. */
  readonly taxPct: number;
  /** Part/tyre markup as a percent (default 50) — `invoice_part_markup_pct`. */
  readonly partMarkupPct: number;
  /** Global OFF-unit daily rate in whole rupiah (default 0) — `off_unit_daily_rate`. */
  readonly offUnitDailyRate: number;
}

/** Defaults per PRD §9.12 (`invoice_tax_pct = 11`, markup `= 50`, OFF rate `= 0`). */
const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  taxPct: 11,
  partMarkupPct: 50,
  offUnitDailyRate: 0,
};

@Injectable()
export class AppSettingsService {
  private systemMode: SystemMode = 'Setup';
  private wentLiveAt: string | null = null;
  private plannerApproval: PlannerApprovalState = {
    on: false,
    until: null,
    kinds: [],
  };
  private billing: BillingSettings = { ...DEFAULT_BILLING_SETTINGS };

  /** Current system mode (REQ-IAM-010). */
  getSystemMode(): SystemMode {
    return this.systemMode;
  }

  /** Whether the system is Live (approvals and the full rule set apply). */
  isLive(): boolean {
    return this.systemMode === 'Live';
  }

  /**
   * Whether approvals are in force. In Setup mode there are NO approvals
   * (REQ-IAM-010: the System Admin enters data "without any approval"); they
   * resume once the system is Live. Approval flows (TASK-108/113) consult this
   * so they are bypassed before go-live and enforced after.
   */
  approvalsEnabled(): boolean {
    return this.isLive();
  }

  /** When the system went Live (PRD §9.12 `went_live_at`), or `null` in Setup. */
  getWentLiveAt(): string | null {
    return this.wentLiveAt;
  }

  /**
   * Flip to Live, once and for all (REQ-IAM-010 "switch to Live once and for
   * all"). The switch is **one-way**: a second call is refused so Setup → Live
   * is irreversible and there is no way to revert. Writes `went_live_at`. Owned
   * by TASK-105's Go-live endpoint; exposed here because the setting lives in
   * this shared store.
   *
   * @throws ConflictException if the system is already Live.
   */
  goLive(at: string): void {
    if (this.systemMode === 'Live') {
      throw new ConflictException('The system is already live. Go live is one-way and cannot be reverted.');
    }
    this.systemMode = 'Live';
    this.wentLiveAt = at;
  }

  /**
   * Read the effective Planner-approval state at `now`. If an end time was set
   * and has passed, the switch reads as off (REQ-IAM-008 "WHEN the end time
   * passes, THE SYSTEM SHALL switch it off").
   */
  getPlannerApproval(now: Date = new Date()): PlannerApprovalState {
    const state = this.plannerApproval;
    if (state.on && state.until !== null && new Date(state.until).getTime() <= now.getTime()) {
      return { on: false, until: null, kinds: [] };
    }
    return state;
  }

  /** Set the Planner-approval switch (REQ-IAM-008). */
  setPlannerApproval(state: PlannerApprovalState): void {
    this.plannerApproval = state;
  }

  /**
   * The billing settings block — PPN rate, part markup and the OFF-unit daily
   * rate (PRD §9.12, REQ-BIL-004/012, DEC-92). Returns a copy so callers cannot
   * mutate the store.
   */
  getBillingSettings(): BillingSettings {
    return { ...this.billing };
  }

  /** The global OFF-unit daily rate (whole rupiah) used for the `Off_Unit` line. */
  getOffUnitDailyRate(): number {
    return this.billing.offUnitDailyRate;
  }

  /**
   * Set the global OFF-unit daily rate (REQ-BIL-012, DEC-92). System Admin only
   * (guarded at the controller). Must be a non-negative whole rupiah.
   *
   * @throws ConflictException if the rate is negative or not a whole number.
   */
  setOffUnitDailyRate(rate: number): BillingSettings {
    if (!Number.isFinite(rate) || rate < 0 || !Number.isInteger(rate)) {
      throw new ConflictException('The OFF-unit daily rate must be a non-negative whole rupiah.');
    }
    this.billing = { ...this.billing, offUnitDailyRate: rate };
    return this.getBillingSettings();
  }

  /** Set the PPN rate (REQ-BIL-004/012); a non-negative percent. */
  setTaxPct(pct: number): BillingSettings {
    if (!Number.isFinite(pct) || pct < 0) {
      throw new ConflictException('The PPN rate must be a non-negative percent.');
    }
    this.billing = { ...this.billing, taxPct: pct };
    return this.getBillingSettings();
  }

  /** Set the part/tyre markup percent (REQ-BIL-003/012); a non-negative percent. */
  setPartMarkupPct(pct: number): BillingSettings {
    if (!Number.isFinite(pct) || pct < 0) {
      throw new ConflictException('The part markup must be a non-negative percent.');
    }
    this.billing = { ...this.billing, partMarkupPct: pct };
    return this.getBillingSettings();
  }

  /**
   * Reset the lifecycle scalars back to their Setup defaults. **Test-only** —
   * production go-live is one-way ({@link goLive}). Tests share a single
   * `AppModule`/service instance, so this lets a suite put the system back into
   * Setup between cases without defeating the irreversibility guarantee in real
   * use.
   */
  resetForTests(): void {
    this.systemMode = 'Setup';
    this.wentLiveAt = null;
    this.plannerApproval = { on: false, until: null, kinds: [] };
    this.billing = { ...DEFAULT_BILLING_SETTINGS };
  }
}
