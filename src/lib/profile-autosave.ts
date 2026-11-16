import { BUDGET_WEEK_OPTIONS, parseDateKey, toDateKey } from './budget-period';
import { profileFieldErrors, type ProfileFields } from './validation';

// The profile page saves on its own: after the user stops typing (or leaves a field), it checks the
// draft and, if it's valid and different from what was last saved, writes it to Supabase.
export const PROFILE_AUTOSAVE_DELAY_MS = 700;

export type ProfileDraftFields = ProfileFields & { activity: string; goal: string; budget_weeks: string; budget_start: string };
export type ProfileErrorKey = keyof ProfileFields | 'budget_start';
export type ProfileSaveResult = { ok: true } | { ok: false; fields: string[]; message: string };

// Everything that would stop a save, one message per field (adds the budget period checks to the form checks).
export function profileSaveErrors(d: ProfileDraftFields, today = new Date()): Partial<Record<ProfileErrorKey, string>> {
  const errors: Partial<Record<ProfileErrorKey, string>> = profileFieldErrors(d);
  if (!(BUDGET_WEEK_OPTIONS as readonly number[]).includes(Number(d.budget_weeks))) errors.budget = 'Pick a budget period.';
  if (!parseDateKey(d.budget_start) || d.budget_start > toDateKey(today)) errors.budget_start = 'Pick a start date that is today or earlier.';
  return errors;
}

// A stable fingerprint of the draft, used to skip saves when nothing changed since the last one.
export function profileDraftKey(d: ProfileDraftFields): string {
  const keys = Object.keys(d).sort() as (keyof ProfileDraftFields)[];
  return JSON.stringify(keys.map(k => [k, String(d[k] ?? '').trim()]));
}
