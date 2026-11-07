// Record-selection and scaling rules for the AI food import workflow.
// TypeScript port of scripts/usda/lib.mjs + 2-build.mjs; the spec is docs/usda-record-selection-rules.md.
// Everything here is pure (no network), so it runs in tests and on the server alike.
// Claude never produces nutrient numbers: it only picks among USDA records, and these functions do the math.

export const FOOD_GROUPS = ['meat', 'seafood', 'grain', 'legume', 'bread', 'fruit', 'vegetable', 'dairy', 'nut_seed', 'condiment', 'other'] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

export type DataType = 'Survey (FNDDS)' | 'Foundation' | 'SR Legacy' | 'Branded';
export const DEFAULT_DATA_TYPES: DataType[] = ['Survey (FNDDS)', 'Foundation', 'SR Legacy'];
const RAW_DATA_TYPES: DataType[] = ['SR Legacy', 'Foundation'];

type GroupRule = {
  label: string;
  // prepared = USDA reports it cooked; scale back to the raw/dry amount you buy (§3)
  mode: 'prepared' | 'raw' | 'as_sold';
  serving: string;
  dataTypes: DataType[];
  // meats: cooked + raw record must come from the same dataset so the calorie ratio is a real cooking yield
  sameDataset?: boolean;
  // what to append to the search when looking for the raw/dry reference record
  rawSearch?: string;
};

export const GROUP_RULES: Record<FoodGroup, GroupRule> = {
  meat: { label: 'Meat & poultry', mode: 'prepared', serving: '4 oz', dataTypes: RAW_DATA_TYPES, sameDataset: true, rawSearch: 'raw' },
  seafood: { label: 'Fish & seafood', mode: 'prepared', serving: '4 oz', dataTypes: RAW_DATA_TYPES, sameDataset: true, rawSearch: 'raw' },
  grain: { label: 'Grains & pasta', mode: 'prepared', serving: '1/4 cup', dataTypes: DEFAULT_DATA_TYPES, rawSearch: 'dry raw' },
  legume: { label: 'Beans & legumes (from dried)', mode: 'prepared', serving: '1/4 cup', dataTypes: DEFAULT_DATA_TYPES, rawSearch: 'mature seeds raw' },
  bread: { label: 'Bread & tortillas', mode: 'as_sold', serving: '2 oz', dataTypes: DEFAULT_DATA_TYPES },
  fruit: { label: 'Fruit', mode: 'raw', serving: '1 unit', dataTypes: DEFAULT_DATA_TYPES },
  vegetable: { label: 'Vegetables', mode: 'raw', serving: '100 g', dataTypes: DEFAULT_DATA_TYPES },
  dairy: { label: 'Dairy & eggs', mode: 'as_sold', serving: '1 oz', dataTypes: DEFAULT_DATA_TYPES },
  nut_seed: { label: 'Nuts & seeds', mode: 'as_sold', serving: '1 oz', dataTypes: DEFAULT_DATA_TYPES },
  condiment: { label: 'Oils, sauces & sweeteners', mode: 'as_sold', serving: '1 tbsp', dataTypes: DEFAULT_DATA_TYPES },
  other: { label: 'Other packaged foods', mode: 'as_sold', serving: '1 oz', dataTypes: [...DEFAULT_DATA_TYPES, 'Branded'] },
};

// Servings the workflow may choose. "1 unit" = average weight of one whole item (§3).
export const SERVING_CHOICES = ['4 oz', '2 oz', '1 oz', '100 g', '1/4 cup', '1/2 cup', '1 cup', '1 tbsp', '1 unit', '1 clove', '1 slice'] as const;

// Prepared-food records that include added fat are never used (§1).
export const EXCLUDE_PREPARED = ['fat added', 'made with oil', 'made with butter', 'fried', 'breaded'];

