// Purchase styles and their package sizes for foods already in the catalog, built from what the store sells
// (same steps as the add-food workflow: src/lib/food-import/purchase-styles.ts, package-sizes.ts).
//
//   node --env-file=.env scripts/kroger/styles-backfill.mjs [--only 1,2,3] [--zip 84601] [--no-ai-sizes]
//
// Per food: search the store for its usual term, the plain word and the frozen / canned / dried aisles; Claude
// sorts the products found into styles and drops anything that isn't the food; each style is priced from its own
// products, and up to 3 package sizes are picked from them. A food with one style (or none) gets no dropdown.
// Output (review the JSON, then load the SQL — ask Claude to load it):
//   data/kroger/<zip>/styles.json   per food: styles, the products in each, the pick, sizes, and dropped products
//   data/kroger/<zip>/styles.sql    food_option + food_option_price + food_package for the styles; removes a
//                                   processed food's old styles unless a grocery list still points at them.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, ROOT, RULES, foodRules, nearestStore, searchProducts, isStoreBrand } from './lib.mjs';
import { STYLES_SYSTEM, STYLES_TOOL, cleanStyles, coreWord, priceStyle, shelfProducts, styleSearchTerms, stylesPrompt } from '../../src/lib/food-import/purchase-styles.ts';
import { SIZES_SYSTEM, SIZES_TOOL, fallbackRows, forStyle, packageRows, sizeCandidates, sizesPrompt } from '../../src/lib/food-import/package-sizes.ts';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const zip = arg('--zip', RULES.defaultZip);
const only = arg('--only') ? new Set(arg('--only').split(',').map(Number)) : null;
const aiSizes = !process.argv.includes('--no-ai-sizes');
const dir = path.join(OUT, zip); fs.mkdirSync(dir, { recursive: true });
const suffix = only ? `-only-${[...only].join('-')}` : ''; // partial runs never overwrite the full run's files
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DELAY = Number(process.env.KROGER_DELAY_MS ?? 250);

