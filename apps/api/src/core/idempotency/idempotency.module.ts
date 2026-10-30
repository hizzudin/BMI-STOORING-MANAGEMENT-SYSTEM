import { Global, Module } from '@nestjs/common';
import { IdempotencyStore } from './idempotency.store.js';

/**
 * Provides the {@link IdempotencyStore} application-wide (NFR-01). Global so the
 * idempotency interceptor and feature modules share one store.
 */
@Global()
@Module({
  providers: [IdempotencyStore],
  exports: [IdempotencyStore],
})
export class IdempotencyModule {}
