import { describe, expect, it } from 'vitest';
import type { Candidate } from './pricing';
import { cleanStyles, coreWord, priceStyle, shelfProducts, styleSearchTerms } from './purchase-styles';

const c = (product_id: string, description: string, over: Partial<Candidate> = {}): Candidate => ({ rank: 0, product_id, brand: 'Kroger', description, categories: 'Produce', size: '16 oz', sold_by: 'UNIT', regular: 2.99, promo: null, ...over });
const kale = { food_name: 'Kale', food_category_id: 4, serving_size: 100, unit: 'g', serving_grams: 100, prepared_grams: 100 };

describe('purchase styles from the store shelf', () => {
  it('searches the usual term, the plain word and the frozen / canned / dried aisles', () => {
    expect(coreWord('Atlantic cod')).toBe('cod');
    expect(coreWord('Blueberries', ['blueberry|blueberries'])).toBe('blueberries');
    expect(styleSearchTerms('fresh kale', 'kale')).toEqual(['fresh kale', 'kale', 'frozen kale', 'canned kale', 'dried kale']);
  });

  it('lists each product once, takes the searches in turns, and keeps only names with the food word', () => {
    const fresh = [c('1', 'Kale Bag'), c('2', 'Kaleidoscope Cereal'), c('3', 'Kroger® Chopped Kale', { size: '10 oz' })];
    const frozen = [c('4', 'Kroger® Frozen Chopped Kale', { categories: 'Frozen' }), c('5', 'Tomato Feta and Kale Egg White Frittatas', { categories: 'Frozen' }), c('1', 'Kale Bag')];
    const shelf = shelfProducts('kale', [fresh, frozen]);
    expect(shelf.map(p => p.product_id)).toEqual(['1', '4', '5', '3']); // "Kaleidoscope" is not kale; product 1 once
    expect(shelf.map(p => p.key)).toEqual([0, 1, 2, 3]);
  });

  it('matches singular and plural names: blueberry and blueberries both count', () => {
    const shelf = shelfProducts('blueberries', [[c('1', 'Fresh Blueberries - 1 PT Clamshell'), c('2', 'Kroger® Frozen Blueberries'), c('3', 'Blueberry Muffins'), c('4', 'Raspberries')]]);
    expect(shelf.map(p => p.product_id)).toEqual(['1', '2', '3']); // the AI drops the muffins
    expect(shelfProducts('peaches', [[c('5', 'Kroger® Peach Halves'), c('6', 'Fresh Peaches')]])).toHaveLength(2);
    expect(shelfProducts('grapes', [[c('7', 'Seedless Green Grapes'), c('8', 'Grape Jelly')]])).toHaveLength(2);
  });

  it('keeps the AI\'s styles only with products from the list, one style per form, each product once', () => {
    const shelf = shelfProducts('kale', [[c('1', 'Kale Bag'), c('3', 'Kroger® Chopped Kale'), c('4', 'Kroger® Frozen Chopped Kale', { categories: 'Frozen' })]]);
    const styles = cleanStyles([
      { form: 'fresh', label: 'Fresh', term: 'kale', basis: 'as_bought', keys: [0, 1] },
      { form: 'frozen', label: 'Frozen', term: 'frozen kale', basis: 'as_bought', keys: [2, 99] }, // 99 isn't on the list
      { form: 'frozen', label: 'Frozen again', term: 'x', basis: 'as_bought', keys: [2] }, // second frozen style dropped
      { form: 'canned', label: 'Canned', term: 'canned kale', basis: 'prepared', keys: [] }, // no products: not a style
    ], shelf, 'Kale', 'kale');
    expect(styles.map(s => [s.option.label, s.members.map(m => m.product_id)])).toEqual([['Fresh', ['1', '3']], ['Frozen', ['4']]]);
    expect(styles[1]!.option).toMatchObject({ form: 'frozen', must: ['kale'], sort_order: 1 });
  });

  it('prices a style from its own products, even outside the food group\'s usual aisle', () => {
    const shelf = shelfProducts('kale', [[c('4', 'Kroger® Frozen Chopped Kale', { categories: 'Frozen', size: '12 oz', regular: 1.79 }), c('6', 'Birds Eye Kale', { brand: 'Birds Eye', categories: 'Frozen', size: '10 oz', regular: 1.5 })]]);
    const [frozen] = cleanStyles([{ form: 'frozen', label: 'Frozen', term: 'frozen kale', basis: 'as_bought', keys: [0, 1] }], shelf, 'Kale', 'kale');
    const { best, scored } = priceStyle(kale, frozen!);
    expect(best?.description).toBe('Kroger® Frozen Chopped Kale'); // store brand first
    expect(best?.price_per_serving).toBeCloseTo(1.79 * 100 / 340.2, 3);
    expect(scored.filter(s => s.eligible)).toHaveLength(2); // both feed the package sizes
  });
});
