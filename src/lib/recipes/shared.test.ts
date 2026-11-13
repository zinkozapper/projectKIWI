import { describe, expect, it } from 'vitest';
import { cartAdditions, cleanIds, cleanTitles, haveByDefault, ingredientStatus, listEntries, normalizeRecipes, recipeKey, recipePrompt, stillNeeded, toPopularRecipe, type Recipe } from './shared';

const catalog = new Set(['1', '2', '3', '4']);

const raw = {
  recipes: [
    {
      title: '  Egg fried rice ',
      summary: 'Quick weeknight rice.',
      servings: 2,
      minutes: 20,
      food_groups: ['grain', 'meat', 'made_up'],
      ingredients: [
        { name: 'Rice', amount: '1 cup', food_id: 1, servings: 2.2 },
        { name: 'Eggs', amount: '2', food_id: 2, servings: 0.4 },
        { name: 'Unicorn', amount: '1', food_id: 999, servings: 1 },
        { name: 'Salt', amount: 'pinch', food_id: null, servings: 1 },
        { name: '', amount: '', food_id: 3, servings: 1 },
      ],
      steps: ['Cook rice.', '', 'Fry with eggs.'],
    },
    { title: 'No ingredients', ingredients: [] },
    { title: 'Toast', servings: 99, minutes: -5, food_groups: [], ingredients: [{ name: 'Bread', food_id: '4', servings: 1 }], steps: [] },
    { title: 'Bean bowl', ingredients: [{ name: 'Beans', food_id: 3, servings: 1 }] },
    { title: 'Fourth', ingredients: [{ name: 'Beans', food_id: 3, servings: 1 }] },
  ],
};

describe('normalizeRecipes', () => {
  const recipes = normalizeRecipes(raw, catalog);

  it('keeps at most 3 recipes and skips ones without ingredients', () => {
    expect(recipes.map(r => r.title)).toEqual(['Egg fried rice', 'Toast', 'Bean bowl']);
  });

  it('drops made-up food ids and food groups, rounds servings up to whole catalog servings', () => {
    const [rice] = recipes;
    expect(rice!.foodGroups).toEqual(['meat', 'grain']);
    expect(rice!.ingredients).toEqual([
      { name: 'Rice', amount: '1 cup', foodId: '1', servings: 3 },
      { name: 'Eggs', amount: '2', foodId: '2', servings: 1 },
      { name: 'Unicorn', amount: '1', foodId: null, servings: 1 },
      { name: 'Salt', amount: 'pinch', foodId: null, servings: 1 },
    ]);
    expect(rice!.steps).toEqual(['Cook rice.', 'Fry with eggs.']);
  });

  it('clamps servings and drops a bad cooking time', () => {
    expect(recipes[1]).toMatchObject({ servings: 12, minutes: null, foodGroups: [] });
  });

  it('returns nothing for an unexpected answer', () => {
    expect(normalizeRecipes(null, catalog)).toEqual([]);
    expect(normalizeRecipes({ recipes: 'no' }, catalog)).toEqual([]);
  });
});

describe('cart additions', () => {
  const recipe: Recipe = {
    title: 'Bowl', summary: '', servings: 2, minutes: 10, steps: [], foodGroups: [],
    ingredients: [
      { name: 'Rice', amount: '', foodId: '1', servings: 2 },
      { name: 'Eggs', amount: '', foodId: '2', servings: 1 },
      { name: 'Beans', amount: '', foodId: '3', servings: 1 },
      { name: 'More beans', amount: '', foodId: '3', servings: 2 },
      { name: 'Salt', amount: '', foodId: null, servings: 1 },
    ],
  };
  const list = new Set(['1']);
  const pantry = new Set(['2']);

  it('labels each ingredient against the list and pantry', () => {
    expect(recipe.ingredients.map(i => ingredientStatus(i, list, pantry))).toEqual(['on_list', 'in_pantry', 'missing', 'missing', 'not_in_catalog']);
  });

  it('proposes only catalog foods you do not have yet', () => {
    expect(cartAdditions(recipe, list, pantry).map(i => i.name)).toEqual(['Beans', 'More beans']);
  });

  it('merges the same food into one list entry', () => {
    expect(listEntries(cartAdditions(recipe, list, pantry))).toEqual([{ id: '3', quantity: 3 }]);
    expect(listEntries([recipe.ingredients[4]!])).toEqual([]);
  });
});

