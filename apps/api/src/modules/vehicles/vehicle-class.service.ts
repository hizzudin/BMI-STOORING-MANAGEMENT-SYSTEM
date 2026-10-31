import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

/**
 * One axle in a chassis layout definition (REQ-PLC-017): its role and how many
 * tyres sit on each side (1 = single, 2 = dual).
 */
export interface AxleDefinition {
  readonly role: string;
  readonly tyresPerSide: number;
}

/** A data-driven chassis-layout definition (REQ-PLC-017). */
export interface ChassisLayoutDefinition {
  readonly axles: readonly AxleDefinition[];
  readonly spareCount: number;
}

/** A generated wheel/spare position (REQ-PLC-019). */
export interface PartPosition {
  readonly code: string;
  readonly positionKind: 'Wheel' | 'Spare';
  readonly axleIndex: number | null;
  readonly side: 'Left' | 'Right' | null;
  readonly ordinal: number;
  readonly label: string;
}

/** A persisted chassis layout with its generated positions (§9.3). */
export interface ChassisLayout {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly version: number;
  readonly definition: ChassisLayoutDefinition;
  readonly axleCount: number;
  readonly tyreCount: number;
  readonly positions: readonly PartPosition[];
  readonly isActive: boolean;
}

/** A persisted vehicle class (§9.3). */
export interface VehicleClass {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  /** `Powered` (has odometer) or `Towed` (days only, REQ-PLC-018). */
  readonly unitKind: 'Powered' | 'Towed';
  readonly defaultChassisLayoutId: number;
  readonly isActive: boolean;
}

/**
 * Vehicle classes and **data-driven chassis layouts** (REQ-VEH-002, REQ-PLC-017).
 *
 * Layouts are never hard-coded: a layout's `axle_count`, `tyre_count` and
 * `part_positions` are GENERATED from its stored `definition` (axles in order +
 * spare count) when the layout is saved, so the System Admin can add a class
 * that is not in the launch list and the system draws its map with no code
 * change and no new release (AC-PLC-010).
 *
 * Phase 1: the dummy gateway (TASK-102) models only the nine business
 * aggregates and carries no `vehicle_classes` / `chassis_layouts` / `part_positions`
 * tables, so — following the TASK-103/104/105 precedent for cross-cutting
 * Phase-1 state — classes and layouts live here as an API-layer in-memory
 * registry. TASK-201 re-homes them behind the PRD §9.3 tables unchanged.
 *
 * Seeded with the dummy gateway's class id 1 (`Tractor_Head`) and layout id 1
 * so the seeded vehicle B 1234 ABC resolves.
 */
@Injectable()
export class VehicleClassService {
  private readonly classes = new Map<number, VehicleClass>();
  private readonly layouts = new Map<number, ChassisLayout>();
  private nextClassId = 1;
  private nextLayoutId = 1;

  constructor() {
    this.seed();
  }

  /** Generate a layout's positions + counts from its definition (REQ-PLC-017). */
  static generatePositions(def: ChassisLayoutDefinition): {
    positions: PartPosition[];
    axleCount: number;
    tyreCount: number;
  } {
    const positions: PartPosition[] = [];
    let tyreCount = 0;
    def.axles.forEach((axle, i) => {
      const axleIndex = i + 1;
      for (const side of ['Left', 'Right'] as const) {
        for (let ordinal = 1; ordinal <= axle.tyresPerSide; ordinal += 1) {
          const sideTag = side === 'Left' ? 'L' : 'R';
          // Inner (I) / Outer (O) marker on a dual axle; single axle has neither.
          const ioTag = axle.tyresPerSide > 1 ? (ordinal === 1 ? 'I' : 'O') : '';
          const code = `A${axleIndex}_${sideTag}${ioTag}`;
          positions.push({
            code,
            positionKind: 'Wheel',
            axleIndex,
            side,
            ordinal,
            label: `Axle ${axleIndex} ${side}${ioTag ? ` ${ordinal === 1 ? 'inner' : 'outer'}` : ''}`,
          });
          tyreCount += 1;
        }
      }
    });
    for (let s = 1; s <= def.spareCount; s += 1) {
      positions.push({
        code: `SPARE_${s}`,
        positionKind: 'Spare',
        axleIndex: null,
        side: null,
        ordinal: s,
        label: `Spare ${s}`,
      });
      tyreCount += 1;
    }
    return { positions, axleCount: def.axles.length, tyreCount };
  }

