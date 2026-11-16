import { describe, expect, it } from 'vitest';
import { averageOptionPrice, defaultOption, itemOptionPrice, resolveOptionId, type FoodOption } from './food-options';

const opt = (id: string, price: number, form: string): FoodOption => ({ id, foodId: '1', form, label: id, price, sort: 0 });
const chicken = [opt('raw', 0.65, 'fresh'), opt('rotisserie', 0.94, 'ready_to_eat'), opt('canned', 0, 'canned')];

describe('food option prices', () => {
  it('uses the picked option, else the default style, else the average of priced options, else the food price', () => {
    expect(itemOptionPrice('rotisserie', chicken, null, 'generic', 0.8)).toBe(0.94);
    expect(itemOptionPrice(null, chicken, null, 'generic', 0.8)).toBe(0.65); // no pick -> the default (first) style
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

  it('defaults to the most whole style: fresh, then dried, frozen, canned, ready to eat', () => {
    const o = (id: string, form: string, sort: number): FoodOption => ({ id, foodId: '1', form, label: id, price: 1, sort });
    const beans = [o('canned', 'canned', 0), o('dried', 'dried', 1)];
    const cod = [o('frozen', 'frozen', 0), o('fresh', 'fresh', 1)];
    expect(defaultOption(beans)?.id).toBe('dried');
    expect(defaultOption(cod)?.id).toBe('fresh');
    expect(resolveOptionId(null, cod)).toBe('fresh');
    expect(resolveOptionId('frozen', cod)).toBe('frozen');
    expect(resolveOptionId('gone', cod)).toBe('fresh');
    expect(resolveOptionId(null, [])).toBeNull();
  });
});
