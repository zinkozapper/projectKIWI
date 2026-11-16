// Purchase options ("prep styles"): how a food is sold — chicken breast raw, rotisserie, frozen, canned.
// Pure (no network, no app imports) so the add-food workflow, the backfill script and the price worker share it.
// Rules: docs/kroger-price-selection-rules.md "Purchase options".
import type { PriceFood, SearchSpec } from './pricing.ts';

/** One option per form keeps options general: never two frozen or two canned kinds (no brand differences). */
export const PURCHASE_FORMS = ['fresh', 'frozen', 'canned', 'dried', 'ready_to_eat'] as const;
export type PurchaseForm = (typeof PURCHASE_FORMS)[number];
export const FORM_LABELS: Record<PurchaseForm, string> = { fresh: 'Fresh', frozen: 'Frozen', canned: 'Canned', dried: 'Dried', ready_to_eat: 'Ready to eat' };

export type PurchaseOption = {
  form: PurchaseForm;
  label: string;
  search_term: string;
  must: string[];
  /** as_bought: priced on the food's raw/dry serving; prepared: priced on its cooked/ready serving (factor × 100 g). */
  basis: 'as_bought' | 'prepared';
  /** Usable share of the package, e.g. a drained can ≈ 0.6. */
  package_yield: number;
  /** Edible grams in one item when it's sold per item with no weight (a rotisserie chicken ≈ 700 g). */
  unit_grams: number | null;
  sort_order: number;
};

// Kroger categories a product of this form is found in. Fresh uses the food group's own categories.
const FORM_CATEGORIES: Record<PurchaseForm, string[] | null> = {
  fresh: null,
  frozen: ['Frozen', 'Natural & Organic'],
  canned: ['Canned & Packaged', 'International', 'Natural & Organic', 'Meat & Seafood', 'Condiment & Sauces'],
  dried: ['Pasta, Sauces, Grain', 'Canned & Packaged', 'Snacks', 'Baking Goods', 'International', 'Natural & Organic', 'Produce'],
  ready_to_eat: ['Deli', 'Meat & Seafood', 'Produce', 'Frozen', 'Bakery', 'Canned & Packaged', 'Dairy', 'International', 'Natural & Organic'],
};
// Words the food group's excludes would otherwise reject for this form (meat excludes "cooked"/"rotisserie",
// fruit and vegetables exclude "frozen"/"canned"/"dried").
const FORM_ALLOW: Record<PurchaseForm, string[]> = {
  fresh: [],
  frozen: ['frozen', 'cooked', 'seasoned', 'riced', 'steamable', 'fries', 'strips', 'patties'],
  canned: ['canned', 'cooked', 'salad', 'sauce', 'cups', 'soup'],
  dried: ['dried', 'chips', 'snack', 'cooked'],
  ready_to_eat: ['cooked', 'rotisserie', 'seasoned', 'grilled', 'salad', 'cups', 'cut', 'chunks', 'sliced', 'shredded', 'microwave', 'strips', 'kit', 'meal', 'bowl'],
};

const clip = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isForm = (s: unknown): s is PurchaseForm => (PURCHASE_FORMS as readonly string[]).includes(String(s));
const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean);

// ---------- AI step ----------
export const OPTIONS_INSTRUCTIONS = `purchaseOptions: the common ways shoppers buy this food at a US grocery store, so they can pick one and see its price. Rules:
- Only forms most stores actually sell for this food, at most one per form: fresh, frozen, canned, dried, ready_to_eat. Keep them general, never brands or package sizes (no "Tyson", no "family pack", no two kinds of canned).
- Include the form Kiwi's nutrition is based on (usually fresh/raw, or dried for dry grains and beans) first.
- 2–4 options when the food is commonly sold several ways (chicken breast: Raw, Rotisserie, Frozen, Canned; black beans: Dried, Canned; broccoli: Fresh, Frozen; corn: Fresh, Frozen, Canned). Return an empty list when there is really only one way to buy it (olive oil, honey, garlic, eggs, milk).
- label: 1–2 plain words the shopper sees (e.g. "Raw", "Rotisserie", "Frozen", "Canned", "Dried", "Fresh"), max 20 characters.
- term: grocery search text for that form (2–5 words, e.g. "rotisserie chicken", "canned chicken breast", "frozen broccoli florets"). Not organic, no brands.
- must: 1–2 words every correct product name contains ("a|b" for either), e.g. ["chicken"], ["broccoli"], ["bean|beans"].
- basis: "as_bought" when it is bought raw/dry like Kiwi's serving (raw, frozen raw, dried); "prepared" when it is already cooked or ready to eat (rotisserie, canned meat or beans, cooked rice cups).
- drained: true only for canned foods packed in liquid that is poured off (beans, vegetables, tuna).
- eachGrams: only for forms usually sold per item with no weight on the label: the edible grams in one item (a rotisserie chicken ≈ 700). Leave it out otherwise.`;

