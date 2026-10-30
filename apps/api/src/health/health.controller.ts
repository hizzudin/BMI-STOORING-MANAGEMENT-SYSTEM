import { Controller, Get } from '@nestjs/common';
import { Public } from '../core/auth/public.decorator.js';

/** The shape returned by `GET /api/v1/health`. */
export interface HealthStatus {
  readonly status: 'ok';
  readonly service: string;
  readonly phase: string;
  readonly time: string;
}

/**
 * Liveness endpoint. Public (no authentication) and read-only (no audit record),
 * so a load balancer / uptime check can probe the API without credentials.
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      service: '@bmi/api',
      phase: 'phase-1-dev',
      time: new Date().toISOString(),
    };
  }
}
