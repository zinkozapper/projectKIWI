// Step 5 (one-off): fill the blank (0) nutrient columns of the original 100 foods from USDA FoodData Central.
//
//   node --env-file=.env scripts/usda/5-backfill.mjs
//
// Reads the current per-100 g values from data/usda/backfill-current.csv (exported from Supabase), finds the
// USDA record for each food and writes:
//   data/usda/backfill-foods.sql     UPDATEs that only touch columns that are 0 today (non-zero values are kept)
//   data/usda/backfill-report.csv    the record used per food, what was filled, and big disagreements to review
//
// Record choice: the food's existing fdc_id when it is on the same basis, otherwise a search (SR Legacy,
// Foundation, FNDDS). Candidates must pass the must/exclude words, and their calories must be within 25% of
// the value already stored, so the filled numbers are on the same raw/cooked basis as the rest of the row.
// Among those: most of the 27 nutrients present, then closest calories. Foods with no match are reported, not guessed.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, NUTRIENTS, search, details, mapNutrients, parseCsv, toCsv } from './lib.mjs';

const TYPES = ['SR Legacy', 'Foundation', 'Survey (FNDDS)'];
const KCAL_TOLERANCE = 0.25;
const DISAGREE = 0.5; // report (not change) non-zero values that differ from USDA by more than 50%

// lib.mjs column label -> food table column
const COLUMN = {
  Calories: 'calories_kcal', Protein: 'protein_g', Carbohydrate: 'carbohydrate_g', Fiber: 'fiber_g', Lipids: 'fat_g',
  'Omega-3 (ALA)': 'omega3_ala_g', 'Omega-6': 'omega6_g', 'Vit. A': 'vitamin_a_mg', 'Vit. E': 'vitamin_e_mg', 'Vit. K': 'vitamin_k_mg',
  'Vit. B1 (Thiamin)': 'thiamin_b1_mg', 'Vit. B2 (Riboflavin)': 'riboflavin_b2_mg', 'Vit. B3 (Niacin)': 'niacin_b3_mg',
  'Vit. B6 (Pyridoxine)': 'vitamin_b6_mg', 'Vit. B9 (Folate)': 'folate_b9_mg', 'Vit. B12 (Cobalamine)': 'vitamin_b12_mg',
  'Vit. C': 'vitamin_c_mg', Choline: 'choline_mg', Sodium: 'sodium_mg', Potassium: 'potassium_mg', Calcium: 'calcium_mg',
  Phosphorous: 'phosphorus_mg', Magnesium: 'magnesium_mg', Iron: 'iron_mg', Zinc: 'zinc_mg', Copper: 'copper_mg', Selenium: 'selenium_mg',
};