// Database column, FDC nutrient numbers in priority order, unit stored. Order matches the food table.
export const NUTRIENT_COLUMNS = [
  ['calories_kcal', ['208', '958', '957'], 'kcal'],
  ['protein_g', ['203'], 'g'],
  ['carbohydrate_g', ['205'], 'g'],
  ['fiber_g', ['291'], 'g'],
  ['fat_g', ['204'], 'g'],
  ['omega3_ala_g', ['851', '619'], 'g'],
  ['omega6_g', ['675', '618'], 'g'],
  ['vitamin_a_mg', ['320'], 'mg'],
  ['vitamin_e_mg', ['323'], 'mg'],
  ['vitamin_k_mg', ['430'], 'mg'],
  ['thiamin_b1_mg', ['404'], 'mg'],
  ['riboflavin_b2_mg', ['405'], 'mg'],
  ['niacin_b3_mg', ['406'], 'mg'],
  ['vitamin_b6_mg', ['415'], 'mg'],
  ['folate_b9_mg', ['435', '417'], 'mg'],
  ['vitamin_b12_mg', ['418'], 'mg'],
  ['vitamin_c_mg', ['401'], 'mg'],
  ['choline_mg', ['421'], 'mg'],
  ['sodium_mg', ['307'], 'mg'],
  ['potassium_mg', ['306'], 'mg'],
  ['calcium_mg', ['301'], 'mg'],
  ['phosphorus_mg', ['305'], 'mg'],
  ['magnesium_mg', ['304'], 'mg'],
  ['iron_mg', ['303'], 'mg'],
  ['zinc_mg', ['309'], 'mg'],
  ['copper_mg', ['312'], 'mg'],
  ['selenium_mg', ['317'], 'mg'],
] as const;

export type NutrientColumn = (typeof NUTRIENT_COLUMNS)[number][0];
export type NutrientValues = Record<NutrientColumn, number | null>;
export const NUTRIENT_COUNT = NUTRIENT_COLUMNS.length;

// Minimal shape of an FDC record (search hit or /foods details).
export type FdcNutrient = {
  nutrientNumber?: string | number;
  unitName?: string;
  value?: number;
  amount?: number;
  nutrient?: { number?: string | number; unitName?: string };
};
export type FdcPortion = { gramWeight?: number; amount?: number; modifier?: string; portionDescription?: string; measureUnit?: { name?: string } };
export type FdcFood = {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  foodNutrients?: FdcNutrient[];
  foodPortions?: FdcPortion[];
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
};

// ---------- Nutrients ----------

function nutrientIndex(food: FdcFood) {
  const idx: Record<string, { value: number; unit: string }> = {};
  for (const n of food.foodNutrients || []) {
    const number = String(n.nutrientNumber ?? n.nutrient?.number ?? '');
    const value = n.value ?? n.amount;
    const unit = String(n.unitName ?? n.nutrient?.unitName ?? '').toLowerCase();
    if (number && value != null && !(number in idx)) idx[number] = { value: Number(value), unit };
  }
  return idx;
}

const TO_MG: Record<string, number> = { g: 1000, mg: 1, ug: 0.001, 'µg': 0.001 };
function convert(value: number, from: string, to: string) {
  if (from === to || to === 'kcal') return value;
  const factor = TO_MG[from];
  if (factor == null) return null;
  return to === 'g' ? (value * factor) / 1000 : value * factor;
}

// Per-100 g values in the database's units, plus how many of the 27 are present ("coverage", §1).
export function mapNutrients(food: FdcFood): { values: NutrientValues; coverage: number } {
  const idx = nutrientIndex(food);
  const values = {} as NutrientValues;
  let coverage = 0;
  for (const [col, nums, unit] of NUTRIENT_COLUMNS) {
    const num = nums.find(n => idx[n] && (n !== '208' || idx[n]!.unit === 'kcal'));
    const hit = num ? idx[num] : undefined;
    const v = hit ? convert(hit.value, hit.unit, unit) : null;
    values[col] = v;
    if (v != null) coverage++;
  }
  return { values, coverage };
}

