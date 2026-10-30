import { Module } from '@nestjs/common';

/**
 * FG-13 — Accounts, access & audit (REQ-IAM, NFR-02, NFR-05).
 *
 * Scaffold stub (TASK-103). Login, sessions, lockout, one-role-per-user and
 * one-System-Admin invariants (BR-14), the editable-but-locked permission
 * matrix, the Planner-approval switch and the audit-log read land in TASK-104.
 * This module will own the real resolver that replaces `DevAuthMiddleware`.
 */
@Module({})
export class IamModule {}
