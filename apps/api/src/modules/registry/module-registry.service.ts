import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@bmi/shared';

/**
 * A single row of the module registry — one registered kind of step
 * (`assignment_modules`, PRD §9.6, REQ-REG-002). Every module, the current ones
 * and any future one, is described entirely by the fields of its row: the
 * engine, designer, WO document renderer and scope lock read these fields and
 * never branch on a specific module code (PR-6, REQ-REG-006).
 */
export interface AssignmentModule {
  readonly id: number;
  /** Identity in the designer, e.g. `Stock`, `Mobilisasi` (unique). */
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  /** Front-end component opened in the WO workspace (data, not code). */
  readonly uiComponent: string;
  /** Settings the designer may give each step of this module (REQ-REG-001). */
  readonly configSchema: Readonly<Record<string, unknown>> | null;
  /** What the WO creator fills for a step of this module; `null` = none. */
  readonly creationSchema: Readonly<Record<string, unknown>> | null;
  /** Who may run a step of this module (the System Admin always may). */
  readonly executorRoles: readonly Role[];
  /** What WO/vehicle data and master data the module may read or change. */
  readonly scopeRules: Readonly<Record<string, unknown>>;
  /** What the WO document prints for the step. */
  readonly completionSection: Readonly<Record<string, unknown>>;
  /** Parts, Labor, Document or None — the cost this module contributes. */
  readonly costKind: ModuleCostKind;
  readonly isActive: boolean;
  readonly sortOrder: number;
}

/** `cost_kind` values (PRD §9.6 CHECK). */
export const MODULE_COST_KINDS = ['Parts', 'Labor', 'Document', 'None'] as const;
export type ModuleCostKind = (typeof MODULE_COST_KINDS)[number];

/** Input to register a new module (the same contract a future module uses). */
export interface RegisterModuleInput {
  code: string;
  name: string;
  description?: string;
  uiComponent: string;
  configSchema?: Record<string, unknown>;
  creationSchema?: Record<string, unknown>;
  executorRoles: Role[];
  scopeRules?: Record<string, unknown>;
  completionSection?: Record<string, unknown>;
  costKind: ModuleCostKind;
  sortOrder?: number;
}

/**
 * The **module registry** (FG-3, REQ-REG-002/006, PR-6 "configuration over code").
 *
 * The step modules are **editable master-data rows**, never hard-coded in the
 * engine. The six current modules — Stock, Part_Purchase, Mechanic_Action,
 * Mobilisasi, Part_Replacement, Document — plus Part_Check (DEC-88) are seeded
 * here as the first registry rows using the *same contract* a future module
 * will use (PRD §9.6 "Build note"). Registering a 7th module is a new row; it
 * becomes pickable in the composer with **no engine edit** (AC-REG-003).
 *
 * Phase 1: the dummy gateway (TASK-102) models only the nine business
 * aggregates and carries no `assignment_modules` table, so — following the
 * TASK-103/104/105/106 precedent for cross-cutting Phase-1 master data — the
 * registry lives here as an API-layer in-memory store. TASK-201/202 re-home it
 * behind the PRD §9.6 `assignment_modules` table unchanged.
 */
@Injectable()
export class ModuleRegistryService {
  private readonly modules = new Map<string, AssignmentModule>();
  private nextId = 1;

  constructor() {
    this.seed();
  }

  /** Register a new module as a registry row (REQ-REG-006). */
  register(input: RegisterModuleInput): AssignmentModule {
    const code = input.code.trim();
    if (code.length === 0) {
      throw new BadRequestException('Module code is required.');
    }
    if (this.modules.has(code.toUpperCase())) {
      throw new BadRequestException(`Module code already exists: ${code}`);
    }
    if (input.executorRoles.length === 0) {
      throw new BadRequestException('A module needs at least one executor role.');
    }
    if (!MODULE_COST_KINDS.includes(input.costKind)) {
      throw new BadRequestException(`Unknown cost kind: ${input.costKind}`);
    }
    const row: AssignmentModule = {
      id: this.nextId,
      code,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      uiComponent: input.uiComponent.trim(),
      configSchema: input.configSchema ?? null,
      creationSchema: input.creationSchema ?? null,
      // The System Admin always may run any step — kept out of the stored list
      // but honoured by `mayExecute` so no row needs to repeat it (PRD §9.6).
      executorRoles: [...input.executorRoles],
      scopeRules: input.scopeRules ?? {},
      completionSection: input.completionSection ?? {},
      costKind: input.costKind,
      isActive: true,
      sortOrder: input.sortOrder ?? this.nextId * 10,
    };
    this.modules.set(code.toUpperCase(), row);
    this.nextId += 1;
    return row;
  }

  /** Deactivate a module: stop new use, keep old WOs readable (REQ-REG-005). */
  deactivate(code: string): AssignmentModule {
    const row = this.require(code);
    const next: AssignmentModule = { ...row, isActive: false };
    this.modules.set(code.toUpperCase(), next);
    return next;
  }

  /** Reactivate a module. */
  activate(code: string): AssignmentModule {
    const row = this.require(code);
    const next: AssignmentModule = { ...row, isActive: true };
    this.modules.set(code.toUpperCase(), next);
    return next;
  }

  /** A known module by code, throwing if absent. */
  require(code: string): AssignmentModule {
    const row = this.modules.get(code.trim().toUpperCase());
    if (!row) {
      throw new NotFoundException(`Unknown module: ${code}`);
    }
    return row;
  }

