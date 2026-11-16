import { describe, expect, it } from 'vitest';
import { averageOptionPrice, itemOptionPrice, type FoodOption } from './food-options';

const opt = (id: string, price: number): FoodOption => ({ id, foodId: '1', form: id, label: id, price, sort: 0 });
const chicken = [opt('raw', 0.65), opt('rotisserie', 0.94), opt('canned', 0)];

describe('food option prices', () => {
  it('uses the picked option, else the average of priced options, else the food price', () => {
    expect(itemOptionPrice('rotisserie', chicken, null, 'generic', 0.8)).toBe(0.94);
    expect(itemOptionPrice(null, chicken, null, 'generic', 0.8)).toBeCloseTo(0.795, 4); // canned is unpriced
    expect(itemOptionPrice('canned', chicken, null, 'generic', 0.8)).toBeCloseTo(0.795, 4); // unpriced pick -> average
    expect(itemOptionPrice(null, undefined, null, 'generic', 0.8)).toBe(0.8);
    expect(itemOptionPrice('gone', [], null, 'generic', null)).toBeNull();
  });

  it('uses the store prices in localized mode', () => {
    const local = { raw: 0.7, rotisserie: 1.2 };
    expect(itemOptionPrice('raw', chicken, local, 'local', null)).toBe(0.7);
    expect(averageOptionPrice(chicken, local, 'local')).toBeCloseTo(0.95, 4);
    expect(averageOptionPrice(chicken, {}, 'local')).toBeNull();
  });
});
