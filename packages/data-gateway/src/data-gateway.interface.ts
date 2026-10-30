/**
 * The `DataGateway` seam (TASK-102, NFR-INTEGRITY / NFR-CONCURRENCY).
 *
 * Business rules (NestJS services, the daily job) depend ONLY on this interface,
 * never on a concrete DB driver — the hard architectural rule from the steering
 * docs and design.md "Phased database strategy". The same interface is backed by:
 *
 *   - Phase 1 Dev   → `DummyDataGateway` (in-memory, seeded) — this package.
 *   - Phase 2 Setup → `PostgresDataGateway` (real PostgreSQL) — TASK-202.
 *   - Phase 3 Go-live → the same Postgres impl on Cloud SQL (Jakarta).
 *
 * Design principles baked into the shape:
 *   - **Repository per aggregate root** (design.md "Data Models", PRD §3.1).
 *   - **Transactional `unitOfWork`** — multi-repository writes commit or roll
 *     back together (NFR-INTEGRITY / NFR-01). A throw inside the callback leaves
 *     zero partial state.
 *   - **Optimistic locking** via a `version` field on every mutable aggregate
 *     (NFR-CONCURRENCY / NFR-03): a save carrying a stale version is refused.
 *   - **Idempotency-key awareness** (NFR-01) so submit/approve/post/issue style
 *     writes can be made exactly-once in later tasks.
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

/**
 * The minimal shape of a persisted aggregate root: a numeric surrogate id
 * (branded ids are `number` at runtime, PRD §9.0) and an optimistic-lock
 * `version` (`version INT NOT NULL DEFAULT 1`). Every repository generic is
 * bound to this so `'id'` and `'version'` are known keys.
 */
export interface Aggregate {
  readonly id: unknown;
  readonly version: number;
}

/**
 * A field a repository can be queried by, expressed as a key of the aggregate
 * whose value is a primitive. Keeps `findBy` type-safe without a query DSL.
 */
export type PrimitiveKeys<T> = {
  [K in keyof T]: T[K] extends string | number | boolean | null ? K : never;
}[keyof T];

/**
 * A repository for one aggregate root. All writes are version-checked.
 *
 * Reads (`getById`, `findBy`, `list`) are available both on the gateway (their
 * own implicit transaction) and inside a `unitOfWork`. Writes (`insert`,
 * `update`, `delete`) are only meaningful inside a transaction so they
 * participate in all-or-nothing commit; the gateway-level helpers that mutate
 * wrap a single-op `unitOfWork` for convenience.
 */
export interface Repository<T extends Aggregate> {
  /** The aggregate name (used in error messages / audit). */
  readonly name: string;

  /** Return the aggregate by its numeric id, or `null` if absent. */
  getById(id: number): Promise<T | null>;

  /** Return the aggregate by id, throwing `NotFoundError` if absent. */
  requireById(id: number): Promise<T>;

  /** Return every aggregate matching an exact field value. */
  findBy<K extends PrimitiveKeys<T>>(field: K, value: T[K]): Promise<readonly T[]>;

  /** Return the first aggregate matching an exact field value, or `null`. */
  findOneBy<K extends PrimitiveKeys<T>>(field: K, value: T[K]): Promise<T | null>;

  /** Return every aggregate in the store (dummy-phase convenience). */
  list(): Promise<readonly T[]>;

  /** Number of stored aggregates. */
  count(): Promise<number>;
}

/**
 * The write-side of a repository, only reachable inside a `unitOfWork`. Writes
 * are version-checked:
 *
 *   - `insert` assigns the next id and sets `version = 1`.
 *   - `update` requires the incoming `version` to match the stored one; on
 *     success it increments the stored `version`. A mismatch throws
 *     `StaleVersionError` (NFR-03).
 *   - `remove` is likewise version-checked.
 *
 * Nothing written here is visible outside the transaction until it commits; if
 * the callback throws, every write in it is discarded (NFR-01).
 */
export interface TransactionalRepository<T extends Aggregate> extends Repository<T> {
  /**
   * Insert a new aggregate. The `id` and `version` of the supplied object are
   * ignored/assigned by the store; the stored row is returned with its real id
   * and `version = 1`.
   */
  insert(aggregate: Omit<T, 'id' | 'version'> & Partial<Pick<T, 'id' | 'version'>>): Promise<T>;

