import { describe, expect, it } from 'vitest';
import {
  computeFood, legacyNutrition, mapNutrients, median, parseQty, pickRawReference, rankCandidates, servingColumns, servingGrams, unitGrams,
  cleanFlavorTags, type FdcFood,
} from './rules';

const n = (number: string, value: number, unitName = 'G') => ({ nutrientNumber: number, value, unitName });
const P = (portions: [string, number][]) => portions.map(([portionDescription, gramWeight]) => ({ portionDescription, gramWeight }));

const lentilsCooked: FdcFood = {
  fdcId: 1, description: 'Lentils, from dried, no added fat', dataType: 'Survey (FNDDS)',
  foodNutrients: [n('208', 115, 'KCAL'), n('203', 9), n('205', 20), n('204', 0.4), n('307', 238, 'MG'), n('418', 0, 'UG')],
};
const lentilsRaw: FdcFood = {
  fdcId: 2, description: 'Lentils, raw', dataType: 'SR Legacy',
  foodNutrients: [n('208', 352, 'KCAL'), n('307', 6, 'MG')],
  foodPortions: [{ amount: 1, modifier: 'cup', measureUnit: { name: 'undetermined' }, gramWeight: 192 }],
};
const shrimpCooked: FdcFood = { fdcId: 3, description: 'Crustaceans, shrimp, mixed species, cooked, moist heat', dataType: 'SR Legacy', foodNutrients: [n('208', 119, 'KCAL'), n('307', 947, 'MG')] };
const shrimpRaw: FdcFood = { fdcId: 4, description: 'Crustaceans, shrimp, raw', dataType: 'SR Legacy', foodNutrients: [n('208', 85, 'KCAL'), n('307', 119, 'MG')] };

describe('mapNutrients', () => {
  it('converts µg to mg and counts coverage', () => {
    const { values, coverage } = mapNutrients({ fdcId: 1, description: '', dataType: 'SR Legacy', foodNutrients: [n('208', 100, 'KCAL'), n('418', 1.5, 'UG'), n('317', 49.7, 'UG')] });
    expect(values.vitamin_b12_mg).toBeCloseTo(0.0015);
    expect(values.selenium_mg).toBeCloseTo(0.0497);
    expect(values.protein_g).toBeNull();
    expect(coverage).toBe(3);
  });

  it('falls back to Atwater energy (958) when 208 is missing, and reads details-format nutrients', () => {
    const { values } = mapNutrients({ fdcId: 1, description: '', dataType: 'Foundation', foodNutrients: [{ nutrient: { number: '958', unitName: 'kcal' }, amount: 65 }] });
    expect(values.calories_kcal).toBe(65);
  });
});

describe('rankCandidates', () => {
  it('drops fat-added records for prepared groups and ranks by coverage, then dataset', () => {
    const hits: FdcFood[] = [
      { fdcId: 10, description: 'Lentils, from dried, fat added', dataType: 'Survey (FNDDS)', foodNutrients: [n('208', 166, 'KCAL'), n('203', 9), n('205', 20)] },
      { fdcId: 11, description: 'Lentils, mature seeds, cooked', dataType: 'SR Legacy', foodNutrients: [n('208', 116, 'KCAL'), n('203', 9)] },
      { fdcId: 12, description: 'Lentils, from dried, no added fat', dataType: 'Survey (FNDDS)', foodNutrients: [n('208', 115, 'KCAL'), n('203', 9)] },
      { fdcId: 13, description: 'Lentil soup', dataType: 'Survey (FNDDS)', foodNutrients: [] },
    ];
    expect(rankCandidates(hits, 'legume').map(c => c.fdcId)).toEqual([12, 11]);
    expect(rankCandidates(hits, 'fruit').map(c => c.fdcId)).toEqual([10, 12, 11]);
  });
});

describe('pickRawReference', () => {
  it('prefers SR Legacy raw records and skips cooked ones', () => {
    const hits: FdcFood[] = [
      { fdcId: 20, description: 'Lentils, dry', dataType: 'Foundation', foodNutrients: [n('208', 351, 'KCAL')] },
      { fdcId: 21, description: 'Lentils, mature seeds, cooked, boiled', dataType: 'SR Legacy', foodNutrients: [n('208', 116, 'KCAL')] },
      lentilsRaw,
    ];
    expect(pickRawReference(hits, lentilsCooked, 'legume')?.fdcId).toBe(2);
  });

  it('requires the same dataset for meats', () => {
    const fnddsCooked = { dataType: 'Survey (FNDDS)' };
    expect(pickRawReference([shrimpRaw], fnddsCooked, 'seafood')).toBeNull();
    expect(pickRawReference([shrimpRaw], shrimpCooked, 'seafood')?.fdcId).toBe(4);
  });
});

