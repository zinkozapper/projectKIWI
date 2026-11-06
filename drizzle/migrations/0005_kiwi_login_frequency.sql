-- OKR 3 (retention): track how often users log on. Builds on 0004's user_login_events table.
--
-- Definitions:
--   logon day = a UTC day with at least one sign-in or app open (analytics.user_active_day from 0004).
--               Counting days, not rows, means signing in three times in one afternoon is one logon.
--               App opens count too: "Remember me" users rarely sign in again but still use the app.
--   frequency tiers over a window (default the last 30 days, minimum 2 logon days):
--     frequent = 2+ logon days   (the OKR 3 "active" user)
--     light    = exactly 1 day
--     inactive = 0 days          (the same users OKR 4 marks inactive, so the two OKRs line up)
--   monthly view = the same count per calendar month, for "logged on twice in October" questions.

-- 1. Logons per user per calendar month. Only months with at least one logon appear here.
CREATE OR REPLACE VIEW analytics.login_frequency_monthly AS
SELECT d.user_id,
       date_trunc('month', d.active_date)::date AS month,
       count(*)::int AS logon_days,
       count(*) >= 2 AS meets_target
FROM analytics.user_active_day d
GROUP BY d.user_id, date_trunc('month', d.active_date);

-- 2. Every user's logon days and sign-ins over a rolling window, with a frequency tier.
CREATE OR REPLACE FUNCTION analytics.login_frequency(
  p_as_of date DEFAULT (now() AT TIME ZONE 'UTC')::date,
  p_window_days int DEFAULT 30,
  p_min_days int DEFAULT 2)
RETURNS TABLE (user_id uuid, email text, signed_up_at timestamptz, logon_days int, sign_ins int, tier text)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT u.id, u.email::text, u.created_at,
         coalesce(d.days, 0)::int,
         coalesce(s.sign_ins, 0)::int,
         CASE WHEN coalesce(d.days, 0) >= p_min_days THEN 'frequent'
              WHEN coalesce(d.days, 0) >= 1 THEN 'light'
              ELSE 'inactive' END
  FROM auth.users u
  LEFT JOIN LATERAL (
    SELECT count(*) AS days FROM analytics.user_active_day a
    WHERE a.user_id = u.id AND a.active_date > p_as_of - p_window_days AND a.active_date <= p_as_of
  ) d ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS sign_ins FROM public.user_login_events e
    WHERE e.user_id = u.id AND e.event_type = 'sign_in'
      AND (e.created_at AT TIME ZONE 'UTC')::date > p_as_of - p_window_days
      AND (e.created_at AT TIME ZONE 'UTC')::date <= p_as_of
  ) s ON true
  WHERE (u.created_at AT TIME ZONE 'UTC')::date <= p_as_of;
$$;

CREATE OR REPLACE VIEW analytics.login_frequency_now AS SELECT * FROM analytics.login_frequency();

-- 3. The OKR 3 number: % of users with 2+ logon days in the window.
--    Users who signed up less than p_min_days days ago haven't had the chance to log on twice yet,
--    so they're left out of the % (and counted as too_new_users) instead of dragging it down.
CREATE OR REPLACE FUNCTION analytics.login_frequency_rate(
  p_as_of date DEFAULT (now() AT TIME ZONE 'UTC')::date,
  p_window_days int DEFAULT 30,
  p_min_days int DEFAULT 2)
RETURNS TABLE (as_of date, window_days int, min_days int, eligible_users int, frequent_users int,
               light_users int, inactive_users int, frequent_pct numeric, avg_logon_days numeric, too_new_users int)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH f AS (
    SELECT f.*, (f.signed_up_at AT TIME ZONE 'UTC')::date > p_as_of - p_min_days AS too_new
    FROM analytics.login_frequency(p_as_of, p_window_days, p_min_days) f
  )
  SELECT p_as_of, p_window_days, p_min_days,
         count(*) FILTER (WHERE NOT too_new)::int,
         count(*) FILTER (WHERE NOT too_new AND tier = 'frequent')::int,
         count(*) FILTER (WHERE NOT too_new AND tier = 'light')::int,
         count(*) FILTER (WHERE NOT too_new AND tier = 'inactive')::int,
         round(100.0 * count(*) FILTER (WHERE NOT too_new AND tier = 'frequent')
               / NULLIF(count(*) FILTER (WHERE NOT too_new), 0), 1),
         round(avg(logon_days) FILTER (WHERE NOT too_new), 2),
         count(*) FILTER (WHERE too_new)::int
  FROM f;
$$;

-- 4. Daily snapshot, like churn_snapshot in 0004.
CREATE TABLE IF NOT EXISTS analytics.login_frequency_snapshot (
  as_of date NOT NULL,
  window_days int NOT NULL,
  min_days int NOT NULL,
  eligible_users int NOT NULL,
  frequent_users int NOT NULL,
  light_users int NOT NULL,
  inactive_users int NOT NULL,
  frequent_pct numeric,
  avg_logon_days numeric,
  too_new_users int NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (as_of, window_days, min_days)
);
ALTER TABLE analytics.login_frequency_snapshot ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION analytics.record_login_frequency_snapshot(
  p_as_of date DEFAULT (now() AT TIME ZONE 'UTC')::date,
  p_window_days int DEFAULT 30,
  p_min_days int DEFAULT 2)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO analytics.login_frequency_snapshot
    (as_of, window_days, min_days, eligible_users, frequent_users, light_users, inactive_users,
     frequent_pct, avg_logon_days, too_new_users)
  SELECT r.as_of, r.window_days, r.min_days, r.eligible_users, r.frequent_users, r.light_users,
         r.inactive_users, r.frequent_pct, r.avg_logon_days, r.too_new_users
  FROM analytics.login_frequency_rate(p_as_of, p_window_days, p_min_days) r
  ON CONFLICT (as_of, window_days, min_days) DO UPDATE SET
    eligible_users = EXCLUDED.eligible_users, frequent_users = EXCLUDED.frequent_users,
    light_users = EXCLUDED.light_users, inactive_users = EXCLUDED.inactive_users,
    frequent_pct = EXCLUDED.frequent_pct, avg_logon_days = EXCLUDED.avg_logon_days,
    too_new_users = EXCLUDED.too_new_users, computed_at = now();
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA analytics FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA analytics FROM PUBLIC, anon, authenticated;

SELECT analytics.record_login_frequency_snapshot();

-- 5. Run it every day at 00:20 UTC, five minutes after the churn snapshot.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('kiwi-login-frequency-snapshot', '20 0 * * *', 'SELECT analytics.record_login_frequency_snapshot()');
  ELSE
    RAISE NOTICE 'pg_cron is not enabled; run SELECT analytics.record_login_frequency_snapshot() yourself or schedule it elsewhere';
  END IF;
END;
$$;
