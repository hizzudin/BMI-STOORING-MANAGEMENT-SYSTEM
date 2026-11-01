import { BadRequestException, Injectable } from '@nestjs/common';
import { idValue, type WorkOrderDto } from '@bmi/shared';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';

/**
 * A breakdown report (`breakdown_reports`, PRD §9, REQ-PM-005). Carries the
 * driver's captured location once (`location_lat`/`location_lng`/
 * `location_captured_at`) which seeds the auto-drafted WO's Mobilisasi step
 * destination (REQ-MBL-002), plus the description (copied to the WO's
 * finding_note, REQ-WO-016) and an optional photo reference.
 */
export interface BreakdownReport {
  readonly id: number;
  readonly vehicleId: number;
  readonly driverId: number;
  readonly description: string;
  readonly locationLat: number | null;
  readonly locationLng: number | null;
  readonly locationCapturedAt: string | null;
  readonly photoRef: string | null;
  /** The Draft WO auto-created from this report (REQ-PM-005). */
  readonly draftedWorkOrderId: number;
  readonly reportedBy: number;
  readonly createdAt: string;
}

export interface ReportBreakdownInput {
  vehicleId: number;
  /** The named driver the System Admin reports for (REQ-PM-005). */
  driverId: number;
  description: string;
  locationLat?: number;
  locationLng?: number;
  locationCapturedAt?: string;
  photoRef?: string;
  /** The reporter (System Admin in R1 / the Driver app in R1 step 7). */
  reportedBy: number;
}

export interface ReportBreakdownResult {
  readonly report: BreakdownReport;
  readonly draftedWorkOrder: WorkOrderDto;
}

/**
 * **Breakdown drafting** (FG-12, REQ-PM-005, REQ-MBL-002, REQ-WO-016).
 *
 * A `Driver_Breakdown` report (the System Admin on a driver's behalf in R1, the
 * Driver app in R1 step 7) **auto-creates a Draft WO pre-seeded with exactly one
 * Mobilisasi step** at the driver's captured breakdown location, with the
 * driver's breakdown description copied into `work_orders.finding_note`. It
 * **reuses** `WorkOrdersService.createBreakdownDraft` (TASK-108 — the WO
 * lifecycle owner, module resolved from the registry, not hard-coded) and never
 * re-implements the WO lifecycle. This service owns the `breakdown_reports` →
 * auto-draft trigger and keeps the report record.
 *
 * **Phase-1 modelling:** the dummy gateway carries no `breakdown_reports` table,
 * so the report lives in this API-layer in-memory store (TASK-103..113
 * precedent); TASK-201/202 re-home it behind PRD §9 unchanged.
 */
@Injectable()
export class BreakdownReportService {
  private readonly reports = new Map<number, BreakdownReport>();
  private nextId = 1;

  constructor(private readonly workOrders: WorkOrdersService) {}

  /**
   * Report a breakdown and auto-draft the WO. The description is required
   * (REQ-PM-005) and becomes the draft's finding_note (REQ-WO-016); the captured
   * location becomes the single Mobilisasi step's destination (REQ-MBL-002).
   */
  async report(input: ReportBreakdownInput, now: Date = new Date()): Promise<ReportBreakdownResult> {
    if (!input.description.trim()) {
      throw new BadRequestException('A breakdown report needs a description (REQ-PM-005, REQ-WO-016).');
    }

    const reportId = this.nextId++;
    const draft = await this.workOrders.createBreakdownDraft({
      vehicleId: input.vehicleId,
      description: input.description.trim(),
      createdBy: input.reportedBy,
      ...(input.locationLat === undefined ? {} : { locationLat: input.locationLat }),
      ...(input.locationLng === undefined ? {} : { locationLng: input.locationLng }),
      breakdownReportId: reportId,
    });

    const report: BreakdownReport = {
      id: reportId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      description: input.description.trim(),
      locationLat: input.locationLat ?? null,
      locationLng: input.locationLng ?? null,
      locationCapturedAt: input.locationCapturedAt ?? (input.locationLat !== undefined ? now.toISOString() : null),
      photoRef: input.photoRef ?? null,
      draftedWorkOrderId: idValue(draft.id),
      reportedBy: input.reportedBy,
      createdAt: now.toISOString(),
    };
    this.reports.set(reportId, report);
    return { report, draftedWorkOrder: draft };
  }

  /** A report by id, or `null`. */
  get(id: number): BreakdownReport | null {
    return this.reports.get(id) ?? null;
  }

  /** Every report, newest first. */
  list(): readonly BreakdownReport[] {
    return [...this.reports.values()].sort((a, b) => b.id - a.id);
  }

  /** Test-only reset of the in-memory report store. */
  resetForTests(): void {
    this.reports.clear();
    this.nextId = 1;
  }
}
