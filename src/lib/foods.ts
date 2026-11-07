
// The 27 nutrients Kiwi tracks. food stores them per 100 g in its *_mg / *_g columns (USDA import);
// per serving = column × food.factor. Values in the app are per serving, in the unit below.
// µg nutrients are stored in mg and multiplied by 1000 so small numbers stay readable.
export const NUTRIENTS = [
  { key: 'calories', column: 'calories_kcal', label: 'Calories', unit: 'kcal', scale: 1, group: 'macros' },
  { key: 'protein', column: 'protein_g', label: 'Protein', unit: 'g', scale: 1, group: 'macros' },
  { key: 'carbs', column: 'carbohydrate_g', label: 'Carbs', unit: 'g', scale: 1, group: 'macros' },
  { key: 'fat', column: 'fat_g', label: 'Fat', unit: 'g', scale: 1, group: 'macros' },
  { key: 'fiber', column: 'fiber_g', label: 'Fiber', unit: 'g', scale: 1, group: 'macros' },
  { key: 'omega3', column: 'omega3_ala_g', label: 'Omega-3 (ALA)', unit: 'g', scale: 1, group: 'macros' },
  { key: 'omega6', column: 'omega6_g', label: 'Omega-6', unit: 'g', scale: 1, group: 'macros' },
  { key: 'vitaminA', column: 'vitamin_a_mg', label: 'Vitamin A', unit: 'µg', scale: 1000, group: 'vitamins' },
  { key: 'vitaminC', column: 'vitamin_c_mg', label: 'Vitamin C', unit: 'mg', scale: 1, group: 'vitamins' },
  { key: 'vitaminE', column: 'vitamin_e_mg', label: 'Vitamin E', unit: 'mg', scale: 1, group: 'vitamins' },
  { key: 'vitaminK', column: 'vitamin_k_mg', label: 'Vitamin K', unit: 'µg', scale: 1000, group: 'vitamins' },
  { key: 'thiamin', column: 'thiamin_b1_mg', label: 'Thiamin (B1)', unit: 'mg', scale: 1, group: 'vitamins' },
  { key: 'riboflavin', column: 'riboflavin_b2_mg', label: 'Riboflavin (B2)', unit: 'mg', scale: 1, group: 'vitamins' },
  { key: 'niacin', column: 'niacin_b3_mg', label: 'Niacin (B3)', unit: 'mg', scale: 1, group: 'vitamins' },
  { key: 'vitaminB6', column: 'vitamin_b6_mg', label: 'Vitamin B6', unit: 'mg', scale: 1, group: 'vitamins' },
  { key: 'folate', column: 'folate_b9_mg', label: 'Folate (B9)', unit: 'µg', scale: 1000, group: 'vitamins' },
  { key: 'vitaminB12', column: 'vitamin_b12_mg', label: 'Vitamin B12', unit: 'µg', scale: 1000, group: 'vitamins' },
  { key: 'choline', column: 'choline_mg', label: 'Choline', unit: 'mg', scale: 1, group: 'vitamins' },
  { key: 'calcium', column: 'calcium_mg', label: 'Calcium', unit: 'mg', scale: 1, group: 'minerals' },
  { key: 'iron', column: 'iron_mg', label: 'Iron', unit: 'mg', scale: 1, group: 'minerals' },
  { key: 'magnesium', column: 'magnesium_mg', label: 'Magnesium', unit: 'mg', scale: 1, group: 'minerals' },
  { key: 'phosphorus', column: 'phosphorus_mg', label: 'Phosphorus', unit: 'mg', scale: 1, group: 'minerals' },
  { key: 'potassium', column: 'potassium_mg', label: 'Potassium', unit: 'mg', scale: 1, group: 'minerals' },
  { key: 'sodium', column: 'sodium_mg', label: 'Sodium', unit: 'mg', scale: 1, group: 'minerals' },
  { key: 'zinc', column: 'zinc_mg', label: 'Zinc', unit: 'mg', scale: 1, group: 'minerals' },
  { key: 'copper', column: 'copper_mg', label: 'Copper', unit: 'µg', scale: 1000, group: 'minerals' },
  { key: 'selenium', column: 'selenium_mg', label: 'Selenium', unit: 'µg', scale: 1000, group: 'minerals' },
] as const;

