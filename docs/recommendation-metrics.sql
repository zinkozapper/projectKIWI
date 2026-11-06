-- OKR 1 key result: % of shown recommendations that get added to the shopping list.
-- Run in the Supabase SQL editor (it runs as postgres, so it sees every user's rows past RLS).
-- add rate = impressions with an 'added' event / impressions with a 'shown' event.

-- 1. Overall, last 30 days
SELECT
  count(*) AS shown,
  count(a.impression_id) AS added,
  round(100.0 * count(a.impression_id) / NULLIF(count(*), 0), 1) AS add_rate_pct
FROM public.recommendation_event s
LEFT JOIN public.recommendation_event a
  ON a.impression_id = s.impression_id AND a.event_type = 'added'
WHERE s.event_type = 'shown'
  AND s.created_at >= now() - interval '30 days';

-- 2. By recommendation source (nutrient_gap = Suggestions card, pairing = "Pairs well with")
SELECT
  s.source,
  count(*) AS shown,
  count(a.impression_id) AS added,
  round(100.0 * count(a.impression_id) / NULLIF(count(*), 0), 1) AS add_rate_pct
FROM public.recommendation_event s
LEFT JOIN public.recommendation_event a
  ON a.impression_id = s.impression_id AND a.event_type = 'added'
WHERE s.event_type = 'shown'
GROUP BY s.source
ORDER BY s.source;

-- 3. Weekly trend, to see whether recommendation changes move the number
SELECT
  date_trunc('week', s.created_at)::date AS week,
  count(*) AS shown,
  count(a.impression_id) AS added,
  round(100.0 * count(a.impression_id) / NULLIF(count(*), 0), 1) AS add_rate_pct
FROM public.recommendation_event s
LEFT JOIN public.recommendation_event a
  ON a.impression_id = s.impression_id AND a.event_type = 'added'
WHERE s.event_type = 'shown'
GROUP BY 1
ORDER BY 1;

-- 4. Optional follow-through: of the added recommendations, how many were later checked off as bought
SELECT
  count(*) AS added,
  count(*) FILTER (WHERE i.is_purchased) AS purchased,
  round(100.0 * count(*) FILTER (WHERE i.is_purchased) / NULLIF(count(*), 0), 1) AS purchased_pct
FROM public.recommendation_event a
JOIN public.shopping_list_item i ON i.shopping_list_item_id = a.shopping_list_item_id
WHERE a.event_type = 'added';