describe('servings', () => {
  it('parses fractions and units', () => {
    expect(parseQty('1/4 cup')).toEqual({ qty: 0.25, unit: 'cup' });
    expect(parseQty('1 1/2 tbsp')).toEqual({ qty: 1.5, unit: 'tbsp' });
    expect(servingColumns('1/4 cup')).toEqual({ serving_size: 0.25, unit: 'cup' });
    expect(servingColumns('1 unit')).toEqual({ serving_size: 1, unit: 'unit' });
  });

  it('resolves "1 unit" to the average whole item', () => {
    expect(unitGrams({ fdcId: 1, description: '', dataType: 'x', foodPortions: P([['1 cup', 160], ['1 whole', 148], ['1 slice', 15]]) }).grams).toBe(148);
    expect(unitGrams({ fdcId: 1, description: '', dataType: 'x', foodPortions: P([['1 medium melon', 550], ['1 large melon', 815], ['1 medium wedge/slice', 70]]) }).grams).toBe(550);
    expect(unitGrams({ fdcId: 1, description: '', dataType: 'x', foodPortions: P([['1 small', 100], ['1 large', 200]]) }).grams).toBe(150);
    expect(unitGrams({ fdcId: 1, description: '', dataType: 'x', foodPortions: P([['1 RACC', 110]]) }).grams).toBeNull();
  });

  it('measures volume servings from SR-style portions and branded labels', () => {
    expect(servingGrams('1/4 cup', lentilsRaw).grams).toBe(48);
    expect(servingGrams('1 cup', { fdcId: 1, description: '', dataType: 'Branded', servingSize: 140, servingSizeUnit: 'g', householdServingFullText: '1 cup' }).grams).toBe(140);
    expect(servingGrams('4 oz', null).grams).toBeCloseTo(113.398);
  });
});

describe('computeFood', () => {
  it('scales a cooked legume to 1/4 cup dry and takes sodium from the dry record', () => {
    const r = computeFood({ group: 'legume', serving: '1/4 cup', record: lentilsCooked, raw: lentilsRaw, groupMedianRatio: 2.7 });
    expect(r.cookRatio).toBeCloseTo(352 / 115, 3);
    expect(r.factor).toBeCloseTo(0.48 * (352 / 115), 3);
    expect(r.perServing.calories_kcal).toBeCloseTo(352 * 0.48, 1); // = dry calories in 48 g
    expect(r.perServing.sodium_mg).toBeCloseTo(6 * 0.48, 2); // not 342 mg of cooking salt
    expect(r.sodiumSource).toBe('raw record');
    expect(r.needsReview).toBe(false);
  });

  it('matches the Sprint 1 shrimp conversion (factor 0.81)', () => {
    const r = computeFood({ group: 'seafood', serving: '4 oz', record: shrimpCooked, raw: shrimpRaw });
    expect(r.factor).toBeCloseTo(0.81, 2);
    expect(r.perServing.calories_kcal).toBeCloseTo(85 * 1.134, 0);
    expect(r.perServing.sodium_mg).toBeCloseTo(119 * 1.134, 0);
  });

  it('falls back to the group median and cuts grain sodium 90% when no raw record exists', () => {
    const rice: FdcFood = { fdcId: 5, description: 'Rice, white, cooked, no added fat', dataType: 'Survey (FNDDS)', foodNutrients: [n('208', 130, 'KCAL'), n('307', 200, 'MG')] };
    const r = computeFood({ group: 'grain', serving: '2 oz', record: rice, raw: null, groupMedianRatio: 2.5 });
    expect(r.cookRatio).toBe(2.5);
    expect(r.per100.sodium_mg).toBeCloseTo(20);
    expect(r.flags.map(f => f.code)).toEqual(expect.arrayContaining(['no_raw_record', 'sodium_fallback']));
    expect(r.needsReview).toBe(true);
  });

  it('flags a cooking yield more than 20% off the group median', () => {
    const r = computeFood({ group: 'legume', serving: '1/4 cup', record: lentilsCooked, raw: lentilsRaw, groupMedianRatio: 2.0 });
    expect(r.flags.some(f => f.code === 'ratio_outlier')).toBe(true);
  });

  it('flags mixed datasets for meats', () => {
    const fndds = { ...shrimpCooked, dataType: 'Survey (FNDDS)' };
    expect(computeFood({ group: 'seafood', serving: '4 oz', record: fndds, raw: shrimpRaw }).flags.some(f => f.code === 'mixed_datasets')).toBe(true);
  });

  it('uses whole-unit weights for produce and falls back to 100 g', () => {
    const apple: FdcFood = { fdcId: 6, description: 'Apples, raw, with skin', dataType: 'SR Legacy', foodNutrients: [n('208', 52, 'KCAL')], foodPortions: P([['1 medium (3" dia)', 182], ['1 cup, sliced', 109]]) };
    expect(computeFood({ group: 'fruit', serving: '1 unit', record: apple }).factor).toBeCloseTo(1.82);
    const bare = { ...apple, foodPortions: [] };
    const r = computeFood({ group: 'fruit', serving: '1 unit', record: bare });
    expect(r.serving).toBe('100 g');
    expect(r.factor).toBe(1);
    expect(r.needsReview).toBe(false);
  });

  it('stores missing nutrients as 0 and refuses records without calories', () => {
    const r = computeFood({ group: 'condiment', serving: '1 tbsp', record: { fdcId: 7, description: 'Honey', dataType: 'SR Legacy', foodNutrients: [n('208', 304, 'KCAL')], foodPortions: P([['1 tbsp', 21]]) } });
    expect(r.per100.protein_g).toBe(0);
    expect(r.missing).toContain('protein_g');
    expect(legacyNutrition(r.perServing).calories).toBeCloseTo(63.84);
    expect(() => computeFood({ group: 'condiment', serving: '1 tbsp', record: { fdcId: 8, description: 'x', dataType: 'SR Legacy', foodNutrients: [] } })).toThrow();
  });
});

describe('helpers', () => {
  it('median ignores non-positive values', () => {
    expect(median([0.83, 0.93, 0.07, 0.83, 0])).toBeCloseTo(0.83);
    expect(median([])).toBeNull();
  });

  it('keeps only known flavor tags', () => {
    expect(cleanFlavorTags(['Savory', 'umami', 'crunchy', 'savory'])).toEqual(['savory', 'umami']);
  });
});
