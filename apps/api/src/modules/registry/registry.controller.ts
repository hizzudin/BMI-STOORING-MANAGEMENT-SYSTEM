import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { SkipAudit } from '../../core/audit/skip-audit.decorator.js';
import { ModuleRegistryService } from './module-registry.service.js';
import { PresetService } from './preset.service.js';
import { ComposerCheckService } from './composer-check.service.js';
import {
  ComposerCheckDto,
  CreatePmPackageDto,
  RegisterModuleDto,
  SavePresetDto,
} from './dto/registry.dto.js';

/**
 * FG-3 — Module registry, step composer and WO presets (REQ-REG, PR-6, DEC-85/88).
 *
 * All writes require the §2.2 `registry.manage` capability, which only a Planner
 * or the System Admin holds (REQ-REG-001). The global RolesGuard refuses every
 * other role a server-side 403 with no extra check. Reads (the designer needs
 * the active module and preset lists, and the live Checks panel) are open to any
 * authenticated user. Every mutating call runs through the global ValidationPipe
 * + IdempotencyInterceptor and leaves exactly one audit record via the
 * AuditInterceptor enriched through the per-request audit-context.
 *
 * `POST /registry/composer/check` is a read-only computation (no state change),
 * so it is not audited.
 */
@Controller('registry')
export class RegistryController {
  constructor(
    private readonly modules: ModuleRegistryService,
    private readonly presets: PresetService,
    private readonly composer: ComposerCheckService,
  ) {}

  // --- Module registry (REQ-REG-002/006) -----------------------------------

  /** The modules the designer offers — only active rows (REQ-REG-002). */
  @Get('modules')
  listModules(@Query('all') all?: string): unknown {
    return {
      modules: all === 'true' ? this.modules.listAll() : this.modules.listActive(),
    };
  }

  /**
   * Register a new step module as a registry row (REQ-REG-006). It becomes
   * pickable in the composer with no engine edit (AC-REG-003).
   */
  @Post('modules')
  @RequireCapability(Capabilities.RegistryManage)
  @HttpCode(HttpStatus.CREATED)
  registerModule(@Req() req: AuthenticatedRequest, @Body() dto: RegisterModuleDto): unknown {
    const created = this.modules.register({
      code: dto.code,
      name: dto.name,
      ...(dto.description === undefined ? {} : { description: dto.description }),
      uiComponent: dto.uiComponent,
      ...(dto.configSchema === undefined ? {} : { configSchema: dto.configSchema }),
      ...(dto.creationSchema === undefined ? {} : { creationSchema: dto.creationSchema }),
      executorRoles: dto.executorRoles,
      ...(dto.scopeRules === undefined ? {} : { scopeRules: dto.scopeRules }),
      ...(dto.completionSection === undefined ? {} : { completionSection: dto.completionSection }),
      costKind: dto.costKind,
      ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
    });
    enrichAudit(req, {
      entity: 'assignment_modules',
      entityId: created.id,
      after: { code: created.code, costKind: created.costKind, isActive: created.isActive },
      reason: 'register_module',
    });
    return { module: created };
  }

  /** Deactivate a module: stop new use, keep old WOs readable (REQ-REG-005). */
  @Post('modules/:code/deactivate')
  @RequireCapability(Capabilities.RegistryManage)
  @HttpCode(HttpStatus.OK)
  deactivateModule(@Req() req: AuthenticatedRequest, @Param('code') code: string): unknown {
    const before = this.modules.require(code);
    const updated = this.modules.deactivate(code);
    enrichAudit(req, {
      entity: 'assignment_modules',
      entityId: updated.id,
      before: { isActive: before.isActive },
      after: { isActive: updated.isActive },
      reason: 'deactivate_module',
    });
    return { module: updated };
  }

  // --- WO presets (versioned) (REQ-REG-003/005) ----------------------------

  @Get('presets')
  listPresets(): unknown {
    return { presets: this.presets.listAll() };
  }

  @Get('presets/:id')
  viewPreset(@Param('id', ParseIntPipe) id: number): unknown {
    return { preset: this.presets.require(id) };
  }

  /**
   * Save the current steps as a preset (REQ-REG-003). A name that already exists
   * is stored as a new version; existing WOs keep their own steps (AC-REG-005).
   */
  @Post('presets')
  @RequireCapability(Capabilities.RegistryManage)
  @HttpCode(HttpStatus.CREATED)
  savePreset(@Req() req: AuthenticatedRequest, @Body() dto: SavePresetDto): unknown {
    const created = this.presets.savePreset({
      name: dto.name,
      category: dto.category,
      ...(dto.requiresDowntime === undefined ? {} : { requiresDowntime: dto.requiresDowntime }),
      createdBy: req.currentUser?.userId ?? 0,
      steps: dto.steps.map((s) => ({
        module: s.module,
        ...(s.stepConfig === undefined ? {} : { stepConfig: s.stepConfig }),
        ...(s.isOptional === undefined ? {} : { isOptional: s.isOptional }),
        executorRoles: s.executorRoles,
        verifierRole: s.verifierRole,
      })),
    });
    enrichAudit(req, {
      entity: 'wo_presets',
      entityId: created.id,
      after: { name: created.name, version: created.version, stepCount: created.steps.length },
      reason: 'save_preset',
    });
    return { preset: created };
  }

  /** Deactivate a preset version (REQ-REG-005). */
  @Post('presets/:id/deactivate')
  @RequireCapability(Capabilities.RegistryManage)
  @HttpCode(HttpStatus.OK)
  deactivatePreset(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): unknown {
    const updated = this.presets.deactivate(id);
    enrichAudit(req, {
      entity: 'wo_presets',
      entityId: updated.id,
      after: { isActive: updated.isActive },
      reason: 'deactivate_preset',
    });
    return { preset: updated };
  }

  // --- PM packages (REQ-REG-007) -------------------------------------------

  @Get('pm-packages')
  listPmPackages(@Query('vehicleClassId') vehicleClassId?: string): unknown {
    const classId = vehicleClassId === undefined ? undefined : Number(vehicleClassId);
    return { packages: this.presets.listPmPackages(classId) };
  }

  @Post('pm-packages')
  @RequireCapability(Capabilities.RegistryManage)
  @HttpCode(HttpStatus.CREATED)
  createPmPackage(@Req() req: AuthenticatedRequest, @Body() dto: CreatePmPackageDto): unknown {
    const created = this.presets.createPmPackage({
      vehicleClassId: dto.vehicleClassId,
      packageCode: dto.packageCode,
      packageName: dto.packageName,
      ...(dto.intervalKm === undefined ? {} : { intervalKm: dto.intervalKm }),
      intervalDays: dto.intervalDays,
      presetId: dto.presetId,
      ...(dto.tasks === undefined ? {} : { tasks: dto.tasks }),
    });
    enrichAudit(req, {
      entity: 'pm_packages',
      entityId: created.id,
      after: { code: created.packageCode, classId: created.vehicleClassId, presetId: created.presetId },
      reason: 'create_pm_package',
    });
    return { package: created };
  }

  // --- Live composer checks (REQ-REG-004) ----------------------------------

  /**
   * Run the live composer checks over the current step list (REQ-REG-004). A
   * read-only computation surfaced in the Create WO "Checks" panel — not audited.
   */
  @Post('composer/check')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  checkComposition(@Body() dto: ComposerCheckDto): unknown {
    return this.composer.check(dto.steps.map((s) => ({ module: s.module })));
  }
}
