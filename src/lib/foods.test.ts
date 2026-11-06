import { describe, expect, it } from 'vitest';
import { searchFoods } from './foods';

describe('searchFoods', () => {
  it('prioritizes every name match before category matches', () => {
    const catalog = [
      { name: 'Skim Milk', category: 'Dairy & Eggs' },
      { name: 'Egg', category: 'Dairy' },
      { name: 'Eggplant', category: 'Produce' },
      { name: 'Almond Milk', category: 'Dairy & Eggs' },
    ];

    expect(searchFoods(catalog, ' EGg ')).toEqual([
      catalog[1],
      catalog[2],
      catalog[0],
      catalog[3],
    ]);
  });

  it('applies the result limit after prioritizing name matches', () => {
    const catalog = [
      { name: 'Skim Milk', category: 'Dairy & Eggs' },
      { name: 'Egg', category: 'Dairy' },
    ];

    expect(searchFoods(catalog, 'egg', 1)).toEqual([catalog[1]]);
  });

  it('matches curated aliases before categories', () => {
    const catalog = [
      { name: 'Other Item', category: 'Non-Dairy Milk' },
      { name: 'Almond Milk', category: 'Other' },
    ];

    expect(searchFoods(catalog, 'non dairy milk')).toEqual([catalog[1], catalog[0]]);
  });

  it('matches food descriptions before categories', () => {
    const catalog = [
      { name: 'Other Item', category: 'Breakfast' },
      { name: 'Morning Food', category: 'Other', note: 'A nutritious breakfast option' },
    ];

    expect(searchFoods(catalog, 'breakfast')).toEqual([catalog[1], catalog[0]]);
  });

  it('tolerates a small typo in food names before category matches', () => {
    const catalog = [
      { name: 'Other Item', category: 'Spinich' },
      { name: 'Spinach', category: 'Produce' },
    ];

    expect(searchFoods(catalog, 'spinich')).toEqual([catalog[1], catalog[0]]);
  });
});
