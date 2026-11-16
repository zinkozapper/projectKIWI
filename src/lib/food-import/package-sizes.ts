// Package sizes ("as bought"): after Kroger pricing finds a food's (or purchase option's) product, Claude looks at
// the other eligible products from the same search and picks up to 3 sizes shoppers actually choose between
// (a 1 lb pack, a 3 lb family pack …). Each size's servings come from its price and the same per-serving price
// rules, so nutrition and cost stay on the food's own serving. Pure (no network, no app imports) so the add-food
// workflow and scripts/kroger/package-sizes-backfill.mjs share it. Table: food_package (migration 0019).
import type { Scored } from './pricing.ts';

export const MAX_SIZES = 3;
const MAX_CANDIDATES = 12;
const MIN_SERVINGS = 0.5;
const MAX_POUNDS = 10;

/** One product the AI can pick from. `byWeight`: priced per lb, so the AI also says how many pounds. */
export type SizeCandidate = {
  key: number;
  product_id: string;
  description: string;
  brand: string;
  size: string;
  byWeight: boolean;
  /** Shelf price of one package (per lb when byWeight). */
  price: number;
  /** Servings in one package (in 1 lb when byWeight). */
  servings: number;
  package_grams: number | null;
};

export type PackageRow = {
  label: string;
  servings: number;
  package_grams: number | null;
  package_price: number;
  product_id: string | null;
  description: string | null;
  package_size: string | null;
  sort_order: number;
  source: 'kroger' | 'ai';
};

const clip = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Eligible products from the winning search, same brand tier as the pick (store brand stays store brand) plus the
 * next tier when that tier has a single size. One per distinct package size (the cheapest per serving), smallest first.
 */
export function sizeCandidates(scored: Scored[]): SizeCandidate[] {
  const ok = scored.filter(s => s.eligible && Number(s.regular) > 0 && Number(s.price_per_serving) > 0);
  if (!ok.length) return [];
  const best = Math.min(...ok.map(s => s.tier));
  const sizesIn = (tiers: number[]) => new Set(ok.filter(s => tiers.includes(s.tier)).map(s => norm(s.size || s.sold_by))).size;
  const tiers = sizesIn([best]) > 1 ? [best] : [best, best + 1];
  const bySize = new Map<string, Scored>();
  for (const s of ok.filter(s => tiers.includes(s.tier))) {
    const k = String(s.sold_by).toLowerCase() === 'weight' ? 'by weight' : norm(s.size);
    if (!k) continue;
    const prev = bySize.get(k);
    if (!prev || Number(s.price_per_serving) < Number(prev.price_per_serving)) bySize.set(k, s);
  }
  return [...bySize.values()]
    .map(s => ({ s, servings: Number(s.regular) / Number(s.price_per_serving) }))
    .filter(x => x.servings >= MIN_SERVINGS && Number.isFinite(x.servings))
    .sort((a, b) => a.servings - b.servings)
    .slice(0, MAX_CANDIDATES)
    .map(({ s, servings }, key) => ({
      key, product_id: s.product_id, description: s.description, brand: s.brand, size: s.size,
      byWeight: String(s.sold_by).toLowerCase() === 'weight', price: Number(s.regular), servings: round2(servings),
      package_grams: s.package_grams ?? null,
    }));
}

// ---------- AI step ----------
export const SIZES_SYSTEM = `You help Kiwi, a nutrition-aware grocery planner. Shoppers add a food to their list as it's sold: one package. Given the store products found for one food, pick the package sizes a shopper should choose between. Rules:
- Pick 1 to 3 products by key. Pick fewer when the sizes are nearly the same or only one size is common; never more than 3.
- Spread them out: an everyday size first (what most households buy for a week), then a smaller and/or a larger bulk size if they exist.
- label: what the shopper sees, 1–4 plain words with the amount, e.g. "1 lb", "3 lb family pack", "12 ct", "15 oz can", "Half gallon". Max 25 characters. No brand names.
- For products sold by weight (byWeight true), also give pounds (0.5–10): the amount bought, e.g. 1 or 2.5. You may pick the same by-weight product more than once with different pounds.
- Order: the everyday size first.`;

export const SIZES_TOOL = {
  name: 'package_sizes',
  description: 'Pick the package sizes shoppers choose between for this food.',
  input_schema: {
    type: 'object',
    properties: {
      sizes: {
        type: 'array',
        maxItems: MAX_SIZES,
        items: {
          type: 'object',
          properties: { key: { type: 'integer' }, label: { type: 'string' }, pounds: { type: 'number' } },
          required: ['key', 'label'],
        },
      },
    },
    required: ['sizes'],
  },
} as const;

export function sizesPrompt(foodName: string, optionLabel: string | null, servingText: string, cands: SizeCandidate[]): string {
  const rows = cands.map(c => `${c.key}. ${[c.brand, c.description].filter(Boolean).join(' · ')} | size: ${c.byWeight ? 'sold by weight (price per lb)' : c.size || '?'} | $${c.price.toFixed(2)}${c.byWeight ? '/lb' : ''} | ${c.servings} servings${c.byWeight ? ' per lb' : ''}`);
  return `Food: ${foodName}${optionLabel ? ` (${optionLabel})` : ''}\nKiwi's serving: ${servingText}\nProducts:\n${rows.join('\n')}`;
}

export type AiSize = { key?: unknown; label?: unknown; pounds?: unknown };

/** Clean the AI's picks into food_package rows: known keys only, at most 3, distinct, labels clipped. */
export function packageRows(raw: unknown, cands: SizeCandidate[]): PackageRow[] {
  const list = Array.isArray(raw) ? (raw as AiSize[]) : [];
  const out: PackageRow[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    if (out.length >= MAX_SIZES) break;
    const c = cands.find(x => x.key === Number(a.key));
    if (!c) continue;
    const lb = c.byWeight ? Math.min(MAX_POUNDS, Math.max(0.5, Number(a.pounds) || 1)) : 1;
    const dedupe = `${c.key}:${lb}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const label = clip(a.label, 25) || defaultLabel(c, lb);
    out.push(row(c, label, lb, out.length, 'ai'));
  }
  return out;
}

/** No AI (error, timeout, self-host without a key): everyday = cheapest per serving, then the smallest and largest. */
export function fallbackRows(cands: SizeCandidate[]): PackageRow[] {
  if (!cands.length) return [];
  const byValue = [...cands].sort((a, b) => a.price / a.servings - b.price / b.servings);
  const everyday = byValue[0]!;
  const picks = [everyday, cands[0]!, cands[cands.length - 1]!].filter((c, i, all) => all.findIndex(x => x.key === c.key) === i);
  return picks.slice(0, MAX_SIZES).map((c, i) => row(c, defaultLabel(c, 1), 1, i, 'kroger'));
}

function defaultLabel(c: SizeCandidate, lb: number) {
  return clip(c.byWeight ? `${lb} lb` : c.size || 'Package', 25);
}

function row(c: SizeCandidate, label: string, lb: number, sort: number, source: PackageRow['source']): PackageRow {
  return {
    label,
    servings: round2(c.servings * lb),
    package_grams: c.byWeight ? Math.round(453.6 * lb) : c.package_grams,
    package_price: round2(c.price * lb),
    product_id: c.product_id,
    description: clip([c.brand, c.description].filter(Boolean).join(' · '), 200) || null,
    package_size: c.byWeight ? `${lb} lb` : c.size || null,
    sort_order: sort,
    source,
  };
}
