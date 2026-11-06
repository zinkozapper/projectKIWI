-- OKR 2 key result: nutrient goal achievement % and its history (migration 0007).
-- Run in the Supabase SQL editor (it runs as postgres, so it sees every user's rows past RLS).
-- A pantry "meets its goals" when what it holds per day covers 100% of every daily nutrient target.

-- 1. The headline numbers today: % of users whose pantry meets every target, average share of
--    nutrients met, and the split by users whose pantry holds a food they added from a recommendation.
SELECT * FROM analytics.nutrient_goal_rate();

-- 2. Which nutrients pantries fall short on most (lowest met_pct first).
SELECT * FROM analytics.nutrient_goal_by_nutrient() ORDER BY met_pct NULLS FIRST, nutrient;

-- 3. Daily history written by the pg_cron job at 00:25 UTC.
SELECT as_of, goal_met_pct, goal_met_users, tracked_users, avg_achievement_pct,
       goal_met_pct_with_recs, goal_met_pct_without_recs
FROM analytics.nutrient_goal_daily
WHERE window_days = 30
ORDER BY as_of DESC
LIMIT 30;

-- 4. When each user's pantry first met all its goals, and whether a recommendation was in it then.
SELECT u.email, first_met.created_at AS first_met_at,
       cardinality(first_met.recommended_food_ids) > 0 AS had_recommended_food,
       (SELECT count(*) FROM public.nutrient_profile_snapshot s
        WHERE s.user_id = first_met.user_id AND s.created_at < first_met.created_at) AS changes_before
FROM (
  SELECT DISTINCT ON (user_id) * FROM public.nutrient_profile_snapshot
  WHERE goal_met ORDER BY user_id, created_at
) first_met
JOIN auth.users u ON u.id = first_met.user_id
ORDER BY first_met.created_at DESC;

-- 5. One user's history (swap in an email).
SELECT s.created_at, s.nutrients_met, s.nutrients_total, s.achievement_pct, s.avg_coverage_pct, s.goal_met,
       cardinality(s.pantry_food_ids) AS pantry_foods, cardinality(s.recommended_food_ids) AS from_recs
FROM public.nutrient_profile_snapshot s
JOIN auth.users u ON u.id = s.user_id
WHERE u.email = 'you@example.com'
ORDER BY s.created_at DESC;

-- 6. Recompute today's daily row now instead of waiting for pg_cron.
-- SELECT analytics.record_nutrient_goal_snapshot();