// ---------- Candidate selection (§1) ----------

const TYPE_RANK: Record<string, number> = { 'Survey (FNDDS)': 0, Foundation: 1, 'SR Legacy': 2, Branded: 3 };

export function isExcluded(description: string, group: FoodGroup) {
  if (GROUP_RULES[group].mode !== 'prepared') return false;
  const d = description.toLowerCase();
  return EXCLUDE_PREPARED.some(t => d.includes(t));
}

export type Candidate = {
  fdcId: number;
  description: string;
  dataType: string;
  brand?: string | undefined;
  coverage: number;
  kcal: number | null;
  rank: number; // USDA search order
};

// Summarize search hits; drop records without calories or with added fat. Order: coverage, dataset, search rank.
// Claude ranks relevance on top of this; it can only choose from the returned list.
export function rankCandidates(hits: FdcFood[], group: FoodGroup | null, limit = 10): Candidate[] {
  return hits
    .map((h, rank) => {
      const { values, coverage } = mapNutrients(h);
      return { fdcId: h.fdcId, description: h.description, dataType: h.dataType, brand: h.brandOwner || undefined, coverage, kcal: values.calories_kcal, rank };
    })
    .filter(c => c.kcal != null && !(group && isExcluded(c.description, group)))
    .sort((a, b) => b.coverage - a.coverage || (TYPE_RANK[a.dataType] ?? 9) - (TYPE_RANK[b.dataType] ?? 9) || a.rank - b.rank)
    .slice(0, limit);
}

// Raw/dry reference: SR Legacy first (it has household portion weights), then search order (§1.5).
// For meats it must come from the same dataset as the cooked record.
export function pickRawReference(hits: FdcFood[], cooked: Pick<FdcFood, 'dataType'>, group: FoodGroup): FdcFood | null {
  const rule = GROUP_RULES[group];
  const raw = hits.filter(h => {
    const d = h.description.toLowerCase();
    if (!/\b(raw|dry|dried|uncooked|unprepared)\b/.test(d) || /\b(cooked|boiled|roasted|baked|fried|canned)\b/.test(d)) return false;
    if (rule.sameDataset && h.dataType !== cooked.dataType) return false;
    return mapNutrients(h).values.calories_kcal != null;
  });
  const order: Record<string, number> = { 'SR Legacy': 0, Foundation: 1 };
  return raw.sort((a, b) => (order[a.dataType] ?? 9) - (order[b.dataType] ?? 9))[0] ?? null;
}

// ---------- Portions / serving grams (§2–3) ----------

const UNIT_ALIASES: Record<string, string> = { tablespoon: 'tbsp', tbsp: 'tbsp', teaspoon: 'tsp', tsp: 'tsp', cup: 'cup', cups: 'cup', oz: 'oz', ounce: 'oz', g: 'g', medium: 'medium', large: 'large', small: 'small', slice: 'slice', tortilla: 'tortilla', fruit: 'fruit', clove: 'clove', unit: 'unit' };

export function parseQty(text: string): { qty: number; unit: string | null } | null {
  const m = String(text).trim().toLowerCase().match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*([a-zµ]+)?/);
  if (!m) return null;
  const qty = (m[1] ?? '').split(/\s+/).reduce((s, part) => {
    if (!part.includes('/')) return s + Number(part);
    const [a, b] = part.split('/');
    return s + Number(a) / Number(b);
  }, 0);
  return { qty, unit: m[2] ? UNIT_ALIASES[m[2]] ?? m[2] : null };
}

function portionText(p: FdcPortion) {
  if (p.portionDescription && !/quantity not specified/i.test(p.portionDescription)) return p.portionDescription;
  const unit = p.measureUnit?.name && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '';
  return `${p.amount ?? 1} ${unit} ${p.modifier ?? ''}`.replace(/\s+/g, ' ').trim();
}

