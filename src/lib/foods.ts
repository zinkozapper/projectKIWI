export type Nutrients = { calories: number; protein: number; carbs: number; fat: number; fiber: number; iron: number; calcium: number; vitaminC: number; vitaminD: number };
export type Food = { id: string; name: string; category: string; unit: string; price: number; servings: number; nutrition: Nutrients; note: string; emoji: string; pairs: string[] };
// Approximate nutrients per package, not a substitute for the package label.
// The catalog lives in the database (food + food_category); loadCatalog fills this shared array once.
export const foods: Food[] = [];
export async function loadCatalog() {
  if (foods.length) return foods;
  const { supabase } = await import('@/integrations/supabase/client');
  const { data, error } = await supabase.from('food').select('*, food_category(category_description)').order('food_id');
  if (error) throw error;
  foods.splice(0, foods.length, ...(data || []).map((r) => ({
    id: String(r.food_id), name: r.food_name, category: r.food_category?.category_description ?? 'Other', unit: r.unit,
    price: Number(r.price), servings: Number(r.serving_size), nutrition: r.nutrition as unknown as Nutrients,
    note: r.food_description, emoji: r.emoji, pairs: (r.pairs || []).map(String),
  })));
  return foods;
}
export const foodById = (id: string) => foods.find(f => f.id === id);
export const nutrientKeys: (keyof Nutrients)[] = ['calories','protein','carbs','fat','fiber','iron','calcium','vitaminC','vitaminD'];
export const nutrientLabels: Record<keyof Nutrients,string> = {calories:'Calories',protein:'Protein',carbs:'Carbs',fat:'Fat',fiber:'Fiber',iron:'Iron',calcium:'Calcium',vitaminC:'Vitamin C',vitaminD:'Vitamin D'};
export const nutrientUnits: Record<keyof Nutrients,string> = {calories:'kcal',protein:'g',carbs:'g',fat:'g',fiber:'g',iron:'mg',calcium:'mg',vitaminC:'mg',vitaminD:'µg'};
export function totals(items: {food_id:string;quantity:number}[]): Nutrients {
  const result = Object.fromEntries(nutrientKeys.map(k=>[k,0])) as Nutrients;
  items.forEach(item => { const food=foodById(item.food_id); if(food) nutrientKeys.forEach(k=>result[k]+=food.nutrition[k]*Number(item.quantity)); });
  return result;
}
export type Profile = {user_id:string;display_name:string;age:number|null;height_cm:number|null;weight_kg:number|null;gender:string|null;activity:string;goal:string;budget:number};
export function targets(profile: Profile | null): Nutrients {
  const weight = Number(profile?.weight_kg)||68, height=Number(profile?.height_cm)||170, age=Number(profile?.age)||23;
  const base = 10*weight+6.25*height-5*age+(profile?.gender==='male'?5:profile?.gender==='female'?-161:-78);
  const calories = Math.round(base*({low:1.2,moderate:1.45,high:1.7}[profile?.activity as 'low'|'moderate'|'high']||1.45));
  return {calories,protein:Math.round(weight*1.0),carbs:Math.round(calories*.5/4),fat:Math.round(calories*.3/9),fiber:profile?.gender==='male'?34:28,iron:profile?.gender==='female'?18:8,calcium:1000,vitaminC:profile?.gender==='male'?90:75,vitaminD:15};
}
