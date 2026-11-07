-- AI food import workflow (Sprint 2): users add foods from USDA FoodData Central with Claude's help.
--
-- How it fits together:
--   * Server functions in src/lib/food-import/ search USDA, ask Claude to rank the records, compute
--     nutrients with the rules in docs/usda-record-selection-rules.md, and write new foods with the
--     service role. The browser can still only READ food (policy from 0001), so every write goes
--     through the server, which checks the caller's quota first.
--   * Quota: each user may add 10 foods. An admin approval adds 10 more (user_food_quota.food_limit).
--     Admins have no limit.
--   * New foods are visible to everyone immediately. Foods the workflow wasn't sure about are saved
--     with needs_review = true so admins can check them on /admin.
--   * food_import_request logs every attempt (the AI workflow's audit trail) and doubles as the admin
--     queue: "no good match" submissions and requests for 10 more foods wait there as pending_admin.

-- 1. New columns on food.
ALTER TABLE public.food
  ADD COLUMN IF NOT EXISTS flavor_profile text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS food_group text,
  ADD COLUMN IF NOT EXISTS cook_ratio double precision,
  ADD COLUMN IF NOT EXISTS raw_fdc_id integer,
  ADD COLUMN IF NOT EXISTS added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.food.flavor_profile IS 'Flavor tags (savory, sweet, umami, ...) used to suggest pairings. Set by the AI workflow for new foods';
COMMENT ON COLUMN public.food.food_group IS 'USDA import rule group: meat, seafood, grain, legume, bread, fruit, vegetable, dairy, nut_seed, condiment, other';
COMMENT ON COLUMN public.food.cook_ratio IS 'Raw (or dry) kcal per 100 g / prepared kcal per 100 g. Only for foods pulled cooked; used to cross-check new foods against their group';
COMMENT ON COLUMN public.food.added_by IS 'User who added the food through the AI workflow; null for the original catalog';

CREATE UNIQUE INDEX IF NOT EXISTS food_name_lower_key ON public.food (lower(food_name));
CREATE INDEX IF NOT EXISTS food_added_by_idx ON public.food (added_by) WHERE added_by IS NOT NULL;

-- The 100 seed foods were imported with explicit ids, so move the id counter past them.
SELECT setval(pg_get_serial_sequence('public.food', 'food_id'), greatest((SELECT max(food_id) FROM public.food), 1));

-- 2. Backfill food_group for the existing catalog (category-based, with a few named exceptions).
UPDATE public.food f SET food_group = CASE
    WHEN f.food_name IN ('Tilapia', 'Salmon', 'Tuna', 'Sardines', 'Oysters', 'Shrimp') THEN 'seafood'
    WHEN f.food_name IN ('Chickpeas / Garbanzo Beans', 'Lentils', 'Black Beans', 'Edamame', 'Tofu') THEN 'legume'
    WHEN f.food_name IN ('Bagels', 'Multi-grain Bread', 'Sourdough Bread', 'Whole Wheat Tortillas') THEN 'bread'
    WHEN f.food_name IN ('Avocado Oil', 'Olive Oil', 'Apple Cider Vinegar', 'Soy Sauce / Tamari', 'Honey', 'Maple Syrup') THEN 'condiment'
    WHEN f.food_name IN ('Protein Powder', 'Powdered Peanut Butter', 'Cocoa Powder', 'Dark Chocolate', 'Kimchi') THEN 'other'
    WHEN c.category_description = 'Proteins & Seafood' THEN 'meat'
    WHEN c.category_description = 'Grains & Carbohydrates' THEN 'grain'
    WHEN c.category_description = 'Fruits & Citrus' THEN 'fruit'
    WHEN c.category_description = 'Vegetables & Aromatics' THEN 'vegetable'
    WHEN c.category_description = 'Dairy & Eggs' THEN 'dairy'
    WHEN c.category_description = 'Nuts, Seeds, Fats & Miscellaneous' THEN 'nut_seed'
    ELSE 'other'
  END
FROM public.food_category c
WHERE c.food_category_id = f.food_category_id AND f.food_group IS NULL;

-- cook_ratio for seed foods that were pulled cooked: factor = serving grams / 100 × ratio.
-- Weight servings (oz) convert directly; the four cup-based foods use the gram weights from data/usda/import-log.csv.
UPDATE public.food SET cook_ratio = factor / (serving_size * 28.3495 / 100)
WHERE cook_ratio IS NULL AND unit = 'oz' AND food_group IN ('meat', 'seafood', 'grain');
UPDATE public.food f SET cook_ratio = f.factor / (v.grams / 100)
FROM (VALUES ('Brown Rice', 46.3), ('Couscous', 43.3), ('Chickpeas / Garbanzo Beans', 50.0), ('Lentils', 48.0)) AS v(name, grams)
WHERE f.food_name = v.name AND f.cook_ratio IS NULL;

-- 3. Per-user add limit. No row = the default 10.
CREATE TABLE IF NOT EXISTS public.user_food_quota (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  food_limit integer NOT NULL DEFAULT 10 CHECK (food_limit >= 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.user_food_quota IS 'How many foods each user may add through the AI workflow. Default 10; each admin approval adds 10';

-- 4. Request log + admin queue.
CREATE TABLE IF NOT EXISTS public.food_import_request (
  request_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'food' CHECK (kind IN ('food', 'quota')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'added', 'cancelled', 'pending_admin', 'approved', 'rejected')),
  query text NOT NULL DEFAULT '',
  how_bought text,
  notes text,
  rounds jsonb NOT NULL DEFAULT '[]'::jsonb,
  chosen_fdc_id integer,
  raw_fdc_id integer,
  food_id integer REFERENCES public.food(food_id) ON DELETE SET NULL,
  admin_note text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.food_import_request IS 'One row per AI food-import attempt (search rounds, choice, result) and per request for a bigger add limit. pending_admin rows are the admin queue';
COMMENT ON COLUMN public.food_import_request.rounds IS 'Each search round: the query, the follow-up answer, USDA candidates and the options Claude returned';
CREATE INDEX IF NOT EXISTS food_import_request_user_idx ON public.food_import_request (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS food_import_request_pending_idx ON public.food_import_request (status) WHERE status = 'pending_admin';

-- 5. Access. Users can read their own quota and requests; all writes go through the server (service role)
--    or the admin functions below.
REVOKE ALL ON public.user_food_quota, public.food_import_request FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_food_quota, public.food_import_request TO authenticated;
GRANT ALL ON public.user_food_quota, public.food_import_request TO service_role;
ALTER TABLE public.user_food_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_import_request ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own food quota" ON public.user_food_quota;
CREATE POLICY "Users read their own food quota" ON public.user_food_quota
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users read their own food requests" ON public.food_import_request;
CREATE POLICY "Users read their own food requests" ON public.food_import_request
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 6. Admin queue functions (same pattern as 0008: SECURITY DEFINER + require_kiwi_admin()).
CREATE OR REPLACE FUNCTION public.admin_food_queue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_kiwi_admin();
  RETURN jsonb_build_object(
    'pending', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
      FROM (
        SELECT r.request_id, r.kind, r.query, r.how_bought, r.notes, r.created_at, r.user_id,
               au.email::text AS email,
               trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS name,
               (SELECT count(*) FROM public.food f WHERE f.added_by = r.user_id)::int AS foods_added,
               coalesce((SELECT q.food_limit FROM public.user_food_quota q WHERE q.user_id = r.user_id), 10) AS food_limit,
               (r.rounds -> -1 -> 'options') AS last_options
        FROM public.food_import_request r
        JOIN auth.users au ON au.id = r.user_id
        LEFT JOIN public.users u ON u.user_id = r.user_id
        WHERE r.status = 'pending_admin'
      ) x),
    'flagged_foods', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT f.food_id, f.food_name, f.food_group, f.review_notes, f.fdc_id, f.raw_fdc_id, f.created_at,
               au.email::text AS added_by_email
        FROM public.food f
        LEFT JOIN auth.users au ON au.id = f.added_by
        WHERE f.needs_review
      ) x),
    'recent', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC), '[]'::jsonb)
      FROM (
        SELECT r.request_id, r.kind, r.status, r.query, r.food_id, f.food_name, r.updated_at, au.email::text AS email
        FROM public.food_import_request r
        JOIN auth.users au ON au.id = r.user_id
        LEFT JOIN public.food f ON f.food_id = r.food_id
        WHERE r.status IN ('added', 'approved', 'rejected')
        ORDER BY r.updated_at DESC
        LIMIT 20
      ) x)
  );
