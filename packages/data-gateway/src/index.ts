/**
 * `@bmi/data-gateway` public surface.
 *
 * The `DataGateway` interface is the seam between business rules and the
 * database (steering hard rule): services depend on this interface only, never
 * on a concrete DB driver. Phase 1 ships the in-memory `DummyDataGateway`;
 * Phase 2 (TASK-202) adds a `PostgresDataGateway` behind the same interface.
 */

export type {
  DataGateway,
  GatewayRepositories,
  TransactionRepositories,
  Repository,
  TransactionalRepository,
  UnitOfWorkContext,
  UnitOfWorkOptions,
  PrimitiveKeys,
} from './data-gateway.interface.js';

export { StaleVersionError, NotFoundError, TransactionClosedError } from './errors.js';

export {
  DummyDataGateway,
  createDummyDataGateway,
  createSeededStore,
  SEED_IDS,
  SEED_PASSWORD,
  SEED_PASSWORD_HASH,
  emptyTable,
  cloneStore,
} from './dummy/index.js';
export type { DummyStore, AggregateTable } from './dummy/index.js';