export type NutrientKey = typeof NUTRIENTS[number]['key'];
export type NutrientGroup = typeof NUTRIENTS[number]['group'];
export type Nutrients = Record<NutrientKey, number>;
type NutrientColumn = typeof NUTRIENTS[number]['column'];

export const nutrientGroups: { group: NutrientGroup; label: string }[] = [
  { group: 'macros', label: 'Macros' },
  { group: 'vitamins', label: 'Vitamins' },
  { group: 'minerals', label: 'Minerals' },
];

// Upper limits rather than goals: the bar warns when over, and gap suggestions skip them.
export const nutrientLimits = new Set<NutrientKey>(['sodium']);

// Small amounts (B vitamins, omega-3) need decimals; everything else reads better as whole numbers.
export function formatAmount(n: number) {
  const abs = Math.abs(n);
  if (abs === 0) return '0';
  if (abs < 1) return String(Number(n.toFixed(2)));
  if (abs < 10) return String(Number(n.toFixed(1)));
  return Math.round(n).toLocaleString();
}

export const emptyNutrients = (): Nutrients => Object.fromEntries(NUTRIENTS.map(n => [n.key, 0])) as Nutrients;

export type Food = {
  id: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  servings: number;
  nutrition: Nutrients;
  note: string;
  emoji: string;
  pairs: string[];
  flavor?: string[];
};

// Food catalog loaded from Supabase.
export const foods: Food[] = [];

export async function loadCatalog() {
  if (foods.length) return foods;

  const { supabase } = await import('@/integrations/supabase/client');

  const { data, error } = await supabase
    .from('food')
    .select('*, food_category(category_description)')
    .order('food_id');

  if (error) throw error;

  foods.splice(0, foods.length, ...(data || []).map(mapFoodRow));

  return foods;
}

type FoodRow = {
  food_id: number;
  food_name: string;
  food_category?: { category_description: string } | null;
  unit: string;
  price: number | string;
  serving_size: number | string;
  nutrition: unknown;
  food_description: string;
  emoji: string;
  pairs: number[] | null;
  flavor_profile?: string[] | null;
  factor?: number | string | null;
} & Partial<Record<NutrientColumn, number | string | null>>;

// One database row -> the Food shape the UI uses. Nutrients come from the per-100 g columns × factor
// (per serving). A row without those columns falls back to the older 8-nutrient nutrition json.
export function mapFoodRow(r: FoodRow): Food {
  const legacy = (r.nutrition ?? {}) as Partial<Record<string, unknown>>;
  const factor = Number(r.factor);
  const hasColumns = Number.isFinite(factor) && factor > 0 && r.calories_kcal != null;
  const nutrition = emptyNutrients();
  for (const n of NUTRIENTS) {
    const value = hasColumns ? Number(r[n.column]) * factor * n.scale : Number(legacy[n.key]);
    nutrition[n.key] = Number.isFinite(value) ? value : 0;
  }
  return {
    id: String(r.food_id),
    name: r.food_name,
    category: r.food_category?.category_description ?? 'Other',
    unit: r.unit,
    price: Number(r.price),
    servings: Number(r.serving_size),
    nutrition,
    note: r.food_description,
    emoji: r.emoji,
    pairs: (r.pairs || []).map(String),
    flavor: r.flavor_profile || [],
  };
}

// Add a food created by the AI food finder to the cached catalog (and link it into its partners' pairs)
// so it shows up in search and pairings without a reload.
export function addFoodToCatalog(row: FoodRow): Food {
  const food = mapFoodRow(row);
  const at = foods.findIndex(f => f.id === food.id);
  if (at >= 0) foods[at] = food;
  else foods.push(food);
  for (const partner of foods) {
    if (food.pairs.includes(partner.id) && !partner.pairs.includes(food.id)) partner.pairs = [...partner.pairs, food.id];
  }
  return food;
}

export const foodById = (id: string) =>
  foods.find(f => f.id === id);

