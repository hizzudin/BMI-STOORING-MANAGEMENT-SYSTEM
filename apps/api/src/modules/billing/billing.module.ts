import { Module } from '@nestjs/common';

/**
 * FG-11 — WO document & invoices (REQ-WOD, REQ-BIL, SM-INV).
 *
 * Scaffold stub (TASK-103). The print-ready WO document and daily invoices
 * (markup/PPN/numbering, Draft→Issued→Paid→Void, the Off_Unit line) land in
 * TASK-115.
 */
@Module({})
export class BillingModule {}
