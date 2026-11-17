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
  /** The store's size text ("16 fl oz", "12 ct", "4 pk / 15.5 oz"), for volume and count. */
  size: string | null;
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
      .select('food_package_id, food_id, food_option_id, label, servings, package_price, package_grams, package_size, sort_order')
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
        label: r.label, servings: Number(r.servings), price: Number(r.package_price), grams: r.package_grams == null ? null : Number(r.package_grams), size: r.package_size ?? null, sort: Number(r.sort_order),
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

/** The size an add starts with: the smallest purchase (fewest servings), then the catalog order. */
export const defaultPackage = (list: FoodPackage[]): FoodPackage | undefined => [...list].sort((a, b) => a.servings - b.servings || a.sort - b.sort)[0];

// ---------- custom amounts ----------
// A list item can ask for its own amount ("3 lb", "6 ct"). It's priced and counted from the store size closest to
// it, scaled: servings = amount × that size's servings per gram (or ml, or item), price the same way.
export const CUSTOM_UNITS = ['oz', 'lb', 'g', 'kg', 'fl oz', 'cup', 'ml', 'l', 'ct'] as const;
export type CustomUnit = (typeof CUSTOM_UNITS)[number];
type Kind = 'mass' | 'volume' | 'count';
const UNIT: Record<CustomUnit, { kind: Kind; base: number; label: string }> = {
  oz: { kind: 'mass', base: 28.3495, label: 'oz' }, lb: { kind: 'mass', base: 453.592, label: 'lb' },
  g: { kind: 'mass', base: 1, label: 'g' }, kg: { kind: 'mass', base: 1000, label: 'kg' },
  'fl oz': { kind: 'volume', base: 29.5735, label: 'fl oz' }, cup: { kind: 'volume', base: 236.588, label: 'cups' },
  ml: { kind: 'volume', base: 1, label: 'ml' }, l: { kind: 'volume', base: 1000, label: 'L' },
  ct: { kind: 'count', base: 1, label: 'ct' },
};
/** Most you can ask for in one custom amount: 50 lb, 20 L or 200 items. */
const MAX_BASE: Record<Kind, number> = { mass: 22680, volume: 20000, count: 200 };
export const isCustomUnit = (u: unknown): u is CustomUnit => (CUSTOM_UNITS as readonly string[]).includes(String(u));

/** One package in grams, ml and items, from its weight and its size text. */
export function packageMeasures(pkg: FoodPackage): { grams: number | null; ml: number | null; count: number | null } {
  const s = String(pkg.size ?? pkg.label ?? '').toLowerCase();
  const num = (re: RegExp) => { const m = s.match(re); return m ? Number(m[1]) : null; };
  const pk = num(/(\d+)\s*(?:pk|pack)\b/);
  const ct = num(/(\d+)\s*(?:ct|count)\b/) ?? (/\b(each|whole)\b/.test(s) ? 1 : null);
  const flOz = num(/(\d*\.?\d+)\s*fl\.?\s*oz/);
  const ml = flOz != null ? flOz * 29.5735 * (pk ?? 1)
    : num(/(\d*\.?\d+)\s*gal/) != null ? num(/(\d*\.?\d+)\s*gal/)! * 3785.41
    : num(/(\d*\.?\d+)\s*qt/) != null ? num(/(\d*\.?\d+)\s*qt/)! * 946.353
    : num(/(\d*\.?\d+)\s*pt\b/) != null ? num(/(\d*\.?\d+)\s*pt\b/)! * 473.176
    : num(/(\d*\.?\d+)\s*(?:l|liters?)\b/) != null ? num(/(\d*\.?\d+)\s*(?:l|liters?)\b/)! * 1000
    : null;
  return { grams: pkg.grams && pkg.grams > 0 ? pkg.grams : null, ml, count: ct ?? (pk && !flOz ? pk : null) };
}

/** Servings in one unit of `unit` for this package (servings per gram, ml or item); null if it can't be related. */
function servingsPerBase(pkg: FoodPackage, kind: Kind): number | null {
  const m = packageMeasures(pkg);
  if (!(pkg.servings > 0)) return null;
  // Mass and volume stand in for each other at about 1 g per ml when the package only gives one of them.
  if (kind === 'mass') return m.grams ? pkg.servings / m.grams : m.ml ? pkg.servings / m.ml : null;
  if (kind === 'volume') return m.ml ? pkg.servings / m.ml : m.grams ? pkg.servings / m.grams : null;
  return m.count ? pkg.servings / m.count : null;
}

