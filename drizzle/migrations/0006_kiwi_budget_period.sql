-- Budget per time period. The budget amount (profiles.budget) now applies to a repeating period:
-- every 1, 2 or 4 weeks, counted from budget_period_start. The app works out the current period
-- and adds up what was bought in it (items checked off on trips finished inside the period, plus
-- what is in the cart on the current trip), so the budget resets on its own each period.
-- Before this, the period choice was only kept in the browser and never reset spending.
-- Safe to run more than once.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS budget_period_weeks smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS budget_period_start date NOT NULL DEFAULT current_date;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_budget_period_weeks_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_budget_period_weeks_check CHECK (budget_period_weeks IN (1, 2, 4));

COMMENT ON COLUMN public.profiles.budget IS 'Grocery budget in dollars for one budget period';
COMMENT ON COLUMN public.profiles.budget_period_weeks IS 'Length of a budget period in weeks: 1, 2 or 4 (shown as 1 month)';
COMMENT ON COLUMN public.profiles.budget_period_start IS 'First day of the first budget period; periods repeat from here';
