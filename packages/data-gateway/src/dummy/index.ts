/**
 * Phase 1 dummy gateway surface: the in-memory implementation, its store types,
 * the PRD example seed, and a one-call factory.
 */

import { DummyDataGateway } from './DummyDataGateway.js';
import { createSeededStore } from './seed.js';

export { DummyDataGateway } from './DummyDataGateway.js';
export { createSeededStore, SEED_IDS, SEED_PASSWORD, SEED_PASSWORD_HASH } from './seed.js';
export type { DummyStore, AggregateTable } from './store.js';
export { emptyTable, cloneStore } from './store.js';

/**
 * Build a `DummyDataGateway` pre-loaded with the PRD example data (WO-0142,
 * B 1234 ABC, tyres TY-0101…TY-0110, …). The default Phase 1 backing store.
 */
export function createDummyDataGateway(): DummyDataGateway {
  return new DummyDataGateway(createSeededStore());
}
