import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { idValue, type AssignmentDto } from '@bmi/shared';
import type { AuthenticatedRequest, CurrentUser } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { AssignmentsService } from './assignments.service.js';
import {
  AssignStepDto,
  PauseStepDto,
  ReleaseStepDto,
  ReturnStepDto,
  StartStepDto,
  StepVersionDto,
} from './dto/assignments.dto.js';

/**
 * FG-2 — Assignment engine & step lifecycle (REQ-ENG, SM-STEP, DEC-87).
 *
 * The endpoints design.md names:
 * `POST /assignments/{id}/start|pause|resume|submit|verify|return|assign` (plus
 * release). Step-execution routes (start/pause/resume/submit) demand only an
 * authenticated principal — the module-agnostic executor-role rule
 * (REQ-ENG-003) is enforced in the service from the step's own registry row, so
 * a fixed capability would wrongly couple the guard to one module. Verify/return
 * carry `step.verify`; assign/release carry `step.assign`. Each mutating call
 * leaves exactly one audit record via the AuditInterceptor + audit-context.
 */
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  /** A step with its computed worked/paused durations. */
  @Get(':id')
  async view(@Param('id', ParseIntPipe) id: number): Promise<{ step: AssignmentDto }> {
    const step = await this.assignments.require(id);
    return { step };
  }

  /** Start a step (SM-STEP Open → In_Progress, REQ-ENG-012/014). Claims if unassigned. */
  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  async start(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: StartStepDto): Promise<{ step: AssignmentDto }> {
    const user = this.principal(req);
    const step = await this.assignments.start(id, user, {
      version: dto.version,
      ...(dto.startedAt === undefined ? {} : { startedAt: dto.startedAt }),
      ...(dto.reason === undefined ? {} : { reason: dto.reason }),
    });
    this.audit(req, step, 'start_step');
    return { step };
  }

  /** Pause a started step with a reason (REQ-ENG-013). */
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  async pause(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: PauseStepDto): Promise<{ step: AssignmentDto }> {
    const user = this.principal(req);
    const step = await this.assignments.pause(id, user, {
      version: dto.version,
      pauseReason: dto.pauseReason,
      ...(dto.note === undefined ? {} : { note: dto.note }),
    });
    this.audit(req, step, 'pause_step');
    return { step };
  }

  /** Resume a paused step (REQ-ENG-013). */
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  async resume(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: StepVersionDto): Promise<{ step: AssignmentDto }> {
    const user = this.principal(req);
    const step = await this.assignments.resume(id, user, { version: dto.version });
    this.audit(req, step, 'resume_step');
    return { step };
  }

  /** Submit a started step (SM-STEP In_Progress → Submitted, REQ-ENG-002). */
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  async submit(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: StepVersionDto): Promise<{ step: AssignmentDto }> {
    const user = this.principal(req);
    const step = await this.assignments.submit(id, user, { version: dto.version });
    this.audit(req, step, 'submit_step');
    return { step };
  }

  /** Verify a submitted step (REQ-ENG-005/007). Verifier ≠ executor (BR-03). */
  @Post(':id/verify')
  @RequireCapability(Capabilities.StepVerify)
  @HttpCode(HttpStatus.OK)
  async verify(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: StepVersionDto): Promise<{ step: AssignmentDto }> {
    const user = this.principal(req);
    const step = await this.assignments.verify(id, user, { version: dto.version });
    this.audit(req, step, 'verify_step', step.selfVerified);
    return { step };
  }

  /** Return a submitted step to its executor with a note (REQ-ENG-005). */
  @Post(':id/return')
  @RequireCapability(Capabilities.StepVerify)
  @HttpCode(HttpStatus.OK)
  async return(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: ReturnStepDto): Promise<{ step: AssignmentDto }> {
    const user = this.principal(req);
    const step = await this.assignments.return(id, user, { version: dto.version, note: dto.note });
    this.audit(req, step, 'return_step');
    return { step };
  }

  /** Assign or reassign a step to a named executor (REQ-ENG-011). */
  @Post(':id/assign')
  @RequireCapability(Capabilities.StepAssign)
  @HttpCode(HttpStatus.OK)
  async assign(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: AssignStepDto): Promise<{ step: AssignmentDto }> {
    const user = this.principal(req);
    const step = await this.assignments.assign(id, user, {
      version: dto.version,
      assigneeId: dto.assigneeId,
      ...(dto.reason === undefined ? {} : { reason: dto.reason }),
    });
    this.audit(req, step, 'assign_step');
    return { step };
  }

  /** Release a claimed step with a reason (REQ-ENG-011). */
  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  async release(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: ReleaseStepDto): Promise<{ step: AssignmentDto }> {
    const user = this.principal(req);
    const step = await this.assignments.release(id, user, { version: dto.version, reason: dto.reason });
    this.audit(req, step, 'release_step');
    return { step };
  }

  // --- helpers -------------------------------------------------------------

  private principal(req: AuthenticatedRequest): CurrentUser {
    if (!req.currentUser) {
      throw new UnauthorizedException('Authentication required.');
    }
    return req.currentUser;
  }

  private audit(req: AuthenticatedRequest, step: AssignmentDto, reason: string, selfDecision = false): void {
    enrichAudit(req, {
      entity: 'work_order_assignments',
      entityId: idValue(step.id),
      after: { sequence: step.sequence, module: step.moduleCode, status: step.status },
      reason,
      selfDecision,
    });
  }
}
