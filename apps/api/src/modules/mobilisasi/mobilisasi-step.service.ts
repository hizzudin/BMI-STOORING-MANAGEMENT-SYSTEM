import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { idValue, Role, StepStatus, type AssignmentDto } from '@bmi/shared';
import { roundAmount, wibDayOf, wibDayToIso } from '@bmi/config';
import type { CurrentUser } from '../../core/auth/current-user.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { StooringRatesService } from './stooring-rates.service.js';

/** The destination + stooring region a Mobilisasi step travels to (REQ-MBL-002/003). */
export interface MobilisasiDestination {
  /** Driver's captured destination latitude (from the breakdown report). */
  readonly lat: number | null;
  readonly lng: number | null;
  /** The stooring-rate region code for that destination (defaults to workshop). */
  readonly stooringRegion: string;
}

/** The route/destination payload returned when a Mobilisasi step is started (REQ-MBL-003). */
export interface MobilisasiRoute {
  readonly stepId: number;
  readonly destination: { lat: number | null; lng: number | null };
  readonly region: { code: string; name: string; price: number };
  /**
   * Phase-1 "open a route" = the destination/region payload the client renders
   * on its own map. There is no third-party map integration in Phase 1 (design.md).
   */
  readonly mapReady: boolean;
}

/** One recorded point of the mechanic's In_Progress location trail (`mobilisation_location_trail`). */
export interface TrailPoint {
  readonly assignmentId: number;
  readonly attemptNo: number;
  readonly lat: number;
  readonly lng: number;
  readonly accuracyM: number | null;
  /** When it was recorded — only between Start and Submit of the step (RSK-09). */
  readonly recordedAt: string;
}

/** A charged stooring fee snapshot on a Mobilisasi step (`work_order_assignments.stooring_fee`). */
export interface StooringCharge {
  readonly stepId: number;
  readonly workOrderId: number;
  readonly regionCode: string;
  readonly regionName: string;
  /** The fee snapshot at submit (BR-07); Rp 0 for the workshop or a de-duplicated day. */
  readonly fee: number;
  /** The WIB day the charge is attributed to (`YYYY-MM-DD`). */
  readonly wibDay: string;
  /** False when this step's region+day was already charged on the WO (REQ-MBL-006). */
  readonly firstForWoRegionDay: boolean;
}

/** Threshold (metres) within which the mechanic counts as "arrived" (REQ-MBL-004). */
const ARRIVAL_THRESHOLD_M = 100;
/** Approximate metres per degree of latitude (good enough for an arrival check). */
const METRES_PER_DEG = 111_320;

/**
 * **Mobilisasi (mobilisation) step** business rules (FG-5a, REQ-MBL, SM-STEP,
 * DEC-90, RSK-09).
 *
 * Mobilisasi is a **data-driven registry module** (PR-6, REQ-REG-006): it is one
 * registry row (seeded in TASK-107) plus this handler registered into the
 * engine's {@link StepHandlerRegistry}; the generic engine never learns about
 * Mobilisasi. The executor is the Mechanic travelling to the driver (verifier
 * Planner/SA). DEC-90 moved the stooring fee + location trail **here** from
 * Mechanic Action.
 *
 * Flow:
 *  - **Start** ({@link start}) returns a route to the driver's captured
 *    destination (from the step's `stepConfig`, seeded at breakdown auto-draft,
 *    REQ-MBL-002/003) and opens the trail window. "Open a route" = return the
 *    destination/region payload; no third-party map integration in Phase 1.
 *  - **Trail** ({@link recordPoint}): the mechanic's location trail is recorded
 *    **only while the step is In_Progress** — a point before Start or after
 *    Submit is refused (RSK-09 / UU-PDP privacy boundary, REQ-MBL-005).
 *  - **Arrival** ({@link hasArrived}) tells the client to auto-submit; a manual
 *    "Finish stooring" control submits too (REQ-MBL-004). Both drive the engine
 *    submit, which calls {@link onSubmit}.
 *  - **Submit** ({@link onSubmit}): compute and snapshot the region's stooring
 *    fee **once per WO / region / WIB-day** (REQ-MBL-006, BR-07) and stop the
 *    trail. A second Mobilisasi step at the same region on the same WIB day
 *    charges Rp 0 (idempotent — no double-charge).
 *  - **Trail read** ({@link readTrail}): Planner/System Admin **only**; every
 *    read writes an access-log record (RSK-09 / UU-PDP, REQ-MBL-005).
 *
 * Phase-1 modelling: the destination/region config, the location trail, the
 * charged fees and the WO stooring cost are API-layer in-memory state keyed by
 * assignment / work-order id (the dummy gateway carries no
 * `mobilisation_location_trail` / `stooring_fee` columns); TASK-201/202 re-home
 * them behind the PRD §9 columns unchanged.
 */