  /** Whether `code` is a known module (active or not). */
  isKnown(code: string): boolean {
    return this.modules.has(code.trim().toUpperCase());
  }

  /** Whether `code` is a known **active** module (what the designer offers). */
  isActive(code: string): boolean {
    return this.modules.get(code.trim().toUpperCase())?.isActive ?? false;
  }

  /**
   * The modules the designer offers — only the **active** rows, in sort order
   * (REQ-REG-002). The composer picks from this list without knowing any code.
   */
  listActive(): readonly AssignmentModule[] {
    return [...this.modules.values()]
      .filter((m) => m.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /** Every module (active or not), in sort order — for admin screens. */
  listAll(): readonly AssignmentModule[] {
    return [...this.modules.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * Whether a `role` may execute a step of module `code`. The System Admin
   * always may (PRD §9.6); otherwise the role must be in `executor_roles`.
   */
  mayExecute(code: string, role: Role): boolean {
    if (role === Role.SystemAdmin) {
      return true;
    }
    return this.require(code).executorRoles.includes(role);
  }

  /** Test-only reset to the seeded six-module baseline. */
  resetForTests(): void {
    this.modules.clear();
    this.nextId = 1;
    this.seed();
  }

  /**
   * Seed the registry's first rows (PRD §9.6 "Build note": build the current
   * modules as the first registry rows using the same contract a future module
   * uses). The six step modules are Stock, Part_Purchase, Mechanic_Action,
   * Mobilisasi, Part_Replacement and Document; Part_Check (DEC-88) is a seventh
   * seeded row of the same shape. None of these is hard-coded in the engine.
   */
  private seed(): void {
    this.register({
      code: 'Stock',
      name: 'Stock',
      description: 'Issue parts and tyres from the warehouse (cuts stock).',
      uiComponent: 'StepStock',
      creationSchema: { parts: 'required', tyres: 'required' },
      executorRoles: [Role.WarehouseManager, Role.FieldCoordinator],
      scopeRules: { reads: ['parts_catalog'], writes: ['stock_cards', 'work_order_parts'] },
      completionSection: { prints: 'issued parts, tyres and quantities' },
      costKind: 'Parts',
      sortOrder: 10,
    });
    this.register({
      code: 'Part_Purchase',
      name: 'Part Purchase',
      description: 'Record parts bought outside; no stock change (DEC-60).',
      uiComponent: 'StepPartPurchase',
      creationSchema: { parts: 'optional' },
      executorRoles: [Role.WarehouseManager, Role.FieldCoordinator],
      scopeRules: { reads: ['parts_catalog'], writes: ['work_order_purchases'] },
      completionSection: { prints: 'purchased lines, totals and receipt file name' },
      costKind: 'Parts',
      sortOrder: 20,
    });
    this.register({
      code: 'Mechanic_Action',
      name: 'Mechanic Action',
      description: 'Internal or external labour and photos (no stooring, DEC-90).',
      uiComponent: 'StepMechanicAction',
      // creationSchema omitted → none (the WO creator fills nothing for this step).
      executorRoles: [Role.Mechanic],
      scopeRules: { writes: ['work_order_services'] },
      completionSection: { prints: 'labour lines, team and photos' },
      costKind: 'Labor',
      sortOrder: 30,
    });
    this.register({
      code: 'Mobilisasi',
      name: 'Mobilisasi',
      description: 'Send a mechanic to the driver; produces the stooring fee (REQ-MBL).',
      uiComponent: 'StepMobilisasi',
      // creationSchema omitted → none.
      executorRoles: [Role.Mechanic],
      scopeRules: { reads: ['stooring_rates', 'breakdown_reports'], writes: ['work_orders.stooring_cost'] },
      completionSection: { prints: 'stooring area and fee' },
      costKind: 'Labor',
      sortOrder: 40,
    });
    this.register({
      code: 'Part_Replacement',
      name: 'Part Replacement',
      description: 'Replace, rotate or demount tyres within the scope lock (BR-11).',
      uiComponent: 'StepPartReplacement',
      // creationSchema omitted → none.
      executorRoles: [Role.Mechanic],
      scopeRules: { reads: ['part_positions'], writes: ['part_placements', 'part_placement_logs'] },
      completionSection: { prints: 'placement snapshot and changes' },
      costKind: 'None',
      sortOrder: 50,
    });
    this.register({
      code: 'Document',
      name: 'Document',
      description: 'Renew a vehicle document (updates the document, SM-DOC).',
      uiComponent: 'StepDocument',
      creationSchema: { vehicleDocument: 'required' },
      executorRoles: [Role.Planner],
      scopeRules: { reads: ['document_types'], writes: ['vehicle_documents', 'document_renewals'] },
      completionSection: { prints: 'document type, old/new expiry and receipt' },
      costKind: 'Document',
      sortOrder: 60,
    });
    this.register({
      code: 'Part_Check',
      name: 'Part Check',
      description: 'Troubleshooting: report each part Good/Repair/Replace (DEC-88).',
      uiComponent: 'StepPartCheck',
      creationSchema: { parts: 'required' },
      executorRoles: [Role.Mechanic],
      scopeRules: { writes: ['work_order_check_items'] },
      completionSection: { prints: 'checked parts, decisions and photos' },
      costKind: 'Labor',
      sortOrder: 70,
    });
  }
}
