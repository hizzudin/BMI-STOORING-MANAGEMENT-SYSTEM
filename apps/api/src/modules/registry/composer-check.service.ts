import { Injectable } from '@nestjs/common';
import { ModuleRegistryService } from './module-registry.service.js';

/** The severity of a composer finding (REQ-REG-004). */
export type CheckSeverity = 'error' | 'warning';

/** One finding surfaced live in the Create WO "Checks" panel (REQ-REG-004). */
export interface ComposerFinding {
  readonly severity: CheckSeverity;
  readonly code: string;
  readonly message: string;
}

/** A composed step as the designer currently has it (order matters). */
export interface ComposedStep {
  readonly module: string;
}

/** The result of a live composer check (REQ-REG-004). */
export interface ComposerCheckResult {
  /** Whether Submit for approval is allowed (no `error` findings). */
  readonly canSubmit: boolean;
  readonly findings: readonly ComposerFinding[];
}

/**
 * **Live composer checks** (FG-3, REQ-REG-004). The Create WO "Checks" panel
 * runs these on every edit and surfaces the findings live; the same checks gate
 * Submit for approval server-side.
 *
 * REQ-REG-004 names exactly three checks and forbids any other rule about which
 * modules may be combined or in which order:
 *   1. **No step → refuse submit** (error, AC-REG-001).
 *   2. **At most one Document step** (error).
 *   3. **Part_Replacement before any Stock step → warn, never block** (because
 *      new tyres must be issued to the WO first).
 *
 * The checks are **data-driven**: they name modules by their registry code and
 * reject any step whose module is not a known active registry row, so a new
 * module registered later (AC-REG-003) is accepted with no change here. No
 * other module-combination rule is added (REQ-REG-004).
 */
@Injectable()
export class ComposerCheckService {
  /** Module codes the three named checks reference, resolved via the registry. */
  private static readonly DOCUMENT = 'Document';
  private static readonly STOCK = 'Stock';
  private static readonly PART_REPLACEMENT = 'Part_Replacement';

  constructor(private readonly registry: ModuleRegistryService) {}

  /** Run the live composer checks over the current step list (REQ-REG-004). */
  check(steps: readonly ComposedStep[]): ComposerCheckResult {
    const findings: ComposerFinding[] = [];

    // Check 0 — every step must name a known active registry module. This keeps
    // a composition honest (no dangling reference) without adding any rule about
    // *which* modules may combine; a newly registered module passes here.
    for (const step of steps) {
      if (!this.registry.isActive(step.module)) {
        findings.push({
          severity: 'error',
          code: 'UNKNOWN_MODULE',
          message: this.registry.isKnown(step.module)
            ? `Step uses a deactivated module: ${step.module}`
            : `Step uses an unknown module: ${step.module}`,
        });
      }
    }

    // Check 1 — no step refuses Submit (AC-REG-001, REQ-REG-004).
    if (steps.length === 0) {
      findings.push({
        severity: 'error',
        code: 'NO_STEP',
        message: 'A work order needs at least one step before it can be submitted.',
      });
    }

    // Check 2 — at most one Document step (REQ-REG-004).
    const documentCount = steps.filter(
      (s) => this.sameModule(s.module, ComposerCheckService.DOCUMENT),
    ).length;
    if (documentCount > 1) {
      findings.push({
        severity: 'error',
        code: 'MULTIPLE_DOCUMENT_STEPS',
        message: 'A work order may hold at most one Document step.',
      });
    }

    // Check 3 — Part_Replacement before any Stock step: warn, never block
    // (new tyres must be issued to the WO first). REQ-REG-004.
    const firstStockIndex = steps.findIndex((s) =>
      this.sameModule(s.module, ComposerCheckService.STOCK),
    );
    const firstReplacementIndex = steps.findIndex((s) =>
      this.sameModule(s.module, ComposerCheckService.PART_REPLACEMENT),
    );
    const replacementBeforeStock =
      firstReplacementIndex !== -1 &&
      (firstStockIndex === -1 || firstReplacementIndex < firstStockIndex);
    if (replacementBeforeStock) {
      findings.push({
        severity: 'warning',
        code: 'REPLACEMENT_BEFORE_STOCK',
        message:
          'A Part Replacement step comes before any Stock step — new tyres must be issued to the work order first.',
      });
    }

    // Submit is allowed unless any finding is an error. Warnings never block.
    const canSubmit = !findings.some((f) => f.severity === 'error');
    return { canSubmit, findings };
  }

  /** Whether two module references are the same registry module (case-safe). */
  private sameModule(a: string, b: string): boolean {
    return a.trim().toUpperCase() === b.trim().toUpperCase();
  }
}
