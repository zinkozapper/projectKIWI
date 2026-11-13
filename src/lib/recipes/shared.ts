// Recipes page: shapes and pure helpers shared by the browser and the server.
// Claude suggests recipes from the user's shopping list (suggest.server.ts); everything here checks and
// cleans its answer and works out which ingredients still need to go on the list. No network here.
import { FOOD_GROUPS, isFoodGroup, type FoodGroup } from '@/lib/food-import/rules';

export { FOOD_GROUPS, type FoodGroup };

export const RECIPE_COUNT = 3;
const MAX_INGREDIENTS = 15;
const MAX_STEPS = 12;
const MAX_SERVINGS = 20;

// servings = how many Kiwi catalog servings of foodId the recipe uses (what goes on the list).
export type RecipeIngredient = { name: string; amount: string; foodId: string | null; servings: number };
export type Recipe = {
  title: string;
  summary: string;
  servings: number;
  minutes: number | null;
  steps: string[];
  foodGroups: FoodGroup[];
  ingredients: RecipeIngredient[];
};
export type SavedRecipe = Recipe & { id: string; createdAt: string };

export type SuggestInput = { listFoodIds: string[]; pantryFoodIds: string[]; dislikedFoodIds?: string[] };
export type SuggestResult = { recipes: Recipe[] };

export const FOOD_GROUP_LABELS: Record<FoodGroup, string> = {
  meat: 'Meat', seafood: 'Seafood', grain: 'Grains', legume: 'Beans & legumes', bread: 'Bread',
  fruit: 'Fruit', vegetable: 'Vegetables', dairy: 'Dairy', nut_seed: 'Nuts & seeds', condiment: 'Condiments', other: 'Other',
};

const clip = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const int = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min ? Math.min(n, max) : null;
};

// Food ids from the browser: digits only, unique, capped.
export function cleanIds(v: unknown, max = 200): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(String).filter(id => /^\d{1,9}$/.test(id)))].slice(0, max);
}

export function cleanFoodGroups(v: unknown): FoodGroup[] {
  if (!Array.isArray(v)) return [];
  return FOOD_GROUPS.filter(g => v.includes(g) && isFoodGroup(g));
}

function cleanIngredient(v: unknown, catalogIds: Set<string>): RecipeIngredient | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const name = clip(o['name'], 120);
  if (!name) return null;
  const rawId = o['food_id'] ?? o['foodId'];
  const id = rawId == null ? '' : String(rawId);
  const foodId = catalogIds.has(id) ? id : null;
  // Whole catalog servings, at least 1, so the list never gets a fraction of a package.
  const servings = Math.min(MAX_SERVINGS, Math.max(1, Math.ceil(Number(o['servings']) || 1)));
  return { name, amount: clip(o['amount'], 60), foodId, servings };
}

// Claude's tool input → at most 3 clean recipes. Food ids Claude made up (not in the catalog) are dropped,
// so an ingredient only links to the list when it is a real Kiwi food.
export function normalizeRecipes(raw: unknown, catalogIds: Set<string>): Recipe[] {
  const list = raw && typeof raw === 'object' ? (raw as { recipes?: unknown }).recipes : null;
  if (!Array.isArray(list)) return [];
  const out: Recipe[] = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const title = clip(o['title'], 120);
    const ingredients = (Array.isArray(o['ingredients']) ? o['ingredients'] : [])
      .map(i => cleanIngredient(i, catalogIds))
      .filter((i): i is RecipeIngredient => !!i)
      .slice(0, MAX_INGREDIENTS);
    if (!title || !ingredients.length) continue;
    out.push({
      title,
      summary: clip(o['summary'], 400),
      servings: int(o['servings'], 1, 12) ?? 2,
      minutes: int(o['minutes'], 1, 600),
      steps: (Array.isArray(o['steps']) ? o['steps'] : []).map(s => clip(s, 500)).filter(Boolean).slice(0, MAX_STEPS),
      foodGroups: cleanFoodGroups(o['food_groups'] ?? o['foodGroups']),
      ingredients,
    });
    if (out.length === RECIPE_COUNT) break;
  }
  return out;
}

