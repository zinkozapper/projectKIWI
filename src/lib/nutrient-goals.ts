import { supabase } from '@/integrations/supabase/client';
import type { Json, TablesInsert } from '@/integrations/supabase/types';
import { nutrientKeys, nutrientLimits, type Nutrients } from './foods';

// OKR 2: how well the pantry covers the user's daily nutrient targets, saved to
// public.nutrient_profile_snapshot (migration 0007) each time the pantry or the targets change.
// A nutrient is met when the pantry holds at least 100% of its daily target per plan day, the same
// per-day math as the plan page bars (each pantry food = 1 serving a day). All 27 tracked nutrients
// count except upper limits like sodium. The goal is met when every nutrient with a target is met.

export type NutrientResult = { per_day: number; target: number; pct: number; met: boolean };
export type NutrientGoalResult = {
  nutrients: Partial<Record<keyof Nutrients, NutrientResult>>;
  nutrientsMet: number;
  nutrientsTotal: number;
  achievementPct: number;
  avgCoveragePct: number;
  goalMet: boolean;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function evaluateNutrientGoals(pantryTotals: Nutrients, daily: Nutrients, days: number): NutrientGoalResult {
  const planDays = Math.max(1, days || 1);
  const nutrients: NutrientGoalResult['nutrients'] = {};
  let met = 0;
  let coverage = 0;
  for (const k of nutrientKeys) {
    if (nutrientLimits.has(k)) continue;
    const target = Number(daily[k]) || 0;
    if (target <= 0) continue;
    const perDay = (Number(pantryTotals[k]) || 0) / planDays;
    const ratio = perDay / target;
    const isMet = ratio >= 1;
    if (isMet) met++;
    coverage += Math.min(ratio, 1);
    nutrients[k] = { per_day: round1(perDay), target, pct: round1(ratio * 100), met: isMet };
  }
  const total = Object.keys(nutrients).length;
  return {
    nutrients,
    nutrientsMet: met,
    nutrientsTotal: total,
    achievementPct: total ? round1((met / total) * 100) : 0,
    avgCoveragePct: total ? round1((coverage / total) * 100) : 0,
    goalMet: total > 0 && met === total,
  };
}

// Same pantry foods, plan length and targets = same snapshot, so reloading the app doesn't add rows.
// Quantities are left out: the pantry only tracks which foods are at home.
export function pantrySignature(pantry: { food_id: string; quantity: number }[], daily: Nutrients, days: number) {
  const items = [...new Set(pantry.map(i => i.food_id))].sort().join(',');
  const targets = nutrientKeys.map(k => Number(daily[k]) || 0).join(',');
  return `${items}|${days}|${targets}`;
}

// Last saved signature per user. undefined = not checked against the database yet this session.
const lastSignature = new Map<string, string | null>();
let queue: Promise<void> = Promise.resolve();

type SnapshotInput = {
  userId: string;
  pantryId: number;
  pantry: { food_id: string; quantity: number }[];
  pantryTotals: Nutrients;
  daily: Nutrients;
  days: number;
};

async function save(input: SnapshotInput) {
  const signature = pantrySignature(input.pantry, input.daily, input.days);
  if (!lastSignature.has(input.userId)) {
    const { data, error } = await supabase
      .from('nutrient_profile_snapshot')
      .select('pantry_signature')
      .eq('user_id', input.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    // Before migration 0007 is applied the table doesn't exist. Skip quietly and try next session.
    if (error) {
      console.error('Could not read nutrient snapshots:', error.message);
      return;
    }
    lastSignature.set(input.userId, data?.pantry_signature ?? null);
  }
  if (lastSignature.get(input.userId) === signature) return;

  const result = evaluateNutrientGoals(input.pantryTotals, input.daily, input.days);
  const row: TablesInsert<'nutrient_profile_snapshot'> = {
    user_id: input.userId,
    pantry_id: input.pantryId,
    plan_days: Math.max(1, input.days || 1),
    nutrients: result.nutrients as Json,
    nutrients_met: result.nutrientsMet,
    nutrients_total: result.nutrientsTotal,
    achievement_pct: result.achievementPct,
    avg_coverage_pct: result.avgCoveragePct,
    goal_met: result.goalMet,
    pantry_food_ids: [...new Set(input.pantry.map(i => Number(i.food_id)))].filter(Number.isFinite),
    pantry_signature: signature,
  };
  const { error } = await supabase.from('nutrient_profile_snapshot').insert(row);
  if (error) console.error('Failed to save nutrient snapshot:', error.message);
  else lastSignature.set(input.userId, signature);
}

// Tracking must never break the planner, so errors only go to the console. Calls run one at a time
// so two quick pantry changes can't both pass the "changed?" check with the same old signature.
export function recordNutrientSnapshot(input: SnapshotInput) {
  queue = queue.then(() => save(input)).catch(e => console.error('Failed to save nutrient snapshot:', e));
  return queue;
}

// Call on sign-out so the next user in this tab is checked against their own last snapshot.
export function resetNutrientSnapshots() {
  lastSignature.clear();
}
