import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';

/**
 * FG-1 scaffold controller (TASK-103).
 *
 * A minimal, representative slice that proves the cross-cutting wiring is live
 * end-to-end before the full WO lifecycle lands in TASK-108:
 *   - `POST /work-orders/scaffold-check` requires the §2.2 `wo.create` capability,
 *     so the global role guard refuses unauthorized roles with a server-side 403.
 *   - Because it is a mutating (POST) call, the audit interceptor appends an
 *     `audit_logs` record, and the idempotency interceptor honours an
 *     `Idempotency-Key`.
 *   - `GET /work-orders/scaffold-count` reads through the injected `DataGateway`,
 *     demonstrating DI of the seam (never a concrete DB driver).
 *
 * TASK-108 replaces these with the real WO endpoints; the guard/audit/idempotency
 * contracts they rely on are established here.
 */
@Controller('work-orders')
export class WorkOrdersController {
  constructor(@Inject(DATA_GATEWAY) private readonly gateway: DataGateway) {}

  /** Reads WO count via the DataGateway seam (no DB driver imported). */
  @Get('scaffold-count')
  async count(): Promise<{ workOrders: number }> {
    const workOrders = await this.gateway.repos.workOrders.count();
    return { workOrders };
  }

  /**
   * A mutating route gated by `wo.create` (PRD §2.2). Roles without that cell
   * (e.g. Accounting, Driver) are refused 403 by the global guard before this
   * handler runs. Echoes the payload so the idempotency replay is observable.
   */
  @RequireCapability(Capabilities.WoCreate)
  @Post('scaffold-check')
  create(@Body() body: Record<string, unknown>): { ok: true; echo: Record<string, unknown> } {
    return { ok: true, echo: body };
  }
}