export const OPTIONS_SCHEMA = {
  type: 'array',
  maxItems: 4,
  items: {
    type: 'object',
    properties: {
      form: { type: 'string', enum: [...PURCHASE_FORMS] },
      label: { type: 'string' },
      term: { type: 'string' },
      must: { type: 'array', items: { type: 'string' }, maxItems: 2 },
      basis: { type: 'string', enum: ['as_bought', 'prepared'] },
      drained: { type: 'boolean' },
      eachGrams: { type: 'number' },
    },
    required: ['form', 'label', 'term', 'basis'],
  },
} as const;

/** Standalone AI tool for foods already in the catalog (scripts/kroger/options-backfill.mjs). */
export const OPTIONS_TOOL = {
  name: 'purchase_options',
  description: 'List the general ways this grocery food is sold.',
  input_schema: { type: 'object', properties: { purchaseOptions: OPTIONS_SCHEMA }, required: ['purchaseOptions'] },
};
export const OPTIONS_SYSTEM = `You help Kiwi, a nutrition-aware grocery planner, list how a grocery food is sold. Return:\n- ${OPTIONS_INSTRUCTIONS}`;

export type AiOption = { form?: unknown; label?: unknown; term?: unknown; must?: unknown; basis?: unknown; drained?: unknown; eachGrams?: unknown };

/** Clean the AI's answer: known forms only, one per form, at most 4, labels/terms clipped. Fewer than 2 = no options. */
export function cleanOptions(raw: unknown, foodName = ''): PurchaseOption[] {
  const list = Array.isArray(raw) ? (raw as AiOption[]) : [];
  const seen = new Set<string>(), out: PurchaseOption[] = [];
  for (const o of list) {
    if (!o || !isForm(o.form) || seen.has(o.form)) continue;
    const label = clip(o.label, 20) || FORM_LABELS[o.form];
    const term = clip(o.term, 60) || `${o.form === 'fresh' ? '' : `${FORM_LABELS[o.form]} `}${foodName}`.trim();
    if (!term) continue;
    seen.add(o.form);
    out.push({
      form: o.form,
      label,
      search_term: term,
      must: (Array.isArray(o.must) ? o.must : []).map(m => clip(m, 30)).filter(Boolean).slice(0, 2),
      basis: o.basis === 'prepared' ? 'prepared' : 'as_bought',
      package_yield: o.drained === true && o.form === 'canned' ? DRAINED_YIELD : 1,
      unit_grams: Number(o.eachGrams) > 0 && Number(o.eachGrams) < 5000 ? Math.round(Number(o.eachGrams)) : null,
      sort_order: out.length,
    });
    if (out.length === 4) break;
  }
  return out.length >= 2 ? out : [];
}
/** A drained can: net weight is about 60% solids (beans ≈ 56–62 %, vegetables ≈ 60 %, tuna ≈ 75 %). */
export const DRAINED_YIELD = 0.6;

// ---------- pricing ----------
/** What the catalog row tells us about one serving. */
export type ServingInfo = {
  food_name: string;
  food_category_id: number | null;
  serving_size: number | string;
  unit: string;
  /** As-bought (raw/dry) grams of one serving. */
  serving_grams?: number | null;
  /** Grams of the food as Kiwi's nutrients describe it (factor × 100): cooked weight for meat, grains and beans. */
  prepared_grams?: number | null;
};

/**
 * The PriceFood for one option: its own search, the form's categories, and the serving re-expressed for
 * prepared forms (4 oz raw chicken = ~94 g of rotisserie chicken). food_id is left off on purpose so the food's
 * own per-food rules in price-rules.json don't override the option's search.
 */
export function optionPriceFood(food: ServingInfo, o: Pick<PurchaseOption, 'form' | 'search_term' | 'must' | 'basis' | 'package_yield'> & { unit_grams?: number | null }): PriceFood {
  const allow = [...FORM_ALLOW[o.form], ...words(o.search_term), ...o.must.flatMap(m => words(m))];
  const categories = FORM_CATEGORIES[o.form];
  const search: SearchSpec = {
    term: o.search_term,
    must: o.must,
    allow,
    ...(categories ? { categories } : {}),
    ...(o.package_yield < 1 ? { packageYield: o.package_yield } : {}),
    ...(o.unit_grams ? { unitGrams: o.unit_grams } : {}),
  };
  const prepared = o.basis === 'prepared' && Number(food.prepared_grams) > 0 ? Number(food.prepared_grams) : null;
  if (prepared) search.servingGrams = prepared;
  return {
    food_id: null,
    food_name: food.food_name,
    food_category_id: food.food_category_id,
    serving_size: food.serving_size,
    unit: food.unit,
    serving_grams: food.serving_grams ?? null,
    search,
  };
}

/** Average of the priced options (0 / null = unpriced), rounded to cents. null when none is priced. */
export function averagePrice(prices: (number | null | undefined)[]): number | null {
  const ok = prices.map(Number).filter(p => Number.isFinite(p) && p > 0);
  return ok.length ? Math.round((ok.reduce((a, b) => a + b, 0) / ok.length) * 100) / 100 : null;
}