END;
$$;

-- Approve or reject a pending request. Approving a quota request adds 10 to the user's limit.
-- Approving a "no good match" food request just closes it (the admin adds the food with the finder,
-- which marks the request 'added' instead).
CREATE OR REPLACE FUNCTION public.admin_resolve_food_request(p_request_id bigint, p_approve boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req public.food_import_request;
BEGIN
  PERFORM public.require_kiwi_admin();
  SELECT * INTO v_req FROM public.food_import_request WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending_admin' THEN
    RAISE EXCEPTION 'That request is no longer waiting for review' USING ERRCODE = 'P0002';
  END IF;

  IF p_approve AND v_req.kind = 'quota' THEN
    INSERT INTO public.user_food_quota (user_id, food_limit, updated_by, updated_at)
    VALUES (v_req.user_id, 20, auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET food_limit = public.user_food_quota.food_limit + 10, updated_by = auth.uid(), updated_at = now();
  END IF;

  UPDATE public.food_import_request
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      admin_note = nullif(trim(coalesce(p_note, '')), ''),
      resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
  WHERE request_id = p_request_id;
END;
$$;

-- Clear the needs_review flag once an admin has checked a new food.
CREATE OR REPLACE FUNCTION public.admin_mark_food_reviewed(p_food_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_kiwi_admin();
  UPDATE public.food SET needs_review = false WHERE food_id = p_food_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_food_queue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_food_request(bigint, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_food_reviewed(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_food_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_food_request(bigint, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_food_reviewed(integer) TO authenticated;
