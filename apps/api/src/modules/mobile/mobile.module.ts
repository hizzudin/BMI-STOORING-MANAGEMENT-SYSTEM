import { Module } from '@nestjs/common';

/**
 * FG-15 — Mobile app endpoints (REQ-MOB).
 *
 * Scaffold stub (TASK-103). The API side of the R1 field flows (driver
 * inspection/odometer/breakdown-with-location-capture, FC requests/purchase,
 * System Admin field menu, the mechanic task list REQ-MOB-010) is served by the
 * feature modules; this module groups any mobile-specific endpoints added in
 * TASK-118.
 */
@Module({})
export class MobileModule {}
