import { Module } from '@nestjs/common';

/**
 * FG-16 — File upload & compression (REQ-FUP, NFR-FILES).
 *
 * Scaffold stub (TASK-103). The signed-link upload pipeline, server-side
 * re-check/compress worker and three-state append-only files land in TASK-116
 * (local store) and TASK-204 (R2 / S3-compatible).
 */
@Module({})
export class FilesModule {}
