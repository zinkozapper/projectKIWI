import { describe, expect, it } from 'vitest';
import { itemsToRepeat, needsPantryCheck, shouldAskPantryCheck, splitPantryCheck, stillHaveFoodIds } from './pantry-check';

const pantry = [
  { id: 'p1', food_id: 'rice' },
  { id: 'p2', food_id: 'eggs' },
  { id: 'p3', food_id: 'spinach' },
];

describe('pantry check', () => {
  it('is due only when a new trip is starting and the pantry has food', () => {
    expect(needsPantryCheck(false, 3)).toBe(true);
    expect(needsPantryCheck(true, 3)).toBe(false);
    expect(needsPantryCheck(false, 0)).toBe(false);
  });

  it('asks at most once per trip, and never while a trip is active', () => {
    const base = { hasActiveTrip: false, alreadyChecked: false, firstSession: false, pantryCount: 3 };
    expect(shouldAskPantryCheck(base)).toBe(true);
    expect(shouldAskPantryCheck({ ...base, alreadyChecked: true })).toBe(false);
    expect(shouldAskPantryCheck({ ...base, hasActiveTrip: true })).toBe(false);
    expect(shouldAskPantryCheck({ ...base, firstSession: true })).toBe(false);
    expect(shouldAskPantryCheck({ ...base, pantryCount: 0 })).toBe(false);
  });

  it('keeps everything the user did not mark as gone', () => {
    const { keep, remove } = splitPantryCheck(pantry, ['p2']);
    expect(keep.map(p => p.food_id)).toEqual(['rice', 'spinach']);
    expect(remove.map(p => p.food_id)).toEqual(['eggs']);
  });

  it('keeps the whole pantry when nothing is marked gone', () => {
    const { keep, remove } = splitPantryCheck(pantry, []);
    expect(keep).toHaveLength(3);
    expect(remove).toHaveLength(0);
  });

  it('skips foods still at home when repeating a trip', () => {
    const still = stillHaveFoodIds(splitPantryCheck(pantry, ['p2']).keep);
    const old = [{ food_id: 'rice' }, { food_id: 'eggs' }, { food_id: 'milk' }];
    const { copy, skipped } = itemsToRepeat(old, still);
    expect(copy.map(i => i.food_id)).toEqual(['eggs', 'milk']);
    expect(skipped.map(i => i.food_id)).toEqual(['rice']);
  });
});