// food_id: [search query, words the description must contain, words it must not contain]
const FOODS = {
  1: ['chicken breast meat only cooked', ['chicken', 'breast'], ['skin', 'fried', 'breaded']],
  2: ['chicken thigh meat only cooked', ['chicken', 'thigh'], ['skin', 'fried', 'breaded']],
  3: ['pork tenderloin cooked roasted', ['pork', 'tenderloin'], []],
  4: ['pork shoulder blade boston cooked', ['pork', 'shoulder'], ['cured', 'ham']],
  5: ['beef top sirloin steak cooked lean', ['beef', 'sirloin'], ['ground']],
  6: ['beef chuck cooked braised', ['beef', 'chuck'], ['ground']],
  7: ['ground beef 90% lean cooked', ['beef', 'ground', '90'], []],
  8: ['beef ribeye steak cooked', ['beef', 'rib'], ['ground', 'short']],
  9: ['tilapia cooked dry heat', ['tilapia'], ['breaded', 'fried']],
  10: ['salmon atlantic farmed cooked', ['salmon'], ['smoked', 'canned']],
  11: ['tuna light canned in water drained', ['tuna'], ['oil', 'salad']],
  12: ['sardines canned in oil drained solids with bone', ['sardine'], ['tomato']],
  13: ['oysters eastern wild raw', ['oyster'], ['fried', 'breaded', 'canned']],
  14: ['ground turkey cooked', ['turkey', 'ground'], ['fat free']],
  15: ['chicken liver cooked simmered', ['chicken', 'liver'], ['pate', 'fried']],
  16: ['beef liver cooked pan-fried', ['beef', 'liver'], []],
  17: ['shrimp cooked', ['shrimp'], ['breaded', 'fried']],
  18: ['chickpeas garbanzo beans mature seeds cooked boiled', ['chickpea'], ['canned', 'hummus']],
  19: ['lentils mature seeds cooked boiled', ['lentil'], ['sprouted', 'soup']],
  20: ['bagel plain enriched', ['bagel'], ['cinnamon', 'egg', 'oat']],
  21: ['pasta cooked enriched without added salt', ['pasta', 'cooked'], ['whole', 'fresh', 'spinach']],
  22: ['pasta whole wheat cooked', ['pasta', 'whole'], []],
  23: ['rice white long-grain regular enriched cooked', ['rice', 'white', 'cooked'], ['fried']],
  24: ['quinoa cooked', ['quinoa', 'cooked'], []],
  25: ['oats regular and quick cooked with water', ['oat'], ['bran', 'instant', 'flavored']],
  26: ['bread multi-grain', ['bread', 'multi'], ['toasted']],
  27: ['rice brown long-grain cooked', ['rice', 'brown', 'cooked'], []],
  28: ['tortilla whole wheat', ['tortilla', 'whole'], []],
  29: ['bread french or vienna sourdough', ['bread', 'sourdough'], ['toasted']],
  30: ['couscous cooked', ['couscous', 'cooked'], []],
  31: ['tangerines mandarin oranges raw', ['tangerine', 'raw'], ['canned', 'juice']],
  32: ['dates medjool', ['date'], []],
  33: ['bananas raw', ['banana', 'raw'], ['dried', 'chips', 'plantain']],
  34: ['peaches yellow raw', ['peach', 'raw'], ['canned', 'dried', 'frozen']],
  35: ['blueberries raw', ['blueberries', 'raw'], ['frozen', 'canned']],
  36: ['blackberries raw', ['blackberries', 'raw'], ['frozen', 'canned']],
  37: ['raspberries raw', ['raspberries', 'raw'], ['frozen', 'canned']],
  38: ['strawberries raw', ['strawberries', 'raw'], ['frozen', 'canned']],
  39: ['kiwifruit green raw', ['kiwi', 'raw'], ['juice', 'dried']],
  40: ['acerola west indian cherry juice raw', ['acerola', 'juice'], []],
  41: ['melons cantaloupe raw', ['cantaloupe', 'raw'], []],
  42: ['apples raw with skin', ['apple', 'raw'], ['juice', 'sauce', 'dried', 'without skin']],
  43: ['lemons raw without peel', ['lemon', 'raw'], ['juice', 'peel only']],
  44: ['limes raw', ['lime', 'raw'], ['juice']],
  45: ['berries mixed frozen unsweetened', ['berr', 'frozen'], ['sweetened', 'sugar']],
  46: ['broccoli raw', ['broccoli', 'raw'], ['raab', 'chinese']],
  47: ['cauliflower raw', ['cauliflower', 'raw'], ['green']],
  48: ['squash winter butternut raw', ['butternut'], ['frozen']],
  49: ['peppers sweet red raw', ['red', 'raw'], ['cooked', 'canned', 'hot']],
  50: ['asparagus raw', ['asparagus', 'raw'], []],
  51: ['brussels sprouts raw', ['brussels', 'raw'], []],
  52: ['potatoes baked flesh and skin', ['potato', 'baked'], ['sweet', 'without salt']],
  53: ['sweet potato cooked baked in skin', ['sweet potato'], ['leaves', 'canned']],
  54: ['carrots raw', ['carrot', 'raw'], ['juice', 'baby']],
  55: ['spinach raw', ['spinach', 'raw'], []],
  56: ['avocados raw all commercial varieties', ['avocado', 'raw'], ['oil']],
  57: ['beets raw', ['beet', 'raw'], ['greens', 'canned']],
  58: ['black beans mature seeds cooked boiled', ['bean', 'black'], ['canned', 'soup', 'turtle']],
  59: ['edamame frozen prepared', ['edamame'], []],
  60: ['tofu raw firm prepared with calcium sulfate', ['tofu'], ['fried', 'dried']],
  61: ['kimchi', ['kimchi'], []],
  62: ['onions raw', ['onion', 'raw'], ['spring', 'green', 'sweet', 'welsh', 'young']],
  63: ['garlic raw', ['garlic', 'raw'], []],
  64: ['tomatoes red ripe raw', ['tomato', 'raw'], ['green', 'juice', 'sun-dried']],
  65: ['cucumber with peel raw', ['cucumber', 'raw'], []],
  66: ['kale raw', ['kale', 'raw'], ['scotch']],
  67: ['squash summer zucchini includes skin raw', ['zucchini', 'raw'], ['baby']],
  68: ['milk nonfat fluid with added vitamin a and vitamin d', ['milk', 'nonfat'], ['dry', 'chocolate']],
  69: ['almond milk unsweetened', ['almond', 'milk'], ['chocolate', 'sweetened, ']],
  70: ['yogurt greek plain nonfat', ['yogurt', 'greek'], ['fruit', 'vanilla', 'whole']],
  71: ['cheese cottage lowfat 2% milkfat', ['cottage', 'lowfat'], []],
  72: ['cheese parmesan hard', ['parmesan'], ['low sodium', 'dry grated']],
  73: ['egg whole raw fresh', ['egg', 'whole'], ['dried', 'frozen', 'duck', 'goose', 'quail']],
  74: ['egg white raw fresh', ['egg', 'white'], ['dried', 'powder']],
  75: ['cheese cheddar', ['cheese', 'cheddar'], ['low', 'reduced']],
  76: ['cheese fat free cheddar or colby', ['cheese', 'fat free'], ['cream', 'cottage']],
  77: ['butter salted', ['butter'], ['whipped', 'oil', 'without salt']],
  78: ['milk whole 3.25% milkfat with added vitamin d', ['milk', 'whole'], ['dry', 'chocolate']],
  79: ['cheese cheddar', ['cheese', 'cheddar'], ['low', 'reduced']],
  80: ['cheese mozzarella whole milk', ['mozzarella'], ['nonfat', 'substitute']],
  81: ['beverages whey protein powder isolate', ['protein'], ['bar']],
  82: ['peanut flour defatted', ['peanut', 'flour'], []],
  83: ['peanut butter smooth style without salt', ['peanut butter'], ['reduced fat']],
  84: ['peanuts all types dry-roasted without salt', ['peanuts'], ['oil-roasted', 'boiled']],
  85: ['cocoa dry powder unsweetened', ['cocoa', 'unsweetened'], ['dutch', 'hot']],
  86: ['nuts almond butter plain without salt', ['almond butter'], []],
  87: ['nuts walnuts english', ['walnut'], ['black']],
  88: ['seeds chia seeds dried', ['chia'], []],
  89: ['seeds hemp seed hulled', ['hemp'], []],
  90: ['seeds pumpkin and squash seed kernels dried', ['pumpkin', 'kernels'], ['whole']],
  91: ['chocolate dark 70-85% cacao solids', ['chocolate', 'dark'], []],
  92: ['oil avocado', ['oil', 'avocado'], []],
  93: ['oil olive salad or cooking', ['oil', 'olive'], []],
  94: ['seeds flaxseed', ['flax'], ['oil']],
  95: ['nuts cashew nuts raw', ['cashew'], ['butter', 'oil']],
  96: ['seeds sunflower seed kernels dry roasted without salt', ['sunflower', 'kernels'], ['oil roasted']],
  97: ['vinegar cider', ['vinegar', 'cider'], []],
  98: ['soy sauce made from soy tamari', ['soy sauce'], ['reduced sodium']],
  99: ['honey', ['honey'], []],
  100: ['syrups maple', ['maple'], []],
};