describe('input and prompt', () => {
  it('keeps only numeric, unique food ids', () => {
    expect(cleanIds(['1', 2, '1', 'x', '3; drop table'])).toEqual(['1', '2']);
    expect(cleanIds('1')).toEqual([]);
  });

  it('lists the shopping list, pantry, dislikes and catalog', () => {
    const line = (id: string, name: string) => ({ id, name, group: 'grain', serving: '45 g' });
    const prompt = recipePrompt({ list: [line('1', 'Rice')], pantry: [], disliked: [line('2', 'Kale')], catalog: [line('1', 'Rice')] });
    expect(prompt).toContain('Shopping list: Rice (#1)');
    expect(prompt).toContain('Already in the pantry: nothing');
    expect(prompt).toContain('dislikes: Kale (#2)');
    expect(prompt).toContain('1 | Rice | grain | 45 g');
  });
});

describe('have boxes and popular mode', () => {
  const recipe: Recipe = {
    title: 'Bowl', summary: '', servings: 2, minutes: 10, steps: [], foodGroups: [],
    ingredients: [
      { name: 'Rice', amount: '', foodId: '1', servings: 2 },
      { name: 'Eggs', amount: '', foodId: '2', servings: 1 },
      { name: 'Beans', amount: '', foodId: '3', servings: 1 },
      { name: 'Salt', amount: '', foodId: null, servings: 1 },
    ],
  };

  it('ticks what is on the list or in the pantry', () => {
    expect([...haveByDefault(recipe, new Set(['1']), new Set(['2']))]).toEqual([0, 1]);
  });

  it('adds only unticked Kiwi foods', () => {
    expect(stillNeeded(recipe, new Set([0, 1])).map(i => i.name)).toEqual(['Beans']);
    expect(stillNeeded(recipe, new Set([0, 1, 2]))).toEqual([]);
  });

  it('asks for well-loved recipes without the cart, skipping ones already shown', () => {
    const rice = { id: '1', name: 'Rice', group: 'grain', serving: '45 g' };
    const prompt = recipePrompt({ mode: 'popular', list: [rice], pantry: [rice], disliked: [], catalog: [], avoidTitles: cleanTitles(['Chili', '<b>Tacos</b>', 'Chili']) });
    expect(prompt).not.toContain('Shopping list');
    expect(prompt).not.toContain('pantry:');
    expect(prompt).toContain('widely loved everyday recipes');
    expect(prompt).toContain('suggest different ones: Chili; bTacosb.');
  });
});

describe('popular recipes', () => {
  it('maps a popular_recipes() row and keeps its save count', () => {
    const r = toPopularRecipe({
      title: 'Chili', summary: null, servings: 4, minutes: 45, steps: ['Cook.'], food_groups: ['legume', 'nope'], saves: '3',
      ingredients: [{ name: 'Beans', amount: '1 can', food_id: 3, servings: 2 }, { name: 'Salt', amount: '', food_id: null, servings: 1 }],
    }, new Set(['3']));
    expect(r).toEqual({
      title: 'Chili', summary: '', servings: 4, minutes: 45, steps: ['Cook.'], foodGroups: ['legume'], saves: 3,
      ingredients: [{ name: 'Beans', amount: '1 can', foodId: '3', servings: 2 }, { name: 'Salt', amount: '', foodId: null, servings: 1 }],
    });
  });

  it('groups saves of the same recipe by title, like the database does', () => {
    expect(recipeKey({ title: '  Egg Fried Rice! ' })).toBe('egg-fried-rice');
  });
});