@Injectable()
export class MobilisasiStepService {
  /** The mechanic's location trail per step id (RSK-09). */
  private readonly trails = new Map<number, TrailPoint[]>();
  /** Whether a step's trail window is open (between Start and Submit) per step id. */
  private readonly trailOpen = new Map<number, boolean>();
  /** The charged stooring fee per step id (snapshot at submit). */
  private readonly charges = new Map<number, StooringCharge>();
  /** The accumulated WO stooring cost per WO id (REQ-MBL-006). */
  private readonly stooringCost = new Map<number, number>();
  /** The set of `region|wibDay` keys already charged per WO id (de-dup, REQ-MBL-006). */
  private readonly chargedWoRegionDays = new Map<number, Set<string>>();

  constructor(
    private readonly rates: StooringRatesService,
    private readonly audit: AuditService,
  ) {}

  // --- destination / route (REQ-MBL-002/003) -------------------------------

  /**
   * The destination + stooring region of a step, read from its `stepConfig`
   * (seeded by the breakdown auto-draft, REQ-MBL-002). An absent/unknown region
   * defaults to the workshop (fee Rp 0, REQ-MBL-006).
   */
  destinationOf(step: AssignmentDto): MobilisasiDestination {
    const cfg = step.stepConfig as {
      locationLat?: unknown;
      locationLng?: unknown;
      stooringRegion?: unknown;
    };
    const lat = typeof cfg.locationLat === 'number' ? cfg.locationLat : null;
    const lng = typeof cfg.locationLng === 'number' ? cfg.locationLng : null;
    const region = typeof cfg.stooringRegion === 'string' && cfg.stooringRegion.trim()
      ? cfg.stooringRegion.trim().toUpperCase()
      : 'WORKSHOP';
    return { lat, lng, stooringRegion: region };
  }

  /**
   * **Start** a Mobilisasi step: open the trail window and return the route to
   * the driver's captured destination (REQ-MBL-003). The engine owns the SM-STEP
   * Open → In_Progress transition (via `/assignments/:id/start`); this records
   * the module-specific side of starting — the client calls this to get the
   * route payload and begin streaming the trail.
   */
  start(step: AssignmentDto): MobilisasiRoute {
    const stepId = idValue(step.id);
    const dest = this.destinationOf(step);
    const rate = this.rates.get(dest.stooringRegion) ?? this.rates.require('WORKSHOP');
    // Open the In_Progress trail window (REQ-MBL-005). Trail points are accepted
    // only while this is open.
    this.trailOpen.set(stepId, true);
    if (!this.trails.has(stepId)) {
      this.trails.set(stepId, []);
    }
    return {
      stepId,
      destination: { lat: dest.lat, lng: dest.lng },
      region: { code: rate.code, name: rate.regionName, price: rate.price },
      mapReady: true,
    };
  }

  // --- location trail (REQ-MBL-005, RSK-09) --------------------------------

  /**
   * Record one point of the mechanic's location trail (REQ-MBL-005). Accepted
   * **only while the step is In_Progress** — the trail window must be open
   * (Start happened, Submit has not). A point before Start or after Submit is
   * **refused** (the RSK-09 / UU-PDP privacy boundary; no points outside the
   * active step).
   */
  recordPoint(
    step: AssignmentDto,
    point: { lat: number; lng: number; accuracyM?: number; recordedAt?: string },
  ): TrailPoint {
    const stepId = idValue(step.id);
    // The trail is recorded only while the step is In_Progress (SM-STEP) and
    // before Submit. Status is authoritative: a point before Start (not yet
    // In_Progress) or after Submit (status moved on, or the window was closed by
    // onSubmit) is refused — the RSK-09 / UU-PDP privacy boundary.
    if (step.status !== StepStatus.InProgress || this.trailOpen.get(stepId) === false) {
      throw new BadRequestException(
        'The location trail is recorded only while the Mobilisasi step is In_Progress (REQ-MBL-005, RSK-09).',
      );
    }
    const trailPoint: TrailPoint = {
      assignmentId: stepId,
      attemptNo: step.attemptNo,
      lat: point.lat,
      lng: point.lng,
      accuracyM: point.accuracyM ?? null,
      recordedAt: point.recordedAt ?? new Date().toISOString(),
    };
    const trail = this.trails.get(stepId) ?? [];
    trail.push(trailPoint);
    this.trails.set(stepId, trail);
    return trailPoint;
  }

  /**
   * **Read** the location trail of a step (REQ-MBL-005, RSK-09 / UU-PDP). Visible
   * to a **Planner or the System Admin only**; any other role is refused 403.
   * **Every read is written to the access log** — the mutating-only
   * `AuditInterceptor` does not cover this GET, so we append an explicit
   * `audit_logs` record here (one per read).
   */
  readTrail(step: AssignmentDto, user: CurrentUser): readonly TrailPoint[] {
    if (user.role !== Role.Planner && user.role !== Role.SystemAdmin) {
      throw new ForbiddenException(
        'The location trail is visible only to a Planner or the System Admin (REQ-MBL-005, RSK-09).',
      );
    }
    const stepId = idValue(step.id);
    const trail = this.trails.get(stepId) ?? [];
    // RSK-09 / UU-PDP: log every access to the trail (one record per read).
    this.audit.append({
      entity: 'mobilisation_location_trail',
      entityId: stepId,
      action: `GET /mobilisasi/${stepId}/trail`,
      after: { points: trail.length, workOrderId: idValue(step.workOrderId) },
      reason: 'trail_access',
      userId: user.userId,
      userRole: user.role,
    });
    return trail.map((p) => ({ ...p }));
  }