  /**
   * Update an existing aggregate. The supplied `version` must equal the stored
   * version (optimistic lock); the returned row carries the incremented
   * version. Throws `StaleVersionError` on a mismatch, `NotFoundError` if the
   * id is unknown.
   */
  update(aggregate: T): Promise<T>;

  /**
   * Delete an aggregate, version-checked. Throws `StaleVersionError` on a
   * version mismatch, `NotFoundError` if the id is unknown.
   */
  remove(id: number, version: number): Promise<void>;
}

/**
 * The set of repositories exposed on the gateway and inside a transaction, one
 * per aggregate root (design.md "Data Models"). Phase 1 models the aggregates
 * the current tasks exercise; later tasks widen this map as their aggregates
 * come online, always through the same interface.
 */
export interface GatewayRepositories {
  readonly users: Repository<UserDto>;
  readonly vehicles: Repository<VehicleDto>;
  readonly vehicleDocuments: Repository<VehicleDocumentDto>;
  readonly workOrders: Repository<WorkOrderDto>;
  readonly assignments: Repository<AssignmentDto>;
  readonly tyres: Repository<TyreDto>;
  readonly maintenanceAlerts: Repository<MaintenanceAlertDto>;
  readonly scheduleCards: Repository<ScheduleCardDto>;
  readonly invoices: Repository<InvoiceDto>;
}

/** The transactional view: every repository, write-enabled. */
export interface TransactionRepositories {
  readonly users: TransactionalRepository<UserDto>;
  readonly vehicles: TransactionalRepository<VehicleDto>;
  readonly vehicleDocuments: TransactionalRepository<VehicleDocumentDto>;
  readonly workOrders: TransactionalRepository<WorkOrderDto>;
  readonly assignments: TransactionalRepository<AssignmentDto>;
  readonly tyres: TransactionalRepository<TyreDto>;
  readonly maintenanceAlerts: TransactionalRepository<MaintenanceAlertDto>;
  readonly scheduleCards: TransactionalRepository<ScheduleCardDto>;
  readonly invoices: TransactionalRepository<InvoiceDto>;
}

/**
 * The context handed to a `unitOfWork` callback: the write-enabled repositories
 * plus the idempotency-key check that makes submit/approve/post/issue writes
 * exactly-once (NFR-01).
 */
export interface UnitOfWorkContext {
  readonly repos: TransactionRepositories;

  /**
   * Record that an idempotency key has been handled inside this transaction.
   * Returns `true` the first time a key is seen (the caller should do the work)
   * and `false` on any replay (the caller should skip and return the prior
   * result). Committed atomically with the rest of the transaction, so a replay
   * after a rolled-back transaction is correctly treated as the first attempt.
   */
  claimIdempotencyKey(key: string): boolean;
}

/**
 * Options for a unit of work.
 */
export interface UnitOfWorkOptions {
  /**
   * An optional idempotency key for the whole transaction. When supplied and
   * already seen, the transaction is skipped and the previously-recorded result
   * is returned (NFR-01). Finer-grained claims use
   * {@link UnitOfWorkContext.claimIdempotencyKey}.
   */
  readonly idempotencyKey?: string;
}

/**
 * The gateway. Read access to each aggregate's repository is available directly;
 * all writes go through `unitOfWork` so they are atomic and version-checked.
 */
export interface DataGateway {
  /** Read-only repositories, one per aggregate root. */
  readonly repos: GatewayRepositories;

  /**
   * Run `work` inside a single transaction. Every write made through
   * `ctx.repos` commits together when `work` resolves, or rolls back entirely
   * if `work` throws — leaving zero partial state (NFR-INTEGRITY / NFR-01). The
   * resolved value of `work` is returned to the caller.
   *
   * Nested calls are not supported; pass the existing context down instead.
   */
  unitOfWork<R>(
    work: (ctx: UnitOfWorkContext) => Promise<R> | R,
    options?: UnitOfWorkOptions,
  ): Promise<R>;
}
