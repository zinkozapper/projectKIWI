// Step 4: export the merged dataset in the exact column layout of Supabase public.food (+ public.food_category).
//   Input : data/usda/kiwi-foods-100g.csv (step 3), data/usda/source/food-list.json
//   Output: data/usda/supabase/food_category.csv  — import FIRST (food.food_category_id references it)
//           data/usda/supabase/food.csv           — then import this
// Nutrient columns are per 100 g (prepared basis); per-serving = value × factor.
// `nutrition` (jsonb) is filled per serving with the keys src/lib/foods.ts reads today, so the current UI keeps working.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, parseCsv, toCsv } from './lib.mjs';

const [head, ...rows] = parseCsv(fs.readFileSync(path.join(OUT, 'kiwi-foods-100g.csv'), 'utf8')).filter(r => r.length > 1);
const col = Object.fromEntries(head.map((h, i) => [h, i]));
const list = JSON.parse(fs.readFileSync(path.join(OUT, 'source/food-list.json'), 'utf8'));
const NUT = head.slice(col.calories_kcal);

const categories = [...new Set(list.foods.map(f => f.category))];
const catId = Object.fromEntries(categories.map((c, i) => [c, i + 1]));

// "4 oz raw" -> {4, oz}; "1 unit (118.0 g)" -> {1, unit}; "1/4 cup" -> {0.25, cup}; blank -> factor × 100 g (as-sold weight)
function serving(text, factor) {
  const m = text.trim().match(/^(\d+\/\d+|\d*\.?\d+)\s+([a-z]+)/i);
  if (!m) return { size: Number((factor * 100).toFixed(1)), unit: 'g' };
  const [a, b] = m[1].split('/');
  return { size: b ? a / b : Number(a), unit: m[2].toLowerCase() };
}
const r2 = v => Math.round(v * 100) / 100;

const foodHead = ['food_id', 'food_name', 'food_description', 'food_picture', 'serving_size', 'unit', 'food_category_id', 'price', 'emoji', 'nutrition', 'pairs', 'factor', 'source', 'fdc_id', ...NUT];
const out = [foodHead];
rows.forEach((r, i) => {
  const factor = Number(r[col.factor]);
  const n = Object.fromEntries(NUT.map(k => [k, Number(r[col[k]])]));
  const s = serving(r[col.serving], factor);
  const nutrition = { calories: r2(n.calories_kcal * factor), protein: r2(n.protein_g * factor), carbs: r2(n.carbohydrate_g * factor), fat: r2(n.fat_g * factor),
    fiber: r2(n.fiber_g * factor), iron: r2(n.iron_mg * factor), calcium: r2(n.calcium_mg * factor), vitaminC: r2(n.vitamin_c_mg * factor), vitaminD: 0 };
  out.push([i + 1, r[col.food_name], '', '', s.size, s.unit, catId[r[col.category]], 0, '', JSON.stringify(nutrition), '{}', factor, r[col.source], r[col.fdc_id] || '', ...NUT.map(k => n[k])]);
});
const dir = path.join(OUT, 'supabase');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'food_category.csv'), toCsv([['food_category_id', 'category_description', 'category_serving_modifier'], ...categories.map(c => [catId[c], c, 1])]));
fs.writeFileSync(path.join(dir, 'food.csv'), toCsv(out));
console.log(`Wrote data/usda/supabase/food_category.csv (${categories.length}) and food.csv (${out.length - 1} rows)`);
