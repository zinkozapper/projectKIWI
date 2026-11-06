-- OKR 4 key result: churn %. Run in the Supabase SQL editor (it runs as postgres, so it can read
-- the analytics schema, which the app's API can't).
-- Definitions live in drizzle/migrations/0004_kiwi_login_activity_churn.sql:
--   active day = sign-up, sign-in, or app open (one per user per UTC day)
--   inactive   = no active day in the last 30 days
--   churn %    = users active in the previous 30 days who had no activity in the last 30 days
--                / users active in the previous 30 days

-- 1. Churn % right now (30-day window)
SELECT * FROM analytics.churn_rate();

-- 2. Same, with a shorter window. Grocery trips are roughly weekly, so 14 days is a stricter test.
SELECT * FROM analytics.churn_rate(p_window_days => 14);

-- 3. The daily history the scheduled job saved (one row per day, newest first)
SELECT as_of, base_users, churned_users, churn_pct, inactive_users, total_users
FROM analytics.churn_snapshot
WHERE window_days = 30
ORDER BY as_of DESC
LIMIT 60;

-- 4. Weekly trend, recomputed from the login table (works even for days before the job existed)
SELECT c.*
FROM generate_series(current_date - 84, current_date, interval '7 days') AS d,
     LATERAL analytics.churn_rate(d::date) c
ORDER BY c.as_of;

-- 5. Who is inactive, longest gone first (for a win-back list)
SELECT email, signed_up_at::date, last_active_date, days_inactive
FROM analytics.user_status_now
WHERE status = 'inactive'
ORDER BY days_inactive DESC NULLS FIRST;

-- 6. Active vs inactive count
SELECT status, count(*) FROM analytics.user_status_now GROUP BY status;

-- 7. Is the daily job scheduled, and did it run?
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'kiwi-churn-snapshot';
SELECT status, start_time, return_message FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'kiwi-churn-snapshot')
ORDER BY start_time DESC LIMIT 5;
