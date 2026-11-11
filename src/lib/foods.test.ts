import { describe, expect, it, vi } from 'vitest';
import { addFoodToCatalog, foods, searchFoods } from './foods';

describe('catalog additions', () => {
  it('notifies pricing when a new food is added, but not when an existing row is updated', () => {
    const listener = vi.fn();
    window.addEventListener('kiwi:catalog-food-added', listener);
    const row = { food_id: 999999, food_name: 'Test food', unit: 'each', price: 0, serving_size: 1, nutrition: {}, food_description: '', emoji: '', pairs: [] };
    try {
      addFoodToCatalog(row);
      addFoodToCatalog(row);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      const index = foods.findIndex(food => food.id === '999999');
      if (index >= 0) foods.splice(index, 1);
      window.removeEventListener('kiwi:catalog-food-added', listener);
    }
  });
});

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
