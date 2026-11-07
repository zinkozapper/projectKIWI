// Step 1: find the store for a ZIP, search Kroger for every food, pre-pick one product per food.
//   node --env-file=.env scripts/kroger/1-search.mjs [--zip 84601] [--only 1,2,3] [--reselect]
//   Output: data/kroger/<zip>/store.json, foods.json, candidates.csv (one "x" per food in `selected` — review and move as needed)
//   --only      re-search just these food IDs; every other food's rows are kept
//   --reselect  re-apply the rules in price-rules.json to the existing candidates.csv without calling the API
// Order per food (docs/kroger-price-selection-rules.md): home store with the main search, then its alternates
// (other preparations / closest substitutes), then the same at up to 3 backup stores (largest by department count).
import fs from 'node:fs';
import path from 'node:path';
import { OUT, ROOT, RULES, nearestStore, alternateStores, searchProducts, rankCandidates, foodRules, foodSpecs, servingAmount, readCsv, toCsv } from './lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const zip = arg('--zip', RULES.defaultZip);
const only = arg('--only') ? new Set(arg('--only').split(',').map(String)) : null;
const reselect = process.argv.includes('--reselect');
const dir = path.join(OUT, zip); fs.mkdirSync(dir, { recursive: true });
const FILE = path.join(dir, 'candidates.csv'), STORE = path.join(dir, 'store.json');

