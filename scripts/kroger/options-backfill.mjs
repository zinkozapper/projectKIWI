// RETIRED: use styles-backfill.mjs, which builds styles from the products the store actually sells.
// Purchase options for foods already in the catalog (new foods get them from the add-food workflow).
// Same AI instructions and Kroger rules as the workflow: src/lib/food-import/purchase-options.ts, pricing.ts.
//
//   node --env-file=.env scripts/kroger/options-backfill.mjs --ai      # Claude lists each food's options -> data/kroger/<zip>/options.json
//      review/edit options.json (delete an option, fix a term), then:
//   node --env-file=.env scripts/kroger/options-backfill.mjs --price   # Kroger prices them -> options.csv + options.sql
//   Optional: --zip 84601 (default), --only 1,2,3 (food ids), --force (redo foods that already have options)
// Run options.sql in the Supabase SQL editor (service role). Rules: docs/kroger-price-selection-rules.md "Purchase options".
import fs from 'node:fs';
import path from 'node:path';
import { OUT, ROOT, RULES, nearestStore, alternateStores, priceFood, isStoreBrand, toCsv } from './lib.mjs';
import { OPTIONS_SYSTEM, OPTIONS_TOOL, averagePrice, cleanOptions, optionPriceFood } from '../../src/lib/food-import/purchase-options.ts';

console.warn('options-backfill.mjs is retired: use scripts/kroger/styles-backfill.mjs instead.');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const zip = arg('--zip', RULES.defaultZip);
const only = arg('--only') ? new Set(arg('--only').split(',').map(Number)) : null;
const force = process.argv.includes('--force');
const dir = path.join(OUT, zip); fs.mkdirSync(dir, { recursive: true });
const OPTIONS = path.join(dir, 'options.json');
// --only runs write their own files, so a partial rerun never overwrites the full run's options.csv / options.sql.
const suffix = only ? `-only-${[...only].join('-')}` : '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function supabase(pathAndQuery) {
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Supabase ${pathAndQuery.split('?')[0]} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function loadFoods() {
  const foods = await supabase('food?select=food_id,food_name,food_group,food_category_id,serving_size,unit,factor,cook_ratio&order=food_id');
  // Same serving grams as the price worker: factor × 100 is the nutrient basis (cooked for meat, grains, beans);
  // dividing by the cook ratio gives the raw/dry grams you buy.
  return foods.map(f => {
    const prepared = Number(f.factor) * 100;
    const ratio = Number(f.cook_ratio) > 0 ? Number(f.cook_ratio) : 1;
    return { ...f, serving_grams: prepared / ratio, prepared_grams: prepared };
  });
}

async function askClaude(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Set ANTHROPIC_API_KEY in .env');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 800, system: OPTIONS_SYSTEM,
        tools: [OPTIONS_TOOL], tool_choice: { type: 'tool', name: OPTIONS_TOOL.name }, messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (res.ok) return (await res.json()).content?.find(c => c.type === 'tool_use')?.input ?? {};
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) { await sleep(2000 * attempt); continue; }
    throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

