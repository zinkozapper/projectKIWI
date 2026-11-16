// Purchase options in the app ("prep style": raw, rotisserie, frozen, canned …). A list item always has one:
// with none saved it uses the food's default, the most whole style (fresh/raw, then dried, frozen, canned, ready
// to eat). Nutrients are the food's own.
// Server side + rules: src/lib/food-import/purchase-options.ts, docs/kroger-price-selection-rules.md.
import { resolvedPrice } from './resolved-prices';

export type FoodOption = { id: string; foodId: string; form: string; label: string; price: number; sort: number };
/** food id -> its options, in display order. Foods sold only one way have none. */
export type OptionCatalog = Record<string, FoodOption[]>;
export type PricingMode = 'loading' | 'generic' | 'local';

export async function loadFoodOptions(): Promise<OptionCatalog> {
  const { supabase } = await import('@/integrations/supabase/client');
  const out: OptionCatalog = {};
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('food_option')
      .select('food_option_id, food_id, form, label, price, sort_order')
      .order('food_id').order('sort_order').range(offset, offset + 999);
    if (error) throw error;
    for (const r of data || []) {
      (out[String(r.food_id)] ||= []).push({ id: String(r.food_option_id), foodId: String(r.food_id), form: r.form, label: r.label, price: Number(r.price), sort: r.sort_order });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Option prices at one store (localized pricing): option id -> price per serving. */
export async function loadLocalOptionPrices(locationId: string): Promise<Record<string, number>> {
  const { supabase } = await import('@/integrations/supabase/client');
  const out: Record<string, number> = {};
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('food_option_price').select('food_option_id, price_per_serving')
      .eq('location_id', locationId).order('food_option_id').range(offset, offset + 999);
    if (error) throw error;
    for (const r of data || []) out[String(r.food_option_id)] = Number(r.price_per_serving);
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Most whole first: fresh produce and raw meat, then dry goods, frozen, canned, and ready to eat last.
const FORM_RANK: Record<string, number> = { fresh: 0, dried: 1, frozen: 2, canned: 3, ready_to_eat: 4 };

/** The style a food defaults to: the most whole form, then the catalog's own order. */
export function defaultOption(options: FoodOption[] | undefined): FoodOption | undefined {
  return [...(options ?? [])].sort((a, b) => (FORM_RANK[a.form] ?? 9) - (FORM_RANK[b.form] ?? 9) || a.sort - b.sort)[0];
}

/** The option an item uses: its own pick when the food still has it, else the food's default (null = no options). */
export function resolveOptionId(optionId: string | null | undefined, options: FoodOption[] | undefined): string | null {
  if (optionId && options?.some(o => o.id === optionId)) return optionId;
  return defaultOption(options)?.id ?? null;
}

export function optionPrice(option: FoodOption, local: Record<string, number> | null, mode: PricingMode): number | null {
  return resolvedPrice(option.price, local?.[option.id], mode);
}

/** Average of the priced options, or null when none is priced. */
export function averageOptionPrice(options: FoodOption[] | undefined, local: Record<string, number> | null, mode: PricingMode): number | null {
  const prices = (options ?? []).map(o => optionPrice(o, local, mode)).filter((p): p is number => p != null);
  return prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
}

/**
 * Price per serving of a list item: its option's price (its pick, else the food's default style); if that one is
 * unpriced, the average of the food's priced options; and for a food without options its own price (`foodPrice`).
 */
export function itemOptionPrice(
  optionId: string | null | undefined,
  options: FoodOption[] | undefined,
  local: Record<string, number> | null,
  mode: PricingMode,
  foodPrice: number | null,
): number | null {
  const id = resolveOptionId(optionId, options);
  const picked = id ? options?.find(o => o.id === id) : undefined;
  const own = picked ? optionPrice(picked, local, mode) : null;
  return own ?? averageOptionPrice(options, local, mode) ?? foodPrice;
}
