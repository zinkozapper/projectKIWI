-- The revision identifies the catalog included in a complete store snapshot, including unmatched foods.
CREATE TABLE IF NOT EXISTS public.price_catalog_revision (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  revision bigint NOT NULL DEFAULT 0
);
INSERT INTO public.price_catalog_revision (singleton) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.price_catalog_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_catalog_revision FROM anon, authenticated;
GRANT ALL ON public.price_catalog_revision TO service_role;
ALTER TABLE public.price_store_refresh ADD COLUMN IF NOT EXISTS catalog_revision bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.price_catalog_food_added() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.price_catalog_revision SET revision = revision + 1 WHERE singleton;
  -- Do not bypass backoff after an API failure. In-flight jobs detect the changed request time.
  UPDATE public.price_refresh_queue SET requested_at = clock_timestamp(),
    next_attempt_at = CASE WHEN last_error IS NULL THEN least(next_attempt_at, now()) ELSE next_attempt_at END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.price_catalog_food_added() FROM PUBLIC;
DROP TRIGGER IF EXISTS price_catalog_food_added ON public.food;
CREATE TRIGGER price_catalog_food_added AFTER INSERT ON public.food
FOR EACH STATEMENT EXECUTE FUNCTION public.price_catalog_food_added();

-- Expose only the freshness of the signed-in user's store, not queue or profile data.
CREATE OR REPLACE FUNCTION public.my_price_snapshot_at() RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(r.completed_at, (SELECT min(p.fetched_at) FROM public.food_price p WHERE p.location_id = z.location_id))
  FROM public.zip_store z
  LEFT JOIN public.price_store_refresh r ON r.location_id = z.location_id
  WHERE auth.uid() IS NOT NULL
    AND z.zip_code = coalesce((SELECT zip_code FROM public.profiles WHERE user_id = auth.uid()), '84601');
$$;
REVOKE ALL ON FUNCTION public.my_price_snapshot_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_price_snapshot_at() TO authenticated;
