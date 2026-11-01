import { Module } from '@nestjs/common';
import { TyreEventLogService } from './tyre-event-log.service.js';

/**
 * The unified tyre-event log (REQ-TYR-013, SM-TYRE §3.6).
 *
 * A dependency-free module so both the warehouse-side {@link TyreRegisterService}
 * (InventoryModule) and the chassis-side Placement module can write to one
 * append-only `tyre_events` store with no import cycle. See
 * {@link TyreEventLogService}.
 */
@Module({
  providers: [TyreEventLogService],
  exports: [TyreEventLogService],
})
export class TyreEventLogModule {}
