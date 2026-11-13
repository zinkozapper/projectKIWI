// Saved recipes (browser side). Rows are protected by RLS (migration 0015): each user sees only their own.
import { supabase } from '@/integrations/supabase/client';
import { cleanFoodGroups, toPopularRecipe, type FoodGroup, type PopularRecipe, type Recipe, type SavedRecipe } from './shared';

type IngredientRow = { position: number; name: string; amount: string; food_id: number | null; servings: number };
type RecipeRow = {
  recipe_id: number; title: string; summary: string; servings: number; minutes: number | null;
  steps: string[]; food_groups: string[]; created_at: string; saved_recipe_ingredient: IngredientRow[] | null;
};

export function toSavedRecipe(r: RecipeRow): SavedRecipe {
  return {
    id: String(r.recipe_id),
    createdAt: r.created_at,
    title: r.title,
    summary: r.summary,
    servings: r.servings,
    minutes: r.minutes,
    steps: r.steps || [],
    foodGroups: cleanFoodGroups(r.food_groups),
    ingredients: [...(r.saved_recipe_ingredient || [])]
      .sort((a, b) => a.position - b.position)
      .map(i => ({ name: i.name, amount: i.amount, foodId: i.food_id == null ? null : String(i.food_id), servings: Number(i.servings) })),
  };
}

const SELECT = 'recipe_id,title,summary,servings,minutes,steps,food_groups,created_at,saved_recipe_ingredient(position,name,amount,food_id,servings)';

export async function loadSavedRecipes(userId: string): Promise<SavedRecipe[]> {
  const { data, error } = await supabase.from('saved_recipe').select(SELECT).eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as RecipeRow[]).map(toSavedRecipe);
}

export async function saveRecipe(userId: string, recipe: Recipe): Promise<SavedRecipe> {
  const { data, error } = await supabase.from('saved_recipe').insert({
    user_id: userId, title: recipe.title, summary: recipe.summary, servings: recipe.servings, minutes: recipe.minutes,
    steps: recipe.steps, food_groups: recipe.foodGroups, source: 'claude',
  }).select('recipe_id').single();
  if (error || !data) throw error || new Error('Could not save the recipe.');
  const recipeId = data.recipe_id;
  const { error: ingredientError } = await supabase.from('saved_recipe_ingredient').insert(recipe.ingredients.map((i, position) => ({
    recipe_id: recipeId, position, name: i.name, amount: i.amount, food_id: i.foodId ? Number(i.foodId) : null, servings: i.servings,
  })));
  if (ingredientError) {
    await supabase.from('saved_recipe').delete().eq('recipe_id', recipeId);
    throw ingredientError;
  }
  const { data: row, error: loadError } = await supabase.from('saved_recipe').select(SELECT).eq('recipe_id', recipeId).single();
  if (loadError || !row) throw loadError || new Error('Could not load the saved recipe.');
  return toSavedRecipe(row as unknown as RecipeRow);
}

export async function setRecipeFoodGroups(recipeId: string, groups: FoodGroup[]) {
  const { error } = await supabase.from('saved_recipe').update({ food_groups: groups }).eq('recipe_id', Number(recipeId));
  if (error) throw error;
}

export async function deleteRecipe(recipeId: string) {
  const { error } = await supabase.from('saved_recipe').delete().eq('recipe_id', Number(recipeId));
  if (error) throw error;
}

// Recipes saved by the most users (migration 0016). Returns [] if the migration isn't applied yet.
export async function loadPopularRecipes(max = 6): Promise<PopularRecipe[]> {
  const { data, error } = await supabase.rpc('popular_recipes', { max_count: max });
  if (error) {
    console.error('Could not load popular recipes:', error.message);
    return [];
  }
  // food_id is a foreign key to food, so every id in a saved ingredient is a real catalog food.
  const ids = (row: { ingredients: unknown }) => new Set((Array.isArray(row.ingredients) ? row.ingredients : [])
    .map(i => (i && typeof i === 'object' ? (i as { food_id?: unknown }).food_id : null))
    .filter(id => id != null).map(String));
  return (data || []).map(row => toPopularRecipe(row, ids(row))).filter(r => r.title && r.ingredients.length);
}
