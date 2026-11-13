-- Recipes page "Popular recipes": the recipes saved by the most Kiwi users.
-- Saved recipes are private (RLS, migration 0015), so this SECURITY DEFINER function returns only
-- recipe content and a save count, never who saved it. Recipes are grouped by their normalized title.
CREATE OR REPLACE FUNCTION public.popular_recipes(max_count integer DEFAULT 6)
RETURNS TABLE (
  recipe_key text, title text, summary text, servings integer, minutes integer,
  steps text[], food_groups text[], ingredients jsonb, saves bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH keyed AS (
    SELECT r.recipe_id, r.user_id, trim(BOTH '-' FROM regexp_replace(lower(r.title), '[^a-z0-9]+', '-', 'g')) AS k
    FROM public.saved_recipe r
  ), counts AS (
    SELECT k, count(DISTINCT user_id) AS saves, min(recipe_id) AS first_id
    FROM keyed
    GROUP BY k
  )
  SELECT c.k, r.title, r.summary, r.servings, r.minutes, r.steps, r.food_groups,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', i.name, 'amount', i.amount, 'food_id', i.food_id, 'servings', i.servings) ORDER BY i.position)
      FROM public.saved_recipe_ingredient i
      WHERE i.recipe_id = r.recipe_id
    ), '[]'::jsonb),
    c.saves
  FROM counts c
  JOIN public.saved_recipe r ON r.recipe_id = c.first_id
  ORDER BY c.saves DESC, r.created_at ASC
  LIMIT least(greatest(COALESCE(max_count, 6), 1), 20);
$$;
REVOKE ALL ON FUNCTION public.popular_recipes(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.popular_recipes(integer) TO authenticated;
