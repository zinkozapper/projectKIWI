// Shared Kroger price logic. Pure functions (selection, size parsing, per-serving scaling) are kept
// separate from the API calls so the add-food workflow can reuse them later.
// Rules: docs/kroger-price-selection-rules.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'data/kroger');
export const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/kroger/price-rules.json'), 'utf8'));
const API = 'https://api.kroger.com/v1';

// ---------- API ----------
let token;
export async function getToken() {
  if (token && token.exp > Date.now()) return token.value;
  const id = process.env.KROGER_CLIENT_ID, secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET in .env (free app at https://developer.kroger.com)');
  const res = await fetch(`${API}/connect/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') },
    body: 'grant_type=client_credentials&scope=product.compact',
  });
  if (!res.ok) throw new Error(`Kroger token ${res.status}: ${await res.text()}`);
  const j = await res.json();
  token = { value: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return token.value;
}
async function get(pathname, params) {
  const url = `${API}${pathname}?${new URLSearchParams(params)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await getToken()}`, Accept: 'application/json' } });
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(`Kroger ${pathname} ${res.status}: ${await res.text()}`);
    return res.json();
  }
  throw new Error(`Kroger ${pathname}: gave up after retries`);
}

const toStore = s => ({
  location_id: s.locationId, chain: s.chain, name: s.name,
  address: s.address?.addressLine1, city: s.address?.city, state: s.address?.state, zip_code: s.address?.zipCode,
  latitude: s.geolocation?.latitude, longitude: s.geolocation?.longitude, departments: (s.departments || []).length,
});
const chainOk = l => !RULES.storeChains.length || RULES.storeChains.includes(String(l.chain).toUpperCase());

/** Nearest Kroger-family grocery store for a ZIP. */
export async function nearestStore(zip, radiusMiles = RULES.storeRadiusMiles) {
  const j = await get('/locations', { 'filter.zipCode.near': zip, 'filter.radiusInMiles': radiusMiles, 'filter.limit': 10 });
  const s = (j.data || []).find(chainOk) || (j.data || [])[0];
  return s ? toStore(s) : null;
}

/**
 * Backup stores for foods the home store can't price. Kroger publishes no store size, so stores are ranked
 * by how many departments they list (bakery, deli, pharmacy, fuel …) as a proxy for the biggest stores nearby.
 */
export async function alternateStores(zip, homeId, n = RULES.altStores.max, radiusMiles = RULES.altStores.radiusMiles) {
  const j = await get('/locations', { 'filter.zipCode.near': zip, 'filter.radiusInMiles': radiusMiles, 'filter.limit': 50 });
  return (j.data || []).filter(l => chainOk(l) && l.locationId !== homeId).map(toStore)
    .sort((a, b) => b.departments - a.departments).slice(0, n);
}

/** Products for a search term at one store, flattened to one row per item that has a price there. */
export async function searchProducts(term, locationId, limit = 50) {
  const j = await get('/products', { 'filter.term': term, 'filter.locationId': locationId, 'filter.limit': limit });
  const rows = [];
  (j.data || []).forEach((p, rank) => (p.items || []).forEach(it => rows.push({
    rank, product_id: p.productId, upc: p.upc, brand: p.brand || '', description: p.description || '',
    categories: (p.categories || []).join('; '), size: it.size || '', sold_by: it.soldBy || '',
    regular: it.price?.regular ?? null, promo: it.price?.promo ?? null,
  })));
  return rows;
}

// ---------- sizes ----------
const MASS = { oz: 28.3495, lb: 453.592, lbs: 453.592, g: 1, kg: 1000 };
const VOL = { 'fl oz': 29.5735, liter: 1000, liters: 1000, gal: 3785.41, qt: 946.353, pt: 473.176, l: 1000, lt: 1000, ml: 1, cup: 236.588, cups: 236.588, tbsp: 14.7868, tsp: 4.92892 };
const COUNT = { ct: 1, count: 1, each: 1, ea: 1, pk: 1, pack: 1, dozen: 12, dz: 12 };
const num = s => { const [a, b] = String(s).split('/'); return b ? a / b : Number(a); };

/** Kroger package size -> { grams, ml, count }. Handles "16 oz", "1 gal", "12 ct", "each", "6 ct / 5.3 oz", "1/2 gal". */
export function parsePackage(size) {
  const s = String(size || '').toLowerCase().replace(/fl\.?\s*oz/g, 'fl oz').trim();
  const out = {};
  if (!s) return out;
  // Kroger multi-item sizes: "6 ct / 18 oz" = 6 items weighing 18 oz in total; "4 pk / 15.5 oz" = 4 packs of 15.5 oz each
  const multi = s.match(/^(\d+)\s*(ct|count|pk|pack)\s*\/\s*(\d+\/\d+|\d*\.?\d+)\s*(fl oz|oz|g|lbs?|ml|l|liter)\b/);
  if (multi) {
    const n = +multi[1], each = /pk|pack/.test(multi[2]), q = num(multi[3]) * (each ? n : 1), u = multi[4];
    if (MASS[u]) out.grams = q * MASS[u]; else out.ml = q * VOL[u];
    out.count = n; return out;
  }
  const re = /(\d+\/\d+|\d*\.?\d+)\s*(fl oz|oz|lbs?|kg|g|gal|qt|pt|ml|liters?|l|lt|cups?|tbsp|tsp|ct|count|each|ea|pk|pack|dozen|dz)\b/g;
  let m;
  while ((m = re.exec(s))) {
    const q = num(m[1]), u = m[2];
    if (MASS[u] && out.grams == null) out.grams = q * MASS[u];
    else if (VOL[u] && out.ml == null) out.ml = q * VOL[u];
    else if (COUNT[u] && out.count == null) out.count = q * COUNT[u];
  }
  if (/^(1\s*)?(each|ea)$/.test(s)) out.count = 1;
  return out;
}

/** The food's serving -> { grams, ml }. grams is the as-bought (raw/dry) weight from the USDA pull. */
export function servingAmount(food) {
  const u = String(food.unit).toLowerCase(), q = Number(food.serving_size);
  const out = { grams: food.serving_grams ? Number(food.serving_grams) : null, ml: null };
  if (MASS[u]) out.grams = q * MASS[u];
  if (VOL[u]) out.ml = q * VOL[u];
  return out;
}

// ---------- selection + scaling ----------
const lc = s => String(s || '').toLowerCase();
export const isOrganic = c => /organic/.test(lc(c.description)) || /organic/.test(lc(c.brand));
export const isStoreBrand = c => RULES.storeBrands.some(b => lc(c.brand) === lc(b) || lc(c.description).startsWith(lc(b) + '®') || lc(c.description).startsWith(lc(b) + '™') || lc(c.description).startsWith(lc(b) + ' '));
// Unbranded: no brand, a listed generic brand, a "Fresh …" produce label, or an all-caps commodity label ("PORK")
export const isGeneric = c => !c.brand || /^fresh\b/i.test(c.brand) || RULES.genericBrands.some(b => lc(c.brand) === lc(b))
  || (/^[A-Z &]+$/.test(c.brand) && /produce|meat & seafood/i.test(c.categories || '')); // "PORK", "BEEF" labels on fresh meat

/** Search specs for a food: the main one, then its `alternates` (other preparations / closest substitutes) in order. */
export function foodSpecs(food) {
  const o = RULES.foods[String(food.food_id)] || {};
  return [{ label: 'primary' }, ...(o.alternates || []).map((a, i) => ({ label: a.label || `alternate ${i + 1}`, ...a }))];
}

export function foodRules(food, spec = null) {
  const base = RULES.foods[String(food.food_id)] || {};
  const o = spec && spec.label !== 'primary' ? { ...base, ...spec } : base;
  const cat = RULES.categories[String(food.food_category_id)] || {};
  return {
    term: o.term || food.food_name,
    must: o.must || [],
    exclude: [...RULES.excludeAlways, ...(cat.exclude || []), ...(o.exclude || [])].filter(t => !(o.allow || []).includes(t)),
    categories: o.categories || cat.categories || [],
    density: o.density ?? cat.density ?? 1,
    unitGrams: o.unitGrams, unitsPerPackageItem: o.unitsPerPackageItem,
    servingGrams: o.servingGrams, packageYield: o.packageYield, label: spec?.label || 'primary',
  };
}

/** Regular price scaled to one serving. Returns { price_per_serving, package_grams, how, flags[] } or { error }. */
export function perServing(food, c, spec = null) {
  const r = foodRules(food, spec), sv = servingAmount(food), pk = parsePackage(c.size);
  const price = Number(c.regular), flags = [];
  // Alternate preparation: serving re-expressed in the alternate form (e.g. 50 g dry chickpeas = 116 g canned, drained)
  if (r.servingGrams) { sv.grams = r.servingGrams; sv.ml = null; }
  // Only part of the package is the food (drained can)
  if (r.packageYield) { if (pk.grams) pk.grams *= r.packageYield; if (pk.ml) pk.ml *= r.packageYield; flags.push(`${Math.round(r.packageYield * 100)}% of package usable`); }
  if (r.label !== 'primary') flags.push(`alternate: ${r.label}`);
  if (!(price > 0)) return { error: 'no regular price' };
  const unitServing = ['unit', 'clove'].includes(lc(food.unit));
  // Sold by weight: Kroger's regular price is per lb
  if (lc(c.sold_by) === 'weight') {
    if (!sv.grams) return { error: 'sold by weight but serving has no grams' };
    flags.push('priced per lb');
    return { priced_g: sv.grams, price_per_serving: price * sv.grams / MASS.lb, package_grams: MASS.lb, how: `$${price}/lb × ${sv.grams.toFixed(1)} g`, flags };
  }
  // Each / count packages for per-unit servings (produce, tortillas, garlic)
  if (unitServing && pk.count) {
    const per = r.unitsPerPackageItem || 1; // e.g. garlic: cloves per bulb
    return { priced_g: sv.grams, price_per_serving: price / (pk.count * per) * Number(food.serving_size), package_grams: null, how: `$${price} / ${pk.count * per} ${lc(food.unit)}s`, flags };
  }
  // Volume serving and volume package (milk by the cup, syrups by the tbsp)
  if (sv.ml && pk.ml) return { priced_g: sv.grams, price_per_serving: price * sv.ml / pk.ml, package_grams: null, how: `$${price} × ${sv.ml.toFixed(1)} ml / ${pk.ml.toFixed(0)} ml`, flags };
  // Weight serving and weight package (the common case)
  if (sv.grams && pk.grams) return { priced_g: sv.grams, price_per_serving: price * sv.grams / pk.grams, package_grams: pk.grams, how: `$${price} × ${sv.grams.toFixed(1)} g / ${pk.grams.toFixed(0)} g`, flags };
  // Weight serving, volume package (skim milk 240 g, oil 15 g): convert with density
  if (sv.grams && pk.ml) {
    const g = pk.ml * r.density; flags.push(`density ${r.density} g/ml`);
    return { priced_g: sv.grams, price_per_serving: price * sv.grams / g, package_grams: g, how: `$${price} × ${sv.grams.toFixed(1)} g / (${pk.ml.toFixed(0)} ml × ${r.density})`, flags };
  }
  // Weight serving, count package (eggs: 12 ct, 50 g each)
  if (sv.grams && pk.count && r.unitGrams) {
    flags.push(`${r.unitGrams} g per unit`);
    return { priced_g: sv.grams, price_per_serving: price / pk.count * sv.grams / r.unitGrams, package_grams: pk.count * r.unitGrams, how: `$${price} / ${pk.count} × ${sv.grams} g / ${r.unitGrams} g`, flags };
  }
  // Per-unit serving but package sold by weight (e.g. a bagged 3 lb of onions): use the unit's grams
  if (unitServing && sv.grams && pk.grams) return { priced_g: sv.grams, price_per_serving: price * sv.grams / pk.grams, package_grams: pk.grams, how: `$${price} × ${sv.grams} g / ${pk.grams.toFixed(0)} g`, flags };
  return { error: `can't relate package "${c.size}" to serving ${food.serving_size} ${food.unit}` };
}

/** Why a candidate is not eligible ('' if it is). */
export function ineligible(food, c, { allowOrganic = false, spec = null } = {}) {
  const r = foodRules(food, spec), d = lc(`${c.description} ${c.brand}`);
  if (!(Number(c.regular) > 0)) return 'no regular price at this store';
  if (isOrganic(c) && !allowOrganic) return 'organic';
  if (r.categories.length && !String(c.categories || '').split(/;\s*/).some(k => r.categories.includes(k))) return `category: ${c.categories || 'none'}`;
  const word = alt => new RegExp(`(^|[^a-z0-9])${alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?($|[^a-z0-9])`, 'i');
  const miss = r.must.filter(t => !lc(t).split('|').some(alt => word(alt).test(d)));
  if (miss.length) return `missing: ${miss.join(', ')}`;
  const hit = r.exclude.filter(t => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(d));
  if (hit.length) return `excluded: ${hit.join(', ')}`;
  return '';
}

/**
 * Score every candidate and pick one: store brand first, then unbranded produce, then national brands;
 * within a tier the lowest regular price per serving; ties by Kroger's search rank.
 */
export function rankCandidates(food, cands, spec = null) {
  const score = allowOrganic => cands.map(c => {
    const why = ineligible(food, c, { allowOrganic, spec });
    const ps = why ? {} : perServing(food, c, spec);
    const tier = isStoreBrand(c) ? 0 : isGeneric(c) ? 1 : 2;
    return { ...c, tier, why: why || ps.error || '', ...ps, eligible: !why && !ps.error };
  });
  // Organic only when nothing non-organic qualifies (rule 2)
  let scored = score(false), organicFallback = false;
  if (!scored.some(s => s.eligible)) { const alt = score(true); if (alt.some(s => s.eligible)) { scored = alt; organicFallback = true; } }
  const best = scored.filter(s => s.eligible)
    .sort((a, b) => a.tier - b.tier || a.price_per_serving - b.price_per_serving || a.rank - b.rank)[0];
  for (const s of scored) {
    s.selected = s === best;
    if (s.selected && s.tier === 2) s.flags = [...(s.flags || []), 'no store brand: national brand used'];
    if (s.selected && organicFallback) s.flags = [...(s.flags || []), 'only organic available'];
    if (s.selected && (s.price_per_serving > RULES.check.maxPerServing || s.price_per_serving < RULES.check.minPerServing))
      s.flags = [...(s.flags || []), `price/serving outside $${RULES.check.minPerServing}–$${RULES.check.maxPerServing}`];
  }
  return { best, scored };
}

/** Full lookup for one food at one store (what the add-food workflow will call). */
export async function priceFood(food, stores) {
  // stores: [home, ...alternates]. Home store first with every spec, then the next store.
  const tried = [];
  for (const store of stores) for (const spec of foodSpecs(food)) {
    const cands = await searchProducts(foodRules(food, spec).term, store.location_id);
    const res = rankCandidates(food, cands, spec);
    tried.push({ store, spec, ...res });
    if (res.best) return { ...res, store, spec, tried };
  }
  return { best: null, tried };
}

// ---------- CSV ----------
export const csvCell = v => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
export const toCsv = rows => rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1 || r[0]);
}
export const readCsv = file => { const [h, ...rows] = parseCsv(fs.readFileSync(file, 'utf8')); return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))); };
