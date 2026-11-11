-- This table existed in the hosted database but was absent from the recorded migrations.
CREATE TABLE IF NOT EXISTS public.food_preferences (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  food_id integer NOT NULL REFERENCES public.food(food_id) ON DELETE CASCADE,
  liked boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, food_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_preferences TO authenticated;
GRANT ALL ON public.food_preferences TO service_role;
ALTER TABLE public.food_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own food preferences" ON public.food_preferences;
CREATE POLICY "Users manage own food preferences" ON public.food_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
