// Kroger price selection + per-serving scaling. Pure functions only (no network, no app imports), so the same
// code runs in the add-food workflow (src) and in the backfill script (scripts/kroger, via Node type stripping).
// Rules: docs/kroger-price-selection-rules.md. Per-food and per-category settings: ./price-rules.json.
import RULES_JSON from './price-rules.json' with { type: 'json' };

// ---------- types ----------
export type SearchSpec = {
  label?: string;
  term?: string;
  must?: string[];
  exclude?: string[];
  allow?: string[];
  categories?: string[];
  density?: number;
  unitGrams?: number;
  unitsPerPackageItem?: number;
  servingGrams?: number;
  packageYield?: number;
};
type FoodRule = SearchSpec & { alternates?: SearchSpec[] };
type CategoryRule = { exclude?: string[]; categories?: string[]; density?: number };
export type PriceRules = {
  defaultZip: string;
  storeRadiusMiles: number;
  storeChains: string[];
  altStores: { max: number; radiusMiles: number };
  storeBrands: string[];
  genericBrands: string[];
  excludeAlways: string[];
  check: { minPerServing: number; maxPerServing: number };
  categories: Record<string, CategoryRule>;
  foods: Record<string, FoodRule>;
};
export const RULES = RULES_JSON as unknown as PriceRules;

/** What pricing needs to know about a food. serving_grams = as-bought (raw/dry) grams of one serving. */
export type PriceFood = {
  food_id?: number | null;
  food_name: string;
  food_category_id: number | null;
  serving_size: number | string;
  unit: string;
  serving_grams?: number | null;
  /** Rules for a food that has no entry in price-rules.json yet (e.g. the add-food workflow's AI search terms). */
  search?: FoodRule | null;
};

export type Candidate = {
  rank: number;
  product_id: string;
  upc?: string;
  brand: string;
  description: string;
  categories: string;
  size: string;
  sold_by: string;
  regular: number | null;
  promo: number | null;
};

export type Priced = { priced_g: number | null; price_per_serving: number; package_grams: number | null; how: string; flags: string[] };
export type Scored = Candidate & Partial<Priced> & { tier: number; why: string; eligible: boolean; selected: boolean };
export type Ranked = { best: Scored | undefined; scored: Scored[] };

// ---------- sizes ----------
const MASS: Record<string, number> = { oz: 28.3495, lb: 453.592, lbs: 453.592, g: 1, kg: 1000 };
const VOL: Record<string, number> = { 'fl oz': 29.5735, liter: 1000, liters: 1000, gal: 3785.41, qt: 946.353, pt: 473.176, l: 1000, lt: 1000, ml: 1, cup: 236.588, cups: 236.588, tbsp: 14.7868, tsp: 4.92892 };
const COUNT: Record<string, number> = { ct: 1, count: 1, each: 1, ea: 1, pk: 1, pack: 1, dozen: 12, dz: 12 };
const LB = 453.592;
const num = (s: string) => { const [a = '', b] = s.split('/'); return b ? Number(a) / Number(b) : Number(a); };
const lc = (s: unknown) => String(s ?? '').toLowerCase();

export type Package = { grams?: number; ml?: number; count?: number };

/** Kroger package size -> { grams, ml, count }. Handles "16 oz", "1 gal", "12 ct", "each", "6 ct / 18 oz", "4 pk / 15.5 oz", "1/2 gal". */
export function parsePackage(size: string | null | undefined): Package {
  const s = lc(size).replace(/fl\.?\s*oz/g, 'fl oz').trim();
  const out: Package = {};
  if (!s) return out;
  // "6 ct / 18 oz" = 6 items weighing 18 oz in total; "4 pk / 15.5 oz" = 4 packs of 15.5 oz each
  const multi = s.match(/^(\d+)\s*(ct|count|pk|pack)\s*\/\s*(\d+\/\d+|\d*\.?\d+)\s*(fl oz|oz|g|lbs?|ml|l|liter)\b/);
  if (multi) {
    const n = Number(multi[1]), each = /pk|pack/.test(multi[2] ?? ''), q = num(multi[3] ?? '0') * (each ? n : 1), u = multi[4] ?? '';
    const m = MASS[u], v = VOL[u];
    if (m) out.grams = q * m; else if (v) out.ml = q * v;
    out.count = n;
    return out;
  }
  const re = /(\d+\/\d+|\d*\.?\d+)\s*(fl oz|oz|lbs?|kg|g|gal|qt|pt|ml|liters?|l|lt|cups?|tbsp|tsp|ct|count|each|ea|pk|pack|dozen|dz)\b/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const q = num(m[1] ?? '0'), u = m[2] ?? '';
    const ms = MASS[u], v = VOL[u], c = COUNT[u];
    if (ms && out.grams == null) out.grams = q * ms;
    else if (v && out.ml == null) out.ml = q * v;
    else if (c && out.count == null) out.count = q * c;
  }
  if (/^(1\s*)?(each|ea)$/.test(s)) out.count = 1;
  return out;
}

