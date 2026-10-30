/**
 * Errors the `DataGateway` contract can raise. These are part of the interface,
 * not of any one implementation: the dummy gateway (Phase 1) and the later
 * `PostgresDataGateway` (Phase 2, TASK-202) must both throw these so business
 * logic can `catch` them without knowing which backing store is in use.
 */

/**
 * Optimistic-lock failure (NFR-CONCURRENCY / NFR-03).
 *
 * Thrown when a save carries a `version` that no longer matches the stored row
 * — i.e. another writer committed in between. The caller should re-read, re-apply
 * and retry. Exactly one of two concurrent saves wins; the stale one gets this.
 */
export class StaleVersionError extends Error {
  readonly aggregate: string;
  readonly id: number;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(
    aggregate: string,
    id: number,
    expectedVersion: number,
    actualVersion: number,
  ) {
    super(
      `Stale version for ${aggregate}#${id}: save carried version ${expectedVersion} ` +
        `but the stored version is ${actualVersion}. Re-read and retry.`,
    );
    this.name = 'StaleVersionError';
    this.aggregate = aggregate;
    this.id = id;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/** Thrown when an aggregate referenced by id does not exist. */
export class NotFoundError extends Error {
  readonly aggregate: string;
  readonly id: number;

  constructor(aggregate: string, id: number) {
    super(`${aggregate}#${id} was not found.`);
    this.name = 'NotFoundError';
    this.aggregate = aggregate;
    this.id = id;
  }
}

/**
 * Thrown when a `unitOfWork` transaction is already resolved (committed or
 * rolled back) and work is attempted against it again. Guards against leaking a
 * transaction handle out of its callback.
 */
export class TransactionClosedError extends Error {
  constructor() {
    super('This unit of work has already been committed or rolled back.');
    this.name = 'TransactionClosedError';
  }
}
