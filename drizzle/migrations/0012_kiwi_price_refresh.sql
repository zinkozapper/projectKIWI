-- A ZIP is queued once; the worker serializes all store refreshes with an advisory lock.
CREATE TABLE IF NOT EXISTS public.price_refresh_queue (
  zip_code text PRIMARY KEY CHECK (zip_code ~ '^[0-9]{5}$'),
  requested_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text
);
ALTER TABLE public.price_refresh_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_refresh_queue FROM anon, authenticated;
GRANT ALL ON public.price_refresh_queue TO service_role;
CREATE TABLE IF NOT EXISTS public.price_store_refresh (
  location_id text PRIMARY KEY REFERENCES public.kroger_store(location_id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL
);
ALTER TABLE public.price_store_refresh ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_store_refresh FROM anon, authenticated;
GRANT ALL ON public.price_store_refresh TO service_role;

-- Only the signed-in user's saved ZIP may be queued. Repeated opens cannot bypass retry delays.
CREATE OR REPLACE FUNCTION public.request_price_refresh() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.price_refresh_queue (zip_code)
  SELECT coalesce((SELECT zip_code FROM public.profiles WHERE user_id = auth.uid()), '84601')
  WHERE auth.uid() IS NOT NULL
  ON CONFLICT (zip_code) DO UPDATE SET requested_at = now()
  WHERE price_refresh_queue.completed_at < now() - interval '30 days'
    AND price_refresh_queue.next_attempt_at <= now();
$$;
REVOKE ALL ON FUNCTION public.request_price_refresh() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_price_refresh() TO authenticated;