  /** Create a vehicle class with its (generated) chassis layout. */
  createClass(input: {
    code: string;
    name: string;
    unitKind?: string;
    layout: ChassisLayoutDefinition;
  }): VehicleClass {
    const code = input.code.trim();
    if (code.length === 0) {
      throw new BadRequestException('Class code is required.');
    }
    for (const existing of this.classes.values()) {
      if (existing.code.toUpperCase() === code.toUpperCase()) {
        throw new BadRequestException(`Vehicle class code already exists: ${code}`);
      }
    }
    const unitKind = input.unitKind === 'Towed' ? 'Towed' : 'Powered';
    const layout = this.createLayout(code, input.name, input.layout);
    const vehicleClass: VehicleClass = {
      id: this.nextClassId,
      code,
      name: input.name.trim(),
      unitKind,
      defaultChassisLayoutId: layout.id,
      isActive: true,
    };
    this.classes.set(vehicleClass.id, vehicleClass);
    this.nextClassId += 1;
    return vehicleClass;
  }

  /** A known class, throwing if absent. */
  requireClass(id: number): VehicleClass {
    const found = this.classes.get(id);
    if (!found) {
      throw new NotFoundException(`Unknown vehicle class: ${id}`);
    }
    return found;
  }

  /** Whether `id` is a known vehicle class. */
  isKnownClass(id: number): boolean {
    return this.classes.has(id);
  }

  /** A known chassis layout, throwing if absent. */
  requireLayout(id: number): ChassisLayout {
    const found = this.layouts.get(id);
    if (!found) {
      throw new NotFoundException(`Unknown chassis layout: ${id}`);
    }
    return found;
  }

  /** Whether `id` is a known chassis layout. */
  isKnownLayout(id: number): boolean {
    return this.layouts.has(id);
  }

  /** Every class (read-only). */
  listClasses(): readonly VehicleClass[] {
    return [...this.classes.values()];
  }

  /** Every layout (read-only). */
  listLayouts(): readonly ChassisLayout[] {
    return [...this.layouts.values()];
  }

  /** Test-only reset to the seeded state. */
  resetForTests(): void {
    this.classes.clear();
    this.layouts.clear();
    this.nextClassId = 1;
    this.nextLayoutId = 1;
    this.seed();
  }

  private createLayout(
    code: string,
    name: string,
    def: ChassisLayoutDefinition,
  ): ChassisLayout {
    const { positions, axleCount, tyreCount } = VehicleClassService.generatePositions(def);
    const layout: ChassisLayout = {
      id: this.nextLayoutId,
      code,
      name: `${name} layout`,
      version: 1,
      definition: def,
      axleCount,
      tyreCount,
      positions,
      isActive: true,
    };
    this.layouts.set(layout.id, layout);
    this.nextLayoutId += 1;
    return layout;
  }

  /** Seed the dummy gateway's class/layout (Tractor_Head 6x4, id 1). */
  private seed(): void {
    // A Tractor_Head 6x4: Steer (single) + two Drive (dual) axles, 1 spare →
    // 2 + 4 + 4 + 1 = 11 tyre positions. Generated, not hard-coded.
    this.createClass({
      code: 'Tractor_Head',
      name: 'Tractor head 6x4',
      unitKind: 'Powered',
      layout: {
        axles: [
          { role: 'Steer', tyresPerSide: 1 },
          { role: 'Drive', tyresPerSide: 2 },
          { role: 'Drive', tyresPerSide: 2 },
        ],
        spareCount: 1,
      },
    });
  }
}
