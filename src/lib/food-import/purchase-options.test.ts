import { describe, expect, it } from 'vitest';
import { averagePrice, cleanOptions, optionPriceFood } from './purchase-options';
import { newFoodSearch } from './workflow.server';
import { foodRules, foodSpecs, perServing, rankCandidates, type Candidate } from './pricing';

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

  it('retries with a plain search when the AI\'s wording finds nothing', () => {
    const [fresh, frozen] = cleanOptions([
      { form: 'fresh', label: 'Fresh', term: 'fresh cauliflower head', must: ['cauliflower'], basis: 'as_bought' },
      { form: 'frozen', label: 'Frozen', term: 'frozen cauliflower florets', must: ['cauliflower'], basis: 'as_bought' },
    ]);
    const specs = (o: NonNullable<typeof fresh>) => foodSpecs(optionPriceFood(chicken, o)).map(s => foodRules(optionPriceFood(chicken, o), s).term);
    expect(specs(fresh!)).toEqual(['fresh cauliflower head', 'cauliflower', 'fresh cauliflower head']); // last: relaxed pass
    expect(specs(frozen!)).toEqual(['frozen cauliflower florets', 'frozen cauliflower', 'frozen cauliflower florets']);
    expect(foodRules(optionPriceFood(chicken, frozen!), foodSpecs(optionPriceFood(chicken, frozen!))[1]!).categories).toContain('Frozen');
  });

  it('matches the AI\'s word stems and keeps desserts out of the frozen aisle', () => {
    const [fresh, frozen] = cleanOptions([
      { form: 'fresh', label: 'Fresh', term: 'fresh blueberries', must: ['blueberr'], basis: 'as_bought' },
      { form: 'frozen', label: 'Frozen', term: 'frozen raspberries', must: ['raspberr'], basis: 'as_bought' },
    ]);
    const fruit = { ...chicken, food_name: 'Berries', food_category_id: null };
    const picked = (o: NonNullable<typeof fresh>, cands: Partial<Candidate>[]) => rankCandidates(optionPriceFood(fruit, o), cands.map(x => c(x))).best?.description;
    expect(picked(fresh!, [{ description: 'Fresh Blueberries - 1 PT Clamshell', brand: 'Fresh Berries', categories: 'Produce', size: '1 pt' }])).toBe('Fresh Blueberries - 1 PT Clamshell');
    expect(picked(frozen!, [{ description: 'Private Selection® Black Raspberry Fudge Chunk Ice Cream Tub', categories: 'Frozen', size: '48 oz' }])).toBeUndefined();
  });

  it('never excludes the option\'s own phrase, and dried fruit has to say dried', () => {
    const [, frozen] = cleanOptions([
      { form: 'fresh', label: 'Regular', term: 'ice cream', must: ['ice cream'], basis: 'as_bought' },
      { form: 'frozen', label: 'Frozen', term: 'ice cream', must: ['ice cream'], basis: 'as_bought' },
    ]);
    expect(foodRules(optionPriceFood({ ...chicken, food_category_id: 5 }, frozen!)).exclude).not.toContain('ice cream');
    const [, dried] = cleanOptions([
      { form: 'fresh', label: 'Fresh', term: 'apples', must: ['apple'], basis: 'as_bought' },
      { form: 'dried', label: 'Dried', term: 'dried apples', must: ['apple'], basis: 'as_bought' },
    ]);
    const apples = optionPriceFood({ ...chicken, food_name: 'Apples', food_category_id: 3 }, dried!);
    const best = (description: string) => rankCandidates(apples, [c({ description, brand: 'Kroger', categories: 'Produce', size: '3 lb' })]).best?.description;
    expect(best('Kroger® Gala Apples – 3 Pound Bag')).toBeUndefined();
    expect(best('Kroger® Dried Apple Rings')).toBe('Kroger® Dried Apple Rings');
  });

  it('falls back to a relaxed pass (must words only) when the group rules reject everything', () => {
    const iceCream = { ...chicken, food_name: 'Ice cream', food_category_id: 5, serving_size: 0.5, unit: 'cup', serving_grams: 67.5 };
    const food = { ...iceCream, food_id: null, search: newFoodSearch('ice cream', ['ice cream']) };
    const tub = [c({ description: 'Kroger® Vanilla Ice Cream', categories: 'Frozen', size: '48 fl oz', regular: 3.99 })];
    const specs = foodSpecs(food);
    const [primary, relaxed] = [specs[0]!, specs[specs.length - 1]!];
    expect(rankCandidates(food, tub, primary).best).toBeUndefined(); // dairy rules: wrong aisle, "vanilla" excluded
    expect(rankCandidates(food, tub, relaxed).best?.description).toBe('Kroger® Vanilla Ice Cream');
  });

  it('a food with no search rule tries shorter endings of its name, then a relaxed pass', () => {
    const cod = { ...chicken, food_id: 999, food_name: 'Atlantic cod' };
    expect(foodSpecs(cod).map(s => [foodRules(cod, s).term, foodRules(cod, s).must])).toEqual([
      ['Atlantic cod', ['atlantic cod']], ['cod', ['cod']], ['cod', ['cod']],
    ]);
    const cottage = { ...chicken, food_id: 998, food_name: 'Full-fat cottage cheese' };
    expect(foodSpecs(cottage).map(s => foodRules(cottage, s).term)).toContain('cottage cheese');
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
