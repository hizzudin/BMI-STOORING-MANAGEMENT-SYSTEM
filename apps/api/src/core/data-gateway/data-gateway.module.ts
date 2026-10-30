import { Global, Module } from '@nestjs/common';
import type { DataGateway } from '@bmi/data-gateway';
import { createDummyDataGateway } from '@bmi/data-gateway';

/**
 * Injection token for the {@link DataGateway} seam.
 *
 * Business logic (services, the daily job) depends only on this token's
 * interface, never on a concrete DB driver — the steering hard rule. Only the
 * provider's `useFactory` changes across phases:
 *
 *   - Phase 1 Dev    → `createDummyDataGateway()` (in-memory, seeded) — bound here.
 *   - Phase 2 Setup  → a `PostgresDataGateway` factory (TASK-202).
 *   - Phase 3 Go-live → the same Postgres impl on Cloud SQL.
 */
export const DATA_GATEWAY = Symbol('DATA_GATEWAY');

/**
 * Provides the `DataGateway` application-wide. Marked `@Global` so every
 * functional-group module can inject `@Inject(DATA_GATEWAY)` without re-importing.
 *
 * In the dev environment it is bound to the in-memory `DummyDataGateway`; the
 * binding is the single seam that later phases re-point (design.md "Phased
 * database strategy").
 */
@Global()
@Module({
  providers: [
    {
      provide: DATA_GATEWAY,
      useFactory: (): DataGateway => createDummyDataGateway(),
    },
  ],
  exports: [DATA_GATEWAY],
})
export class DataGatewayModule {}
