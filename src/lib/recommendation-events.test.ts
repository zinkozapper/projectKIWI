import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ upsert })) },
}));

import { logRecommendationAdded, logRecommendationsShown, resetRecommendationImpressions } from './recommendation-events';

const rowsOf = (call: number) => upsert.mock.calls[call]![0] as Record<string, unknown>[];

describe('recommendation events', () => {
  beforeEach(() => {
    upsert.mockClear();
    resetRecommendationImpressions();
  });

  it('logs each shown recommendation once per impression', async () => {
    await logRecommendationsShown([{ source: 'nutrient_gap', foodId: '5', rank: 1 }], '9');
    await logRecommendationsShown([
      { source: 'nutrient_gap', foodId: '5', rank: 1 },
      { source: 'nutrient_gap', foodId: '7', rank: 2 },
    ], '9');

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(rowsOf(0)).toEqual([expect.objectContaining({ event_type: 'shown', food_id: 5, rank: 1, shopping_list_id: 9 })]);
    expect(rowsOf(1).map(r => r['food_id'])).toEqual([7]);
  });

  it('links an add to the impression that was shown, then starts a new impression', async () => {
    await logRecommendationsShown([{ source: 'pairing', foodId: '3', anchorFoodId: '1', rank: 1 }]);
    const shownId = rowsOf(0)[0]!['impression_id'];

    await logRecommendationAdded({ source: 'pairing', foodId: '3', anchorFoodId: '1' }, '9', '42');
    expect(rowsOf(1)[0]).toMatchObject({
      impression_id: shownId,
      event_type: 'added',
      anchor_food_id: 1,
      shopping_list_id: 9,
      shopping_list_item_id: 42,
    });

    await logRecommendationsShown([{ source: 'pairing', foodId: '3', anchorFoodId: '1', rank: 1 }]);
    expect(rowsOf(2)[0]!['impression_id']).not.toBe(shownId);
  });

  it('ignores an add that was never shown', async () => {
    await logRecommendationAdded({ source: 'nutrient_gap', foodId: '8' }, '9', '42');
    expect(upsert).not.toHaveBeenCalled();
  });
});
