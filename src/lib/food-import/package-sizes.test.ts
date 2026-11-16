import { describe, expect, it } from 'vitest';
import { fallbackRows, packageRows, sizeCandidates, type SizeCandidate } from './package-sizes';
import type { Scored } from './pricing';

const scored = (o: Partial<Scored>): Scored => ({
  rank: 0, product_id: 'p', brand: 'Kroger', description: 'Chicken breast', categories: '', size: '1 lb', sold_by: 'UNIT',
  regular: 4, promo: null, tier: 0, why: '', eligible: true, selected: false, price_per_serving: 1, priced_g: 113, package_grams: 453, how: '', flags: [], ...o,
});

describe('sizeCandidates', () => {
  it('keeps eligible store-brand sizes, cheapest per size, smallest first', () => {
    const c = sizeCandidates([
      scored({ product_id: 'a', size: '3 lb', regular: 9, price_per_serving: 0.75 }),
      scored({ product_id: 'b', size: '1 lb', regular: 4, price_per_serving: 1 }),
      scored({ product_id: 'b2', size: '1 lb', regular: 3.6, price_per_serving: 0.9 }),
      scored({ product_id: 'x', size: '2 lb', eligible: false }),
      scored({ product_id: 'n', size: '5 lb', tier: 2, regular: 14, price_per_serving: 0.7 }),
    ]);
    expect(c.map(x => x.product_id)).toEqual(['b2', 'a']);
    expect(c[1]!.servings).toBe(12);
  });
  it('adds the next brand tier when the best tier has one size', () => {
    const c = sizeCandidates([scored({ product_id: 'a' }), scored({ product_id: 'g', tier: 1, size: '3 lb', regular: 9, price_per_serving: 0.75 })]);
    expect(c.map(x => x.product_id)).toEqual(['a', 'g']);
  });
  it('marks weight-priced products', () => {
    const c = sizeCandidates([scored({ sold_by: 'WEIGHT', size: '', regular: 3.99, price_per_serving: 1 })]);
    expect(c[0]).toMatchObject({ byWeight: true, servings: 3.99 });
  });
});

const cand = (key: number, o: Partial<SizeCandidate> = {}): SizeCandidate => ({ key, product_id: `p${key}`, description: 'd', brand: 'Kroger', size: `${key + 1} lb`, byWeight: false, price: 4 * (key + 1), servings: 4 * (key + 1), package_grams: null, ...o });

describe('packageRows', () => {
  it('turns AI picks into at most 3 rows in the AI’s order', () => {
    const rows = packageRows([{ key: 1, label: '2 lb' }, { key: 0, label: '1 lb' }, { key: 2, label: 'Family pack' }, { key: 3, label: 'too many' }], [cand(0), cand(1), cand(2), cand(3)]);
    expect(rows.map(r => [r.label, r.sort_order, r.servings])).toEqual([['2 lb', 0, 8], ['1 lb', 1, 4], ['Family pack', 2, 12]]);
  });
  it('drops unknown keys and duplicates and scales by-weight products by pounds', () => {
    const w = cand(0, { byWeight: true, price: 3.99, servings: 4 });
    const rows = packageRows([{ key: 9, label: 'x' }, { key: 0, label: '2 lb', pounds: 2 }, { key: 0, label: 'again', pounds: 2 }], [w]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ servings: 8, package_price: 7.98, package_grams: 907 });
  });
});

describe('fallbackRows', () => {
  it('picks best value first, then smallest and largest, max 3', () => {
    const rows = fallbackRows([cand(0, { price: 5 }), cand(1, { price: 6 }), cand(2, { price: 20 }), cand(3, { price: 30 })]);
    expect(rows.map(r => r.product_id)).toEqual(['p1', 'p0', 'p3']);
  });
  it('returns nothing without candidates', () => expect(fallbackRows([])).toEqual([]));
});
