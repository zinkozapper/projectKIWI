// Step 2: pull the selected records, apply food-group rules, write per-100g + per-serving CSVs and an import log.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, OUT, NUTRIENTS, details, mapNutrients, servingGrams, portionList, parseCsv, toCsv } from './lib.mjs';

const [header, ...rows] = parseCsv(fs.readFileSync(path.join(OUT, 'candidates.csv'), 'utf8')).filter(r => r.length > 1);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const picks = {};
for (const r of rows) if (r[col.selected].trim().toLowerCase() === 'x') {
  const key = `${r[col.food]}|${r[col.role]}`;
  if (picks[key]) throw new Error(`More than one selection for ${key}`);
  picks[key] = r[col.fdc_id];
}

const records = Object.fromEntries((await details([...new Set(Object.values(picks))])).map(f => [String(f.fdcId), f]));
const cols = NUTRIENTS.map(n => n[0]);
const per100 = [['Factor', 'Food', ...cols]];
const perServing = [['Serving', 'Food', ...cols]];
const source = [['food', 'group', 'mode', 'serving', 'serving_g_unprepared', 'factor', 'nutrient_fdc_id', 'nutrient_data_type', 'nutrient_description', 'raw_fdc_id', 'raw_description', 'raw_kcal_100g', 'prepared_kcal_100g', 'serving_source', 'coverage_of_27', 'missing', 'flags', 'portions_on_record']];
const flags = [];

for (const food of CONFIG.foods) {
  const group = CONFIG.groups[food.group];
  const serving = food.serving || group.serving;
  const nutId = picks[`${food.name}|nutrients`], rawId = picks[`${food.name}|raw_reference`];
  const f = [];
  if (!nutId) { flags.push(`${food.name}: no nutrients record selected — skipped`); continue; }
  const rec = records[nutId];
  const { values, coverage } = mapNutrients(rec);
  let factor = null, grams = null, how = '', rawKcal = null, raw = null;

  if (food.servingGrams) { grams = food.servingGrams; how = 'override in foods-to-import.json'; }
  if (group.mode === 'prepared') {
    raw = rawId && records[rawId];
    if (!raw) f.push('no raw_reference selected');
    else {
      if (group.sameDataset && raw.dataType !== rec.dataType) f.push(`cooked (${rec.dataType}) and raw (${raw.dataType}) records come from different datasets`);
      rawKcal = mapNutrients(raw).values.Calories;
      if (!grams) ({ grams, how } = servingGrams(serving, raw)); // volume servings are measured on the raw/dry record
      if (grams && rawKcal && values.Calories) factor = (grams / 100) * (rawKcal / values.Calories);
    }
  } else {
    if (!grams) ({ grams, how } = servingGrams(serving, rec));
    if (grams) factor = grams / 100;
  }
  if (!grams) f.push(`serving: ${how}`);

  // Atwater sanity check on the per-100g record
  const { Calories: kcal, Protein: p, Carbohydrate: c, Lipids: l } = values;
  if (kcal && p != null && c != null && l != null) {
    const est = 4 * p + 4 * c + 9 * l;
    if (Math.abs(est - kcal) / kcal > 0.2) f.push(`kcal ${kcal.toFixed(0)} vs 4P+4C+9F ${est.toFixed(0)}`);
  }
  const missing = cols.filter(c => values[c] == null);
  const r4 = v => v == null ? '' : +v.toFixed(5);
  per100.push([factor == null ? '' : factor.toFixed(2), food.name, ...cols.map(c => r4(values[c]))]);
  perServing.push([serving, food.name, ...cols.map(c => factor == null || values[c] == null ? '' : r4(values[c] * factor))]);
  source.push([food.name, food.group, group.mode, serving, grams?.toFixed(1), factor?.toFixed(4), nutId, rec.dataType, rec.description, rawId || '', raw?.description || '', rawKcal?.toFixed(1), values.Calories?.toFixed(1), how, coverage, missing.join('; '), f.join('; '), portionList(group.mode === 'prepared' ? raw : rec)]);
  if (f.length) flags.push(`${food.name}: ${f.join('; ')}`);
}

// Existing Nutrient Map rows: recompute serving + factor only
const rescale = [['food', 'serving', 'serving_g', 'factor', 'portion_fdc_id', 'portion_description', 'serving_source', 'portions_on_record']];
for (const item of CONFIG.rescaleExisting?.items || []) {
  const id = picks[`${item.name}|portion`], rec = id && records[id];
  if (item.query && !rec) { flags.push(`${item.name} (existing): no portion record selected`); continue; }
  const { grams, how } = item.servingGrams ? { grams: item.servingGrams, how: 'override in foods-to-import.json' } : servingGrams(item.serving, rec);
  if (!grams) flags.push(`${item.name} (existing): serving: ${how}`);
  rescale.push([item.name, item.serving, grams?.toFixed(1), grams ? (grams / 100).toFixed(2) : '', id || '', rec?.description || '', how, portionList(rec)]);
}
fs.writeFileSync(path.join(OUT, 'existing-factor-updates.csv'), toCsv(rescale));

fs.writeFileSync(path.join(OUT, 'new-foods-100g.csv'), toCsv(per100));
fs.writeFileSync(path.join(OUT, 'new-foods-serving.csv'), toCsv(perServing));
fs.writeFileSync(path.join(OUT, 'import-log.csv'), toCsv(source));
console.log(`Wrote new-foods-100g.csv, new-foods-serving.csv, import-log.csv (${per100.length - 1} foods) and existing-factor-updates.csv (${rescale.length - 1} rows) to data/usda/`);
console.log(flags.length ? `\nFlags to review:\n- ${flags.join('\n- ')}` : '\nNo flags.');
