import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { DataGatewayModule } from './core/data-gateway/data-gateway.module.js';
import { AuditModule } from './core/audit/audit.module.js';
import { AuditInterceptor } from './core/audit/audit.interceptor.js';
import { IdempotencyModule } from './core/idempotency/idempotency.module.js';
import { IdempotencyInterceptor } from './core/idempotency/idempotency.interceptor.js';
import { RolesGuard } from './core/auth/roles.guard.js';
import { DevAuthMiddleware } from './core/auth/dev-auth.middleware.js';
import { HealthModule } from './health/health.module.js';
import { FUNCTIONAL_GROUP_MODULES } from './modules/index.js';

/**
 * Root application module.
 *
 * Wires the cross-cutting concerns required by design.md "Components and
 * Interfaces" — every mutating endpoint gets a server-side role guard (NFR-04),
 * idempotency-key support (NFR-01) and an audit write (NFR-02):
 *
 *   - `DataGatewayModule`  — DI of the `DataGateway` seam (dummy in dev).
 *   - `RolesGuard`         — global guard reading the PRD §2.2 matrix.
 *   - `IdempotencyInterceptor` — global, honours the `Idempotency-Key` header.
 *   - `AuditInterceptor`   — global, appends an audit record per mutating call.
 *   - `DevAuthMiddleware`  — resolves the request principal (TASK-104 replaces it).
 *
 * Interceptor order matters: idempotency is registered before audit, so a
 * replayed (short-circuited) request does not produce a second audit record.
 *
 * Every functional group (FG-1..FG-18) is imported as its own module.
 */
@Module({
  imports: [
    DataGatewayModule,
    AuditModule,
    IdempotencyModule,
    HealthModule,
    ...FUNCTIONAL_GROUP_MODULES,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Resolve the principal on every route before the guard runs.
    consumer.apply(DevAuthMiddleware).forRoutes('*');
  }
}
