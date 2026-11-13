// Recipes page (server side): Claude suggests 3 recipes from the user's shopping list and pantry.
// Uses ANTHROPIC_API_KEY through the food finder's askClaude (OpenAI-compatible on self-hosted servers).
// The caller must be signed in, so the AI key can't be used anonymously.
import { getRequest } from '@tanstack/react-start/server';
import { adminClient } from '@/lib/food-import/env.server';
import { askClaude } from '@/lib/food-import/claude.server';
import { cleanIds, normalizeRecipes, RECIPE_SYSTEM, RECIPE_TOOL, recipePrompt, type CatalogLine, type SuggestInput, type SuggestResult } from './shared';

export class RecipeError extends Error {}
export const isRecipeError = (e: unknown): e is RecipeError => e instanceof RecipeError;

async function requireUser() {
  const header = getRequest()?.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new RecipeError('Please sign in again to get recipes.');
  const db = await adminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new RecipeError('Your session expired. Please sign in again.');
  return db;
}

export async function suggest(input: SuggestInput): Promise<SuggestResult> {
  const listIds = cleanIds(input.listFoodIds);
  const pantryIds = cleanIds(input.pantryFoodIds);
  const dislikedIds = cleanIds(input.dislikedFoodIds);
  if (!listIds.length && !pantryIds.length) throw new RecipeError('Add some foods to your list first.');

  const db = await requireUser();
  const { data, error } = await db.from('food').select('food_id,food_name,food_group,serving_size,unit').order('food_id');
  if (error) throw error;
  const catalog: CatalogLine[] = (data || []).map(f => ({
    id: String(f.food_id), name: f.food_name, group: f.food_group, serving: `${Number(f.serving_size)} ${f.unit}`,
  }));
  const byId = new Map(catalog.map(f => [f.id, f]));
  const pick = (ids: string[]) => ids.map(id => byId.get(id)).filter((f): f is CatalogLine => !!f);
  const list = pick(listIds);
  const pantry = pick(pantryIds.filter(id => !listIds.includes(id)));
  if (!list.length && !pantry.length) throw new RecipeError('Add some foods to your list first.');

  const raw = await askClaude<unknown>({
    system: RECIPE_SYSTEM,
    prompt: recipePrompt({ list, pantry, disliked: pick(dislikedIds), catalog }),
    tool: RECIPE_TOOL,
    maxTokens: 4000,
  });
  const recipes = normalizeRecipes(raw, new Set(byId.keys()));
  if (!recipes.length) throw new RecipeError('The AI assistant didn’t return any usable recipes. Try again.');
  return { recipes };
}
