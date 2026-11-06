-- Admin dashboard: who is an admin, and the read-only functions the admin page calls.
--
-- How access works:
--   public.app_admin lists admin accounts. The app can't read or change it directly (RLS on, no
--   policies, no grants). Everything goes through the functions below, which run as the owner
--   (SECURITY DEFINER) and check public.is_kiwi_admin() first, so a non-admin calling them from the
--   browser gets "Admins only" (error 42501) and no data.
--   The OKR numbers come from the analytics schema built in 0004, 0005 and 0007, plus
--   recommendation_event from 0003. That schema stays private; only these wrappers are exposed.
--
-- Make the first admin in the SQL editor (it runs as postgres, so RLS doesn't apply):
--   INSERT INTO public.app_admin (user_id, note)
--   SELECT id, 'first admin' FROM auth.users WHERE email = 'you@example.com'
--   ON CONFLICT (user_id) DO NOTHING;
-- After that, admins can make other admins from the admin page.

-- 1. The admin list.
CREATE TABLE IF NOT EXISTS public.app_admin (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text
);
COMMENT ON TABLE public.app_admin IS 'Accounts that can open the admin dashboard. Read and changed only through the admin_* functions';

REVOKE ALL ON public.app_admin FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_admin TO service_role;
ALTER TABLE public.app_admin ENABLE ROW LEVEL SECURITY;

-- 2. Is the signed-in user an admin? The app calls this after login to decide whether to show the
--    Admin button. It only ever answers for the caller.
CREATE OR REPLACE FUNCTION public.is_kiwi_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_admin a WHERE a.user_id = auth.uid());
$$;

-- Internal guard used by every admin_* function. Not callable from the app.
CREATE OR REPLACE FUNCTION public.require_kiwi_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_kiwi_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- 3. Everything the dashboard's OKR section shows, in one call.
--    okr1 = recommendation add rate (same math as docs/recommendation-metrics.sql)
--    okr2 = analytics.nutrient_goal_rate() (pantries that cover every daily nutrient target)
--    okr3 = analytics.login_frequency_rate() (2+ logon days in the window)
--    okr4 = analytics.churn_rate()
--    *_history = the daily snapshots the pg_cron jobs write, newest first
CREATE OR REPLACE FUNCTION public.admin_dashboard(p_window_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_as_of date := (now() AT TIME ZONE 'UTC')::date;
  v_window int := greatest(1, least(coalesce(p_window_days, 30), 365));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_window_days, 30), 365)));
  v_result jsonb;
BEGIN
  PERFORM public.require_kiwi_admin();

  SELECT jsonb_build_object(
    'as_of', v_as_of,
    'window_days', v_window,

    'okr1', (
      SELECT jsonb_build_object(
        'shown', count(*),
        'added', count(a.impression_id),
        'add_rate_pct', round(100.0 * count(a.impression_id) / NULLIF(count(*), 0), 1))
      FROM public.recommendation_event s
      LEFT JOIN public.recommendation_event a ON a.impression_id = s.impression_id AND a.event_type = 'added'
      WHERE s.event_type = 'shown' AND s.created_at >= v_since),

    'okr1_by_source', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.source), '[]'::jsonb)
      FROM (
        SELECT s.source::text AS source, count(*) AS shown, count(a.impression_id) AS added,
               round(100.0 * count(a.impression_id) / NULLIF(count(*), 0), 1) AS add_rate_pct
        FROM public.recommendation_event s
        LEFT JOIN public.recommendation_event a ON a.impression_id = s.impression_id AND a.event_type = 'added'
        WHERE s.event_type = 'shown' AND s.created_at >= v_since
        GROUP BY s.source
      ) x),

    'okr1_weekly', (
      SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.week DESC), '[]'::jsonb)
      FROM (
        SELECT date_trunc('week', s.created_at)::date AS week, count(*) AS shown, count(a.impression_id) AS added,
               round(100.0 * count(a.impression_id) / NULLIF(count(*), 0), 1) AS add_rate_pct
        FROM public.recommendation_event s
        LEFT JOIN public.recommendation_event a ON a.impression_id = s.impression_id AND a.event_type = 'added'
        WHERE s.event_type = 'shown' AND s.created_at >= now() - interval '12 weeks'
        GROUP BY 1
      ) w),

    'okr2', (SELECT to_jsonb(r) FROM analytics.nutrient_goal_rate(v_as_of, v_window) r),

    'okr2_by_nutrient', (
      SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.met_pct NULLS FIRST, n.nutrient), '[]'::jsonb)
      FROM analytics.nutrient_goal_by_nutrient(v_as_of) n),

    'okr2_history', (
      SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.as_of DESC), '[]'::jsonb)
      FROM (
        SELECT g.as_of, g.goal_met_pct, g.goal_met_users, g.tracked_users, g.avg_achievement_pct
        FROM analytics.nutrient_goal_daily g
        WHERE g.window_days = 30
        ORDER BY g.as_of DESC LIMIT 30
      ) h),

    'okr3', (SELECT to_jsonb(r) FROM analytics.login_frequency_rate(v_as_of, v_window, 2) r),

    'okr3_history', (
      SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.as_of DESC), '[]'::jsonb)
      FROM (
        SELECT f.as_of, f.frequent_pct, f.frequent_users, f.eligible_users, f.avg_logon_days
        FROM analytics.login_frequency_snapshot f
        WHERE f.window_days = 30 AND f.min_days = 2
        ORDER BY f.as_of DESC LIMIT 30
      ) h),

    'okr4', (SELECT to_jsonb(c) FROM analytics.churn_rate(v_as_of, v_window) c),

    'okr4_history', (
      SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.as_of DESC), '[]'::jsonb)
      FROM (
        SELECT c.as_of, c.churn_pct, c.churned_users, c.base_users, c.total_users, c.inactive_users
        FROM analytics.churn_snapshot c
        WHERE c.window_days = 30
        ORDER BY c.as_of DESC LIMIT 30
      ) h),

    'users', (
      SELECT jsonb_build_object(
        'total', count(*),
        'active', count(*) FILTER (WHERE u.status = 'active'),
        'inactive', count(*) FILTER (WHERE u.status = 'inactive'),
        'new_in_window', count(*) FILTER (WHERE u.signed_up_at >= v_since))
      FROM analytics.user_status(v_window, v_as_of) u),

    'admins', (SELECT count(*) FROM public.app_admin)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 4. Every account with its activity, for the user table on the admin page.
