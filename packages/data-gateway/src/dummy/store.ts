/**
 * The in-memory store that backs `DummyDataGateway` (Phase 1).
 *
 * One `AggregateTable<T>` per aggregate root holds its rows keyed by numeric id,
 * plus the id sequence and the aggregate name. A `DummyStore` groups all tables
 * and the idempotency-key set. The all-or-nothing `unitOfWork` is implemented by
 * **snapshotting** the whole store, applying writes to the snapshot, and either
 * swapping it in on success or discarding it on a throw — so a mid-write failure
 * leaves the committed store untouched (NFR-INTEGRITY / NFR-01).
 */

import type { Aggregate } from '../data-gateway.interface.js';

/** A table of rows for one aggregate, addressed by numeric id. */
export interface AggregateTable<T extends Aggregate> {
  readonly name: string;
  /** rows keyed by numeric id */
  rows: Map<number, T>;
  /** last assigned id; next insert uses `nextId + 1` */
  nextId: number;
}

function cloneTable<T extends Aggregate>(table: AggregateTable<T>): AggregateTable<T> {
  // Rows are plain immutable DTOs (readonly fields), so a shallow copy of the
  // Map is a sufficient deep clone for isolation: replacing a row always creates
  // a new object, never mutates an existing one.
  return {
    name: table.name,
    rows: new Map(table.rows),
    nextId: table.nextId,
  };
}

/** The complete in-memory database: every table plus the idempotency ledger. */
export interface DummyStore {
  readonly tables: Record<string, AggregateTable<Aggregate>>;
  /** idempotency keys already handled (committed) */
  idempotencyKeys: Set<string>;
}

/** Build an empty table for an aggregate. */
export function emptyTable<T extends Aggregate>(name: string): AggregateTable<T> {
  return { name, rows: new Map<number, T>(), nextId: 0 };
}

/** Deep-enough clone of the whole store for a transaction snapshot. */
export function cloneStore(store: DummyStore): DummyStore {
  const tables: Record<string, AggregateTable<Aggregate>> = {};
  for (const [key, table] of Object.entries(store.tables)) {
    tables[key] = cloneTable(table);
  }
  return {
    tables,
    idempotencyKeys: new Set(store.idempotencyKeys),
  };
}