async function supabase(pathAndQuery) {
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Supabase ${pathAndQuery.split('?')[0]} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function askClaude(system, tool, prompt, maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Set ANTHROPIC_API_KEY in .env');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: maxTokens, system,
        tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (res.ok) return (await res.json()).content?.find(c => c.type === 'tool_use')?.input ?? {};
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) { await sleep(2000 * attempt); continue; }
    throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

const foods = (await supabase('food?select=food_id,food_name,food_category_id,serving_size,unit,factor,cook_ratio&order=food_id'))
  .filter(f => !only || only.has(f.food_id))
  .map(f => {
    const prepared = Number(f.factor) * 100;
    const ratio = Number(f.cook_ratio) > 0 ? Number(f.cook_ratio) : 1;
    return { ...f, serving_grams: prepared / ratio, prepared_grams: prepared };
  });
const home = await nearestStore(zip);
if (!home) throw new Error(`No Kroger-family store near ${zip}`);
console.log(`ZIP ${zip} -> ${home.name} (${home.location_id}), ${foods.length} foods\n`);

const q = v => v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const n = v => v == null || v === '' || !Number.isFinite(+v) ? 'NULL' : String(+v);
const arr = a => `ARRAY[${a.map(q).join(', ')}]::text[]`;
const review = {}, optionRows = [], priceRows = [], packageRows_ = [], processed = [];

for (const f of foods) {
  const rule = foodRules({ ...f, food_id: f.food_id });
  const term = rule.term || f.food_name;
  const core = coreWord(f.food_name, rule.must);
  const lists = [];
  for (const t of styleSearchTerms(term, core)) { lists.push(await searchProducts(t, home.location_id).catch(() => [])); await sleep(DELAY); }
  const products = shelfProducts(core, lists);
  const servingText = `${f.serving_size} ${f.unit} (${Math.round(f.serving_grams)} g)`;
  let styles = [];
  if (products.length >= 2) {
    try { styles = cleanStyles((await askClaude(STYLES_SYSTEM, STYLES_TOOL, stylesPrompt(f.food_name, servingText, products), 1200)).styles, products, f.food_name, core); }
    catch (e) { console.error(`  AI failed for ${f.food_name}: ${e.message}`); continue; }
  }
  processed.push(f.food_id);
  const kept = new Set(styles.flatMap(s => s.members.map(m => m.key)));
  review[f.food_id] = { food: f.food_name, searches: styleSearchTerms(term, core), styles: [], dropped: products.filter(p => !kept.has(p.key)).map(p => p.description) };
  if (styles.length < 2) {
    review[f.food_id].note = styles.length ? `one style (${styles[0].option.label}): no dropdown` : 'no styles';
    console.log(`${String(f.food_id).padStart(3)} ${f.food_name.padEnd(26)} — ${review[f.food_id].note}`);
    continue;
  }
  for (const s of styles) {
    const { best, scored } = priceStyle(f, s);
    const o = s.option;
    const pps = best ? Math.round(best.price_per_serving * 10000) / 10000 : null;
    optionRows.push(`(${f.food_id}, ${q(o.form)}, ${q(o.label)}, ${q(o.search_term)}, ${arr(o.must)}, ${q(o.basis)}, ${n(o.package_yield)}, ${n(o.unit_grams)}, ${n(pps == null ? 0 : Math.round(pps * 100) / 100)}, ${n(o.sort_order)})`);
    if (best) priceRows.push(`(${f.food_id}, ${q(o.form)}, ${q(home.location_id)}, NULL, ${q(best.product_id)}, ${q(best.upc)}, ${q(best.brand)}, ${q(best.description)}, ${q(best.size)}, ${q(best.sold_by)}, ${n(best.regular)}, ${n(best.package_grams)}, ${n(best.priced_g || f.serving_grams)}, ${pps}, ${isStoreBrand(best)}, ${q((best.flags ?? []).join('; ') || null)})`);
    // Package sizes from this style's own products
    const cands = forStyle(sizeCandidates(scored), o.form);
    let sizes = fallbackRows(cands);
    if (aiSizes && cands.length > 1) {
      try { const rows = packageRows((await askClaude(SIZES_SYSTEM, SIZES_TOOL, sizesPrompt(f.food_name, o.label, servingText, cands), 400)).sizes, cands); if (rows.length) sizes = rows; }
      catch (e) { console.error(`  sizes AI failed for ${f.food_name} ${o.label}: ${e.message}. Using fixed rules.`); }
    }
    for (const r of sizes) packageRows_.push(`(${f.food_id}, ${q(o.form)}, ${q(r.label)}, ${n(r.servings)}, ${n(r.package_grams)}, ${n(r.package_price)}, ${q(r.product_id)}, ${q(r.description)}, ${q(r.package_size)}, ${r.sort_order}, ${q(r.source)})`);
    review[f.food_id].styles.push({
      label: o.label, form: o.form, basis: o.basis, products: s.members.map(m => m.description),
      pick: best ? `${best.description} · ${best.size} · $${best.regular} -> $${pps.toFixed(2)}/serving` : 'no usable price',
      sizes: sizes.map(r => `${r.label} · $${r.package_price}`),
    });
  }
  console.log(`${String(f.food_id).padStart(3)} ${f.food_name.padEnd(26)} ${review[f.food_id].styles.map(s => `${s.label} (${s.products.length})`).join(' · ')}`);
}

fs.writeFileSync(path.join(dir, `styles${suffix}.json`), JSON.stringify(review, null, 2));
const ids = processed.join(', ') || 'NULL';
const sql = [`-- Generated by scripts/kroger/styles-backfill.mjs for ZIP ${zip} on ${new Date().toISOString()}`, 'BEGIN;',
  `INSERT INTO public.kroger_store (location_id, chain, name, address, city, state, zip_code, latitude, longitude, fetched_at)
VALUES (${q(home.location_id)}, ${q(home.chain)}, ${q(home.name)}, ${q(home.address)}, ${q(home.city)}, ${q(home.state)}, ${q(home.zip_code)}, ${n(home.latitude)}, ${n(home.longitude)}, now())
ON CONFLICT (location_id) DO UPDATE SET name = EXCLUDED.name, fetched_at = now();`,
  `-- Old styles of the foods processed here go, unless a grocery list still points at them.
DELETE FROM public.food_option o WHERE o.food_id IN (${ids})
  AND NOT EXISTS (SELECT 1 FROM public.shopping_list_item s WHERE s.food_option_id = o.food_option_id);`];
if (optionRows.length) {
  sql.push(`INSERT INTO public.food_option (food_id, form, label, search_term, must, basis, package_yield, unit_grams, price, sort_order)
VALUES
${optionRows.join(',\n')}
ON CONFLICT (food_id, form) DO UPDATE SET label = EXCLUDED.label, search_term = EXCLUDED.search_term, must = EXCLUDED.must, basis = EXCLUDED.basis,
  package_yield = EXCLUDED.package_yield, unit_grams = EXCLUDED.unit_grams, price = EXCLUDED.price, sort_order = EXCLUDED.sort_order;`);
}
if (priceRows.length) {
  sql.push(`INSERT INTO public.food_option_price (food_option_id, location_id, source_location_id, product_id, upc, brand, description, package_size, sold_by, package_price, package_grams, serving_grams, price_per_serving, store_brand, flags)
SELECT o.food_option_id, v.location_id, v.source_location_id, v.product_id, v.upc, v.brand, v.description, v.package_size, v.sold_by, v.package_price, v.package_grams, v.serving_grams, v.price_per_serving, v.store_brand, v.flags
FROM (VALUES
${priceRows.join(',\n')}
) AS v(food_id, form, location_id, source_location_id, product_id, upc, brand, description, package_size, sold_by, package_price, package_grams, serving_grams, price_per_serving, store_brand, flags)
JOIN public.food_option o ON o.food_id = v.food_id AND o.form = v.form
ON CONFLICT (food_option_id, location_id) DO UPDATE SET product_id = EXCLUDED.product_id, upc = EXCLUDED.upc, brand = EXCLUDED.brand, description = EXCLUDED.description,
  package_size = EXCLUDED.package_size, sold_by = EXCLUDED.sold_by, package_price = EXCLUDED.package_price, package_grams = EXCLUDED.package_grams,
  serving_grams = EXCLUDED.serving_grams, price_per_serving = EXCLUDED.price_per_serving, store_brand = EXCLUDED.store_brand, flags = EXCLUDED.flags, fetched_at = now();`);
}
if (packageRows_.length) {
  sql.push(`-- Sizes for each style: replace the style's sizes unless a list or pantry row points at one.
DELETE FROM public.food_package p USING public.food_option o
WHERE p.food_option_id = o.food_option_id AND o.food_id IN (${ids})
  AND NOT EXISTS (SELECT 1 FROM public.shopping_list_item s WHERE s.food_package_id = p.food_package_id)
  AND NOT EXISTS (SELECT 1 FROM public.pantry_item i WHERE i.food_package_id = p.food_package_id);
INSERT INTO public.food_package (food_id, food_option_id, label, servings, package_grams, package_price, product_id, description, package_size, sort_order, source)
SELECT v.food_id, o.food_option_id, v.label, v.servings, v.package_grams, v.package_price, v.product_id, v.description, v.package_size, v.sort_order, v.source
FROM (VALUES
${packageRows_.join(',\n')}
) AS v(food_id, form, label, servings, package_grams, package_price, product_id, description, package_size, sort_order, source)
JOIN public.food_option o ON o.food_id = v.food_id AND o.form = v.form
ON CONFLICT (food_id, coalesce(food_option_id, 0), sort_order) DO UPDATE SET label = EXCLUDED.label, servings = EXCLUDED.servings,
  package_grams = EXCLUDED.package_grams, package_price = EXCLUDED.package_price, product_id = EXCLUDED.product_id,
  description = EXCLUDED.description, package_size = EXCLUDED.package_size, source = EXCLUDED.source;`);
}
sql.push('COMMIT;');
fs.writeFileSync(path.join(dir, `styles${suffix}.sql`), sql.join('\n\n') + '\n');
console.log(`\nWrote ${path.relative(ROOT, dir)}/styles${suffix}.json and styles${suffix}.sql (${optionRows.length} styles, ${packageRows_.length} sizes for ${processed.length} foods). Review the JSON, then ask Claude to load the SQL.`);