export type IngredientStatus = 'on_list' | 'in_pantry' | 'missing' | 'not_in_catalog';

export function ingredientStatus(i: RecipeIngredient, listIds: ReadonlySet<string>, pantryIds: ReadonlySet<string>): IngredientStatus {
  if (!i.foodId) return 'not_in_catalog';
  if (listIds.has(i.foodId)) return 'on_list';
  if (pantryIds.has(i.foodId)) return 'in_pantry';
  return 'missing';
}

export const STATUS_LABELS: Record<IngredientStatus, string> = {
  on_list: 'On your list', in_pantry: 'In your pantry', missing: 'Not on your list', not_in_catalog: 'Not in Kiwi',
};

// The cart additions for a recipe: catalog foods that are neither on the list nor in the pantry.
export function cartAdditions(r: Recipe, listIds: ReadonlySet<string>, pantryIds: ReadonlySet<string>): RecipeIngredient[] {
  return r.ingredients.filter(i => ingredientStatus(i, listIds, pantryIds) === 'missing');
}

// Picked ingredients → one list entry per food (two ingredients can be the same food), servings added up.
export function listEntries(ingredients: RecipeIngredient[]): { id: string; quantity: number }[] {
  const byFood = new Map<string, number>();
  for (const i of ingredients) if (i.foodId) byFood.set(i.foodId, (byFood.get(i.foodId) ?? 0) + i.servings);
  return [...byFood].map(([id, quantity]) => ({ id, quantity }));
}

// Stable key for a recipe on the page (picks and saved state).
export const recipeKey = (r: Recipe) => r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export type CatalogLine = { id: string; name: string; group: string | null; serving: string };

export function recipePrompt({ list, pantry, disliked, catalog }: { list: CatalogLine[]; pantry: CatalogLine[]; disliked: CatalogLine[]; catalog: CatalogLine[] }) {
  const names = (l: CatalogLine[]) => (l.length ? l.map(f => `${f.name} (#${f.id})`).join(', ') : 'nothing');
  return [
    `Shopping list: ${names(list)}`,
    `Already in the pantry: ${names(pantry)}`,
    ...(disliked.length ? [`The user dislikes: ${names(disliked)}. Avoid these.`] : []),
    '',
    `Suggest exactly ${RECIPE_COUNT} different recipes that use as much of the shopping list as possible, then the pantry.`,
    'Add other ingredients only when a recipe needs them.',
    '',
    'Kiwi catalog (id | name | food group | one serving):',
    ...catalog.map(f => `${f.id} | ${f.name} | ${f.group ?? 'other'} | ${f.serving}`),
  ].join('\n');
}

export const RECIPE_SYSTEM = [
  'You suggest simple, budget-friendly home recipes for young adults who are learning to cook.',
  'Each recipe takes under an hour and uses common equipment.',
  'For every ingredient, set food_id to the Kiwi catalog id when a catalog food is a reasonable match, otherwise null',
  '(salt, pepper, water and spices are usually null). Never invent ids.',
  'servings = how many of that catalog food\'s listed servings the whole recipe uses (round up, at least 1).',
  'food_groups = the food groups the recipe mainly provides, from the allowed list.',
].join(' ');

export const RECIPE_TOOL = {
  name: 'suggest_recipes',
  description: `Return exactly ${RECIPE_COUNT} recipes.`,
  input_schema: {
    type: 'object',
    properties: {
      recipes: {
        type: 'array',
        minItems: RECIPE_COUNT,
        maxItems: RECIPE_COUNT,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string', description: 'One sentence.' },
            servings: { type: 'integer', description: 'How many people it feeds.' },
            minutes: { type: 'integer', description: 'Total time.' },
            food_groups: { type: 'array', items: { type: 'string', enum: [...FOOD_GROUPS] } },
            ingredients: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  amount: { type: 'string', description: 'Like "1 cup" or "2 cloves".' },
                  food_id: { type: ['integer', 'null'] },
                  servings: { type: 'number' },
                },
                required: ['name', 'amount', 'food_id', 'servings'],
              },
            },
            steps: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'summary', 'servings', 'minutes', 'food_groups', 'ingredients', 'steps'],
        },
      },
    },
    required: ['recipes'],
  },
};
