import { Injectable, NotFoundException } from '@nestjs/common';

/**
 * The object-storage seam (FG-16, NFR-13, DEC-32).
 *
 * Business logic (the files service + worker) depends ONLY on this interface,
 * never on a concrete storage driver — the steering hard rule. In Phase 1 the
 * {@link LocalObjectStore} holds the bytes in process; TASK-204 swaps the
 * implementation for the S3-compatible adapter (MinIO locally / Cloudflare R2
 * in staging/production) behind this same contract, without touching the
 * pipeline. The API server never stores files on its own disk in production
 * (REQ-FUP-004): a Phase-1 in-process map stands in for the remote bucket.
 */
export interface ObjectStore {
  /** Store (or overwrite) the bytes at `key`. Returns the stored byte length. */
  put(key: string, bytes: Buffer): Promise<number>;
  /** Read the bytes at `key`, or `null` when the key is absent. */
  get(key: string): Promise<Buffer | null>;
  /** Remove the bytes at `key`. Idempotent — removing an absent key is a no-op. */
  remove(key: string): Promise<void>;
  /** Whether a key currently holds bytes. */
  has(key: string): Promise<boolean>;
  /** Total bytes currently stored (NFR-13 storage-budget usage). */
  totalBytes(): Promise<number>;
}

/** DI token for the {@link ObjectStore} seam. */
export const OBJECT_STORE = Symbol('OBJECT_STORE');

/**
 * Phase-1 in-process {@link ObjectStore}. Keeps each object's bytes in a `Map`,
 * standing in for the remote private bucket. Deterministic and side-effect-free
 * (no real filesystem or network), so the whole FUP pipeline is unit-testable.
 */
@Injectable()
export class LocalObjectStore implements ObjectStore {
  private readonly objects = new Map<string, Buffer>();

  async put(key: string, bytes: Buffer): Promise<number> {
    this.objects.set(key, Buffer.from(bytes));
    return bytes.length;
  }

  async get(key: string): Promise<Buffer | null> {
    const bytes = this.objects.get(key);
    return bytes ? Buffer.from(bytes) : null;
  }

  /** Read the bytes at `key`, throwing {@link NotFoundException} when absent. */
  async require(key: string): Promise<Buffer> {
    const bytes = await this.get(key);
    if (!bytes) {
      throw new NotFoundException(`Object '${key}' not found in storage.`);
    }
    return bytes;
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async totalBytes(): Promise<number> {
    let total = 0;
    for (const bytes of this.objects.values()) {
      total += bytes.length;
    }
    return total;
  }

  /** Test hook: wipe the store between cases. */
  resetForTests(): void {
    this.objects.clear();
  }
}
