import { Module } from '@nestjs/common';

/**
 * FG-14 — Setup mode & Go live (REQ-SETUP, ASM-64).
 *
 * Scaffold stub (TASK-103). Setup-mode gating (only System Admin + Access
 * Manager sign in, no approvals), bulk import and the one-way Go-live switch
 * land in TASK-105.
 */
@Module({})
export class SetupModule {}
