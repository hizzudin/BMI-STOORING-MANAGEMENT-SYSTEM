import { Injectable } from '@nestjs/common';

/**
 * The known master-data reference sets that bulk import validates rows against
 * (REQ-IAM-011). In Phase 1 the dummy gateway (TASK-102) models only the nine
 * business aggregates and does not carry a `vehicle_classes` table, so the set
 * of valid vehicle-class ids lives here as an API-layer in-memory registry —
 * following the TASK-103/104 precedent for cross-cutting Phase-1 state.
 * TASK-201 replaces this with the real `vehicle_classes` table behind the same
 * `isKnownVehicleClass` contract.
 *
 * It is seeded with the dummy gateway's seeded class id (1) so a vehicles import
 * referencing the seeded class validates; `registerVehicleClass` lets Setup /
 * tests widen the set as classes are created in their own screens (DEC-75).
 */
@Injectable()
export class MasterDataService {
  /** Known vehicle-class ids (seeded from the dummy gateway's class id 1). */
  private readonly vehicleClassIds = new Set<number>([1]);

  /** Whether `classId` is a known vehicle class a vehicle row may reference. */
  isKnownVehicleClass(classId: number): boolean {
    return this.vehicleClassIds.has(classId);
  }

  /** Register a vehicle-class id as known (created in its own screen, DEC-75). */
  registerVehicleClass(classId: number): void {
    this.vehicleClassIds.add(classId);
  }

  /** The known vehicle-class ids (read-only snapshot). */
  knownVehicleClassIds(): readonly number[] {
    return [...this.vehicleClassIds];
  }
}
