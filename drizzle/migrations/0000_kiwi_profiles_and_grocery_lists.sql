CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, display_name text NOT NULL DEFAULT '', age integer, height_cm numeric, weight_kg numeric, gender text, activity text NOT NULL DEFAULT 'moderate', goal text NOT NULL DEFAULT 'maintain', budget numeric NOT NULL DEFAULT 75, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.profiles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.pantry_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, food_id text NOT NULL, quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, food_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pantry_items TO authenticated;
GRANT ALL ON public.pantry_items TO service_role;
ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pantry" ON public.pantry_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.trips (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, days integer NOT NULL DEFAULT 7 CHECK (days BETWEEN 1 AND 30), budget numeric NOT NULL DEFAULT 75 CHECK (budget >= 0), status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')), created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trips" ON public.trips FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.trip_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, food_id text NOT NULL, quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0), purchased boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(trip_id, food_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_items TO authenticated;
GRANT ALL ON public.trip_items TO service_role;
ALTER TABLE public.trip_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trip items" ON public.trip_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX trip_items_trip_id_idx ON public.trip_items(trip_id);
CREATE INDEX trips_user_created_idx ON public.trips(user_id, created_at DESC);