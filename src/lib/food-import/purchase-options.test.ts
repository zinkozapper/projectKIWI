import { describe, expect, it } from 'vitest';
import { averagePrice, cleanOptions, optionPriceFood } from './purchase-options';
import { foodRules, perServing, rankCandidates, type Candidate } from './pricing';

const chicken = { food_name: 'Chicken breast', food_category_id: 1, serving_size: 4, unit: 'oz', serving_grams: 113.4, prepared_grams: 94 };
const c = (over: Partial<Candidate>): Candidate => ({ rank: 0, product_id: 'p', brand: 'Kroger', description: '', categories: 'Meat & Seafood', size: '1 lb', sold_by: 'UNIT', regular: 5, promo: null, ...over });

describe('cleanOptions', () => {
  it('keeps one option per known form, at most 4, and needs at least 2', () => {
    const out = cleanOptions([
      { form: 'fresh', label: 'Raw', term: 'boneless skinless chicken breast', must: ['breast'], basis: 'as_bought' },
      { form: 'ready_to_eat', label: 'Rotisserie', term: 'rotisserie chicken', must: ['rotisserie'], basis: 'prepared', eachGrams: 700 },
      { form: 'frozen', label: 'Frozen', term: 'frozen chicken breast', basis: 'as_bought' },
      { form: 'frozen', label: 'Frozen strips', term: 'frozen chicken strips', basis: 'prepared' },
      { form: 'canned', label: 'Canned', term: 'canned chicken breast', basis: 'prepared', drained: true },
      { form: 'smoked', label: 'Smoked', term: 'x', basis: 'prepared' },
    ], 'Chicken breast');
    expect(out.map(o => o.label)).toEqual(['Raw', 'Rotisserie', 'Frozen', 'Canned']);
    expect(out[1]).toMatchObject({ basis: 'prepared', unit_grams: 700, sort_order: 1 });
    expect(out[3]).toMatchObject({ package_yield: 0.6 });
    expect(cleanOptions([{ form: 'fresh', label: 'Fresh', term: 'honey', basis: 'as_bought' }])).toEqual([]);
    expect(cleanOptions(null)).toEqual([]);
  });
});

describe('optionPriceFood', () => {
  it('lets a rotisserie option past the meat excludes and prices it on the cooked serving', () => {
    const [, rotisserie] = cleanOptions([
      { form: 'fresh', label: 'Raw', term: 'boneless skinless chicken breast', basis: 'as_bought' },
      { form: 'ready_to_eat', label: 'Rotisserie', term: 'rotisserie chicken', must: ['rotisserie'], basis: 'prepared', eachGrams: 700 },
    ]);
    const food = optionPriceFood(chicken, rotisserie!);
    expect(food.food_id).toBeNull(); // the food's own price-rules entry must not override the option's search
    expect(foodRules(food).term).toBe('rotisserie chicken');
    expect(foodRules(food).exclude).not.toContain('rotisserie');
    // Sold "each": priced per 700 g bird, on the 94 g cooked serving
    const r = perServing(food, { size: '1 ct', sold_by: 'UNIT', regular: 7 }) as { price_per_serving: number };
    expect(r.price_per_serving).toBeCloseTo(7 * 94 / 700, 4);
    const { best } = rankCandidates(food, [c({ description: 'Kroger® Rotisserie Chicken', categories: 'Deli', size: '1 ct', regular: 7 })]);
    expect(best?.description).toBe('Kroger® Rotisserie Chicken');
  });

  it('uses the frozen aisle and keeps the raw serving for an as-bought frozen option', () => {
    const [, frozen] = cleanOptions([
      { form: 'fresh', label: 'Fresh', term: 'broccoli crowns', basis: 'as_bought' },
      { form: 'frozen', label: 'Frozen', term: 'frozen broccoli florets', must: ['broccoli'], basis: 'as_bought' },
    ]);
    const broccoli = { food_name: 'Broccoli', food_category_id: 4, serving_size: 100, unit: 'g', serving_grams: 100, prepared_grams: 100 };
    const food = optionPriceFood(broccoli, frozen!);
    const { best, scored } = rankCandidates(food, [
      c({ description: 'Kroger® Broccoli Crowns', categories: 'Produce', size: '1 lb', regular: 2 }),
      c({ description: 'Kroger® Frozen Broccoli Florets', categories: 'Frozen', size: '12 oz', regular: 1.5 }),
    ]);
    expect(scored[0]!.why).toMatch(/category/);
    expect(best?.price_per_serving).toBeCloseTo(1.5 * 100 / (12 * 28.3495), 4);
  });
});

describe('averagePrice', () => {
  it('averages priced options only', () => {
    expect(averagePrice([0.65, 1.15, null, 0])).toBe(0.9);
    expect(averagePrice([null, 0])).toBeNull();
  });
});
