import { Injectable } from '@nestjs/common';

/** A recorded response for a completed idempotent request. */
export interface IdempotentRecord {
  /** HTTP status code the first attempt returned. */
  readonly statusCode: number;
  /** The JSON body the first attempt returned. */
  readonly body: unknown;
  /** When the record was stored (UTC). */
  readonly at: Date;
}

/**
 * In-memory store of idempotency keys → their first response (NFR-01).
 *
 * Phase 1 keeps this in process memory; Phase 2 (TASK-203) moves it to Redis so
 * replays are durable across instances. The interface it exposes — `get` /
 * `remember` — does not change.
 */
@Injectable()
export class IdempotencyStore {
  private readonly records = new Map<string, IdempotentRecord>();

  /** The recorded response for a key, or `undefined` on first sight. */
  get(key: string): IdempotentRecord | undefined {
    return this.records.get(key);
  }

  /** Record the response for a key so a replay returns the same result. */
  remember(key: string, statusCode: number, body: unknown): void {
    this.records.set(key, { statusCode, body, at: new Date() });
  }

  /** Whether a key has already been handled. */
  has(key: string): boolean {
    return this.records.has(key);
  }
}
