import { describe, expect, it } from 'vitest';
import { parsePackage, perServing, rankCandidates, type Candidate, type PriceFood } from './pricing';

const c = (over: Partial<Candidate>): Candidate => ({ rank: 0, product_id: 'p', brand: '', description: '', categories: 'Produce', size: '1 lb', sold_by: 'UNIT', regular: 1, promo: null, ...over });
const food = (over: Partial<PriceFood>): PriceFood => ({ food_name: 'Test', food_category_id: 3, serving_size: 100, unit: 'g', ...over });

describe('parsePackage', () => {
  it('reads Kroger sizes', () => {
    expect(parsePackage('16 oz').grams).toBeCloseTo(453.6, 1);
    expect(parsePackage('1/2 gal').ml).toBeCloseTo(1892.7, 1);
    expect(parsePackage('1 each')).toEqual({ count: 1 });
    expect(parsePackage('6 ct / 18 oz')).toMatchObject({ count: 6, grams: expect.closeTo(510.3, 1) }); // 18 oz total
    expect(parsePackage('4 pk / 15.5 oz').grams).toBeCloseTo(1757.7, 1); // 4 cans of 15.5 oz
    expect(parsePackage('2 liter').ml).toBe(2000);
  });
});

describe('perServing', () => {
  it('scales weight, per-lb, count, volume, density and egg servings', () => {
    const chicken = food({ unit: 'oz', serving_size: 4, food_category_id: 1 });
    expect((perServing(chicken, { size: '1 lb', sold_by: 'UNIT', regular: 5.99 }) as { price_per_serving: number }).price_per_serving).toBeCloseTo(1.4975, 3);
    const banana = food({ unit: 'unit', serving_size: 1, serving_grams: 118 });
    expect((perServing(banana, { size: '1 lb', sold_by: 'WEIGHT', regular: 0.55 }) as { price_per_serving: number }).price_per_serving).toBeCloseTo(0.1431, 3);
    const tortilla = food({ unit: 'unit', serving_size: 1, serving_grams: 45, food_category_id: 2 });
    expect((perServing(tortilla, { size: '10 ct / 16 oz', sold_by: 'UNIT', regular: 2.79 }) as { price_per_serving: number }).price_per_serving).toBeCloseTo(0.279, 3);
    const milk = food({ unit: 'cup', serving_size: 1, food_category_id: 5 });
    expect((perServing(milk, { size: '1 gal', sold_by: 'UNIT', regular: 3.79 }) as { price_per_serving: number }).price_per_serving).toBeCloseTo(0.2369, 3);
    const skim = food({ unit: 'g', serving_size: 240, food_category_id: 5 });
    expect((perServing(skim, { size: '1 qt', sold_by: 'UNIT', regular: 2.19 }) as { flags: string[] }).flags).toContain('density 1.03 g/ml');
    expect(perServing(food({}), { size: 'mystery', sold_by: 'UNIT', regular: 1 })).toHaveProperty('error');
  });

  it('applies an alternate preparation (canned chickpeas for a dry serving)', () => {
    const chickpeas = food({ food_id: 18, food_category_id: 1, unit: 'cup', serving_size: 0.25, serving_grams: 50 });
    const r = perServing(chickpeas, { size: '15.5 oz', sold_by: 'UNIT', regular: 1 }, { label: 'canned', servingGrams: 116, packageYield: 0.56 }) as { price_per_serving: number; flags: string[] };
    expect(r.price_per_serving).toBeCloseTo(0.4714, 3);
    expect(r.flags).toEqual(['56% of package usable', 'alternate: canned']);
  });
});

describe('rankCandidates', () => {
  const kale = food({ food_name: 'Kale', food_category_id: 4, search: { term: 'kale', must: ['kale'] } });

  it('prefers store brand over a cheaper national brand, and matches whole words in the right category', () => {
    const { best, scored } = rankCandidates(kale, [
      c({ rank: 0, brand: 'Kroger', description: 'Kroger® Kaleidos Cookies', categories: 'Snacks', regular: 3 }),
      c({ rank: 1, brand: 'Taylor Farms', description: 'Taylor Farms Kale', size: '16 oz', regular: 2 }),
      c({ rank: 2, brand: 'Fresh Citrus', description: 'Kroger® Kale Bag', size: '16 oz', regular: 3.49 }),
      c({ rank: 3, brand: 'Simple Truth Organic', description: 'Simple Truth Organic® Kale', regular: 1 }),
    ]);
    expect(best?.description).toBe('Kroger® Kale Bag'); // store brand by name, even under a "Fresh …" brand
    expect(scored.map(s => s.why)).toEqual(['category: Snacks', '', '', 'organic']);
  });

  it('falls back to organic only when nothing else qualifies', () => {
    const { best } = rankCandidates(kale, [c({ brand: 'Simple Truth Organic', description: 'Simple Truth Organic® Kale', regular: 2.49 })]);
    expect(best?.flags).toContain('only organic available');
  });
});
