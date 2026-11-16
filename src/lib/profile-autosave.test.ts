import { describe, expect, it } from 'vitest';
import { profileDraftKey, profileSaveErrors, type ProfileDraftFields } from './profile-autosave';

const today = new Date(2026, 10, 16, 12);
const draft: ProfileDraftFields = {
  display_name: 'Alex', age: '23', height_ft: '5', height_in: '7', weight_lb: '150', gender: 'female',
  activity: 'moderate', goal: 'maintain', budget: '75', budget_weeks: '1', budget_start: '2026-11-10', zip_code: '84601',
};

describe('profile autosave', () => {
  it('accepts a complete profile', () => {
    expect(profileSaveErrors(draft, today)).toEqual({});
  });

  it('flags empty required fields so a half-filled profile is not saved', () => {
    const errors = profileSaveErrors({ ...draft, age: '', zip_code: '846' }, today);
    expect(Object.keys(errors).sort()).toEqual(['age', 'zip_code']);
  });

  it('rejects a budget start date in the future or a bad period', () => {
    expect(profileSaveErrors({ ...draft, budget_start: '2026-11-17' }, today).budget_start).toBeTruthy();
    expect(profileSaveErrors({ ...draft, budget_weeks: '3' }, today).budget).toBeTruthy();
  });

  it('gives the same key for the same values, ignoring outer spaces', () => {
    expect(profileDraftKey(draft)).toBe(profileDraftKey({ ...draft, display_name: ' Alex ' }));
    expect(profileDraftKey(draft)).not.toBe(profileDraftKey({ ...draft, weight_lb: '151' }));
  });
});
