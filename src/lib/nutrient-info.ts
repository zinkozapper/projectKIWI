import { NUTRIENTS, type NutrientKey } from './foods';

// Plain-language notes for the nutrient info popups, written at about a 3rd-grade reading level:
// short words, short sentences, one idea each.
export const NUTRIENT_INFO: Record<NutrientKey, string> = {
  calories: 'Calories are the energy in food. Your body uses them to move, think and grow.',
  protein: 'Protein builds and fixes your muscles. It helps you grow strong and heal when you get hurt.',
  carbs: 'Carbs are your body’s main fuel. They give you quick energy to run, play and think.',
  fat: 'Fat gives your body long-lasting energy. It also helps you use some vitamins.',
  fiber: 'Fiber helps food move through your belly. It keeps you full and helps you go to the bathroom.',
  omega3: 'Omega-3 is a healthy fat. It helps your brain, eyes and heart work well.',
  omega6: 'Omega-6 is a fat your body needs a little of. Too much can be hard on your body, so less is better.',
  vitaminA: 'Vitamin A helps your eyes see, even in the dark. It also helps you fight off germs.',
  vitaminC: 'Vitamin C helps you fight colds and heal cuts. It also keeps your gums healthy.',
  vitaminE: 'Vitamin E protects your cells from damage. It helps keep your skin and eyes healthy.',
  vitaminK: 'Vitamin K helps your blood stop when you get a cut. It also helps keep bones strong.',
  thiamin: 'Thiamin (B1) helps your body turn food into energy. It also helps your nerves work.',
  riboflavin: 'Riboflavin (B2) helps your body get energy from food. It helps your skin and eyes too.',
  niacin: 'Niacin (B3) helps turn food into energy. It helps keep your skin and nerves healthy.',
  vitaminB6: 'Vitamin B6 helps your brain work and your mood stay steady. It also helps make blood.',
  folate: 'Folate (B9) helps your body make new cells. It is extra important for growing bodies.',
  vitaminB12: 'Vitamin B12 helps make healthy blood. It also keeps your nerves and brain working.',
  choline: 'Choline helps your brain remember things. It also helps your muscles move.',
  calcium: 'Calcium makes your bones and teeth strong. It also helps your muscles and heart work.',
  iron: 'Iron helps your blood carry air to your whole body. Without enough, you feel tired.',
  magnesium: 'Magnesium helps your muscles relax and your heart keep a steady beat. It helps you sleep too.',
  phosphorus: 'Phosphorus works with calcium to build strong bones and teeth. It helps make energy too.',
  potassium: 'Potassium helps your heart beat and your muscles move. It also balances water in your body.',
  sodium: 'Sodium is in salt. Your body needs a little, but too much is hard on your heart, so less is better.',
  zinc: 'Zinc helps you fight germs and heal cuts. It also helps you taste and smell food.',
  copper: 'Copper helps your body make blood and use iron. It also helps keep your bones strong.',
  selenium: 'Selenium protects your cells from damage. It helps your body fight germs.',
};

// Extra words people type when searching for a nutrient.
const ALIASES: Partial<Record<NutrientKey, string[]>> = {
  calories: ['energy', 'kcal'],
  carbs: ['carbohydrate', 'carbohydrates', 'sugar', 'starch'],
  fat: ['fats', 'lipids'],
  omega3: ['omega 3', 'omega-3', 'ala', 'fish oil'],
  omega6: ['omega 6', 'omega-6', 'linoleic'],
  vitaminA: ['vit a', 'retinol', 'a'],
  vitaminC: ['vit c', 'ascorbic', 'c'],
  vitaminE: ['vit e', 'tocopherol', 'e'],
  vitaminK: ['vit k', 'k'],
  thiamin: ['b1', 'vitamin b1', 'thiamine'],
  riboflavin: ['b2', 'vitamin b2'],
  niacin: ['b3', 'vitamin b3'],
  vitaminB6: ['b6', 'vit b6'],
  folate: ['b9', 'vitamin b9', 'folic acid'],
  vitaminB12: ['b12', 'vit b12', 'cobalamin'],
  sodium: ['salt'],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Nutrients matching what the user typed, best match first: exact name or alias, then prefix, then contains.
export function searchNutrients(query: string, limit = 5): NutrientKey[] {
  const q = norm(query);
  if (!q) return [];
  const scored = NUTRIENTS.map(n => {
    const names = [n.label, n.key.replace(/([A-Z])/g, ' $1'), ...(ALIASES[n.key] ?? [])].map(norm);
    const rank = names.some(x => x === q) ? 0
      : names.some(x => x.startsWith(q) || x.split(' ').some(w => w.startsWith(q))) ? 1
      : q.length > 1 && names.some(x => x.includes(q)) ? 2
      : 9;
    return { key: n.key, rank };
  });
  return scored.filter(s => s.rank < 9).sort((a, b) => a.rank - b.rank).slice(0, limit).map(s => s.key);
}