export type Grams = { grams: number | null; how: string };

const NOT_A_UNIT = /\b(cup|slice|slices|piece|wedge|ring|stick|cube|ball|floweret|section|chunk|tbsp|tsp|teaspoon|tablespoon|oz|racc|90000|inch|mashed|chopped|diced|sliced|pint|package|serving|leaf|spear|stalk|miniature|mini|cherry|plum|grape|italian|baby|nlea)\b/i;

// "1 unit" = average gram weight of one whole item: medium, else the one whole-item portion, else mean of small/large.
export function unitGrams(food: FdcFood | null | undefined, qty = 1): Grams {
  const whole = (food?.foodPortions || [])
    .map(p => ({ p, text: portionText(p) }))
    .filter(x => x.p.gramWeight && !NOT_A_UNIT.test(x.text));
  const find = (re: RegExp) => whole.find(x => re.test(x.text));
  const medium = find(/\bmedium\b/i);
  if (medium) return { grams: medium.p.gramWeight! * qty, how: `unit (medium): "${medium.text}" = ${medium.p.gramWeight} g` };
  const sized = whole.filter(x => /\b(small|large|extra large)\b/i.test(x.text));
  const plain = whole.filter(x => !sized.includes(x));
  const first = plain[0];
  if (first) return { grams: first.p.gramWeight! * qty, how: `unit: "${first.text}" = ${first.p.gramWeight} g` };
  const small = find(/\bsmall\b/i);
  const large = find(/(?<!extra )\blarge\b/i);
  if (small && large) {
    const g = (small.p.gramWeight! + large.p.gramWeight!) / 2;
    return { grams: g * qty, how: `unit: average of small ${small.p.gramWeight} g and large ${large.p.gramWeight} g` };
  }
  return { grams: null, how: 'no whole-unit portion on record' };
}

export function servingGrams(serving: string, food: FdcFood | null | undefined): Grams {
  const want = parseQty(serving);
  if (!want || !want.unit) return { grams: null, how: `unparseable serving "${serving}"` };
  if (want.unit === 'unit') return unitGrams(food, want.qty);
  if (want.unit === 'g') return { grams: want.qty, how: 'fixed' };
  if (want.unit === 'oz') return { grams: want.qty * 28.3495, how: 'fixed' };
  if (food?.dataType === 'Branded' && food.servingSizeUnit?.toLowerCase() === 'g' && food.householdServingFullText && food.servingSize) {
    const hh = parseQty(food.householdServingFullText);
    if (hh?.unit === want.unit) return { grams: (food.servingSize / hh.qty) * want.qty, how: `label: ${food.householdServingFullText} = ${food.servingSize} g` };
  }
  const unit = want.unit;
  const matches = (food?.foodPortions || [])
    .map(p => ({ p, text: portionText(p) }))
    .map(x => ({ ...x, parsed: parseQty(x.text) }))
    .filter(x => x.parsed && (x.parsed.unit === unit || x.text.toLowerCase().includes(` ${unit}`)) && x.p.gramWeight)
    .sort((a, b) => a.text.length - b.text.length);
  const m = matches[0];
  if (!m) return { grams: null, how: `no "${unit}" portion on record` };
  const perUnit = m.p.gramWeight! / (m.parsed!.unit === unit ? m.parsed!.qty : 1);
  return { grams: perUnit * want.qty, how: `portion: "${m.text}" = ${m.p.gramWeight} g` };
}

// "1/4 cup" -> { size: 0.25, unit: 'cup' } for the food table's serving_size + unit columns.
export function servingColumns(serving: string) {
  const q = parseQty(serving);
  return { serving_size: q ? Number(q.qty.toFixed(4)) : 1, unit: q?.unit || 'unit' };
}

// ---------- Scaling, sodium and cross-checks ----------