// ---- foods + serving grams ----
async function loadFoods() {
  // --reselect reuses the food list saved by the last search, so it works offline
  const cache = path.join(dir, 'foods.json');
  let foods;
  if (reselect && fs.existsSync(cache)) foods = JSON.parse(fs.readFileSync(cache, 'utf8'));
  else {
    const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env');
    const res = await fetch(`${url}/rest/v1/food?select=food_id,food_name,food_category_id,serving_size,unit&order=food_id`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Supabase food ${res.status}: ${await res.text()}`);
    foods = await res.json();
    fs.writeFileSync(cache, JSON.stringify(foods, null, 1));
  }
  const grams = {};
  const usda = path.join(ROOT, 'data/usda');
  for (const r of readCsv(path.join(usda, 'kiwi-foods.csv'))) { const m = r.serving.match(/\((\d*\.?\d+) g\)/); if (m) grams[r.food_name] = +m[1]; }
  for (const r of readCsv(path.join(usda, 'existing-factor-updates.csv'))) if (+r.serving_g) grams[r.food] = +r.serving_g;
  for (const r of readCsv(path.join(usda, 'import-log.csv'))) if (+r.serving_g_unprepared) grams[r.food] = +r.serving_g_unprepared;
  grams['Soy Sauce / Tamari'] ??= grams['Soy Sauce'];
  return foods.map(f => ({ ...f, serving_grams: servingAmount(f).grams ?? grams[f.food_name] ?? null }));
}

const head = ['food_id', 'food', 'serving', 'serving_g', 'selected', 'tier', 'eligible', 'reason', 'product_id', 'upc', 'brand', 'description', 'size', 'package_g', 'sold_by', 'regular', 'promo', 'price_per_serving', 'how', 'flags', 'search_term', 'rank', 'categories', 'store_id', 'spec', 'priced_g'];
const tierName = ['store brand', 'unbranded', 'national brand'];
const row = (f, s, store, spec) => [f.food_id, f.food_name, `${f.serving_size} ${f.unit}`, f.serving_grams ?? '', s.selected ? 'x' : '', tierName[s.tier] ?? '', s.eligible ? 'yes' : '', s.why,
  s.product_id, s.upc, s.brand, s.description, s.size, s.package_grams == null ? '' : (+s.package_grams).toFixed(1), s.sold_by, s.regular, s.promo, s.price_per_serving == null ? '' : s.price_per_serving.toFixed(4), s.how || '', (s.flags || []).join('; '), foodRules(f, spec).term, s.rank, s.categories, store, spec.label, s.priced_g == null ? '' : (+s.priced_g).toFixed(1)];
const storeName = id => id === stores.home.location_id ? 'home store' : (stores.alternates.find(s => s.location_id === id)?.name || id);
const summary = (f, best, n, store, spec) => console.log(`${String(f.food_id).padStart(3)} ${f.food_name.padEnd(28)} ${String(n).padStart(3)} items -> ${best ? `${best.brand} | ${best.description} | ${best.size} | $${best.regular} -> $${best.price_per_serving.toFixed(2)}/serving${store !== stores.home.location_id ? ` @ ${storeName(store)}` : ''}${best.flags?.length ? ' [' + best.flags.join('; ') + ']' : ''}` : 'NONE — left unpriced'}`);

// Rank one food across (store, spec) groups in order; the first group with an eligible product wins.
function pickAcross(f, groups) {
  const out = []; let winner = null, n = 0;
  for (const g of groups) {
    const { best, scored } = rankCandidates(f, g.cands, g.spec);
    if (winner) for (const s of scored) s.selected = false; // only the first winning group keeps its x
    else if (best) winner = { best, ...g };
    n += g.cands.length;
    scored.forEach(s => out.push(row(f, s, g.store, g.spec)));
    if (!scored.length) out.push(row(f, { why: 'no search results' }, g.store, g.spec));
  }
  summary(f, winner?.best, n, winner?.store, winner?.spec);
  return out;
}

// ---- stores ----
let stores;
if (reselect) {
  const saved = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  stores = { home: saved.store, alternates: saved.alternates || [] };
} else {
  const home = await nearestStore(zip);
  if (!home) throw new Error(`No Kroger-family store within ${RULES.storeRadiusMiles} mi of ${zip}`);
  const alternates = await alternateStores(zip, home.location_id);
  stores = { home, alternates };
  fs.writeFileSync(STORE, JSON.stringify({ zip, store: home, alternates, fetched_at: new Date().toISOString() }, null, 2));
  console.log(`ZIP ${zip} -> ${home.name} (${home.location_id})`);
  console.log(`Backup stores (most departments within ${RULES.altStores.radiusMiles} mi): ${alternates.map(s => `${s.name} [${s.departments}]`).join('; ') || 'none'}\n`);
}

const out = [head];
const foods = await loadFoods();
if (reselect) {
  const rows = readCsv(FILE);
  for (const f of foods) {
    const mine = rows.filter(r => r.food_id === String(f.food_id));
    if (!mine.length) continue;
    // rebuild the (store, spec) groups in their search order
    const keys = [...new Set(mine.map(r => `${r.store_id || stores.home.location_id}|${r.spec || 'primary'}`))];
    const specs = foodSpecs(f);
    const groups = keys.map(k => {
      const [store, label] = k.split('|');
      const spec = specs.find(s => s.label === label) || specs[0];
      const cands = mine.filter(r => `${r.store_id || stores.home.location_id}|${r.spec || 'primary'}` === k && r.product_id).map(r => ({ rank: +r.rank, product_id: r.product_id, upc: r.upc, brand: r.brand, description: r.description,
        categories: r.categories, size: r.size, sold_by: r.sold_by, regular: r.regular === '' ? null : +r.regular, promo: r.promo === '' ? null : +r.promo }));
      return { store, spec, cands };
    });
    out.push(...pickAcross(f, groups));
  }
} else {
  for (const f of foods) {
    if (only && !only.has(String(f.food_id))) continue;
    if (!f.serving_grams && !servingAmount(f).ml) console.warn(`  ! ${f.food_name}: no serving grams found`);
    const groups = [];
    for (const store of [stores.home, ...stores.alternates]) {
      for (const spec of foodSpecs(f)) {
        const cands = await searchProducts(foodRules(f, spec).term, store.location_id);
        groups.push({ store: store.location_id, spec, cands });
        await new Promise(r => setTimeout(r, process.env.KROGER_DELAY_MS ?? 250)); // be polite: ~4 req/s
        if (rankCandidates(f, cands, spec).best) break;
      }
      if (groups.some(g => rankCandidates(f, g.cands, g.spec).best)) break;
    }
    out.push(...pickAcross(f, groups));
  }
}
// --only re-searches a few foods: keep every other food's rows from the existing file
if (only && !reselect && fs.existsSync(FILE)) {
  const keep = readCsv(FILE).filter(r => !only.has(r.food_id)).map(r => head.map(h => r[h] ?? ''));
  const all = [...keep, ...out.slice(1)].sort((a, b) => a[0] - b[0]);
  out.splice(1, out.length - 1, ...all);
}
fs.writeFileSync(FILE, toCsv(out));
console.log(`\nWrote ${path.relative(ROOT, FILE)}. Review the "x" in the selected column, then run 2-build.mjs --zip ${zip}`);
