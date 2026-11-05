import { describe, expect, it } from 'vitest';
import { currentBudgetPeriod, daysLeftInPeriod, isInBudgetPeriod, normalizeBudgetWeeks, parseDateKey, toDateKey } from './budget-period';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('budget periods', () => {
  it('starts on the start date and lasts the chosen number of weeks', () => {
    const p = currentBudgetPeriod('2026-11-03', 1, day(2026, 11, 3));
    expect(toDateKey(p.start)).toBe('2026-11-03');
    expect(toDateKey(p.end)).toBe('2026-11-10');
  });

  it('rolls over to the next period after the last day', () => {
    expect(toDateKey(currentBudgetPeriod('2026-11-03', 1, day(2026, 11, 9, 23)).start)).toBe('2026-11-03');
    expect(toDateKey(currentBudgetPeriod('2026-11-03', 1, day(2026, 11, 10, 0)).start)).toBe('2026-11-10');
  });

  it('repeats every 2 or 4 weeks, across month ends', () => {
    expect(toDateKey(currentBudgetPeriod('2026-11-03', 2, day(2026, 12, 2)).start)).toBe('2026-12-01');
    expect(toDateKey(currentBudgetPeriod('2026-10-01', 4, day(2027, 1, 1)).start)).toBe('2026-12-24');
  });

  it('keeps counting whole days across daylight saving changes', () => {
    // US clocks fall back on 2026-11-01.
    expect(toDateKey(currentBudgetPeriod('2026-10-25', 1, day(2026, 11, 1, 0)).start)).toBe('2026-11-01');
  });

  it('uses the first period when the start date is in the future', () => {
    expect(toDateKey(currentBudgetPeriod('2026-12-01', 1, day(2026, 11, 5)).start)).toBe('2026-12-01');
  });

  it('only counts timestamps inside the period', () => {
    const p = currentBudgetPeriod('2026-11-03', 1, day(2026, 11, 5));
    expect(isInBudgetPeriod(day(2026, 11, 3, 0).toISOString(), p)).toBe(true);
    expect(isInBudgetPeriod(day(2026, 11, 2, 23).toISOString(), p)).toBe(false);
    expect(isInBudgetPeriod(day(2026, 11, 10, 0).toISOString(), p)).toBe(false);
    expect(isInBudgetPeriod(null, p)).toBe(false);
  });

  it('counts days left including today', () => {
    const p = currentBudgetPeriod('2026-11-03', 1, day(2026, 11, 5));
    expect(daysLeftInPeriod(p, day(2026, 11, 5))).toBe(5);
    expect(daysLeftInPeriod(p, day(2026, 11, 9))).toBe(1);
  });

  it('rejects bad input', () => {
    expect(parseDateKey('2026-02-30')).toBeNull();
    expect(parseDateKey('')).toBeNull();
    expect(normalizeBudgetWeeks('3')).toBe(1);
    expect(normalizeBudgetWeeks(4)).toBe(4);
  });
});
