// Shared helpers for the USDA FoodData Central import. No dependencies (Node 18+).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'data/usda');
export const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/usda/foods-to-import.json'), 'utf8'));
export const DEFAULT_TYPES = ['Survey (FNDDS)', 'Foundation', 'SR Legacy'];
const API = 'https://api.nal.usda.gov/fdc/v1';

// Target columns, in Nutrient Map CSV order. `nums` = FDC nutrient numbers in priority order.
export const NUTRIENTS = [
  ['Calories', ['208', '958', '957'], 'kcal'],
  ['Protein', ['203'], 'g'],
  ['Carbohydrate', ['205'], 'g'],
  ['Fiber', ['291'], 'g'],
  ['Lipids', ['204'], 'g'],
  ['Omega-3 (ALA)', ['851', '619'], 'g'],
  ['Omega-6', ['675', '618'], 'g'],
  ['Vit. A', ['320'], 'mg'],
  ['Vit. E', ['323'], 'mg'],
  ['Vit. K', ['430'], 'mg'],
  ['Vit. B1 (Thiamin)', ['404'], 'mg'],
  ['Vit. B2 (Riboflavin)', ['405'], 'mg'],
  ['Vit. B3 (Niacin)', ['406'], 'mg'],
  ['Vit. B6 (Pyridoxine)', ['415'], 'mg'],
  ['Vit. B9 (Folate)', ['435', '417'], 'mg'],
  ['Vit. B12 (Cobalamine)', ['418'], 'mg'],
  ['Vit. C', ['401'], 'mg'],
  ['Choline', ['421'], 'mg'],
  ['Sodium', ['307'], 'mg'],
  ['Potassium', ['306'], 'mg'],
  ['Calcium', ['301'], 'mg'],
  ['Phosphorous', ['305'], 'mg'],
  ['Magnesium', ['304'], 'mg'],
  ['Iron', ['303'], 'mg'],
  ['Zinc', ['309'], 'mg'],
  ['Copper', ['312'], 'mg'],
  ['Selenium', ['317'], 'mg'],
];

export function apiKey() {
  const k = process.env.FDC_API_KEY;
  if (!k) { console.error('Set FDC_API_KEY (free key: https://api.data.gov/signup). e.g. node --env-file=.env scripts/usda/1-search.mjs'); process.exit(1); }
  return k;
}

async function call(url, opts) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, opts);
    if (res.ok) return res.json();
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) { await new Promise(r => setTimeout(r, 2000 * attempt)); continue; }
    throw new Error(`FDC ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

export function search(query, dataTypes, pageSize = 10) {
  const body = JSON.stringify({ query, dataType: dataTypes, pageSize });
  return call(`${API}/foods/search?api_key=${encodeURIComponent(apiKey())}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    .then(r => r.foods || []);
}