/** The food's serving -> { grams, ml }. grams is the as-bought (raw/dry) weight from the USDA pull. */
export function servingAmount(food: PriceFood): { grams: number | null; ml: number | null } {
  const u = lc(food.unit), q = Number(food.serving_size);
  const out: { grams: number | null; ml: number | null } = { grams: food.serving_grams ? Number(food.serving_grams) : null, ml: null };
  const m = MASS[u], v = VOL[u];
  if (m) out.grams = q * m;
  if (v) out.ml = q * v;
  return out;
}

// ---------- brands ----------
export const isOrganic = (c: Pick<Candidate, 'brand' | 'description'>) => /organic/.test(lc(c.description)) || /organic/.test(lc(c.brand));
export const isStoreBrand = (c: Pick<Candidate, 'brand' | 'description'>) =>
  RULES.storeBrands.some(b => { const d = lc(c.description), x = lc(b); return lc(c.brand) === x || d.startsWith(`${x}®`) || d.startsWith(`${x}™`) || d.startsWith(`${x} `); });
// Unbranded: no brand, a listed generic brand, a "Fresh …" produce label, or an all-caps commodity label on fresh meat/produce ("PORK")
export const isGeneric = (c: Pick<Candidate, 'brand' | 'categories'>) =>
  !c.brand || /^fresh\b/i.test(c.brand) || RULES.genericBrands.some(b => lc(c.brand) === lc(b))
  || (/^[A-Z &]+$/.test(c.brand) && /produce|meat & seafood/i.test(c.categories || ''));

// ---------- rules ----------
export type Spec = SearchSpec & { label: string };
const ruleFor = (food: PriceFood): FoodRule => RULES.foods[String(food.food_id)] ?? food.search ?? {};

/** Search specs for a food: the main one, then its `alternates` (other preparations / closest substitutes) in order. */
export function foodSpecs(food: PriceFood): Spec[] {
  return [{ label: 'primary' }, ...(ruleFor(food).alternates ?? []).map((a, i) => ({ ...a, label: a.label || `alternate ${i + 1}` }))];
}

export type FoodRules = {
  term: string; must: string[]; exclude: string[]; categories: string[]; density: number;
  unitGrams: number | undefined; unitsPerPackageItem: number | undefined; servingGrams: number | undefined; packageYield: number | undefined; label: string;
};

export function foodRules(food: PriceFood, spec: Spec | null = null): FoodRules {
  const base = ruleFor(food);
  const o: FoodRule = spec && spec.label !== 'primary' ? { ...base, ...spec } : base;
  const cat: CategoryRule = RULES.categories[String(food.food_category_id)] ?? {};
  const allow = o.allow ?? [];
  return {
    term: o.term || food.food_name,
    must: o.must ?? [],
    exclude: [...RULES.excludeAlways, ...(cat.exclude ?? []), ...(o.exclude ?? [])].filter(t => !allow.includes(t)),
    categories: o.categories ?? cat.categories ?? [],
    density: o.density ?? cat.density ?? 1,
    unitGrams: o.unitGrams, unitsPerPackageItem: o.unitsPerPackageItem,
    servingGrams: o.servingGrams, packageYield: o.packageYield, label: spec?.label ?? 'primary',
  };
}