const FOOD_SEARCH_ALIASES: Record<string, string[]> = {
  egg: ['eggs'],
  'egg white': ['egg whites'],
  'almond milk': ['plant milk', 'non dairy milk', 'dairy free milk', 'milk alternative'],
  'whole milk': ['dairy milk'],
  'nonfat greek yogurt': ['greek yogurt', 'yogurt', 'yoghurt'],
  'chickpeas garbanzo beans': ['chickpeas', 'garbanzo beans'],
  'rolled oats': ['oatmeal', 'porridge oats'],
  'ground beef 90 10': ['ground beef', 'minced beef'],
  'ground turkey': ['turkey mince'],
  'sweet potato': ['yam', 'yams'],
  'protein powder': ['whey protein', 'protein supplement'],
};

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function matchesQuery(value: string, query: string, queryWords: string[]): boolean {
  const normalized = normalizeSearchText(value);
  if (normalized.includes(query)) return true;
  const words = normalized.split(' ');
  return queryWords.every(queryWord => words.some(word => word.includes(queryWord)));
}

function isTypoMatch(value: string, queryWords: string[]): boolean {
  const words = normalizeSearchText(value).split(' ');
  return queryWords.every(queryWord => {
    if (queryWord.length < 5) return false;
    const maxDistance = queryWord.length >= 8 ? 2 : 1;
    return words.some(word => editDistanceWithin(queryWord, word, maxDistance));
  });
}

function editDistanceWithin(left: string, right: string, maxDistance: number): boolean {
  if (Math.abs(left.length - right.length) > maxDistance) return false;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[right.length]! <= maxDistance;
}

export function searchFoods<T extends Pick<Food, 'name' | 'category'> & Partial<Pick<Food, 'note'>>>(
  catalog: T[],
  query: string,
  limit = 6
): T[] {
  const term = normalizeSearchText(query);
  if (!term) return [];
  const queryWords = term.split(' ');

  const nameMatches: T[] = [];
  const aliasMatches: T[] = [];
  const typoMatches: T[] = [];
  const descriptionMatches: T[] = [];
  const categoryMatches: T[] = [];

  for (const food of catalog) {
    const name = normalizeSearchText(food.name);
    if (matchesQuery(food.name, term, queryWords)) {
      nameMatches.push(food);
    } else if ((FOOD_SEARCH_ALIASES[name] || []).some(alias => matchesQuery(alias, term, queryWords))) {
      aliasMatches.push(food);
    } else if (isTypoMatch(food.name, queryWords)) {
      typoMatches.push(food);
    } else if (food.note && matchesQuery(food.note, term, queryWords)) {
      descriptionMatches.push(food);
    } else if (matchesQuery(food.category, term, queryWords)) {
      categoryMatches.push(food);
    }
  }

  return [...nameMatches, ...aliasMatches, ...typoMatches, ...descriptionMatches, ...categoryMatches].slice(0, limit);
}

export const nutrientKeys: NutrientKey[] = NUTRIENTS.map(n => n.key);
export const nutrientLabels = Object.fromEntries(NUTRIENTS.map(n => [n.key, n.label])) as Record<NutrientKey, string>;
export const nutrientUnits = Object.fromEntries(NUTRIENTS.map(n => [n.key, n.unit])) as Record<NutrientKey, string>;

// quantity = total servings (shopping_list_item.quantity, or days × 1 serving for a pantry food).
export function totals(
  items: { food_id: string; quantity: number }[]
): Nutrients {
  const result = emptyNutrients();
  items.forEach(item => {
    const food = foodById(item.food_id);
    if (food) nutrientKeys.forEach(k => { result[k] += food.nutrition[k] * Number(item.quantity); });
  });
  return result;
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  const result = emptyNutrients();
  nutrientKeys.forEach(k => { result[k] = a[k] + b[k]; });
  return result;
}