/** Units a custom amount can use for these sizes (weight/volume when a size has one, items when a size is a count). */
export function customUnitsFor(packages: FoodPackage[]): CustomUnit[] {
  return CUSTOM_UNITS.filter(u => packages.some(p => servingsPerBase(p, UNIT[u].kind) != null));
}

export type CustomAmount = { servings: number; reference: FoodPackage; scale: number };

/**
 * A custom amount against the store sizes: the size it scales from (closest in servings), how many servings it
 * is, and `scale` = custom ÷ that size (price and nutrients scale by it). Returns a message when it's not usable.
 */
export function customAmount(packages: FoodPackage[], amount: number, unit: CustomUnit): CustomAmount | { error: string } {
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter an amount greater than zero.' };
  const u = UNIT[unit];
  const base = amount * u.base;
  if (base > MAX_BASE[u.kind]) return { error: u.kind === 'count' ? 'That’s more than 200 items. Pick a smaller amount.' : u.kind === 'mass' ? 'That’s more than 50 lb. Pick a smaller amount.' : 'That’s more than 20 liters. Pick a smaller amount.' };
  const fits = packages.map(p => ({ p, per: servingsPerBase(p, u.kind) })).filter((x): x is { p: FoodPackage; per: number } => x.per != null);
  if (!fits.length) return { error: u.kind === 'count' ? 'This food isn’t sold by the item. Use a weight instead.' : 'Use a count for this food (it’s sold by the item).' };
  const target = base * fits[0]!.per;
  const ref = fits.sort((a, b) => Math.abs(Math.log((base * a.per) / a.p.servings)) - Math.abs(Math.log((base * b.per) / b.p.servings)))[0]!;
  const servings = base * ref.per;
  if (servings < 0.1 || !Number.isFinite(target)) return { error: 'That’s less than a tenth of a serving. Pick a larger amount.' };
  return { servings, reference: ref.p, scale: servings / ref.p.servings };
}

/** "3 lb", "1.5 cups", "6 ct" */
export function customLabel(amount: number, unit: CustomUnit): string {
  const a = Math.round(amount * 100) / 100;
  return `${a} ${unit === 'cup' && a === 1 ? 'cup' : UNIT[unit].label}`;
}

/** Servings in `quantity` of a list or pantry row: packages × servings each, or plain servings without a size. */
export const servingsOf = (quantity: number, pkg: FoodPackage | undefined): number => (pkg ? quantity * pkg.servings : quantity);

/**
 * Price of one package: its own shelf price (a 2-pack is often cheaper per serving than two singles).
 * Shelf prices come from the default store, so at another store they're scaled by how that store's price per
 * serving compares (`perServing` / `defaultPerServing`). A package with no shelf price falls back to
 * price per serving × servings; with neither, null.
 */
export function packagePrice(pkg: FoodPackage, perServing: number | null, defaultPerServing: number | null = null): number | null {
  if (pkg.price > 0) {
    const ratio = perServing != null && perServing > 0 && defaultPerServing != null && defaultPerServing > 0 ? perServing / defaultPerServing : 1;
    return pkg.price * ratio;
  }
  return perServing != null && perServing > 0 ? perServing * pkg.servings : null;
}

/** What one of this package is called on the list: "unit" for a single item (1 ct, each, whole fruit), else "package". */
export function packageNoun(pkg: FoodPackage, quantity: number): string {
  const single = /^\s*(1\s*(ct|count|each|ea)\b|each\b|whole\b)|\bwhole\b/i.test(pkg.label);
  const word = single ? 'unit' : 'package';
  return quantity === 1 ? word : `${word}s`;
}

/** "1 serving", "2.5 servings" */
export const servingsText = (n: number, format: (n: number) => string = String) => `${format(n)} ${n === 1 ? 'serving' : 'servings'}`;

/** "3 lb · 12 servings" */
export function packageCaption(pkg: FoodPackage): string {
  const s = Math.round(pkg.servings * 10) / 10;
  return `${pkg.label} · ${s} ${s === 1 ? 'serving' : 'servings'}`;
}
