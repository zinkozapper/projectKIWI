import { beforeEach, describe, expect, it, vi } from 'vitest';

const { insert, maybeSingle } = vi.hoisted(() => ({
  insert: vi.fn().mockResolvedValue({ error: null }),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
}));
vi.mock('@/integrations/supabase/client', () => {
  const select = () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle }) }) }) });
  return { supabase: { from: vi.fn(() => ({ insert, select })) } };
});

import type { Nutrients } from './foods';
import { evaluateNutrientGoals, pantrySignature, recordNutrientSnapshot, resetNutrientSnapshots } from './nutrient-goals';

const n = (v: Partial<Nutrients>): Nutrients => ({
  calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, iron: 0, calcium: 0, vitaminC: 0, vitaminD: 0, ...v,
});

const daily = n({ calories: 2000, protein: 60, iron: 18 });

describe('evaluateNutrientGoals', () => {
  it('compares pantry supply per plan day with each daily target', () => {
    // 7 days: 14000 kcal = 2000/day (met), 210 g protein = 30/day (50%), 140 mg iron = 20/day (met)
    const r = evaluateNutrientGoals(n({ calories: 14000, protein: 210, iron: 140 }), daily, 7);
    expect(r.nutrientsTotal).toBe(3);
    expect(r.nutrientsMet).toBe(2);
    expect(r.nutrients.protein).toEqual({ per_day: 30, target: 60, pct: 50, met: false });
    expect(r.nutrients.iron?.met).toBe(true);
    expect(r.achievementPct).toBe(66.7);
    expect(r.avgCoveragePct).toBe(83.3);
    expect(r.goalMet).toBe(false);
  });

  it('meets the goal only when every nutrient reaches 100%', () => {
    const r = evaluateNutrientGoals(n({ calories: 2000, protein: 60, iron: 18 }), daily, 1);
    expect(r.goalMet).toBe(true);
    expect(r.achievementPct).toBe(100);
  });

  it('skips nutrients without a target and handles an empty pantry', () => {
    const r = evaluateNutrientGoals(n({}), daily, 7);
    expect(Object.keys(r.nutrients)).toEqual(['calories', 'protein', 'iron']);
    expect(r.achievementPct).toBe(0);
    expect(r.goalMet).toBe(false);
  });
});

describe('recordNutrientSnapshot', () => {
  const input = (quantity: number) => ({
    userId: 'u1', pantryId: 5, pantry: [{ food_id: '3', quantity }], pantryTotals: n({ protein: 60 * quantity }), daily, days: 7,
  });

  beforeEach(() => {
    insert.mockClear();
    maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
    resetNutrientSnapshots();
  });

  it('saves only when the pantry or targets change', async () => {
    await recordNutrientSnapshot(input(1));
    await recordNutrientSnapshot(input(1));
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[0]).toMatchObject({ user_id: 'u1', pantry_id: 5, plan_days: 7, pantry_food_ids: [3], nutrients_total: 3 });

    await recordNutrientSnapshot(input(2));
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('skips the first save when it matches the last snapshot in the database', async () => {
    maybeSingle.mockResolvedValue({ data: { pantry_signature: pantrySignature(input(1).pantry, daily, 7) }, error: null });
    await recordNutrientSnapshot(input(1));
    expect(insert).not.toHaveBeenCalled();
  });

  it('does nothing when the table is missing', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'relation does not exist' } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await recordNutrientSnapshot(input(1));
    expect(insert).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