export const RATIO_TOLERANCE = 0.2; // flag new cooked foods >20% off their group's median raw/cooked ratio
export const SODIUM_FALLBACK_CUT: Partial<Record<FoodGroup, number>> = { grain: 0.9, legume: 0.9 }; // salted cooking water

export function median(values: number[]) {
  const v = values.filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

export type Flag = { code: string; message: string; review: boolean };

export type ComputeInput = {
  group: FoodGroup;
  serving: string;
  record: FdcFood; // supplies every nutrient (per 100 g as USDA reports it)
  raw?: FdcFood | null; // raw/dry reference for prepared groups: calories, sodium, portions
  groupMedianRatio?: number | null; // median cook_ratio of the group's existing foods
};

export type ComputedFood = {
  per100: Record<NutrientColumn, number>; // stored columns (per 100 g as prepared; missing = 0)
  perServing: Record<NutrientColumn, number>;
  factor: number;
  servingGrams: number;
  serving: string;
  servingHow: string;
  cookRatio: number | null;
  coverage: number;
  missing: NutrientColumn[];
  sodiumSource: 'record' | 'raw record' | 'fallback cut' | 'record (no cut)';
  flags: Flag[];
  needsReview: boolean;
};

const round = (v: number, d = 6) => Number(v.toFixed(d));

export function computeFood({ group, serving, record, raw, groupMedianRatio }: ComputeInput): ComputedFood {
  const rule = GROUP_RULES[group];
  const flags: Flag[] = [];
  const { values, coverage } = mapNutrients(record);
  const kcal = values.calories_kcal;
  if (kcal == null || kcal <= 0) throw new Error('That USDA record has no calorie value, so it can’t be scaled.');

  let usedServing = serving;
  let grams: number | null = null;
  let how = '';
  let ratio: number | null = null;
  let sodium = values.sodium_mg;
  let sodiumSource: ComputedFood['sodiumSource'] = 'record';

  if (rule.mode === 'prepared') {
    const rawKcal = raw ? mapNutrients(raw).values.calories_kcal : null;
    if (raw && rawKcal) {
      ratio = rawKcal / kcal;
      if (rule.sameDataset && raw.dataType !== record.dataType) {
        flags.push({ code: 'mixed_datasets', message: `Cooked record is ${record.dataType} but raw record is ${raw.dataType}; the cooking yield may be off.`, review: true });
      }
      // Sodium comes from the raw/dry record: cooking salt isn't part of what you buy.
      const rawSodium = mapNutrients(raw).values.sodium_mg;
      if (rawSodium != null) {
        sodium = rawSodium / ratio; // stored per 100 g prepared, so per serving = raw sodium × raw grams / 100
        sodiumSource = 'raw record';
      }
    } else if (groupMedianRatio) {
      ratio = groupMedianRatio;
      flags.push({ code: 'no_raw_record', message: `No raw/dry USDA record found; used the ${rule.label.toLowerCase()} group's typical cooking yield (ratio ${groupMedianRatio.toFixed(2)}).`, review: true });
    } else {
      throw new Error('No raw or dry USDA record was found to convert this cooked food back to what you buy.');
    }
    if (sodiumSource === 'record') {
      const cut = SODIUM_FALLBACK_CUT[group];
      if (cut && sodium != null) {
        sodium = sodium * (1 - cut);
        sodiumSource = 'fallback cut';
        flags.push({ code: 'sodium_fallback', message: `Sodium reduced ${cut * 100}% to remove cooking salt (no raw sodium value).`, review: true });
      } else {
        sodiumSource = 'record (no cut)';
      }
    }
    ({ grams, how } = servingGrams(serving, raw ?? record)); // volume servings are measured dry/raw
    if (ratio && groupMedianRatio) {
      const off = Math.abs(ratio / groupMedianRatio - 1);
      if (off > RATIO_TOLERANCE) {
        flags.push({ code: 'ratio_outlier', message: `Raw/cooked ratio ${ratio.toFixed(2)} is ${Math.round(off * 100)}% off the group median ${groupMedianRatio.toFixed(2)}.`, review: true });
      }
    }
  } else {
    ({ grams, how } = servingGrams(serving, record));
  }

  if (!grams) {
    // §3: no usable portion -> fall back to 100 g (prepared foods can't fall back: their serving is the raw amount)
    flags.push({ code: 'serving_fallback', message: `Couldn’t size "${serving}" (${how}); using 100 g instead.`, review: rule.mode === 'prepared' });
    usedServing = '100 g';
    grams = 100;
    how = 'fallback';
  }

  const factor = (grams / 100) * (ratio ?? 1);
  const filled = { ...values, sodium_mg: sodium };

  const { protein_g: p, carbohydrate_g: c, fat_g: f } = filled;
  if (p != null && c != null && f != null) {
    const est = 4 * p + 4 * c + 9 * f;
    if (Math.abs(est - kcal) / kcal > 0.2) {
      flags.push({ code: 'atwater', message: `Calories ${kcal.toFixed(0)} vs 4P+4C+9F ${est.toFixed(0)} (normal for fibrous/acidic foods and vinegar).`, review: false });
    }
  }

  const missing = NUTRIENT_COLUMNS.map(n => n[0]).filter(col => filled[col] == null);
  if (coverage < 15) flags.push({ code: 'low_coverage', message: `Only ${coverage} of ${NUTRIENT_COUNT} nutrients are on this record; missing ones are stored as 0.`, review: false });

  const per100 = {} as Record<NutrientColumn, number>;
  const perServing = {} as Record<NutrientColumn, number>;
  for (const [col] of NUTRIENT_COLUMNS) {
    const v = filled[col] ?? 0; // missing values are stored as 0 (§6)
    per100[col] = round(v);
    perServing[col] = round(v * factor);
  }

  return {
    per100,
    perServing,
    factor: round(factor, 4),
    servingGrams: round(grams, 1),
    serving: usedServing,
    servingHow: how,
    cookRatio: ratio == null ? null : round(ratio, 4),
    coverage,
    missing,
    sodiumSource,
    flags,
    needsReview: flags.some(f => f.review),
  };
}

// The 9-key per-serving nutrition JSON the current UI reads (src/lib/foods.ts).
export function legacyNutrition(perServing: Record<NutrientColumn, number>) {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    calories: r2(perServing.calories_kcal),
    protein: r2(perServing.protein_g),
    carbs: r2(perServing.carbohydrate_g),
    fat: r2(perServing.fat_g),
    fiber: r2(perServing.fiber_g),
    iron: r2(perServing.iron_mg),
    calcium: r2(perServing.calcium_mg),
    vitaminC: r2(perServing.vitamin_c_mg),
    vitaminD: 0,
  };
}

// ---------- Flavor profiles ----------

export const FLAVOR_TAGS = ['savory', 'umami', 'sweet', 'sour', 'citrus', 'bitter', 'spicy', 'herbal', 'earthy', 'nutty', 'creamy', 'smoky', 'fresh', 'starchy', 'rich', 'mild'] as const;
export type FlavorTag = (typeof FLAVOR_TAGS)[number];
export const cleanFlavorTags = (tags: unknown): FlavorTag[] =>
  Array.isArray(tags) ? [...new Set(tags.map(t => String(t).toLowerCase().trim()).filter((t): t is FlavorTag => (FLAVOR_TAGS as readonly string[]).includes(t)))].slice(0, 5) : [];

export const isFoodGroup = (v: unknown): v is FoodGroup => typeof v === 'string' && (FOOD_GROUPS as readonly string[]).includes(v);
export const isServingChoice = (v: unknown): v is (typeof SERVING_CHOICES)[number] => typeof v === 'string' && (SERVING_CHOICES as readonly string[]).includes(v);
