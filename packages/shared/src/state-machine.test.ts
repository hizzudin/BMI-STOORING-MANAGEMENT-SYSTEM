import { describe, it, expect } from 'vitest';
import {
  createStateMachine,
  InvalidTransitionError,
} from './state-machine.js';

describe('createStateMachine (engine core)', () => {
  const traffic = createStateMachine({
    name: 'TEST-TL',
    transitions: [
      { from: 'Red', event: 'Go', to: 'Green' },
      { from: 'Green', event: 'Caution', to: 'Amber' },
      { from: 'Amber', event: 'Stop', to: 'Red' },
    ],
  });

  it('resolves a listed transition', () => {
    expect(traffic.transition('Red', 'Go')).toBe('Green');
    expect(traffic.next('Green', 'Caution')).toBe('Amber');
    expect(traffic.can('Amber', 'Stop')).toBe(true);
  });

  it('refuses an unlisted (from, event) pair by throwing InvalidTransitionError', () => {
    expect(() => traffic.transition('Red', 'Stop')).toThrow(
      InvalidTransitionError,
    );
    expect(traffic.next('Red', 'Stop')).toBeUndefined();
    expect(traffic.can('Red', 'Stop')).toBe(false);
  });

  it('carries machine/from/event on the thrown error', () => {
    try {
      traffic.transition('Green', 'Go');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      const e = err as InvalidTransitionError;
      expect(e.machine).toBe('TEST-TL');
      expect(e.from).toBe('Green');
      expect(e.event).toBe('Go');
    }
  });

  it('rejects a table with duplicate (from, event) rows at build time', () => {
    expect(() =>
      createStateMachine({
        name: 'DUP',
        transitions: [
          { from: 'A', event: 'X', to: 'B' },
          { from: 'A', event: 'X', to: 'C' },
        ],
      }),
    ).toThrow(/duplicate transition/);
  });
});
