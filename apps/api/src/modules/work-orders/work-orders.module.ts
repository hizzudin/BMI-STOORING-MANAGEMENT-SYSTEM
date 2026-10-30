import { Module } from '@nestjs/common';
import { WorkOrdersController } from './work-orders.controller.js';

/**
 * FG-1 — Work Order lifecycle (REQ-WO, SM-WO).
 *
 * Scaffold (TASK-103): registered in the root module so the
 * module-per-functional-group structure is in place, with a representative
 * scaffold controller that exercises the global role guard, idempotency
 * interceptor and audit interceptor against a `wo.create`-gated route. The full
 * controllers, services and DTOs land in TASK-108 (WO lifecycle + assignment
 * engine).
 */
@Module({
  controllers: [WorkOrdersController],
})
export class WorkOrdersModule {}
