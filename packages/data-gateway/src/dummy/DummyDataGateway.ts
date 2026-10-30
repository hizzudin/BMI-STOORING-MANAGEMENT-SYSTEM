/**
 * `DummyDataGateway` — the Phase 1 (Dev) in-memory implementation of the
 * {@link DataGateway} seam. No Postgres, no cloud: business rules run end-to-end
 * against seeded dummy data so flows and state machines can be exercised early.
 *
 * Correctness guarantees it provides for the whole `DataGateway` contract:
 *
 *   - **All-or-nothing writes** (NFR-INTEGRITY / NFR-01): `unitOfWork` snapshots
 *     the store, applies writes to the snapshot, and commits by swapping the
 *     snapshot in only when the callback resolves. If the callback throws, the
 *     snapshot is discarded and the committed store is untouched — zero partial
 *     state.
 *   - **Optimistic locking** (NFR-CONCURRENCY / NFR-03): `update`/`remove`
 *     compare the incoming `version` to the stored one and throw
 *     `StaleVersionError` on a mismatch; a successful `update` increments the
 *     stored version. Two concurrent saves against the same version: exactly one
 *     commits, the other is rejected.
 *   - **Idempotency** (NFR-01): keys claimed inside a committed transaction are
 *     remembered; a replay is skipped. Keys claimed in a rolled-back transaction
 *     are forgotten (they committed with the snapshot that was discarded).
 */

import type {
  UserDto,
  VehicleDto,
  VehicleDocumentDto,
  WorkOrderDto,
  AssignmentDto,
  TyreDto,
  MaintenanceAlertDto,
  ScheduleCardDto,
  InvoiceDto,
} from '@bmi/shared';
import { idValue } from '@bmi/shared';

import type {
  Aggregate,
  DataGateway,
  GatewayRepositories,
  PrimitiveKeys,
  TransactionalRepository,
  TransactionRepositories,
  UnitOfWorkContext,
  UnitOfWorkOptions,
} from '../data-gateway.interface.js';
import { NotFoundError, StaleVersionError, TransactionClosedError } from '../errors.js';
import { cloneStore, type AggregateTable, type DummyStore } from './store.js';

/** The nine aggregate tables Phase 1 models (design.md "Data Models"). */
type TableKey =
  | 'users'
  | 'vehicles'
  | 'vehicleDocuments'
  | 'workOrders'
  | 'assignments'
  | 'tyres'
  | 'maintenanceAlerts'
  | 'scheduleCards'
  | 'invoices';

function rowId<T extends Aggregate>(row: T): number {
  return idValue(row.id as never);
}

/**
 * A repository bound to a *source* of the table it reads/writes. The source is a
 * thunk so the same repository object reads the committed store outside a
 * transaction and the snapshot inside one, without rebuilding it.
 */
class TableRepository<T extends Aggregate> implements TransactionalRepository<T> {
  constructor(
    readonly name: string,
    private readonly table: () => AggregateTable<T>,
    private readonly writable: boolean,
  ) {}

  private requireWritable(): void {
    if (!this.writable) {
      // A read-only repository (gateway.repos) was asked to write. This is a
      // programming error, surfaced as the same guard the transaction uses.
      throw new TransactionClosedError();
    }
  }

  getById(id: number): Promise<T | null> {
    return Promise.resolve(this.table().rows.get(id) ?? null);
  }

  requireById(id: number): Promise<T> {
    const found = this.table().rows.get(id);
    if (!found) {
      throw new NotFoundError(this.name, id);
    }
    return Promise.resolve(found);
  }

  findBy<K extends PrimitiveKeys<T>>(field: K, value: T[K]): Promise<readonly T[]> {
    const matches: T[] = [];
    for (const row of this.table().rows.values()) {
      if (row[field] === value) {
        matches.push(row);
      }
    }
    return Promise.resolve(matches);
  }

  async findOneBy<K extends PrimitiveKeys<T>>(field: K, value: T[K]): Promise<T | null> {
    const matches = await this.findBy(field, value);
    return matches[0] ?? null;
  }

  list(): Promise<readonly T[]> {
    return Promise.resolve([...this.table().rows.values()]);
  }

  count(): Promise<number> {
    return Promise.resolve(this.table().rows.size);
  }

  insert(
    aggregate: Omit<T, 'id' | 'version'> & Partial<Pick<T, 'id' | 'version'>>,
  ): Promise<T> {
    this.requireWritable();
    const table = this.table();
    const id = table.nextId + 1;
    table.nextId = id;
    // Stored rows always start at version 1 regardless of any supplied value.
    const row = { ...(aggregate as object), id, version: 1 } as unknown as T;
    table.rows.set(id, row);
    return Promise.resolve(row);
  }