CREATE OR REPLACE FUNCTION public.admin_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  signed_up_at timestamptz,
  last_sign_in_at timestamptz,
  last_active_date date,
  days_inactive int,
  status text,
  logon_days int,
  tier text,
  is_admin boolean,
  has_profile boolean,
  trips_completed int,
  recs_added int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public.require_kiwi_admin();

  RETURN QUERY
  SELECT s.user_id,
         s.email,
         coalesce(u.first_name, '')::text,
         coalesce(u.last_name, '')::text,
         s.signed_up_at,
         au.last_sign_in_at,
         s.last_active_date,
         s.days_inactive,
         s.status,
         coalesce(f.logon_days, 0),
         coalesce(f.tier, 'inactive'),
         a.user_id IS NOT NULL,
         EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = s.user_id),
         (SELECT count(*) FROM public.shopping_list l WHERE l.user_id = s.user_id AND l.status = 'completed')::int,
         (SELECT count(*) FROM public.recommendation_event r WHERE r.user_id = s.user_id AND r.event_type = 'added')::int
  FROM analytics.user_status() s
  JOIN auth.users au ON au.id = s.user_id
  LEFT JOIN analytics.login_frequency() f ON f.user_id = s.user_id
  LEFT JOIN public.users u ON u.user_id = s.user_id
  LEFT JOIN public.app_admin a ON a.user_id = s.user_id
  ORDER BY s.signed_up_at DESC;
END;
$$;

-- 5. Make someone an admin, or take it away. An admin can't remove their own access, so the
--    last admin can't lock everyone out by accident.
CREATE OR REPLACE FUNCTION public.admin_set_admin(p_user_id uuid, p_is_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_kiwi_admin();

  IF p_is_admin THEN
    INSERT INTO public.app_admin (user_id, granted_by) VALUES (p_user_id, auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    IF p_user_id = auth.uid() THEN
      RAISE EXCEPTION 'You can''t remove your own admin access' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.app_admin WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- 6. Recompute today's churn, login frequency and nutrient goal snapshots now instead of waiting for pg_cron.
CREATE OR REPLACE FUNCTION public.admin_refresh_snapshots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_kiwi_admin();
  PERFORM analytics.record_churn_snapshot();
  PERFORM analytics.record_login_frequency_snapshot();
  PERFORM analytics.record_nutrient_goal_snapshot();
END;
$$;

-- 7. Who may call what. Supabase grants new functions to anon by default, so take that back.
REVOKE ALL ON FUNCTION public.is_kiwi_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.require_kiwi_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dashboard(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_admin(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_refresh_snapshots() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_kiwi_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_admin(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refresh_snapshots() TO authenticated;
