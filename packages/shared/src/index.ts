/**
 * `@bmi/shared` public surface — domain types, DTOs, branded IDs, and the
 * thirteen PRD §3 state machines with their data-driven `transition()` guards.
 *
 * Pure and dependency-free: no DB driver, no gateway, no framework. Business
 * rules depend on these abstractions (steering hard rule).
 */

export * from './ids.js';
export * from './enums.js';
export * from './states.js';
export * from './state-machine.js';
export * from './machines.js';
export * from './dto.js';
