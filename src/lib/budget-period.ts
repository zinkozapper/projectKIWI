// Budget periods. A budget is an amount per period (1, 2 or 4 weeks) that repeats from a start date.
// Example: $75 every 2 weeks starting Mon Nov 3 gives periods Nov 3-16, Nov 17-30, Dec 1-14, ...
// Dates are calendar days in the user's local time, stored as 'YYYY-MM-DD' (Postgres `date`).

export const BUDGET_WEEK_OPTIONS = [1, 2, 4] as const;
export type BudgetWeeks = (typeof BUDGET_WEEK_OPTIONS)[number];

export type BudgetPeriod = {
  start: Date; // first day, local midnight
  end: Date; // the day after the last day (exclusive), local midnight
  weeks: BudgetWeeks;
};

const DAY_MS = 86_400_000;

export function normalizeBudgetWeeks(value: unknown): BudgetWeeks {
  const n = Number(value);
  return n === 2 || n === 4 ? n : 1;
}

export function budgetWeeksLabel(weeks: number) {
  return weeks === 1 ? '1 week' : weeks === 2 ? '2 weeks' : '1 month';
}

// Local calendar date as 'YYYY-MM-DD'.
export function toDateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 'YYYY-MM-DD' to local midnight, or null if it is not a real date.
export function parseDateKey(key: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toDateKey(d) === key ? d : null;
}

function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

// Whole calendar days from a to b. Uses UTC so daylight saving changes don't shift the count.
function daysBetween(a: Date, b: Date) {
  return Math.floor((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
}

// The period that contains `today`. Before the start date, the first period is returned.
export function currentBudgetPeriod(startKey: string | null | undefined, weeks: number, today = new Date()): BudgetPeriod {
  const w = normalizeBudgetWeeks(weeks);
  const length = w * 7;
  const start = parseDateKey(startKey) ?? addDays(today, 0);
  const index = Math.max(0, Math.floor(daysBetween(start, today) / length));
  const periodStart = addDays(start, index * length);
  return { start: periodStart, end: addDays(periodStart, length), weeks: w };
}

// True when a timestamp (e.g. a trip's completed_at) falls on a day inside the period.
export function isInBudgetPeriod(timestamp: string | Date | null | undefined, period: BudgetPeriod) {
  if (!timestamp) return false;
  const t = new Date(timestamp);
  if (Number.isNaN(t.getTime())) return false;
  return t >= period.start && t < period.end;
}

// e.g. "Nov 3 – Nov 16"
export function formatBudgetPeriod(period: BudgetPeriod) {
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(period.start)} – ${fmt(addDays(period.end, -1))}`;
}

// Days left in the period, counting today.
export function daysLeftInPeriod(period: BudgetPeriod, today = new Date()) {
  return Math.max(0, daysBetween(today, period.end));
}
