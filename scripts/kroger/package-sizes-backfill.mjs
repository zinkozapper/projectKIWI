// Package sizes (up to 3) for foods already in the catalog. New foods get them from the add-food workflow.
// Same rules and AI step as the workflow: src/lib/food-import/package-sizes.ts. Table: food_package (migration 0019).
//
//   node --env-file=.env scripts/kroger/package-sizes-backfill.mjs
//      -> data/kroger/<zip>/package-sizes.json (review: each food's sizes, servings and prices) + package-sizes.sql
//   Optional: --zip 84601 (default), --only 1,2,3 (food ids), --no-ai (fixed rules instead of Claude)
// Run package-sizes.sql in the Supabase SQL editor (service role), or ask Claude to load it.
// Only foods without purchase styles: styles-backfill.mjs picks the sizes of foods that have styles.
// The SQL fills the same 3 slots per food/option, so list and pantry rows pointing at a size keep working.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, ROOT, RULES, nearestStore, alternateStores, priceFood } from './lib.mjs';
import { SIZES_SYSTEM, SIZES_TOOL, fallbackRows, forStyle, packageRows, sizeCandidates, sizesPrompt } from '../../src/lib/food-import/package-sizes.ts';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const zip = arg('--zip', RULES.defaultZip);
const only = arg('--only') ? new Set(arg('--only').split(',').map(Number)) : null;
const useAi = !process.argv.includes('--no-ai');
const dir = path.join(OUT, zip); fs.mkdirSync(dir, { recursive: true });
// --only runs write their own files, so a partial rerun never overwrites the full run's output.
const suffix = only ? `-only-${[...only].join('-')}` : '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function supabase(pathAndQuery, { optional = false } = {}) {
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) { if (optional) return []; throw new Error(`Supabase ${pathAndQuery.split('?')[0]} ${res.status}: ${await res.text()}`); }
  return res.json();
}

async function loadFoods() {
  const foods = await supabase('food?select=food_id,food_name,food_group,food_category_id,serving_size,unit,factor,cook_ratio&order=food_id');
  return foods.map(f => {
    const prepared = Number(f.factor) * 100;
    const ratio = Number(f.cook_ratio) > 0 ? Number(f.cook_ratio) : 1;
    return { ...f, serving_grams: prepared / ratio, prepared_grams: prepared };
  });
}

async function askClaude(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Set ANTHROPIC_API_KEY in .env (or run with --no-ai)');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 400, system: SIZES_SYSTEM,
        tools: [SIZES_TOOL], tool_choice: { type: 'tool', name: SIZES_TOOL.name }, messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (res.ok) return (await res.json()).content?.find(c => c.type === 'tool_use')?.input ?? {};
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) { await sleep(2000 * attempt); continue; }
    throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function sizesFor(food, optionLabel, priceAs, home, moreStores, form) {
  const hit = await priceFood(priceAs, home, moreStores);
  const winning = hit.tried.find(t => t.store === hit.store && t.spec === hit.spec);
  const cands = forStyle(winning ? sizeCandidates(winning.result.scored) : [], form);
  if (cands.length < 2 || !useAi) return fallbackRows(cands);
  try {
    const answer = await askClaude(sizesPrompt(food.food_name, optionLabel, `${food.serving_size} ${food.unit} (${Math.round(priceAs.serving_grams ?? food.serving_grams)} g)`, cands));
    const rows = packageRows(answer.sizes, cands);
    return rows.length ? rows : fallbackRows(cands);
  } catch (e) {
    console.error(`  AI failed for ${food.food_name}: ${e.message}. Using fixed rules.`);
    return fallbackRows(cands);
  }
}

const q = v => v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const n = v => v == null || v === '' || !Number.isFinite(+v) ? 'NULL' : String(+v);

const foods = (await loadFoods()).filter(f => !only || only.has(f.food_id));
const options = await supabase('food_option?select=food_option_id,food_id,form,label,search_term,must,basis,package_yield,unit_grams&order=food_id,sort_order', { optional: true });
const home = await nearestStore(zip);
if (!home) throw new Error(`No Kroger-family store near ${zip}`);
let backups;
const moreStores = () => (backups ??= alternateStores(zip, home.location_id));
console.log(`ZIP ${zip} -> ${home.name} (${home.location_id}) · ${useAi ? 'Claude picks sizes' : 'fixed rules'}\n`);

