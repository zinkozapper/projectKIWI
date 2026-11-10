import { describe, expect, it } from 'vitest';
import { boostTitle, MIN_BOOST_PERCENT, nutrientBoosts } from './recommendation-boosts';

describe('nutrientBoosts', () => {
  it('keeps only nutrients filled by at least 10% of the remaining gap, in impact order', () => {
    const boosts = nutrientBoosts([
      { key: 'calcium', percentage: 53, impact: 0.4 },
      { key: 'protein', percentage: 49, impact: 0.3 },
      { key: 'fiber', percentage: 9, impact: 0.05 },
      { key: 'iron', percentage: 10, impact: 0.02 },
    ]);
    expect(boosts.map(b => b.key)).toEqual(['calcium', 'protein', 'iron']);
    expect(boosts[0]).toMatchObject({ label: 'Calcium', percentage: 53 });
  });

  it('returns nothing when every gap fill is small', () => {
    expect(nutrientBoosts([{ key: 'protein', percentage: MIN_BOOST_PERCENT - 1, impact: 0.1 }])).toEqual([]);
  });

  it('describes a boost for the tooltip', () => {
    expect(boostTitle({ key: 'protein', label: 'Protein', percentage: 56 })).toBe('Fills 56% of your remaining protein gap');
  });
});
