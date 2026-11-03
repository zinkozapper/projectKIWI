// Step 3: merge the existing Nutrient Map bank with the new USDA foods into one import-ready dataset.
//   Inputs : data/usda/source/nutrient-map-100g.csv (existing bank, per 100 g prepared + factor in column A)
//            data/usda/source/food-list.json         (canonical 100-food list, categories, name aliases)
//            data/usda/new-foods-100g.csv, import-log.csv, existing-factor-updates.csv (steps 1–2)
//   Outputs: data/usda/kiwi-foods.csv       — per serving (what you buy): the Supabase import file
//            data/usda/kiwi-foods-100g.csv  — same rows per 100 g prepared, for reference
import fs from 'node:fs';
import path from 'node:path';
import { OUT, NUTRIENTS, parseCsv, toCsv } from './lib.mjs';

const read = f => parseCsv(fs.readFileSync(path.join(OUT, f), 'utf8')).filter(r => r.some(c => c !== ''));
const objects = f => { const [h, ...rows] = read(f); return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const list = JSON.parse(fs.readFileSync(path.join(OUT, 'source/food-list.json'), 'utf8'));
const canon = Object.fromEntries(list.foods.map(f => [f.name.toLowerCase(), f]));
const resolve = name => canon[(list.aliases[name] || name).toLowerCase()];
const num = v => v === '' || v == null || isNaN(Number(String(v).replace(/[$,]/g, ''))) ? null : Number(v);

const KEYS = ['calories_kcal', 'protein_g', 'carbohydrate_g', 'fiber_g', 'fat_g', 'omega3_ala_g', 'omega6_g', 'vitamin_a_mg', 'vitamin_e_mg', 'vitamin_k_mg',
  'thiamin_b1_mg', 'riboflavin_b2_mg', 'niacin_b3_mg', 'vitamin_b6_mg', 'folate_b9_mg', 'vitamin_b12_mg', 'vitamin_c_mg', 'choline_mg', 'sodium_mg',
  'potassium_mg', 'calcium_mg', 'phosphorus_mg', 'magnesium_mg', 'iron_mg', 'zinc_mg', 'copper_mg', 'selenium_mg'];
if (KEYS.length !== NUTRIENTS.length) throw new Error('nutrient key mismatch');

// Existing bank: section rows set the serving basis; food rows = [factor, name, ...27 nutrients]
const SECTION_SERVING = { 'Meats, cooked': '4 oz raw', Grains: '2 oz dry', Vegetables: '100 g' };
const UNIT_ROWS = new Set(['Bagels', 'Multi-grain Bread']); // in the Grains section but sold as units
const foods = new Map(), dropped = [];
let section = null;
for (const r of read('source/nutrient-map-100g.csv')) {
  const vals = r.slice(2, 2 + KEYS.length);
  if (r[1] && vals.every(v => v === '') && !['RDA', 'UL', 'Purpose'].includes(r[1])) { section = r[1]; continue; }
  const factor = num(r[0]);
  if (factor == null || !r[1]) continue;
  const f = resolve(r[1].trim());
  if (!f) { dropped.push(r[1]); continue; }
  foods.set(f.name, { name: f.name, category: f.category, factor, serving: UNIT_ROWS.has(r[1]) ? '' : (SECTION_SERVING[section] || ''),
    source: 'existing bank', fdc_id: '', per100: vals.map(num) });
}
// Existing rows re-served by the per-unit / grams rule
for (const u of objects('existing-factor-updates.csv')) {
  const f = foods.get(resolve(u.food)?.name);
  if (!f || num(u.factor) == null) continue;
  Object.assign(f, { factor: num(u.factor), serving: u.serving === '1 unit' ? `1 unit (${u.serving_g} g)` : u.serving, source: f.source + ' (serving per USDA portion)', fdc_id: u.portion_fdc_id || '' });
}
// New USDA foods
const log = Object.fromEntries(objects('import-log.csv').map(l => [l.food, l]));
for (const r of read('new-foods-100g.csv').slice(1)) {
  const l = log[r[1]], f = resolve(r[1]);
  if (!f) { dropped.push(r[1]); continue; }
  foods.set(f.name, { name: f.name, category: f.category, factor: num(l.factor), serving: l.serving === '1 unit' ? `1 unit (${l.serving_g_unprepared} g)` : l.serving,
    source: `USDA FDC ${l.nutrient_data_type}`, fdc_id: l.nutrient_fdc_id, per100: r.slice(2).map(num) });
}

const round = v => v == null ? 0 : Number(v.toFixed(6)); // missing values stored as 0 (docs §6)
const head = ['food_name', 'category', 'serving', 'factor', 'source', 'fdc_id', ...KEYS];
const ordered = list.foods.map(f => foods.get(f.name)).filter(Boolean);
const perServing = [head, ...ordered.map(f => [f.name, f.category, f.serving, f.factor, f.source, f.fdc_id, ...f.per100.map(v => v == null || f.factor == null ? 0 : round(v * f.factor))])];
const per100 = [head, ...ordered.map(f => [f.name, f.category, f.serving, f.factor, f.source, f.fdc_id, ...f.per100.map(round)])];
fs.writeFileSync(path.join(OUT, 'kiwi-foods.csv'), toCsv(perServing));
fs.writeFileSync(path.join(OUT, 'kiwi-foods-100g.csv'), toCsv(per100));

const missing = list.foods.filter(f => !foods.has(f.name)).map(f => f.name);
const blanks = ordered.map(f => [f.name, f.per100.filter(v => v == null).length]).filter(([, n]) => n);
console.log(`Wrote kiwi-foods.csv and kiwi-foods-100g.csv (${ordered.length}/${list.foods.length} foods)`);
if (missing.length) console.log(`Missing from list: ${missing.join(', ')}`);
if (dropped.length) console.log(`Rows not on the 100-food list (dropped): ${dropped.join(', ')}`);
const noServing = ordered.filter(f => !f.serving).map(f => f.name);
if (noServing.length) console.log(`No serving description (factor kept from existing bank): ${noServing.join(', ')}`);
console.log(`Foods with blank nutrients: ${blanks.length}\n  ${blanks.map(([n, c]) => `${n} (${c})`).join(', ')}`);
