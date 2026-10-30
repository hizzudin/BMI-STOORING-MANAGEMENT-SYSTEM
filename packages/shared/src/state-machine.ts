/**
 * Pure, dependency-free state-machine engine.
 *
 * PR-6 ("configuration over code"): every machine's allowed moves are expressed
 * as DATA — a list of `{ from, event, to }` rows that mirror a PRD §3 table
 * row-for-row. The generic `transition()` helper walks that data; it never hard-
 * codes a machine's rules. A move not present in the table is refused, which is
 * exactly the PRD §3 contract: "a transition not listed is refused."
 *
 * This module imports nothing outside itself — no DB driver, no gateway — per
 * the steering hard rule that business logic depends only on abstractions.
 */

/** One allowed move in a machine, mirroring a PRD §3 transition-table row. */
export interface TransitionRule<State extends string, Event extends string> {
  readonly from: State;
  readonly event: Event;
  readonly to: State;
}

/** A machine definition: its name (for errors) and its transition table. */
export interface StateMachine<State extends string, Event extends string> {
  readonly name: string;
  readonly transitions: readonly TransitionRule<State, Event>[];
}

/**
 * Thrown when a `(from, event)` pair is not listed in a machine's PRD §3 table.
 * Typed so callers can `instanceof`-narrow and map it to a domain/HTTP error
 * without string-matching the message.
 */
export class InvalidTransitionError extends Error {
  readonly machine: string;
  readonly from: string;
  readonly event: string;

  constructor(machine: string, from: string, event: string) {
    super(
      `${machine}: transition not permitted — no rule for event '${event}' from state '${from}' (PRD §3).`,
    );
    this.name = 'InvalidTransitionError';
    this.machine = machine;
    this.from = from;
    this.event = event;
    // Preserve the prototype chain when targeting ES5-era runtimes.
    Object.setPrototypeOf(this, InvalidTransitionError.prototype);
  }
}

/**
 * Build a reusable, typed guard from a machine definition.
 *
 * Validates the table once (no duplicate `(from, event)` rows — a PRD §3 table
 * is deterministic) and returns helpers that keep the machine's state/event
 * types without any `as` casts at the call site.
 */
export function createStateMachine<State extends string, Event extends string>(
  machine: StateMachine<State, Event>,
): {
  readonly name: string;
  readonly transitions: readonly TransitionRule<State, Event>[];
  /** Resolve the next state, or `undefined` if the move is not in the table. */
  next(from: State, event: Event): State | undefined;
  /** True iff `(from, event)` is a listed transition. */
  can(from: State, event: Event): boolean;
  /** Resolve the next state, or throw `InvalidTransitionError` if refused. */
  transition(from: State, event: Event): State;
} {
  // Index by "from\x00event" for O(1) lookup and duplicate detection. A NUL
  // separator cannot appear in the PascalCase/underscore literals we use.
  const index = new Map<string, State>();
  for (const rule of machine.transitions) {
    const key = `${rule.from}\u0000${rule.event}`;
    if (index.has(key)) {
      throw new Error(
        `${machine.name}: duplicate transition for event '${rule.event}' from state '${rule.from}'.`,
      );
    }
    index.set(key, rule.to);
  }

  const lookup = (from: State, event: Event): State | undefined =>
    index.get(`${from}\u0000${event}`);

  return {
    name: machine.name,
    transitions: machine.transitions,
    next: lookup,
    can: (from, event): boolean => lookup(from, event) !== undefined,
    transition: (from, event): State => {
      const to = lookup(from, event);
      if (to === undefined) {
        throw new InvalidTransitionError(machine.name, from, event);
      }
      return to;
    },
  };
}