// ---------- scaling ----------
/** Regular price scaled to one serving, or { error }. */
export function perServing(food: PriceFood, c: Pick<Candidate, 'size' | 'sold_by' | 'regular'>, spec: Spec | null = null): Priced | { error: string } {
  const r = foodRules(food, spec), sv = servingAmount(food), pk = parsePackage(c.size);
  const price = Number(c.regular), flags: string[] = [];
  if (!(price > 0)) return { error: 'no regular price' };
  // Alternate preparation: serving re-expressed in that form (e.g. 50 g dry chickpeas = 116 g canned, drained)
  if (r.servingGrams) { sv.grams = r.servingGrams; sv.ml = null; }
  // Only part of the package is the food (drained can)
  if (r.packageYield) { if (pk.grams) pk.grams *= r.packageYield; if (pk.ml) pk.ml *= r.packageYield; flags.push(`${Math.round(r.packageYield * 100)}% of package usable`); }
  if (r.label !== 'primary') flags.push(`alternate: ${r.label}`);
  const g = sv.grams;
  const done = (pps: number, packageGrams: number | null, how: string): Priced => ({ priced_g: g, price_per_serving: pps, package_grams: packageGrams, how, flags });
  const unitServing = ['unit', 'clove'].includes(lc(food.unit));
  // Sold by weight: Kroger's regular price is per lb
  if (lc(c.sold_by) === 'weight') {
    if (!g) return { error: 'sold by weight but serving has no grams' };
    flags.push('priced per lb');
    return done(price * g / LB, LB, `$${price}/lb × ${g.toFixed(1)} g`);
  }
  // Each / count packages for per-unit servings (produce, tortillas, garlic)
  if (unitServing && pk.count) {
    const per = r.unitsPerPackageItem || 1; // e.g. garlic: cloves per bulb
    return done(price / (pk.count * per) * Number(food.serving_size), null, `$${price} / ${pk.count * per} ${lc(food.unit)}s`);
  }
  // Volume serving and volume package (milk by the cup, syrups by the tbsp)
  if (sv.ml && pk.ml) return done(price * sv.ml / pk.ml, null, `$${price} × ${sv.ml.toFixed(1)} ml / ${pk.ml.toFixed(0)} ml`);
  // Weight serving and weight package (the common case)
  if (g && pk.grams) return done(price * g / pk.grams, pk.grams, `$${price} × ${g.toFixed(1)} g / ${pk.grams.toFixed(0)} g`);
  // Weight serving, volume package: convert with density
  if (g && pk.ml) {
    const pg = pk.ml * r.density; flags.push(`density ${r.density} g/ml`);
    return done(price * g / pg, pg, `$${price} × ${g.toFixed(1)} g / (${pk.ml.toFixed(0)} ml × ${r.density})`);
  }
  // Weight serving, count package (eggs: 12 ct, 50 g each)
  if (g && pk.count && r.unitGrams) {
    flags.push(`${r.unitGrams} g per unit`);
    return done(price / pk.count * g / r.unitGrams, pk.count * r.unitGrams, `$${price} / ${pk.count} × ${g} g / ${r.unitGrams} g`);
  }
  return { error: `can't relate package "${c.size}" to serving ${food.serving_size} ${food.unit}` };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Why a candidate is not eligible ('' if it is). */
export function ineligible(food: PriceFood, c: Candidate, { allowOrganic = false, spec = null }: { allowOrganic?: boolean; spec?: Spec | null } = {}): string {
  const r = foodRules(food, spec), d = lc(`${c.description} ${c.brand}`);
  if (!(Number(c.regular) > 0)) return 'no regular price at this store';
  if (isOrganic(c) && !allowOrganic) return 'organic';
  if (r.categories.length && !String(c.categories || '').split(/;\s*/).some(k => r.categories.includes(k))) return `category: ${c.categories || 'none'}`;
  const word = (alt: string) => new RegExp(`(^|[^a-z0-9])${escape(alt)}(s|es)?($|[^a-z0-9])`, 'i');
  const miss = r.must.filter(t => !lc(t).split('|').some(alt => word(alt).test(d)));
  if (miss.length) return `missing: ${miss.join(', ')}`;
  const hit = r.exclude.filter(t => new RegExp(`\\b${escape(t)}\\b`, 'i').test(d));
  if (hit.length) return `excluded: ${hit.join(', ')}`;
  return '';
}

/**
 * Score every candidate and pick one: store brand first, then unbranded produce, then national brands;
 * within a tier the lowest regular price per serving; ties by Kroger's search rank.
 * Organic only when nothing non-organic qualifies.
 */
export function rankCandidates(food: PriceFood, cands: Candidate[], spec: Spec | null = null): Ranked {
  const score = (allowOrganic: boolean): Scored[] => cands.map(c => {
    const why = ineligible(food, c, { allowOrganic, spec });
    const ps = why ? null : perServing(food, c, spec);
    const err = ps && 'error' in ps ? ps.error : '';
    const tier = isStoreBrand(c) ? 0 : isGeneric(c) ? 1 : 2;
    return { ...c, ...(ps && !('error' in ps) ? ps : {}), tier, why: why || err, eligible: !why && !err, selected: false };
  });
  let scored = score(false), organicFallback = false;
  if (!scored.some(s => s.eligible)) { const alt = score(true); if (alt.some(s => s.eligible)) { scored = alt; organicFallback = true; } }
  const best = scored.filter(s => s.eligible)
    .sort((a, b) => a.tier - b.tier || (a.price_per_serving ?? 0) - (b.price_per_serving ?? 0) || a.rank - b.rank)[0];
  if (best) {
    best.selected = true;
    const extra: string[] = [];
    if (best.tier === 2) extra.push('no store brand: national brand used');
    if (organicFallback) extra.push('only organic available');
    const pps = best.price_per_serving ?? 0;
    if (pps > RULES.check.maxPerServing || pps < RULES.check.minPerServing) extra.push(`price/serving outside $${RULES.check.minPerServing}–$${RULES.check.maxPerServing}`);
    best.flags = [...(best.flags ?? []), ...extra];
  }
  return { best, scored };
}