// Curated combinations of foods commonly used together.
const MEAL_PAIRINGS: string[][] = [

  // Chicken meals
  ['Chicken breast', 'Chicken thighs', 'Brown Rice', 'Broccoli', 'Sweet Potato', 'Green Beans'],
  ['Chicken breast', 'Quinoa', 'Spinach', 'Avocado', 'Tomatoes'],
  ['Chicken thighs', 'Potato', 'Carrot', 'Yellow Onion', 'Garlic'],
  ['Chicken breast', 'Whole Wheat Tortillas', 'Black Beans', 'Avocado', 'Red Bell Pepper'],

  // Beef meals
  ['Ground beef 90/10', 'Rice', 'Black Beans', 'Red Bell Pepper', 'Tomatoes'],
  ['Chuck', 'Potato', 'Carrot', 'Yellow Onion'],
  ['Ribeye Whole', 'Asparagus', 'Potato', 'Broccoli'],
  ['Sirloin', 'Brown Rice', 'Broccoli', 'Red Bell Pepper'],
  ['Ground beef 90/10', 'Whole Wheat Pasta', 'Tomatoes', 'Parmesan Cheese'],

  // Pork meals
  ['Pork Tenderloin', 'Sweet Potato', 'Brussels Sprouts', 'Apples'],
  ['Pork Butt/Shoulder', 'Rice', 'Yellow Onion', 'Red Bell Pepper'],
  ['Pork Tenderloin', 'Quinoa', 'Asparagus', 'Carrot'],

  // Fish and seafood
  ['Salmon', 'Quinoa', 'Asparagus', 'Lemon', 'Broccoli'],
  ['Tilapia', 'Brown Rice', 'Broccoli', 'Lemon'],
  ['Shrimp', 'Rice', 'Broccoli', 'Red Bell Pepper', 'Garlic'],
  ['Tuna', 'Sourdough Bread', 'Avocado', 'Cucumber'],
  ['Sardines', 'Sourdough Bread', 'Avocado', 'Lemon'],
  ['Oysters', 'Lemon', 'Spinach', 'Sourdough Bread'],

  // Breakfast combinations
  ['Egg', 'Avocado', 'Sourdough Bread', 'Spinach', 'Tomatoes'],
  ['Egg white', 'Spinach', 'Tomatoes', 'Cheddar Cheese'],
  ['Rolled oats', 'Bananas', 'Blueberries', 'Peanut Butter', 'Milk'],
  ['Rolled oats', 'Strawberries', 'Chia Seeds', 'Almond Milk'],
  ['Nonfat Greek yogurt', 'Blueberries', 'Strawberries', 'Walnuts'],
  ['Low-fat Cottage Cheese', 'Peaches', 'Blueberries', 'Walnuts'],
  ['Bagels', 'Egg', 'Avocado', 'Cheddar Cheese'],
  ['Bagels', 'Low-fat Cottage Cheese', 'Strawberries'],

  // Legumes and plant-based meals
  ['Chickpeas / Garbanzo Beans', 'Cucumber', 'Tomatoes', 'Spinach', 'Quinoa'],
  ['Black Beans', 'Brown Rice', 'Avocado', 'Red Bell Pepper', 'Tomatoes'],
  ['Lentils', 'Brown Rice', 'Carrot', 'Spinach', 'Tomatoes'],
  ['Edamame', 'Rice', 'Carrot', 'Cucumber', 'Soy Sauce / Tamari'],
  ['Tofu', 'Brown Rice', 'Broccoli', 'Carrot', 'Soy Sauce / Tamari'],

  // Pasta and grain meals
  ['Pasta', 'Ground beef 90/10', 'Tomatoes', 'Spinach', 'Parmesan Cheese'],
  ['Whole Wheat Pasta', 'Chicken breast', 'Spinach', 'Parmesan Cheese'],
  ['Quinoa', 'Chicken breast', 'Avocado', 'Spinach'],
  ['Couscous', 'Chickpeas / Garbanzo Beans', 'Cucumber', 'Tomatoes'],

  // Sandwiches and wraps
  ['Multi-grain Bread', 'Egg', 'Avocado', 'Spinach'],
  ['Whole Wheat Tortillas', 'Chicken breast', 'Black Beans', 'Avocado'],
  ['Whole Wheat Tortillas', 'Ground beef 90/10', 'Cheddar Cheese', 'Tomatoes'],
  ['Sourdough Bread', 'Tuna', 'Avocado', 'Cucumber'],

  // Vegetables and sides
  ['Broccoli', 'Chicken breast', 'Brown Rice'],
  ['Asparagus', 'Salmon', 'Quinoa'],
  ['Sweet Potato', 'Chicken breast', 'Ground Turkey'],
  ['Brussels Sprouts', 'Pork Tenderloin', 'Potato'],
  ['Zucchini', 'Ground beef 90/10', 'Tomatoes', 'Parmesan Cheese'],
  ['Cauliflower', 'Chicken breast', 'Brown Rice'],
  ['Beets', 'Spinach', 'Feta', 'Quinoa'],
  ['Kale', 'Chicken breast', 'Avocado', 'Pumpkin Seeds'],
  ['Butternut squash', 'Chicken thighs', 'Quinoa'],
  ['Kimchi', 'Egg', 'Rice', 'Tofu'],
];