// ---------- step 1: AI lists the options ----------
async function aiStep() {
  const foods = await loadFoods();
  const existing = new Set((await supabase('food_option?select=food_id')).map(o => o.food_id));
  const saved = fs.existsSync(OPTIONS) ? JSON.parse(fs.readFileSync(OPTIONS, 'utf8')) : {};
  const todo = foods.filter(f => (!only || only.has(f.food_id)) && (force || !existing.has(f.food_id)));
  let i = 0;
  const worker = async () => {
    for (let f = todo[i++]; f; f = todo[i++]) {
      const answer = await askClaude(`Food: ${f.food_name}\nFood group: ${f.food_group ?? 'unknown'}\nKiwi's serving: ${f.serving_size} ${f.unit}`);
      const options = cleanOptions(answer.purchaseOptions, f.food_name);
      saved[f.food_id] = { food: f.food_name, options };
      console.log(`${String(f.food_id).padStart(3)} ${f.food_name.padEnd(28)} ${options.length ? options.map(o => `${o.label} [${o.search_term}]`).join(' · ') : '— one way to buy it'}`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  fs.writeFileSync(OPTIONS, JSON.stringify(saved, null, 2));
  console.log(`\nWrote ${path.relative(ROOT, OPTIONS)} (${Object.keys(saved).length} foods). Review it, then run with --price.`);
}

// ---------- step 2: Kroger prices each option ----------
const q = v => v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const n = v => v == null || v === '' || !Number.isFinite(+v) ? 'NULL' : String(+v);
const arr = a => `ARRAY[${a.map(q).join(', ')}]::text[]`;

async function priceStep() {
  const plan = JSON.parse(fs.readFileSync(OPTIONS, 'utf8'));
  const foods = new Map((await loadFoods()).map(f => [String(f.food_id), f]));
  const home = await nearestStore(zip);
  if (!home) throw new Error(`No Kroger-family store near ${zip}`);
  let backups;
  const moreStores = () => (backups ??= alternateStores(zip, home.location_id));
  console.log(`ZIP ${zip} -> ${home.name} (${home.location_id})\n`);
  const csv = [['food_id', 'food', 'option', 'form', 'basis', 'search_term', 'brand', 'product', 'size', 'regular', 'serving_g', 'price_per_serving', 'store', 'flags']];
  const optionRows = [], priceRows = [], usedStores = new Map([[home.location_id, home]]);
  for (const [foodId, { options }] of Object.entries(plan)) {
    const f = foods.get(foodId);
    if (!f || (only && !only.has(Number(foodId))) || !options?.length) continue;
    const prices = [];
    for (const o of options) {
      const hit = await priceFood(optionPriceFood(f, o), home, moreStores);
      const b = hit.best, backup = hit.store && hit.store.location_id !== home.location_id;
      if (backup) usedStores.set(hit.store.location_id, hit.store);
      const pps = b ? Math.round(b.price_per_serving * 10000) / 10000 : null;
      prices.push(pps);
      const flags = [...(b?.flags ?? []), ...(backup ? [`from backup store: ${hit.store.name}`] : [])].join('; ');
      csv.push([foodId, f.food_name, o.label, o.form, o.basis, o.search_term, b?.brand, b?.description, b?.size, b?.regular, b?.priced_g?.toFixed(1), pps, b ? (backup ? hit.store.name : 'home') : '', b ? flags : 'no product found']);
      optionRows.push(`(${foodId}, ${q(o.form)}, ${q(o.label)}, ${q(o.search_term)}, ${arr(o.must)}, ${q(o.basis)}, ${n(o.package_yield)}, ${n(o.unit_grams)}, ${n(pps == null ? 0 : Math.round(pps * 100) / 100)}, ${n(o.sort_order)})`);
      if (b) priceRows.push(`(${foodId}, ${q(o.form)}, ${q(home.location_id)}, ${q(backup ? hit.store.location_id : null)}, ${q(b.product_id)}, ${q(b.upc)}, ${q(b.brand)}, ${q(b.description)}, ${q(b.size)}, ${q(b.sold_by)}, ${n(b.regular)}, ${n(b.package_grams)}, ${n(b.priced_g || f.serving_grams)}, ${pps}, ${isStoreBrand(b)}, ${q(flags || null)})`);
      console.log(`${String(foodId).padStart(3)} ${f.food_name.padEnd(26)} ${o.label.padEnd(12)} ${b ? `$${b.regular} ${b.size} -> $${pps.toFixed(2)}/serving | ${b.description}` : 'NONE'}`);
      await sleep(Number(process.env.KROGER_DELAY_MS ?? 250));
    }
    const avg = averagePrice(prices);
    if (avg != null) console.log(`    average $${avg.toFixed(2)}/serving`);
  }
  fs.writeFileSync(path.join(dir, `options${suffix}.csv`), toCsv(csv));

  const stores = [...usedStores.values()].map(s => `(${q(s.location_id)}, ${q(s.chain)}, ${q(s.name)}, ${q(s.address)}, ${q(s.city)}, ${q(s.state)}, ${q(s.zip_code)}, ${n(s.latitude)}, ${n(s.longitude)}, now())`);
  const sql = [`-- Generated by scripts/kroger/options-backfill.mjs for ZIP ${zip} on ${new Date().toISOString()}`, 'BEGIN;',
    `INSERT INTO public.kroger_store (location_id, chain, name, address, city, state, zip_code, latitude, longitude, fetched_at)\nVALUES ${stores.join(',\n')}\nON CONFLICT (location_id) DO UPDATE SET name = EXCLUDED.name, fetched_at = now();`,
    `INSERT INTO public.zip_store (zip_code, location_id, fetched_at) VALUES (${q(zip)}, ${q(home.location_id)}, now())\nON CONFLICT (zip_code) DO UPDATE SET location_id = EXCLUDED.location_id, fetched_at = now();`];
  if (optionRows.length) {
    sql.push(`INSERT INTO public.food_option (food_id, form, label, search_term, must, basis, package_yield, unit_grams, price, sort_order)
VALUES
${optionRows.join(',\n')}
ON CONFLICT (food_id, form) DO UPDATE SET label = EXCLUDED.label, search_term = EXCLUDED.search_term, must = EXCLUDED.must, basis = EXCLUDED.basis,
  package_yield = EXCLUDED.package_yield, unit_grams = EXCLUDED.unit_grams, price = CASE WHEN ${zip === RULES.defaultZip ? 'true' : 'false'} THEN EXCLUDED.price ELSE food_option.price END, sort_order = EXCLUDED.sort_order;`);
  }
  if (priceRows.length) {
    sql.push(`INSERT INTO public.food_option_price (food_option_id, location_id, source_location_id, product_id, upc, brand, description, package_size, sold_by, package_price, package_grams, serving_grams, price_per_serving, store_brand, flags)
SELECT o.food_option_id, v.location_id, v.source_location_id, v.product_id, v.upc, v.brand, v.description, v.package_size, v.sold_by, v.package_price, v.package_grams, v.serving_grams, v.price_per_serving, v.store_brand, v.flags
FROM (VALUES
${priceRows.join(',\n')}
) AS v(food_id, form, location_id, source_location_id, product_id, upc, brand, description, package_size, sold_by, package_price, package_grams, serving_grams, price_per_serving, store_brand, flags)
JOIN public.food_option o ON o.food_id = v.food_id AND o.form = v.form
ON CONFLICT (food_option_id, location_id) DO UPDATE SET source_location_id = EXCLUDED.source_location_id, product_id = EXCLUDED.product_id, upc = EXCLUDED.upc,
  brand = EXCLUDED.brand, description = EXCLUDED.description, package_size = EXCLUDED.package_size, sold_by = EXCLUDED.sold_by, package_price = EXCLUDED.package_price,
  package_grams = EXCLUDED.package_grams, serving_grams = EXCLUDED.serving_grams, price_per_serving = EXCLUDED.price_per_serving, store_brand = EXCLUDED.store_brand,
  flags = EXCLUDED.flags, fetched_at = now();`);
  }
  if (zip === RULES.defaultZip && optionRows.length) {
    sql.push(`-- No option picked = the average of the priced options (food.price is the app-wide default price)
UPDATE public.food f SET price = a.avg FROM (
  SELECT food_id, round(avg(price), 2) AS avg FROM public.food_option WHERE price > 0 GROUP BY food_id
) a WHERE a.food_id = f.food_id;`);
  }
  sql.push('COMMIT;');
  fs.writeFileSync(path.join(dir, `options${suffix}.sql`), sql.join('\n\n') + '\n');
  console.log(`\nWrote ${path.relative(ROOT, dir)}/options${suffix}.csv and options${suffix}.sql (${optionRows.length} options, ${priceRows.length} priced).`);
}

if (process.argv.includes('--ai')) await aiStep();
else if (process.argv.includes('--price')) await priceStep();
else console.log('Run with --ai first, review options.json, then --price. See the comment at the top of this file.');
