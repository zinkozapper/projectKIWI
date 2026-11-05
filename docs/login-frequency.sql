-- OKR 3 key result: % of users who log on at least twice a month. Run in the Supabase SQL editor.
-- Definitions live in drizzle/migrations/0005_kiwi_login_frequency.sql:
--   logon day = a UTC day with a sign-in or app open (several logons on one day count once)
--   frequent  = 2+ logon days in the last 30 days (the OKR 3 "active" user)
--   light     = 1 logon day, inactive = 0 (the same users OKR 4 marks inactive)

-- 1. The OKR 3 number right now (rolling 30 days)
SELECT * FROM analytics.login_frequency_rate();

-- 2. Each user's logon days and tier, most frequent first
SELECT email, logon_days, sign_ins, tier
FROM analytics.login_frequency_now
ORDER BY logon_days DESC, email;

-- 3. By calendar month: % of users who logged on 2+ days that month.
--    The denominator is every user who had signed up by the end of that month.
WITH months AS (
  SELECT generate_series(date_trunc('month', min(created_at)), date_trunc('month', now()), interval '1 month')::date AS month
  FROM auth.users
)
SELECT m.month,
       count(u.id) AS users,
       count(f.user_id) FILTER (WHERE f.meets_target) AS twice_or_more,
       round(100.0 * count(f.user_id) FILTER (WHERE f.meets_target) / NULLIF(count(u.id), 0), 1) AS pct_twice_or_more
FROM months m
JOIN auth.users u ON u.created_at < m.month + interval '1 month'
LEFT JOIN analytics.login_frequency_monthly f ON f.user_id = u.id AND f.month = m.month
GROUP BY m.month
ORDER BY m.month;

-- 4. The daily history the scheduled job saved
SELECT as_of, eligible_users, frequent_users, light_users, inactive_users, frequent_pct, avg_logon_days
FROM analytics.login_frequency_snapshot
WHERE window_days = 30 AND min_days = 2
ORDER BY as_of DESC
LIMIT 60;

-- 5. Is the daily job scheduled?
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'kiwi-%';