// Snacks, fruit, smoothies, and additional combinations.
const ADDITIONAL_PAIRINGS: string[][] = [

  // Fruit combinations
  ['Bananas', 'Peanut Butter', 'Rolled oats'],
  ['Apples', 'Almond Butter', 'Walnuts'],
  ['Blueberries', 'Nonfat Greek yogurt', 'Chia Seeds'],
  ['Strawberries', 'Low-fat Cottage Cheese', 'Walnuts'],
  ['Dates', 'Peanut Butter', 'Almond Butter'],
  ['Cantaloupe', 'Low-fat Cottage Cheese', 'Strawberries'],
  ['Kiwis', 'Strawberries', 'Nonfat Greek yogurt'],
  ['Blackberries', 'Blueberries', 'Nonfat Greek yogurt'],
  ['Raspberries', 'Rolled oats', 'Almond Milk'],
  ['Mandarin Oranges', 'Walnuts', 'Nonfat Greek yogurt'],
  ['Peaches', 'Low-fat Cottage Cheese', 'Walnuts'],
  ['Frozen Mixed Berries', 'Bananas', 'Nonfat Greek yogurt'],
  ['Acerola Juice', 'Frozen Mixed Berries', 'Bananas'],

  // Smoothies and protein bowls
  ['Protein Powder', 'Bananas', 'Almond Milk', 'Peanut Butter'],
  ['Protein Powder', 'Frozen Mixed Berries', 'Nonfat Greek yogurt'],
  ['Hemp Seeds', 'Blueberries', 'Rolled oats', 'Almond Milk'],
  ['Ground Flax Seeds', 'Rolled oats', 'Bananas', 'Blueberries'],
  ['Chia Seeds', 'Almond Milk', 'Strawberries', 'Rolled oats'],

  // Nuts and seeds
  ['Almond Butter', 'Apples', 'Bananas'],
  ['Cashews', 'Dates', 'Dark Chocolate'],
  ['Peanuts', 'Dark Chocolate', 'Bananas'],
  ['Pumpkin Seeds', 'Kale', 'Quinoa'],
  ['Sunflower Seeds', 'Spinach', 'Strawberries'],
  ['Walnuts', 'Apples', 'Rolled oats'],
  ['Hemp Seeds', 'Nonfat Greek yogurt', 'Blueberries'],
  ['Ground Flax Seeds', 'Nonfat Greek yogurt', 'Bananas'],

  // Chocolate and sweet additions
  ['Cocoa Powder', 'Bananas', 'Peanut Butter', 'Almond Milk'],
  ['Dark Chocolate', 'Strawberries', 'Almonds'],
  ['Honey', 'Nonfat Greek yogurt', 'Blueberries'],
  ['Maple Syrup', 'Rolled oats', 'Bananas'],
  ['Dates', 'Cashews', 'Dark Chocolate'],

  // Oils, condiments, and seasonings
  ['Olive Oil', 'Tomatoes', 'Spinach', 'Quinoa'],
  ['Avocado Oil', 'Chicken breast', 'Broccoli'],
  ['Apple Cider Vinegar', 'Spinach', 'Avocado'],
  ['Lemon', 'Olive Oil', 'Salmon'],
  ['Lime', 'Black Beans', 'Avocado', 'Tomatoes'],
  ['Soy Sauce / Tamari', 'Tofu', 'Brown Rice'],
  ['Garlic', 'Olive Oil', 'Broccoli', 'Chicken breast'],

  // Dairy and cheese
  ['Mozzarella Cheese', 'Tomatoes', 'Olive Oil'],
  ['Cheddar Cheese', 'Egg', 'Multi-grain Bread'],
  ['Parmesan Cheese', 'Whole Wheat Pasta', 'Tomatoes'],
  ['Nonfat Cheese', 'Egg white', 'Spinach'],
  ['Cheese', 'Whole Wheat Tortillas', 'Black Beans'],
  ['Butter', 'Bagels', 'Egg'],
  ['Butter', 'Potato', 'Broccoli'],
  ['Whole Milk', 'Rolled oats', 'Bananas'],
  ['Skim Milk', 'Protein Powder', 'Bananas'],
  ['Almond Milk', 'Rolled oats', 'Blueberries'],

  // Liver and nutrient-rich foods
  ['Chicken Liver', 'Yellow Onion', 'Spinach'],
  ['Liver', 'Yellow Onion', 'Potato'],
  ['Chicken Liver', 'Brown Rice', 'Broccoli'],

  // More vegetable combinations
  ['Beets', 'Goat Cheese', 'Spinach'],
  ['Cauliflower', 'Olive Oil', 'Garlic'],
  ['Carrot', 'Hummus', 'Cucumber'],
  ['Kale', 'Avocado', 'Lemon'],
  ['Zucchini', 'Tomatoes', 'Mozzarella Cheese'],
  ['Brussels Sprouts', 'Olive Oil', 'Garlic'],
  ['Butternut squash', 'Quinoa', 'Spinach'],

  // Bread and snack combinations
  ['Bagels', 'Cream Cheese', 'Tomatoes'],
  ['Multi-grain Bread', 'Peanut Butter', 'Bananas'],
  ['Sourdough Bread', 'Mozzarella Cheese', 'Tomatoes'],
];