export async function details(fdcIds) {
  const out = [];
  for (let i = 0; i < fdcIds.length; i += 20) {
    const body = JSON.stringify({ fdcIds: fdcIds.slice(i, i + 20).map(Number), format: 'full' });
    out.push(...await call(`${API}/foods?api_key=${encodeURIComponent(apiKey())}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));
  }
  return out;
}

// Normalize nutrients from either a search hit or a details record -> { number: {value, unit} }
export function nutrientIndex(food) {
  const idx = {};
  for (const n of food.foodNutrients || []) {
    const number = String(n.nutrientNumber ?? n.nutrient?.number ?? '');
    const value = n.value ?? n.amount;
    const unit = (n.unitName ?? n.nutrient?.unitName ?? '').toLowerCase();
    if (number && value != null && !(number in idx)) idx[number] = { value: Number(value), unit };
  }
  return idx;
}

const TO_MG = { g: 1000, mg: 1, ug: 0.001, 'µg': 0.001 };
function convert(value, from, to) {
  if (from === to || to === 'kcal') return value;
  if (to === 'g') return value * TO_MG[from] / 1000;
  if (to === 'mg') return value * TO_MG[from];
  throw new Error(`unit ${from} -> ${to}`);
}

// Map a food to target columns (per 100 g). Returns { values: {col: number|null}, coverage, used: {col: nutrientNumber} }
export function mapNutrients(food) {
  const idx = nutrientIndex(food);
  const values = {}, used = {};
  let coverage = 0;
  for (const [col, nums, unit] of NUTRIENTS) {
    const num = nums.find(n => idx[n] && (n !== '208' || idx[n].unit === 'kcal'));
    if (num) { values[col] = convert(idx[num].value, idx[num].unit, unit); used[col] = num; coverage++; }
    else values[col] = null;
  }
  return { values, coverage, used };
}

// ---- Portions ----
const UNIT_ALIASES = { tablespoon: 'tbsp', tbsp: 'tbsp', teaspoon: 'tsp', tsp: 'tsp', cup: 'cup', cups: 'cup', oz: 'oz', ounce: 'oz', g: 'g', medium: 'medium', large: 'large', small: 'small', slice: 'slice', tortilla: 'tortilla', fruit: 'fruit' };
export function parseQty(text) {
  const m = String(text).trim().toLowerCase().match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*([a-zµ]+)?/);
  if (!m) return null;
  const q = m[1].split(/\s+/).reduce((s, part) => s + (part.includes('/') ? part.split('/')[0] / part.split('/')[1] : Number(part)), 0);
  return { qty: q, unit: UNIT_ALIASES[m[2]] || m[2] || null };
}

function portionText(p) {
  if (p.portionDescription && !/quantity not specified/i.test(p.portionDescription)) return p.portionDescription;
  const unit = p.measureUnit?.name && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '';
  return `${p.amount ?? 1} ${unit} ${p.modifier ?? ''}`.replace(/\s+/g, ' ').trim();
}

export const portionList = food => food?.dataType === 'Branded'
  ? `label: ${food.householdServingFullText ?? '?'} = ${food.servingSize} ${food.servingSizeUnit}`
  : (food?.foodPortions || []).map(p => `${portionText(p)} = ${p.gramWeight} g`).join(' | ');

// "1 unit" = average gram weight of one whole item (docs §3).
const NOT_A_UNIT = /\b(cup|slice|slices|piece|wedge|ring|stick|cube|ball|floweret|section|chunk|tbsp|tsp|teaspoon|tablespoon|oz|racc|90000|inch|mashed|chopped|diced|sliced|pint|package|serving|leaf|spear|stalk|miniature|mini|cherry|plum|grape|italian|baby)\b/i;
export function unitGrams(food, qty = 1) {
  const whole = (food?.foodPortions || []).map(p => ({ p, text: portionText(p) }))
    .filter(x => x.p.gramWeight && !NOT_A_UNIT.test(x.text));
  const find = re => whole.find(x => re.test(x.text));
  const medium = find(/\bmedium\b/i);
  if (medium) return { grams: medium.p.gramWeight * qty, how: `unit (medium): "${medium.text}" = ${medium.p.gramWeight} g` };
  const sized = whole.filter(x => /\b(small|large|extra large)\b/i.test(x.text));
  const plain = whole.filter(x => !sized.includes(x));
  if (plain.length) return { grams: plain[0].p.gramWeight * qty, how: `unit: "${plain[0].text}" = ${plain[0].p.gramWeight} g` };
  const small = find(/\bsmall\b/i), large = find(/(?<!extra )\blarge\b/i);
  if (small && large) { const g = (small.p.gramWeight + large.p.gramWeight) / 2; return { grams: g * qty, how: `unit: average of small ${small.p.gramWeight} g and large ${large.p.gramWeight} g` }; }
  return { grams: null, how: 'no whole-unit portion on record' };
}

// Resolve a serving like "4 oz", "100 g", "1/4 cup", "1 medium" to grams using the record's portions.
export function servingGrams(serving, food) {
  const want = parseQty(serving);
  if (!want) return { grams: null, how: `unparseable serving "${serving}"` };
  if (want.unit === 'unit') return unitGrams(food, want.qty);
  if (want.unit === 'g') return { grams: want.qty, how: 'fixed' };
  if (want.unit === 'oz') return { grams: want.qty * 28.3495, how: 'fixed' };
  if (food?.dataType === 'Branded' && food.servingSizeUnit?.toLowerCase() === 'g' && food.householdServingFullText) {
    const hh = parseQty(food.householdServingFullText);
    if (hh?.unit === want.unit) return { grams: food.servingSize / hh.qty * want.qty, how: `label: ${food.householdServingFullText} = ${food.servingSize} g` };
  }
  const matches = (food?.foodPortions || []).map(p => ({ p, text: portionText(p) }))
    .map(x => ({ ...x, parsed: parseQty(x.text) }))
    .filter(x => x.parsed && (x.parsed.unit === want.unit || x.text.toLowerCase().includes(` ${want.unit}`)) && x.p.gramWeight)
    .sort((a, b) => a.text.length - b.text.length);
  if (!matches.length) return { grams: null, how: `no "${want.unit}" portion on record` };
  const m = matches[0];
  const perUnit = m.p.gramWeight / (m.parsed.unit === want.unit ? m.parsed.qty : 1);
  return { grams: perUnit * want.qty, how: `portion: "${m.text}" = ${m.p.gramWeight} g` };
}

// ---- CSV ----
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
  return rows;
}
