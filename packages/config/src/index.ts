/**
 * `@bmi/config` — cross-cutting helpers shared across the BMI Stooring System.
 *
 * - format:    Indonesian number/date/time formatting (NFR-08, NFR-09)
 * - time:      UTC↔WIB conversion and WIB-day boundaries (NFR-14)
 * - numbering: never-reused, configurable running-number generator (NFR-15)
 * - money:     half-up rupiah rounding, markup-per-unit, PPN (NFR-16)
 *
 * Pure and dependency-free: no concrete DB driver is imported here. The numbering
 * generator takes an injected `SequenceSource`; the real counter lives behind the
 * `DataGateway` in later tasks.
 */

export * from './format.js';
export * from './time.js';
export * from './numbering.js';
export * from './money.js';