// Normalize names to make matching more reliable.
function normalizeFoodName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Recognize common database naming variations.
const FOOD_ALIASES: Record<string, string[]> = {
  'egg': ['eggs'],
  'bananas': ['banana'],
  'blueberries': ['blueberry'],
  'strawberries': ['strawberry'],
  'tomatoes': ['tomato'],
  'carrot': ['carrots'],
  'apples': ['apple'],
  'rice': ['brown rice', 'white rice'],
  'milk': ['whole milk', 'skim milk', 'almond milk'],
  'ground beef 90 10': ['ground beef'],
  'chicken breast': ['chicken'],
  'nonfat greek yogurt': ['greek yogurt'],
  'chickpeas garbanzo beans': ['chickpeas', 'garbanzo beans'],
  'potato': ['potatoes'],
  'bagels': ['bagel'],
  'rolled oats': ['oatmeal'],
  'cantaloupe': ['melon'],
  'protein powder': ['whey protein'],
  'cheese': ['cheddar cheese', 'mozzarella cheese', 'parmesan cheese'],
  'whole wheat pasta': ['pasta'],
  'almond milk': ['milk alternative'],
  'black beans': ['black bean'],
  'ground turkey': ['turkey'],
};

// Match a catalog food against a pairing name.
function matchesPairing(food: Food, pairingName: string): boolean {
  const name = normalizeFoodName(food.name);
  const pairing = normalizeFoodName(pairingName);

  if (name === pairing) return true;

  const aliases = FOOD_ALIASES[pairing] || [];

  if (
    aliases.some(alias => normalizeFoodName(alias) === name)
  ) {
    return true;
  }

  return name.startsWith(pairing + ' ') ||
    pairing.startsWith(name + ' ');
}

// Combine both curated pairing catalogs.
const ALL_MEAL_PAIRINGS = [
  ...MEAL_PAIRINGS,
  ...ADDITIONAL_PAIRINGS
];

// Return foods commonly used together in meals.

