import { describe, expect, it } from 'vitest';
import { customAmount, customLabel, customUnitsFor, defaultPackage, packageMeasures, packagePrice, packagesFor, servingsOf, type FoodPackage, type PackageCatalog, packageNoun, servingsText } from './food-packages';
import type { FoodOption } from './food-options';

const pkg = (id: string, optionId: string | null, sort: number, servings = 4, price = 5): FoodPackage => ({ id, foodId: '1', optionId, label: `p${id}`, servings, price, grams: null, size: null, sort });
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
  it('prices a package at its shelf price, scaled to the shopper\'s store, else per serving', () => {
    expect(packagePrice(pkg('a', null, 0, 2, 9.99), 5, 5)).toBe(9.99); // a 2-pack keeps its own (cheaper) price
    expect(packagePrice(pkg('a', null, 0, 4, 5), 1.5, 1.25)).toBeCloseTo(6); // another store, 20% dearer
    expect(packagePrice(pkg('a', null, 0, 4, 5), null)).toBe(5);
    expect(packagePrice(pkg('a', null, 0, 4, 0), 1.5)).toBe(6); // no shelf price
    expect(packagePrice(pkg('a', null, 0, 4, 0), null)).toBeNull();
  });
});

describe('list wording', () => {
  const named = (label: string): FoodPackage => ({ id: 'x', foodId: '1', optionId: null, label, servings: 1, price: 1, grams: null, size: null, sort: 0 });
  it('calls a single item a unit and everything else a package', () => {
    expect(packageNoun(named('1 ct whole fruit'), 1)).toBe('unit');
    expect(packageNoun(named('Each'), 3)).toBe('units');
    expect(packageNoun(named('8 oz'), 1)).toBe('package');
    expect(packageNoun(named('2 pk, 8 oz each'), 2)).toBe('packages');
    expect(servingsText(1)).toBe('1 serving');
    expect(servingsText(2.5)).toBe('2.5 servings');
  });
});

describe('custom amounts', () => {
  const sized = (id: string, servings: number, grams: number | null, size: string | null, sort = 0): FoodPackage =>
    ({ id, foodId: '1', optionId: null, label: size ?? id, servings, price: 5, grams, size, sort });
  const bags = [sized('a', 4.54, 453.592, '16 oz'), sized('b', 18.14, 1814.368, '4 lb', 1)];

  it('defaults to the smallest size', () => {
    expect(defaultPackage([sized('big', 10, null, null, 0), sized('small', 2, null, null, 1)])!.id).toBe('small');
  });
  it('reads volume and count from the size text', () => {
    expect(packageMeasures(sized('x', 8, null, '64 fl oz')).ml).toBeCloseTo(1892.7, 0);
    expect(packageMeasures(sized('x', 12, null, '12 ct')).count).toBe(12);
  });
  it('offers only units the sizes can convert', () => {
    expect(customUnitsFor(bags)).toContain('lb');
    expect(customUnitsFor(bags)).not.toContain('ct');
  });
  it('scales servings and price from the nearest size', () => {
    const c = customAmount(bags, 3, 'lb');
    if ('error' in c) throw new Error(c.error);
    expect(c.reference.id).toBe('b');
    expect(c.servings).toBeCloseTo(13.6, 1);
    expect(c.scale).toBeCloseTo(0.75, 2);
    const small = customAmount(bags, 8, 'oz');
    if ('error' in small) throw new Error(small.error);
    expect(small.reference.id).toBe('a');
    expect(small.scale).toBeCloseTo(0.5, 2);
  });
  it('rejects bad amounts', () => {
    expect('error' in customAmount(bags, 0, 'oz')).toBe(true);
    expect('error' in customAmount(bags, 60, 'lb')).toBe(true);
    expect('error' in customAmount(bags, 3, 'ct')).toBe(true);
  });
  it('labels amounts', () => {
    expect(customLabel(3, 'lb')).toBe('3 lb');
  });
});
