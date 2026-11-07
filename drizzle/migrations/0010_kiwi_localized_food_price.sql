-- Localized food prices (Kroger Products API).
--
-- How it fits together:
--   profiles.zip_code      Where the user shops. Defaults to downtown Provo (84601).
--   kroger_store           Kroger-family stores we have priced (Smith's in Utah).
--   zip_store              Nearest priced store for each ZIP, so prices are fetched per store, not per user.
--   food_price             One row per food per store: the chosen product, its regular package price,
--                          and that price scaled to the food's serving (same serving the nutrients use).
--   food.price             Stays as the default price per serving (the Provo store). The app falls back
--                          to it when a user's ZIP has no store priced yet.
--
-- Prices are filled by scripts/kroger (see docs/kroger-price-selection-rules.md). The app can read
-- them; only the service role writes them. Safe to run more than once.

-- 1. ZIP on the profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS zip_code text NOT NULL DEFAULT '84601';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_zip_code_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_zip_code_check CHECK (zip_code ~ '^[0-9]{5}$');
COMMENT ON COLUMN public.profiles.zip_code IS '5-digit ZIP where the user shops; picks the store whose prices they see. Default 84601 (downtown Provo)';

-- 2. Stores
CREATE TABLE IF NOT EXISTS public.kroger_store (
  location_id text PRIMARY KEY,
  chain text,
  name text NOT NULL,
  address text,
  city text,
  state text,
  zip_code text,
  latitude numeric,
  longitude numeric,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.kroger_store IS 'Kroger-family stores (Smith''s in Utah) whose prices are in food_price';

-- 3. ZIP -> nearest store
CREATE TABLE IF NOT EXISTS public.zip_store (
  zip_code text PRIMARY KEY CHECK (zip_code ~ '^[0-9]{5}$'),
  location_id text NOT NULL REFERENCES public.kroger_store(location_id) ON DELETE CASCADE,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.zip_store IS 'Nearest Kroger-family store for a ZIP, found with the Kroger Locations API';

-- 4. Prices
CREATE TABLE IF NOT EXISTS public.food_price (
  food_id integer NOT NULL REFERENCES public.food(food_id) ON DELETE CASCADE,
  location_id text NOT NULL REFERENCES public.kroger_store(location_id) ON DELETE CASCADE,
  product_id text NOT NULL,
  upc text,
  brand text,
  description text,
  package_size text,
  sold_by text,
  package_price numeric(10,2) NOT NULL CHECK (package_price > 0),
  package_grams numeric,
  serving_grams numeric NOT NULL CHECK (serving_grams > 0),
  price_per_serving numeric(10,4) NOT NULL CHECK (price_per_serving >= 0),
  store_brand boolean NOT NULL DEFAULT true,
  flags text,
  source text NOT NULL DEFAULT 'kroger',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (food_id, location_id)
);
CREATE INDEX IF NOT EXISTS food_price_location_idx ON public.food_price (location_id);
COMMENT ON TABLE public.food_price IS 'Regular (non-sale) price of each food at each store, per package and scaled to the food''s serving';
COMMENT ON COLUMN public.food_price.price_per_serving IS 'package_price * serving_grams / package_grams (or per each for unit-sold items)';

-- 5. Access: anyone signed in (or not) can read prices; only the service role writes.
ALTER TABLE public.kroger_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zip_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_price ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kroger_store_read ON public.kroger_store;
CREATE POLICY kroger_store_read ON public.kroger_store FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS zip_store_read ON public.zip_store;
CREATE POLICY zip_store_read ON public.zip_store FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS food_price_read ON public.food_price;
CREATE POLICY food_price_read ON public.food_price FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.kroger_store, public.zip_store, public.food_price FROM anon, authenticated;
GRANT SELECT ON public.kroger_store, public.zip_store, public.food_price TO anon, authenticated;
GRANT ALL ON public.kroger_store, public.zip_store, public.food_price TO service_role;
