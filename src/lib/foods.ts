
export type Nutrients = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  iron: number;
  calcium: number;
  vitaminC: number;
  vitaminD: number;
};

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

  foods.splice(
    0,
    foods.length,
    ...(data || []).map((r) => {
      // nutrition is a jsonb column, so Supabase types it as Json. Missing values still become 0.
      const n = (r.nutrition ?? {}) as Partial<Record<keyof Nutrients, unknown>>;
      return {
        id: String(r.food_id),
        name: r.food_name,
        category: r.food_category?.category_description ?? 'Other',
        unit: r.unit,
        price: Number(r.price),
        servings: Number(r.serving_size),
        nutrition: {
          calories: Number(n.calories) || 0,
          protein: Number(n.protein) || 0,
          carbs: Number(n.carbs) || 0,
          fat: Number(n.fat) || 0,
          fiber: Number(n.fiber) || 0,
          iron: Number(n.iron) || 0,
          calcium: Number(n.calcium) || 0,
          vitaminC: Number(n.vitaminC) || 0,
          vitaminD: Number(n.vitaminD) || 0,
        },
        note: r.food_description,
        emoji: r.emoji,
        pairs: (r.pairs || []).map(String),
      };
    })
  );

  return foods;
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

export const nutrientKeys: (keyof Nutrients)[] = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'iron',
  'calcium',
  'vitaminC',
  'vitaminD'
];

export const nutrientLabels: Record<keyof Nutrients, string> = {
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  fiber: 'Fiber',
  iron: 'Iron',
  calcium: 'Calcium',
  vitaminC: 'Vitamin C',
  vitaminD: 'Vitamin D'
};

export const nutrientUnits: Record<keyof Nutrients, string> = {
  calories: 'kcal',
  protein: 'g',
  carbs: 'g',
  fat: 'g',
  fiber: 'g',
  iron: 'mg',
  calcium: 'mg',
  vitaminC: 'mg',
  vitaminD: 'µg'
};

export function totals(
  items: { food_id: string; quantity: number }[]
): Nutrients {
  const result = Object.fromEntries(
    nutrientKeys.map(k => [k, 0])
  ) as Nutrients;

  items.forEach(item => {
    const food = foodById(item.food_id);

    if (food) {
      nutrientKeys.forEach(k => {
        result[k] += food.nutrition[k] * Number(item.quantity);
      });
    }
  });

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
  budgetRemaining: number
): Food[] {
  if (!selectedFood) return [];

  const matchingGroups = ALL_MEAL_PAIRINGS.filter(group =>
    group.some(name => matchesPairing(selectedFood, name))
  );

  const recommendedNames = matchingGroups.flatMap(group =>
    group.filter(name => !matchesPairing(selectedFood, name))
  );

  const recommendations: Food[] = [];
  const seen = new Set<string>();

  for (const pairingName of recommendedNames) {
    const match = foods.find(food =>
      matchesPairing(food, pairingName)
    );

    if (!match) continue;
    if (match.id === selectedFood.id) continue;
    if (excludedFoodIds.includes(match.id)) continue;
    if (seen.has(match.id)) continue;

    const price = Number(match.price);

    if (
      Number.isFinite(price) &&
      price > 0 &&
      price > budgetRemaining
    ) {
      continue;
    }

    seen.add(match.id);
    recommendations.push(match);
  }

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

  return {
    calories,
    protein: Math.round(weight * 1.0),
    carbs: Math.round(calories * 0.5 / 4),
    fat: Math.round(calories * 0.3 / 9),
    fiber: profile?.gender === 'male' ? 34 : 28,
    iron: profile?.gender === 'female' ? 18 : 8,
    calcium: 1000,
    vitaminC: profile?.gender === 'male' ? 90 : 75,
    vitaminD: 15
  };
}