export function getFoodPairings(
  selectedFood: Food | undefined,
  excludedFoodIds: string[],
  _dailyTargets: Nutrients,
  budgetRemaining: number,
  foodPreferences: Record<string, boolean> = {},
  days = 1
): Food[] {
  if (!selectedFood) return [];

  const matchingGroups = ALL_MEAL_PAIRINGS.filter(group =>
    group.some(name => matchesPairing(selectedFood, name))
  );

  const recommendedNames = matchingGroups.flatMap(group =>
    group.filter(name => !matchesPairing(selectedFood, name))
  );

  // Pairings stored in the database (food.pairs, set by the AI food finder) come first, in both directions;
  // the curated lists below still cover the original catalog until it is backfilled.
  const databasePairs = [
    ...selectedFood.pairs.map(id => foodById(id)),
    ...foods.filter(food => food.pairs.includes(selectedFood.id)),
  ].filter((food): food is Food => !!food);
  const candidates: Food[] = [
    ...databasePairs,
    ...recommendedNames.map(name => foods.find(food => matchesPairing(food, name))).filter((food): food is Food => !!food),
  ];

  const recommendations: Food[] = [];
  const seen = new Set<string>();

  for (const match of candidates) {
    if (match.id === selectedFood.id) continue;
    if (excludedFoodIds.includes(match.id)) continue;
    if (seen.has(match.id)) continue;

    seen.add(match.id);
    recommendations.push(match);
  }

  // Never drop a pairing for budget: pairings whose add (price × days) fits the remaining budget come
  // first, then liked over neutral over disliked.
  const fits = (food: Food) => {
    const price = Number(food.price);
    return !(Number.isFinite(price) && price > 0) || price * days <= budgetRemaining;
  };
  recommendations.sort((a, b) => {
    if (fits(a) !== fits(b)) return fits(a) ? -1 : 1;
    const scoreA = foodPreferences[a.id] === true
      ? 1.25
      : foodPreferences[a.id] === false
        ? 0.75
        : 1;

    const scoreB = foodPreferences[b.id] === true
      ? 1.25
      : foodPreferences[b.id] === false
        ? 0.75
        : 1;

    return scoreB - scoreA;
  });

  return recommendations.slice(0, 3);
}


// User nutrition profile.
export type Profile = {
  user_id: string;
  display_name: string;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  gender: string | null;
  activity: string;
  goal: string;
  budget: number;
  budget_period_weeks?: number;
  budget_period_start?: string;
};

// Calculate estimated daily nutritional targets.
export function targets(profile: Profile | null): Nutrients {
  const weight = Number(profile?.weight_kg) || 68;
  const height = Number(profile?.height_cm) || 170;
  const age = Number(profile?.age) || 23;

  const base =
    10 * weight +
    6.25 * height -
    5 * age +
    (profile?.gender === 'male'
      ? 5
      : profile?.gender === 'female'
        ? -161
        : -78);

  const calories = Math.round(
    base *
    ({
      low: 1.2,
      moderate: 1.45,
      high: 1.7
    }[profile?.activity as 'low' | 'moderate' | 'high'] || 1.45)
  );

  // Adult (19+) Dietary Reference Intakes, NIH Office of Dietary Supplements: RDA, or AI where no RDA
  // exists (fiber, omega-3/6, vitamin K, choline, potassium). Sodium is the 2,300 mg upper limit.
  const male = profile?.gender === 'male';
  const over30 = age > 30;

  return {
    calories,
    protein: Math.round(weight * 1.0),
    carbs: Math.round(calories * 0.5 / 4),
    fat: Math.round(calories * 0.3 / 9),
    fiber: male ? 34 : 28,
    omega3: male ? 1.6 : 1.1,
    omega6: male ? 17 : 12,
    vitaminA: male ? 900 : 700,
    vitaminC: male ? 90 : 75,
    vitaminE: 15,
    vitaminK: male ? 120 : 90,
    thiamin: male ? 1.2 : 1.1,
    riboflavin: male ? 1.3 : 1.1,
    niacin: male ? 16 : 14,
    vitaminB6: 1.3,
    folate: 400,
    vitaminB12: 2.4,
    choline: male ? 550 : 425,
    calcium: 1000,
    iron: profile?.gender === 'female' ? 18 : 8,
    magnesium: male ? (over30 ? 420 : 400) : (over30 ? 320 : 310),
    phosphorus: 700,
    potassium: male ? 3400 : 2600,
    sodium: 2300,
    zinc: male ? 11 : 8,
    copper: 900,
    selenium: 55,
  };
}
