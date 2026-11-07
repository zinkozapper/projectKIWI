// Step 1: find the store for a ZIP, search Kroger for every food, pre-pick one product per food.
//   node --env-file=.env scripts/kroger/1-search.mjs [--zip 84601] [--only 1,2,3] [--reselect]
//   Output: data/kroger/<zip>/store.json, candidates.csv (one "x" per food in `selected` — review and move as needed)
//   --reselect  re-apply the rules in price-rules.json to an existing candidates.csv without calling the API
// Foods come from Supabase (public read). Serving grams for cup/tbsp/unit servings come from the USDA pull files.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, ROOT, RULES, nearestStore, searchProducts, rankCandidates, foodRules, servingAmount, readCsv, toCsv } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const zip = arg('--zip', RULES.defaultZip);
const only = arg('--only') ? new Set(arg('--only').split(',').map(String)) : null;
const dir = path.join(OUT, zip); fs.mkdirSync(dir, { recursive: true });
const FILE = path.join(dir, 'candidates.csv');

// ---- foods + serving grams ----
async function loadFoods() {
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  const res = await fetch(`${url}/rest/v1/food?select=food_id,food_name,food_category_id,serving_size,unit&order=food_id`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Supabase food ${res.status}: ${await res.text()}`);
  const foods = await res.json();
  const grams = {};
  const usda = path.join(ROOT, 'data/usda');
  for (const r of readCsv(path.join(usda, 'kiwi-foods.csv'))) { const m = r.serving.match(/\((\d*\.?\d+) g\)/); if (m) grams[r.food_name] = +m[1]; }
  for (const r of readCsv(path.join(usda, 'existing-factor-updates.csv'))) if (+r.serving_g) grams[r.food] = +r.serving_g;
  for (const r of readCsv(path.join(usda, 'import-log.csv'))) if (+r.serving_g_unprepared) grams[r.food] = +r.serving_g_unprepared;
  grams['Soy Sauce / Tamari'] ??= grams['Soy Sauce'];
  return foods.map(f => ({ ...f, serving_grams: servingAmount(f).grams ?? grams[f.food_name] ?? null }));
}

const head = ['food_id', 'food', 'serving', 'serving_g', 'selected', 'tier', 'eligible', 'reason', 'product_id', 'upc', 'brand', 'description', 'size', 'package_g', 'sold_by', 'regular', 'promo', 'price_per_serving', 'how', 'flags', 'search_term', 'rank', 'categories'];
const tierName = ['store brand', 'unbranded', 'national brand'];
const row = (f, s) => [f.food_id, f.food_name, `${f.serving_size} ${f.unit}`, f.serving_grams ?? '', s.selected ? 'x' : '', tierName[s.tier], s.eligible ? 'yes' : '', s.why,
  s.product_id, s.upc, s.brand, s.description, s.size, s.package_grams == null ? '' : (+s.package_grams).toFixed(1), s.sold_by, s.regular, s.promo, s.price_per_serving == null ? '' : s.price_per_serving.toFixed(4), s.how || '', (s.flags || []).join('; '), foodRules(f).term, s.rank, s.categories];
const summary = (f, best, n) => console.log(`${String(f.food_id).padStart(3)} ${f.food_name.padEnd(28)} ${String(n).padStart(3)} items -> ${best ? `${best.brand} | ${best.description} | ${best.size} | $${best.regular} -> $${best.price_per_serving.toFixed(2)}/serving${best.flags?.length ? ' [' + best.flags.join('; ') + ']' : ''}` : 'NONE — pick manually or adjust price-rules.json'}`);

const out = [head];
if (process.argv.includes('--reselect')) {
  const rows = readCsv(FILE);
  const foods = Object.fromEntries((await loadFoods()).map(f => [String(f.food_id), f]));
  for (const id of [...new Set(rows.map(r => r.food_id))]) {
    const f = foods[id]; if (!f) continue;
    // reload only what Kroger returned; selection and prices are recomputed from the current rules
    const cands = rows.filter(r => r.food_id === id && r.product_id).map(r => ({ rank: +r.rank, product_id: r.product_id, upc: r.upc, brand: r.brand, description: r.description,
      categories: r.categories, size: r.size, sold_by: r.sold_by, regular: r.regular === '' ? null : +r.regular, promo: r.promo === '' ? null : +r.promo }));
    const { best, scored } = rankCandidates(f, cands);
    scored.forEach(s => out.push(row(f, s))); if (!scored.length) out.push(row(f, { why: 'no search results' }));
    summary(f, best, cands.length);
  }
} else {
  const store = await nearestStore(zip);
  if (!store) throw new Error(`No Kroger-family store within ${RULES.storeRadiusMiles} mi of ${zip}`);
  fs.writeFileSync(path.join(dir, 'store.json'), JSON.stringify({ zip, store, fetched_at: new Date().toISOString() }, null, 2));
  console.log(`ZIP ${zip} -> ${store.name} (${store.location_id}), ${store.address}, ${store.city} ${store.state}\n`);
  for (const f of await loadFoods()) {
    if (only && !only.has(String(f.food_id))) continue;
    if (!f.serving_grams && !servingAmount(f).ml) console.warn(`  ! ${f.food_name}: no serving grams found`);
    const cands = await searchProducts(foodRules(f).term, store.location_id);
    const { best, scored } = rankCandidates(f, cands);
    scored.forEach(s => out.push(row(f, s))); if (!scored.length) out.push(row(f, { why: 'no search results' }));
    summary(f, best, cands.length);
    await new Promise(r => setTimeout(r, process.env.KROGER_DELAY_MS ?? 250)); // be polite: ~4 req/s
  }
}
fs.writeFileSync(FILE, toCsv(out));
console.log(`\nWrote ${path.relative(ROOT, FILE)}. Review the "x" in the selected column, then run 2-build.mjs --zip ${zip}`);