const CURRENT = path.join(OUT, 'backfill-current.csv');
if (!fs.existsSync(CURRENT)) { console.error(`Missing ${CURRENT} (export it from Supabase first).`); process.exit(1); }
const [head, ...rows] = parseCsv(fs.readFileSync(CURRENT, 'utf8')).filter(r => r.length > 1);
const col = Object.fromEntries(head.map((k, i) => [k, i]));
const current = rows.map(r => ({ id: Number(r[col.food_id]), name: r[col.food_name], fdc: r[col.fdc_id] ? Number(r[col.fdc_id]) : null, values: Object.fromEntries(Object.values(COLUMN).map(c => [c, Number(r[col[c]]) || 0])) }));

const within = (kcal, target) => kcal != null && target > 0 && Math.abs(kcal - target) / target <= KCAL_TOLERANCE;
const eligible = (desc, must, exclude) => { const d = desc.toLowerCase(); return must.every(t => d.includes(t)) && !exclude.some(t => d.includes(t)); };

const sql = ['-- Generated by scripts/usda/5-backfill.mjs: fills only nutrient columns that are 0 today, per 100 g, from USDA FDC.', ''];
const report = [['food_id', 'food', 'fdc_id', 'data_type', 'usda_description', 'usda_kcal', 'stored_kcal', 'filled', 'review (stored vs USDA, >50% apart)']];

