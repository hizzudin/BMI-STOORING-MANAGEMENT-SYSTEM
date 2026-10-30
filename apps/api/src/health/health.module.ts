import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

/** Exposes the public `/health` liveness endpoint. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
