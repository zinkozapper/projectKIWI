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

/** Nearest Kroger-family grocery store for a ZIP. */
export async function nearestStore(zip, radiusMiles = RULES.storeRadiusMiles) {
  const j = await get('/locations', { 'filter.zipCode.near': zip, 'filter.radiusInMiles': radiusMiles, 'filter.limit': 10 });
  const s = (j.data || []).find(l => !RULES.storeChains.length || RULES.storeChains.includes(String(l.chain).toUpperCase())) || (j.data || [])[0];
  if (!s) return null;
  return {
    location_id: s.locationId, chain: s.chain, name: s.name,
    address: s.address?.addressLine1, city: s.address?.city, state: s.address?.state, zip_code: s.address?.zipCode,
    latitude: s.geolocation?.latitude, longitude: s.geolocation?.longitude,
  };
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
const VOL = { 'fl oz': 29.5735, gal: 3785.41, qt: 946.353, pt: 473.176, l: 1000, lt: 1000, ml: 1, cup: 236.588, cups: 236.588, tbsp: 14.7868, tsp: 4.92892 };
const COUNT = { ct: 1, count: 1, each: 1, ea: 1, pk: 1, pack: 1, dozen: 12, dz: 12 };
const num = s => { const [a, b] = String(s).split('/'); return b ? a / b : Number(a); };

/** Kroger package size -> { grams, ml, count }. Handles "16 oz", "1 gal", "12 ct", "each", "6 ct / 5.3 oz", "1/2 gal". */
export function parsePackage(size) {
  const s = String(size || '').toLowerCase().replace(/fl\.?\s*oz/g, 'fl oz').trim();
  const out = {};
  if (!s) return out;
  const multi = s.match(/^(\d+)\s*(?:ct|pk|count|pack)\s*\/\s*(\d+\/\d+|\d*\.?\d+)\s*(fl oz|oz|g|lb|ml)\b/);
  if (multi) {
    const n = +multi[1], q = num(multi[2]), u = multi[3];
    if (MASS[u]) out.grams = n * q * MASS[u]; else out.ml = n * q * VOL[u];
    out.count = n; return out;
  }
  const re = /(\d+\/\d+|\d*\.?\d+)\s*(fl oz|oz|lbs?|kg|g|gal|qt|pt|ml|l|lt|cups?|tbsp|tsp|ct|count|each|ea|pk|pack|dozen|dz)\b/g;
  let m;
  while ((m = re.exec(s))) {
    const q = num(m[1]), u = m[2];
    if (MASS[u] && out.grams == null) out.grams = q * MASS[u];
    else if (VOL[u] && out.ml == null) out.ml = q * VOL[u];
    else if (COUNT[u] && out.count == null) out.count = q * COUNT[u];
  }
  if (/^each$|^1 each$/.test(s)) out.count = 1;
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
export const isStoreBrand = c => RULES.storeBrands.some(b => lc(c.brand) === lc(b));
export const isGeneric = c => !c.brand || RULES.genericBrands.some(b => lc(c.brand) === lc(b));

export function foodRules(food) {
  const o = RULES.foods[String(food.food_id)] || {};
  const cat = RULES.categories[String(food.food_category_id)] || {};
  return {
    term: o.term || food.food_name,
    must: o.must || [],
    exclude: [...RULES.excludeAlways, ...(cat.exclude || []), ...(o.exclude || [])].filter(t => !(o.allow || []).includes(t)),
    density: o.density ?? cat.density ?? 1,
    unitGrams: o.unitGrams, unitsPerPackageItem: o.unitsPerPackageItem,
  };
}

/** Regular price scaled to one serving. Returns { price_per_serving, package_grams, how, flags[] } or { error }. */
export function perServing(food, c) {
  const r = foodRules(food), sv = servingAmount(food), pk = parsePackage(c.size);
  const price = Number(c.regular), flags = [];
  if (!(price > 0)) return { error: 'no regular price' };
  const unitServing = ['unit', 'clove'].includes(lc(food.unit));
  // Sold by weight: Kroger's regular price is per lb
  if (lc(c.sold_by) === 'weight') {
    if (!sv.grams) return { error: 'sold by weight but serving has no grams' };
    flags.push('priced per lb');
    return { price_per_serving: price * sv.grams / MASS.lb, package_grams: MASS.lb, how: `$${price}/lb × ${sv.grams.toFixed(1)} g`, flags };
  }
  // Each / count packages for per-unit servings (produce, tortillas, garlic)
  if (unitServing && pk.count && !pk.grams) {
    const per = r.unitsPerPackageItem || 1; // e.g. garlic: cloves per bulb
    return { price_per_serving: price / (pk.count * per) * Number(food.serving_size), package_grams: null, how: `$${price} / ${pk.count * per} ${lc(food.unit)}s`, flags };
  }
  // Volume serving and volume package (milk by the cup, syrups by the tbsp)
  if (sv.ml && pk.ml) return { price_per_serving: price * sv.ml / pk.ml, package_grams: null, how: `$${price} × ${sv.ml.toFixed(1)} ml / ${pk.ml.toFixed(0)} ml`, flags };
  // Weight serving and weight package (the common case)
  if (sv.grams && pk.grams) return { price_per_serving: price * sv.grams / pk.grams, package_grams: pk.grams, how: `$${price} × ${sv.grams.toFixed(1)} g / ${pk.grams.toFixed(0)} g`, flags };
  // Weight serving, volume package (skim milk 240 g, oil 15 g): convert with density
  if (sv.grams && pk.ml) {
    const g = pk.ml * r.density; flags.push(`density ${r.density} g/ml`);
    return { price_per_serving: price * sv.grams / g, package_grams: g, how: `$${price} × ${sv.grams.toFixed(1)} g / (${pk.ml.toFixed(0)} ml × ${r.density})`, flags };
  }
  // Weight serving, count package (eggs: 12 ct, 50 g each)
  if (sv.grams && pk.count && r.unitGrams) {
    flags.push(`${r.unitGrams} g per unit`);
    return { price_per_serving: price / pk.count * sv.grams / r.unitGrams, package_grams: pk.count * r.unitGrams, how: `$${price} / ${pk.count} × ${sv.grams} g / ${r.unitGrams} g`, flags };
  }
  // Per-unit serving but package sold by weight (e.g. a bagged 3 lb of onions): use the unit's grams
  if (unitServing && sv.grams && pk.grams) return { price_per_serving: price * sv.grams / pk.grams, package_grams: pk.grams, how: `$${price} × ${sv.grams} g / ${pk.grams.toFixed(0)} g`, flags };
  return { error: `can't relate package "${c.size}" to serving ${food.serving_size} ${food.unit}` };
}

/** Why a candidate is not eligible ('' if it is). */
export function ineligible(food, c) {
  const r = foodRules(food), d = lc(`${c.description} ${c.brand}`);
  if (!(Number(c.regular) > 0)) return 'no regular price at this store';
  if (isOrganic(c)) return 'organic';
  const miss = r.must.filter(t => !lc(t).split('|').some(alt => d.includes(alt)));
  if (miss.length) return `missing: ${miss.join(', ')}`;
  const hit = r.exclude.filter(t => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(d));
  if (hit.length) return `excluded: ${hit.join(', ')}`;
  return '';
}

/**
 * Score every candidate and pick one: store brand first, then unbranded produce, then national brands;
 * within a tier the lowest regular price per serving; ties by Kroger's search rank.
 */
export function rankCandidates(food, cands) {
  const scored = cands.map(c => {
    const why = ineligible(food, c);
    const ps = why ? {} : perServing(food, c);
    const tier = isStoreBrand(c) ? 0 : isGeneric(c) ? 1 : 2;
    return { ...c, tier, why: why || ps.error || '', ...ps, eligible: !why && !ps.error };
  });
  const best = scored.filter(s => s.eligible)
    .sort((a, b) => a.tier - b.tier || a.price_per_serving - b.price_per_serving || a.rank - b.rank)[0];
  for (const s of scored) {
    s.selected = s === best;
    if (s.selected && s.tier === 2) s.flags = [...(s.flags || []), 'no store brand: national brand used'];
    if (s.selected && (s.price_per_serving > RULES.check.maxPerServing || s.price_per_serving < RULES.check.minPerServing))
      s.flags = [...(s.flags || []), `price/serving outside $${RULES.check.minPerServing}–$${RULES.check.maxPerServing}`];
  }
  return { best, scored };
}

/** Full lookup for one food at one store (what the add-food workflow will call). */
export async function priceFood(food, locationId) {
  const r = foodRules(food);
  const cands = await searchProducts(r.term, locationId);
  return rankCandidates(food, cands);
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