const review = {}, values = [];
for (const f of foods) {
  const own = options.filter(o => o.food_id === f.food_id);
  // Foods with purchase styles get their sizes from styles-backfill.mjs (picked from each style's own products).
  if (own.length) continue;
  const groups = [{ optionId: null, label: null, form: null, priceAs: f }];
  review[f.food_id] = { food: f.food_name, sizes: [] };
  for (const g of groups) {
    const rows = await sizesFor(f, g.label, g.priceAs, home, moreStores, g.form);
    for (const r of rows) {
      review[f.food_id].sizes.push({ option: g.label, label: r.label, servings: r.servings, price: r.package_price, perServing: Math.round(r.package_price / r.servings * 100) / 100, product: r.description, size: r.package_size });
      values.push(`(${f.food_id}, ${n(g.optionId)}, ${q(r.label)}, ${n(r.servings)}, ${n(r.package_grams)}, ${n(r.package_price)}, ${q(r.product_id)}, ${q(r.description)}, ${q(r.package_size)}, ${r.sort_order}, ${q(r.source)})`);
    }
    console.log(`${String(f.food_id).padStart(3)} ${f.food_name.padEnd(26)} ${(g.label ?? '').padEnd(11)} ${rows.length ? rows.map(r => `${r.label} (${r.servings} sv, $${r.package_price})`).join(' · ') : '— no sizes found'}`);
    await sleep(Number(process.env.KROGER_DELAY_MS ?? 250));
  }
}

fs.writeFileSync(path.join(dir, `package-sizes${suffix}.json`), JSON.stringify(review, null, 2));
const sql = [`-- Generated by scripts/kroger/package-sizes-backfill.mjs for ZIP ${zip} on ${new Date().toISOString()}`, 'BEGIN;'];
if (values.length) {
  sql.push(`INSERT INTO public.food_package (food_id, food_option_id, label, servings, package_grams, package_price, product_id, description, package_size, sort_order, source)
VALUES
${values.join(',\n')}
ON CONFLICT (food_id, coalesce(food_option_id, 0), sort_order) DO UPDATE SET label = EXCLUDED.label, servings = EXCLUDED.servings,
  package_grams = EXCLUDED.package_grams, package_price = EXCLUDED.package_price, product_id = EXCLUDED.product_id,
  description = EXCLUDED.description, package_size = EXCLUDED.package_size, source = EXCLUDED.source;`);
  sql.push(`-- Slots the new picks no longer use, unless a list or pantry row still points at them.
DELETE FROM public.food_package p
USING (VALUES ${[...new Set(values.map(v => v.split(',').slice(0, 2).join(',') + ')'))].join(', ')}) AS done(food_id, food_option_id)
WHERE p.food_id = done.food_id AND coalesce(p.food_option_id, 0) = coalesce(done.food_option_id::bigint, 0)
  AND p.sort_order >= (SELECT count(*) FROM (VALUES ${values.map(v => v.split(',').slice(0, 2).join(',') + ')').join(', ')}) AS n(food_id, food_option_id)
                       WHERE n.food_id = p.food_id AND coalesce(n.food_option_id::bigint, 0) = coalesce(p.food_option_id, 0))
  AND NOT EXISTS (SELECT 1 FROM public.shopping_list_item s WHERE s.food_package_id = p.food_package_id)
  AND NOT EXISTS (SELECT 1 FROM public.pantry_item i WHERE i.food_package_id = p.food_package_id);`);
}
sql.push('COMMIT;');
fs.writeFileSync(path.join(dir, `package-sizes${suffix}.sql`), sql.join('\n\n') + '\n');
console.log(`\nWrote ${path.relative(ROOT, dir)}/package-sizes${suffix}.json and package-sizes${suffix}.sql (${values.length} sizes for ${foods.length} foods). Review the JSON, then load the SQL.`);