for (const food of current) {
  const spec = FOODS[food.id];
  if (!spec) continue;
  const [query, must, exclude] = spec;
  const kcal = food.values.calories_kcal;
  let chosen = null;
  if (food.fdc) {
    const [rec] = await details([food.fdc]).catch(() => []);
    const m = rec && mapNutrients(rec);
    if (m && within(m.values.Calories, kcal)) chosen = { rec, m };
  }
  if (!chosen) {
    const hits = await search(query, TYPES, 25);
    const ok = hits.map(h => ({ h, m: mapNutrients(h) }))
      .filter(c => eligible(c.h.description, must, exclude) && within(c.m.values.Calories, kcal))
      .sort((a, b) => b.m.coverage - a.m.coverage || Math.abs(a.m.values.Calories - kcal) - Math.abs(b.m.values.Calories - kcal));
    if (ok[0]) { const [rec] = await details([ok[0].h.fdcId]); chosen = { rec, m: mapNutrients(rec) }; }
  }
  if (!chosen) {
    console.log(`${food.id} ${food.name}: no USDA record within ${KCAL_TOLERANCE * 100}% of ${kcal} kcal — review by hand`);
    report.push([food.id, food.name, '', '', 'NO MATCH', '', kcal, '', '']);
    continue;
  }
  const { rec, m } = chosen;
  const fills = [], review = [];
  for (const [label] of NUTRIENTS) {
    const c = COLUMN[label], usda = m.values[label], stored = food.values[c];
    if (usda == null) continue;
    if (stored === 0 && usda > 0) fills.push([c, Number(usda.toPrecision(4))]);
    else if (stored > 0 && usda > 0 && Math.abs(stored - usda) / Math.max(stored, usda) > DISAGREE) review.push(`${c} ${stored} vs ${Number(usda.toPrecision(4))}`);
  }
  console.log(`${food.id} ${food.name}: ${rec.fdcId} ${rec.description} — fills ${fills.length}${review.length ? `, review ${review.length}` : ''}`);
  report.push([food.id, food.name, rec.fdcId, rec.dataType, rec.description, m.values.Calories?.toFixed(0), kcal, fills.map(f => f[0]).join(' '), review.join('; ')]);
  if (fills.length) {
    const sets = fills.map(([c, v]) => `${c} = CASE WHEN ${c} = 0 THEN ${v} ELSE ${c} END`).join(', ');
    sql.push(`UPDATE public.food SET ${sets} WHERE food_id = ${food.id}; -- ${food.name}: FDC ${rec.fdcId}`);
  }
}

fs.writeFileSync(path.join(OUT, 'backfill-foods.sql'), sql.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'backfill-report.csv'), toCsv(report));
console.log('\nWrote data/usda/backfill-foods.sql and data/usda/backfill-report.csv');
