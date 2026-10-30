import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/**
 * Provides the append-only {@link AuditService} application-wide (NFR-02).
 * Global so the audit interceptor and every feature module share one sink.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
