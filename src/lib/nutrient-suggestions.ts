import { NUTRIENT_PRIORITY, nutrientLabels, type Food, type NutrientKey, type Nutrients } from './foods';
import { MIN_BOOST_PERCENT, nutrientBoosts, type NutrientBoost } from './recommendation-boosts';

// Suggestions work through nutrition gaps one nutrient at a time, in NUTRIENT_PRIORITY order
// ("Suggestions for vitamin A", then zinc, ...). Within one nutrient, foods that also fill other
// gaps rank higher. A user can pick a nutrient to focus on; after they add a suggestion the plan
// goes back to the priority order.

export type FoodSuggestion = { food: Food; score: number; boosts: NutrientBoost[]; addCost: number; fitsBudget: boolean };

export type SuggestionInput = {
  available: Food[]; // foods not already on the list or in the pantry
  daily: Nutrients; // daily targets
  combined: Nutrients; // pantry + list totals for the whole plan
  days: number;
  preferences: Record<string, boolean | undefined>;
  chosen: NutrientKey | null; // nutrient the user asked about, if any
  addCostOf: (food: Food) => number; // price × days; 0 = unknown
  budgetRemaining: number;
  count?: number;
};

export type SuggestionResult = {
  nutrient: NutrientKey | null; // the nutrient these suggestions are for
  label: string;
  chosen: boolean; // true when the user picked the nutrient
  suggestions: FoodSuggestion[];
  // Every available food scored against the open gaps in priority order (pairing cards use it for chips).
  gapScores: FoodSuggestion[];
  openGaps: NutrientKey[];
};

const OTHER_GAP_WEIGHT = 0.35; // how much filling other gaps counts next to the focus nutrient
const OTHER_GAPS_CONSIDERED = 6;

export function nutrientGap(k: NutrientKey, daily: Nutrients, combined: Nutrients, days: number) {
  const target = daily[k];
  const intake = combined[k] / Math.max(1, days);
  return { target, intake, remaining: Math.max(0, target - intake) };
}

export function rankSuggestions(input: SuggestionInput): SuggestionResult {
  const { available, daily, combined, days, preferences, chosen, addCostOf, budgetRemaining, count = 3 } = input;
  const gap = (k: NutrientKey) => nutrientGap(k, daily, combined, days);
  const openGaps = NUTRIENT_PRIORITY.filter(k => daily[k] > 0 && gap(k).remaining > 0);

  // How much one serving a day of food closes gap k: 0..1 of what's still missing, weighted by how big the gap is.
  const fillOf = (food: Food, k: NutrientKey) => {
    const { target, remaining } = gap(k);
    const amount = Math.max(0, Number(food.nutrition[k]) || 0);
    const percentage = remaining > 0 ? Math.min(100, Math.round(amount / remaining * 100)) : 0;
    const impact = remaining > 0 ? (remaining / target) * Math.min(amount / remaining, 1) : 0;
    return { key: k, amount, percentage, impact };
  };
  const preferenceWeight = (food: Food) => (preferences[food.id] === true ? 1.25 : preferences[food.id] === false ? 0.75 : 1);
  const withBudget = (food: Food, score: number, boosts: NutrientBoost[]): FoodSuggestion => {
    const addCost = addCostOf(food);
    // Unknown price (0): fits while there's budget left.
    const fitsBudget = addCost > 0 ? addCost <= budgetRemaining : budgetRemaining > 0;
    return { food, score, boosts, addCost, fitsBudget };
  };
  const knownCosts = available.map(addCostOf).filter(c => c > 0).sort((a, b) => a - b);
  const typicalCost = knownCosts[Math.floor(knownCosts.length / 2)] || 1;
  // Suggestions never disappear for budget reasons: foods that fit come first by score, the rest by score per dollar.
  const byBudgetThenScore = (a: FoodSuggestion, b: FoodSuggestion) => {
    if (a.fitsBudget !== b.fitsBudget) return a.fitsBudget ? -1 : 1;
    return a.fitsBudget ? b.score - a.score : b.score / (b.addCost || typicalCost) - a.score / (a.addCost || typicalCost);
  };

  const topGaps = openGaps.slice(0, OTHER_GAPS_CONSIDERED);
  const gapScores = available
    .map(food => {
      const fills = topGaps.slice(0, 4).map(k => fillOf(food, k)).filter(g => g.impact > 0).sort((a, b) => b.impact - a.impact);
      const score = fills.reduce((t, g) => t + g.impact, 0) * preferenceWeight(food);
      return withBudget(food, score, nutrientBoosts(fills));
    })
    .filter(s => s.score > 0 && s.boosts.length > 0)
    .sort(byBudgetThenScore);

  // Score foods for one nutrient. If the chosen nutrient is already met, rank by share of the daily target instead.
  const forNutrient = (k: NutrientKey): FoodSuggestion[] => {
    const met = gap(k).remaining <= 0;
    return available
      .map(food => {
        const amount = Math.max(0, Number(food.nutrition[k]) || 0);
        const main = met
          ? { key: k, amount, percentage: Math.min(100, Math.round(amount / daily[k] * 100)), impact: Math.min(amount / daily[k], 1) }
          : fillOf(food, k);
        if (main.percentage < MIN_BOOST_PERCENT) return null;
        const others = topGaps.filter(o => o !== k).map(o => fillOf(food, o)).filter(g => g.impact > 0).sort((a, b) => b.impact - a.impact);
        const fill = met ? main.impact : Math.min(main.amount / gap(k).remaining, 1);
        const score = (fill + OTHER_GAP_WEIGHT * others.reduce((t, g) => t + g.impact, 0)) * preferenceWeight(food);
        return withBudget(food, score, [...nutrientBoosts([main]), ...nutrientBoosts(others)].slice(0, 3));
      })
      .filter((s): s is FoodSuggestion => !!s)
      .sort(byBudgetThenScore)
      .slice(0, count);
  };

  if (chosen && daily[chosen] > 0) {
    return { nutrient: chosen, label: nutrientLabels[chosen], chosen: true, suggestions: forNutrient(chosen), gapScores, openGaps };
  }
  // Priority order: the first open gap that some available food can meaningfully help with.
  for (const k of openGaps) {
    const list = forNutrient(k);
    if (list.length) return { nutrient: k, label: nutrientLabels[k], chosen: false, suggestions: list, gapScores, openGaps };
  }
  return { nutrient: null, label: '', chosen: false, suggestions: [], gapScores, openGaps };
}
