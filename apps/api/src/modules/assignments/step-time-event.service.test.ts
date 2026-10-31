import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { StepTimeEventService } from './step-time-event.service.js';

/**
 * Unit coverage of the step time-event ledger (FG-2, DEC-87, REQ-ENG-013/015).
 * Proves the worked/paused arithmetic AC-ENG-008 asks for, and the pause-reason
 * guards the DB CHECKs enforce.
 */
describe('StepTimeEventService (TASK-108) — timing arithmetic (AC-ENG-008)', () => {
  let svc: StepTimeEventService;
  const ASG = 1;

  beforeEach(() => {
    svc = new StepTimeEventService();
  });

  it('AC-ENG-008 — Start 11:25, Pause 12:00, Resume 13:00, Submit 14:20 → worked 1h55, paused 1h00', () => {
    svc.append({ assignmentId: ASG, attemptNo: 1, event: 'Open', at: iso('11:00') });
    svc.append({ assignmentId: ASG, attemptNo: 1, event: 'Start', at: iso('11:25') });
    svc.append({ assignmentId: ASG, attemptNo: 1, event: 'Pause', at: iso('12:00'), pauseReason: 'Break_Shift_End' });
    svc.append({ assignmentId: ASG, attemptNo: 1, event: 'Resume', at: iso('13:00') });
    svc.append({ assignmentId: ASG, attemptNo: 1, event: 'Submit', at: iso('14:20') });

    const d = svc.durationOf(ASG);
    // 11:25→12:00 = 35 min, 13:00→14:20 = 80 min → 115 min worked.
    expect(d.workedSeconds).toBe((35 + 80) * 60);
    // 12:00→13:00 = 60 min paused.
    expect(d.pausedSeconds).toBe(60 * 60);
  });

  it('sums worked time across attempts after a return (REQ-ENG-015)', () => {
    // Attempt 1: worked 30 min then returned.
    svc.append({ assignmentId: ASG, attemptNo: 1, event: 'Start', at: iso('09:00') });
    svc.append({ assignmentId: ASG, attemptNo: 1, event: 'Submit', at: iso('09:30') });
    svc.append({ assignmentId: ASG, attemptNo: 1, event: 'Return', at: iso('09:40') });
    // Attempt 2: worked 20 min.
    svc.append({ assignmentId: ASG, attemptNo: 2, event: 'Start', at: iso('10:00') });
    svc.append({ assignmentId: ASG, attemptNo: 2, event: 'Submit', at: iso('10:20') });

    expect(svc.durationOf(ASG).workedSeconds).toBe((30 + 20) * 60);
  });

  it('refuses a Pause with no reason and an "Other" pause with no note (REQ-ENG-013)', () => {
    expect(() =>
      svc.append({ assignmentId: ASG, attemptNo: 1, event: 'Pause', at: iso('12:00') }),
    ).toThrow(BadRequestException);
    expect(() =>
      svc.append({ assignmentId: ASG, attemptNo: 1, event: 'Pause', at: iso('12:00'), pauseReason: 'Other' }),
    ).toThrow(BadRequestException);
  });

  it('reports the opened-at of the current attempt (REQ-ENG-014 lower bound)', () => {
    svc.append({ assignmentId: ASG, attemptNo: 1, event: 'Open', at: iso('14:20') });
    expect(svc.openedAtOfAttempt(ASG, 1)).toBe(iso('14:20'));
    expect(svc.openedAtOfAttempt(ASG, 2)).toBeNull();
  });
});

/** Build an ISO UTC instant for a fixed day at the given HH:MM (WIB-independent). */
function iso(hhmm: string): string {
  return `2026-10-26T${hhmm}:00.000Z`;
}