  // --- arrival / auto-submit (REQ-MBL-004) ---------------------------------

  /**
   * Whether the mechanic has reached the destination within the arrival
   * threshold (REQ-MBL-004). The client polls this to decide whether to
   * auto-submit; a manual "Finish stooring" submit does not need it. Returns
   * false when the step has no destination coordinates.
   */
  hasArrived(step: AssignmentDto, at: { lat: number; lng: number }): boolean {
    const dest = this.destinationOf(step);
    if (dest.lat === null || dest.lng === null) {
      return false;
    }
    return this.distanceMetres(dest.lat, dest.lng, at.lat, at.lng) <= ARRIVAL_THRESHOLD_M;
  }

  // --- submit (REQ-MBL-006, BR-07) -----------------------------------------

  /**
   * The engine **submit** hook (REQ-MBL-006, BR-07, RSK-09). Runs inside the
   * engine's `unitOfWork` via the step-handler registry — whether the submit was
   * an auto-submit on arrival or a manual "Finish stooring" (REQ-MBL-004):
   *   1. **Stop the trail** — close the In_Progress window, so no point is
   *      recorded after Submit (RSK-09, REQ-MBL-005).
   *   2. **Charge the stooring fee once per WO / region / WIB-day** — snapshot
   *      the active region's price onto the step and add it to the WO stooring
   *      cost; a second Mobilisasi step of the same WO at the same region on the
   *      same WIB day adds Rp 0 (idempotent, REQ-MBL-006). The workshop region
   *      is always Rp 0.
   */
  onSubmit(step: AssignmentDto): StooringCharge {
    const stepId = idValue(step.id);
    const workOrderId = idValue(step.workOrderId);
    // 1) Stop the trail at submit (RSK-09, REQ-MBL-005).
    this.trailOpen.set(stepId, false);

    // Idempotent re-run guard: if this step already charged, return its snapshot.
    const existing = this.charges.get(stepId);
    if (existing) {
      return existing;
    }

    // 2) Resolve the region + its current price (snapshot now, BR-07).
    const dest = this.destinationOf(step);
    const rate = this.rates.get(dest.stooringRegion) ?? this.rates.require('WORKSHOP');

    // One charge per WO / region / WIB-day (REQ-MBL-006). The WIB day comes from
    // the submit instant via @bmi/config (WIB-day boundaries, NFR-14).
    const wibDay = wibDayToIso(wibDayOf(new Date()));
    const key = `${rate.code}|${wibDay}`;
    const charged = this.chargedWoRegionDays.get(workOrderId) ?? new Set<string>();
    const firstForWoRegionDay = !charged.has(key);

    // Fee is the region price only when this is the first charge for the WO's
    // region+day; a repeat (or the workshop) adds Rp 0 (REQ-MBL-006).
    const fee = firstForWoRegionDay ? roundAmount(rate.price) : 0;

    const charge: StooringCharge = {
      stepId,
      workOrderId,
      regionCode: rate.code,
      regionName: rate.regionName,
      fee,
      wibDay,
      firstForWoRegionDay,
    };
    this.charges.set(stepId, charge);
    if (firstForWoRegionDay) {
      charged.add(key);
      this.chargedWoRegionDays.set(workOrderId, charged);
      this.stooringCost.set(workOrderId, roundAmount(this.stooringCostOf(workOrderId) + fee));
    }
    return charge;
  }

  // --- reads ---------------------------------------------------------------

  /** The charged stooring snapshot of a step, or `undefined`. */
  chargeOf(stepId: number): StooringCharge | undefined {
    const c = this.charges.get(stepId);
    return c ? { ...c } : undefined;
  }

  /** The accumulated WO stooring cost (0 if none), half-up Rp (REQ-MBL-006). */
  stooringCostOf(workOrderId: number): number {
    return this.stooringCost.get(workOrderId) ?? 0;
  }

  /** The number of trail points recorded for a step (for internal/test checks). */
  trailLengthOf(stepId: number): number {
    return this.trails.get(stepId)?.length ?? 0;
  }

  /** Test-only reset of all Mobilisasi state. */
  resetForTests(): void {
    this.trails.clear();
    this.trailOpen.clear();
    this.charges.clear();
    this.stooringCost.clear();
    this.chargedWoRegionDays.clear();
  }

  // --- internals -----------------------------------------------------------

  /** Planar great-circle-approx distance in metres (sufficient for arrival). */
  private distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLat = (lat2 - lat1) * METRES_PER_DEG;
    const meanLatRad = ((lat1 + lat2) / 2) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * METRES_PER_DEG * Math.cos(meanLatRad);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }
}
