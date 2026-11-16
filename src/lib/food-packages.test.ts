import { describe, expect, it } from 'vitest';
import { defaultPackage, packagePrice, packagesFor, servingsOf, type FoodPackage, type PackageCatalog } from './food-packages';
import type { FoodOption } from './food-options';

const pkg = (id: string, optionId: string | null, sort: number, servings = 4, price = 5): FoodPackage => ({ id, foodId: '1', optionId, label: `p${id}`, servings, price, grams: null, sort });
const opt = (id: string): FoodOption => ({ id, foodId: '1', form: 'fresh', label: id, price: 1, sort: 0 });

describe('packagesFor', () => {
  const catalog: PackageCatalog = { '1': [pkg('a', null, 0), pkg('b', null, 1), pkg('r', 'raw', 0), pkg('t', 'roti', 0)] };
  it('uses the picked option’s sizes', () => expect(packagesFor(catalog, '1', 'roti', [opt('raw'), opt('roti')]).map(p => p.id)).toEqual(['t']));
  it('uses food-level sizes with no pick', () => expect(packagesFor(catalog, '1', null).map(p => p.id)).toEqual(['a', 'b']));
  it('lets only the base option borrow food-level sizes', () => {
    const c: PackageCatalog = { '1': [pkg('a', null, 0)] };
    expect(packagesFor(c, '1', 'raw', [opt('raw'), opt('canned')]).map(p => p.id)).toEqual(['a']);
    expect(packagesFor(c, '1', 'canned', [opt('raw'), opt('canned')])).toEqual([]);
  });
  it('falls back to the first option with sizes when the food has none of its own', () => {
    const c: PackageCatalog = { '1': [pkg('c', 'canned', 0)] };
    expect(packagesFor(c, '1', null, [opt('raw'), opt('canned')]).map(p => p.id)).toEqual(['c']);
  });
  it('returns nothing for an unknown food', () => expect(packagesFor(catalog, '9', null)).toEqual([]));
});

describe('package math', () => {
  it('picks the sort-0 size as default', () => expect(defaultPackage([pkg('x', null, 2), pkg('y', null, 0)])?.id).toBe('y'));
  it('counts servings in packages or plain servings', () => {
    expect(servingsOf(2, pkg('a', null, 0, 4))).toBe(8);
    expect(servingsOf(3, undefined)).toBe(3);
  });
  it('prices a package from the store price per serving, else its shelf price', () => {
    expect(packagePrice(pkg('a', null, 0, 4, 5), 1.5)).toBe(6);
    expect(packagePrice(pkg('a', null, 0, 4, 5), null)).toBe(5);
    expect(packagePrice(pkg('a', null, 0, 4, 0), null)).toBeNull();
  });
});
