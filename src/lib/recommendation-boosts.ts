import { nutrientLabels, type NutrientKey } from '@/lib/foods';

// A suggestion card shows one short chip per nutrient the food really helps with. "Really helps" means
// one serving fills at least this share of what is still missing for that nutrient.
export const MIN_BOOST_PERCENT = 10;

export type NutrientBoost = { key: NutrientKey; label: string; percentage: number };
type GapFill = { key: NutrientKey; percentage: number; impact: number };

// Gaps come in ranked by impact; keep that order and drop the small ones.
export function nutrientBoosts(gaps: GapFill[], minPercent = MIN_BOOST_PERCENT): NutrientBoost[] {
  return gaps
    .filter(gap => gap.percentage >= minPercent)
    .map(gap => ({ key: gap.key, label: nutrientLabels[gap.key], percentage: gap.percentage }));
}

export function boostTitle(boost: NutrientBoost) {
  return `Fills ${boost.percentage}% of your remaining ${boost.label.toLowerCase()} gap`;
}