  update(aggregate: T): Promise<T> {
    this.requireWritable();
    const table = this.table();
    const id = rowId(aggregate);
    const current = table.rows.get(id);
    if (!current) {
      throw new NotFoundError(this.name, id);
    }
    if (current.version !== aggregate.version) {
      // Optimistic lock: the caller's version is stale (NFR-03).
      throw new StaleVersionError(this.name, id, aggregate.version, current.version);
    }
    const next = { ...(aggregate as object), version: current.version + 1 } as unknown as T;
    table.rows.set(id, next);
    return Promise.resolve(next);
  }

  remove(id: number, version: number): Promise<void> {
    this.requireWritable();
    const table = this.table();
    const current = table.rows.get(id);
    if (!current) {
      throw new NotFoundError(this.name, id);
    }
    if (current.version !== version) {
      throw new StaleVersionError(this.name, id, version, current.version);
    }
    table.rows.delete(id);
    return Promise.resolve();
  }
}

function buildRepositories(
  source: () => DummyStore,
  writable: boolean,
): {
  users: TableRepository<UserDto>;
  vehicles: TableRepository<VehicleDto>;
  vehicleDocuments: TableRepository<VehicleDocumentDto>;
  workOrders: TableRepository<WorkOrderDto>;
  assignments: TableRepository<AssignmentDto>;
  tyres: TableRepository<TyreDto>;
  maintenanceAlerts: TableRepository<MaintenanceAlertDto>;
  scheduleCards: TableRepository<ScheduleCardDto>;
  invoices: TableRepository<InvoiceDto>;
} {
  const table =
    <T extends Aggregate>(key: TableKey) =>
    (): AggregateTable<T> =>
      source().tables[key] as unknown as AggregateTable<T>;

  return {
    users: new TableRepository<UserDto>('users', table<UserDto>('users'), writable),
    vehicles: new TableRepository<VehicleDto>('vehicles', table<VehicleDto>('vehicles'), writable),
    vehicleDocuments: new TableRepository<VehicleDocumentDto>(
      'vehicleDocuments',
      table<VehicleDocumentDto>('vehicleDocuments'),
      writable,
    ),
    workOrders: new TableRepository<WorkOrderDto>(
      'workOrders',
      table<WorkOrderDto>('workOrders'),
      writable,
    ),
    assignments: new TableRepository<AssignmentDto>(
      'assignments',
      table<AssignmentDto>('assignments'),
      writable,
    ),
    tyres: new TableRepository<TyreDto>('tyres', table<TyreDto>('tyres'), writable),
    maintenanceAlerts: new TableRepository<MaintenanceAlertDto>(
      'maintenanceAlerts',
      table<MaintenanceAlertDto>('maintenanceAlerts'),
      writable,
    ),
    scheduleCards: new TableRepository<ScheduleCardDto>(
      'scheduleCards',
      table<ScheduleCardDto>('scheduleCards'),
      writable,
    ),
    invoices: new TableRepository<InvoiceDto>('invoices', table<InvoiceDto>('invoices'), writable),
  };
}

export class DummyDataGateway implements DataGateway {
  /** The committed store. A transaction works on a snapshot and swaps this in. */
  private store: DummyStore;

  readonly repos: GatewayRepositories;

  constructor(store: DummyStore) {
    this.store = store;
    // Read-only repositories always point at the *current committed* store.
    this.repos = buildRepositories(() => this.store, false) satisfies GatewayRepositories;
  }

  async unitOfWork<R>(
    work: (ctx: UnitOfWorkContext) => Promise<R> | R,
    options: UnitOfWorkOptions = {},
  ): Promise<R> {
    const key = options.idempotencyKey;
    if (key !== undefined && this.store.idempotencyKeys.has(key)) {
      // Already handled in a prior committed transaction — skip the work.
      return undefined as R;
    }

    // Snapshot: all writes land here; the committed store is untouched until commit.
    const snapshot = cloneStore(this.store);
    let open = true;

    const repos = buildRepositories(() => {
      if (!open) {
        throw new TransactionClosedError();
      }
      return snapshot;
    }, true) satisfies TransactionRepositories;

    const ctx: UnitOfWorkContext = {
      repos,
      claimIdempotencyKey: (claimKey: string): boolean => {
        if (!open) {
          throw new TransactionClosedError();
        }
        if (snapshot.idempotencyKeys.has(claimKey)) {
          return false;
        }
        snapshot.idempotencyKeys.add(claimKey);
        return true;
      },
    };

    try {
      const result = await work(ctx);
      if (key !== undefined) {
        snapshot.idempotencyKeys.add(key);
      }
      // Commit: swap the fully-applied snapshot in atomically.
      this.store = snapshot;
      return result;
    } finally {
      // Whether we committed or threw, the handle is now dead. On a throw the
      // snapshot is simply dropped (never swapped in) → zero partial writes.
      open = false;
    }
  }
}
