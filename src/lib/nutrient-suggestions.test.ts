import { describe, expect, it } from 'vitest';
import { emptyNutrients, NUTRIENT_PRIORITY, nutrientLimits, type Food, type Nutrients } from './foods';
import { rankSuggestions } from './nutrient-suggestions';
import { searchNutrients } from './nutrient-info';

const daily: Nutrients = { ...emptyNutrients(), vitaminA: 900, zinc: 11, omega3: 1.6, vitaminC: 90, protein: 60, iron: 8, sodium: 2300, omega6: 17 };
const food = (id: string, n: Partial<Nutrients>): Food => ({ id, name: id, category: '', unit: 'unit', price: 1, servings: 1, nutrition: { ...emptyNutrients(), ...n }, note: '', emoji: '', pairs: [] });

const carrot = food('carrot', { vitaminA: 500 });
const sweetPotato = food('sweet potato', { vitaminA: 600, vitaminC: 20 }); // A plus another gap
const oysters = food('oysters', { zinc: 20, vitaminB12: 10 });
const orange = food('orange', { vitaminC: 70 });
const base = { daily, days: 7, preferences: {}, chosen: null, addCostOf: () => 7, budgetRemaining: 100 };

describe('rankSuggestions', () => {
  it('works on the first open gap in priority order and prefers foods that cover more gaps', () => {
    const r = rankSuggestions({ ...base, available: [carrot, sweetPotato, oysters, orange], combined: emptyNutrients() });
    expect(r.nutrient).toBe('vitaminA');
    expect(r.chosen).toBe(false);
    expect(r.suggestions.map(s => s.food.id)).toEqual(['sweet potato', 'carrot']);
    expect(r.suggestions[0]!.boosts[0]!.key).toBe('vitaminA'); // focus nutrient's chip first
  });

  it('moves down the line once a nutrient is met', () => {
    const combined = { ...emptyNutrients(), vitaminA: 900 * 7 };
    const r = rankSuggestions({ ...base, available: [carrot, oysters, orange], combined });
    expect(r.nutrient).toBe('zinc');
    expect(r.suggestions.map(s => s.food.id)).toEqual(['oysters']);
  });

  it('skips a gap no food can help with', () => {
    const r = rankSuggestions({ ...base, available: [orange], combined: emptyNutrients() });
    expect(r.nutrient).toBe('vitaminC');
  });

  it('follows a nutrient the user chose, even one already met', () => {
    const r = rankSuggestions({ ...base, available: [carrot, orange], combined: emptyNutrients(), chosen: 'vitaminC' });
    expect(r).toMatchObject({ nutrient: 'vitaminC', chosen: true });
    expect(r.suggestions.map(s => s.food.id)).toEqual(['orange']);
    const met = rankSuggestions({ ...base, available: [orange], combined: { ...emptyNutrients(), vitaminC: 90 * 7 }, chosen: 'vitaminC' });
    expect(met.suggestions.map(s => s.food.id)).toEqual(['orange']);
  });

  it('keeps suggestions over budget, ranked by value per dollar', () => {
    const pricey = food('pricey', { vitaminA: 600 });
    const cheap = food('cheap', { vitaminA: 500 });
    const r = rankSuggestions({ ...base, available: [pricey, cheap], combined: emptyNutrients(), budgetRemaining: -5, addCostOf: f => (f.id === 'pricey' ? 70 : 7) });
    expect(r.suggestions.map(s => s.food.id)).toEqual(['cheap', 'pricey']);
  });

  it('never suggests a food the user thumbed down', () => {
    const r = rankSuggestions({ ...base, available: [carrot, sweetPotato], combined: emptyNutrients(), preferences: { 'sweet potato': false } });
    expect(r.suggestions.map(s => s.food.id)).toEqual(['carrot']);
    expect(r.gapScores.map(s => s.food.id)).not.toContain('sweet potato');
  });

  it('never targets calories or the upper limits', () => {
    expect(NUTRIENT_PRIORITY).not.toContain('calories');
    for (const limit of nutrientLimits) expect(NUTRIENT_PRIORITY).not.toContain(limit);
    expect(nutrientLimits.has('omega6')).toBe(true);
  });
});

describe('searchNutrients', () => {
  it('matches names and common aliases', () => {
    expect(searchNutrients('iron')[0]).toBe('iron');
    expect(searchNutrients('b12')[0]).toBe('vitaminB12');
    expect(searchNutrients('vit c')[0]).toBe('vitaminC');
    expect(searchNutrients('omega 3')[0]).toBe('omega3');
    expect(searchNutrients('salt')[0]).toBe('sodium');
    expect(searchNutrients('vitamin')).toHaveLength(5);
    expect(searchNutrients('xyz')).toEqual([]);
  });
});
