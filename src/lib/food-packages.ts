// Package sizes (migration 0019): a food, or one of its purchase options, is bought as a package (1 lb,
// 3 lb family pack …), at most 3 sizes each. One add on the plan = one package; its servings are spread across
// the trip, so a 4-serving pack on a 7-day trip is 4/7 of a serving a day. Older list items and foods with no
// sizes keep counting servings. Sizes come from the add-food workflow's AI step (package-sizes.ts) and
// scripts/kroger/package-sizes-backfill.mjs; migration 0019 seeded one size per priced food.
import type { FoodOption } from './food-options';

export type FoodPackage = {
  id: string;
  foodId: string;
  optionId: string | null;
  label: string;
  /** Servings in one package, on the food's nutrition serving. */
  servings: number;
  /** Shelf price at the default store (0 = unknown). */
  price: number;
  grams: number | null;
  sort: number;
};
/** food id -> its sizes (food-level and per purchase option), in display order. */
export type PackageCatalog = Record<string, FoodPackage[]>;

/** A pantry row with no size counts as a week of servings, so older rows (quantity 1) stay 1 serving a day. */
export const PANTRY_SERVINGS_WITHOUT_SIZE = 7;

export async function loadFoodPackages(): Promise<PackageCatalog> {
  const { supabase } = await import('@/integrations/supabase/client');
  const out: PackageCatalog = {};
  for (let offset = 0; ; offset += 1000) {
    // food_package isn't in the generated Supabase types until migration 0019 is applied and types are regenerated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from as any)('food_package')
      .select('food_package_id, food_id, food_option_id, label, servings, package_price, package_grams, sort_order')
      .order('food_id').order('sort_order').range(offset, offset + 999);
    if (error) {
      // Migration 0019 not applied yet: everything keeps counting servings.
      if (error.code === '42P01' || error.code === 'PGRST205') return out;
      throw error;
    }
    // food_package isn't in the generated Supabase types until migration 0019 is applied and types are regenerated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (data || []) as any[]) {
      (out[String(r.food_id)] ||= []).push({
        id: String(r.food_package_id), foodId: String(r.food_id), optionId: r.food_option_id == null ? null : String(r.food_option_id),
        label: r.label, servings: Number(r.servings), price: Number(r.package_price), grams: r.package_grams == null ? null : Number(r.package_grams), sort: Number(r.sort_order),
      });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Sizes for a food as the shopper is buying it: the picked option's own sizes; for no pick, the food's own sizes
 * (or its first option's). A picked option without sizes borrows the food's sizes only when it is the food's
 * base option (listed first), since a raw pack's size says nothing about a rotisserie chicken.
 */
export function packagesFor(catalog: PackageCatalog, foodId: string, optionId: string | null | undefined, options: FoodOption[] = []): FoodPackage[] {
  const all = catalog[foodId] ?? [];
  const foodLevel = all.filter(p => p.optionId == null);
  if (optionId) {
    const own = all.filter(p => p.optionId === optionId);
    if (own.length) return own;
    return options[0]?.id === optionId ? foodLevel : [];
  }
  if (foodLevel.length) return foodLevel;
  const first = options.find(o => all.some(p => p.optionId === o.id));
  return first ? all.filter(p => p.optionId === first.id) : [];
}

/** The size most shoppers pick (sort 0 from the AI step). */
export const defaultPackage = (list: FoodPackage[]): FoodPackage | undefined => [...list].sort((a, b) => a.sort - b.sort)[0];

/** Servings in `quantity` of a list or pantry row: packages × servings each, or plain servings without a size. */
export const servingsOf = (quantity: number, pkg: FoodPackage | undefined): number => (pkg ? quantity * pkg.servings : quantity);

/**
 * Price of one package: the shopper's store price per serving × servings (so localized pricing still applies),
 * else the package's own shelf price, else null.
 */
export function packagePrice(pkg: FoodPackage, perServing: number | null): number | null {
  if (perServing != null && perServing > 0) return perServing * pkg.servings;
  return pkg.price > 0 ? pkg.price : null;
}

/** "3 lb · 12 servings" */
export function packageCaption(pkg: FoodPackage): string {
  const s = Math.round(pkg.servings * 10) / 10;
  return `${pkg.label} · ${s} ${s === 1 ? 'serving' : 'servings'}`;
}
