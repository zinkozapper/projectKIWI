// Localized Kroger price for a food the add-food workflow is about to save. Server-only.
// The user's ZIP (profiles.zip_code, default 84601) picks their store; zip_store caches ZIP -> store so the
// Locations API is only called for a ZIP Kiwi hasn't seen. The food is priced at the user's store and at the
// default ZIP's store (food.price = the default store's price, the app-wide fallback).
// Never throws: a missing key or a Kroger outage just means the food is saved unpriced (price 0).
import { adminClient, env } from './env.server';
import { krogerClient, type KrogerClient, type KrogerStore } from './kroger.server';
import { RULES, isStoreBrand, type PriceFood } from './pricing';
import { averagePrice, optionPriceFood, type PurchaseOption, type ServingInfo } from './purchase-options';
import { sizeCandidates, type SizeCandidate } from './package-sizes';
import { STYLES_SYSTEM, STYLES_TOOL, cleanStyles, coreWord, priceStyle, shelfProducts, styleSearchTerms, stylesPrompt, type AiStyle } from './purchase-styles';

export type FoodPriceRow = {
  location_id: string;
  source_location_id: string | null;
  product_id: string;
  upc: string | null;
  brand: string | null;
  description: string | null;
  package_size: string | null;
  sold_by: string | null;
  package_price: number;
  package_grams: number | null;
  serving_grams: number;
  price_per_serving: number;
  store_brand: boolean;
  flags: string | null;
};

export type PricingOutcome = {
  /** Rows for public.food_price (food_id is added once the food row exists). */
  rows: FoodPriceRow[];
  /** Price per serving at the default ZIP's store -> food.price. null = not found. */
  defaultPrice: number | null;
  /** What the shopper sees: their own store's price, or why there isn't one. */
  forUser: { zip: string; store: string; product: string; perServing: number; flags: string[] } | null;
  note: string | null;
  /** Products from the default store's winning search, for the AI's package sizes (package-sizes.ts). */
  sizeCandidates: SizeCandidate[];
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const PRICE_TIMEOUT_MS = 20_000;
const OPTION_TIMEOUT_MS = 25_000;
let client: KrogerClient | null = null;
const kroger = () => (client ??= krogerClient(async () => ({ id: await env('KROGER_CLIENT_ID'), secret: await env('KROGER_CLIENT_SECRET') })));

type Db = Awaited<ReturnType<typeof adminClient>>;

async function saveStore(db: Db, s: KrogerStore) {
  const { departments: _d, ...row } = s;
  await db.from('kroger_store').upsert({ ...row, fetched_at: new Date().toISOString() }, { onConflict: 'location_id' });
}

/** The store a ZIP prices from: cached in zip_store, otherwise looked up and cached. */
async function storeForZip(db: Db, zip: string): Promise<KrogerStore | null> {
  const { data } = await db.from('zip_store').select('location_id, kroger_store(*)').eq('zip_code', zip).maybeSingle();
  const cached = data?.kroger_store as unknown as Omit<KrogerStore, 'departments'> | null | undefined;
  if (cached) return { ...cached, departments: 0 };
  const store = await kroger().nearestStore(zip);
  if (!store) return null;
  await saveStore(db, store);
  await db.from('zip_store').upsert({ zip_code: zip, location_id: store.location_id, fetched_at: new Date().toISOString() }, { onConflict: 'zip_code' });
  return store;
}

async function priceAtZip(db: Db, food: PriceFood, zip: string) {
  const home = await storeForZip(db, zip);
  if (!home) return { zip, home: null, hit: null };
  const hit = await kroger().priceFood(food, home, () => kroger().alternateStores(zip, home.location_id));
  if (!hit.best || !hit.store) return { zip, home, hit: null };
  if (hit.store.location_id !== home.location_id) await saveStore(db, hit.store);
  const b = hit.best;
  // Every eligible product from the search that found the pick: the AI chooses package sizes from these.
  const winning = hit.tried.find(t => t.store === hit.store && t.spec === hit.spec);
  const sizes = winning ? sizeCandidates(winning.result.scored) : [];
  const flags = [...(b.flags ?? []), ...(hit.store.location_id !== home.location_id ? [`from backup store: ${hit.store.name}`] : [])];
  const row: FoodPriceRow = {
    location_id: home.location_id,
    source_location_id: hit.store.location_id !== home.location_id ? hit.store.location_id : null,
    product_id: b.product_id, upc: b.upc || null, brand: b.brand || null, description: b.description || null,
    package_size: b.size || null, sold_by: b.sold_by || null, package_price: Number(b.regular),
    package_grams: b.package_grams ?? null, serving_grams: b.priced_g ?? (Number(food.serving_grams) || 1),
    price_per_serving: round4(b.price_per_serving ?? 0), store_brand: isStoreBrand(b), flags: flags.join('; ') || null,
  };
  return { zip, home, hit: { row, storeName: hit.store.name, flags, sizes } };
}

export async function priceNewFood(food: PriceFood, userId: string): Promise<PricingOutcome> {
  const none = (note: string): PricingOutcome => ({ rows: [], defaultPrice: null, forUser: null, note, sizeCandidates: [] });
  try {
    if (!(await env('KROGER_CLIENT_ID')) || !(await env('KROGER_CLIENT_SECRET'))) return none('Store prices aren’t set up yet.');
    const db = await adminClient();
    const { data: profile } = await db.from('profiles').select('zip_code').eq('user_id', userId).maybeSingle();
    const userZip = /^\d{5}$/.test(profile?.zip_code ?? '') ? String(profile?.zip_code) : RULES.defaultZip;
    const zips = [...new Set([userZip, RULES.defaultZip])];
    // Cap the wait: a slow Kroger response shouldn't hold up adding the food
    const timeout = new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), PRICE_TIMEOUT_MS));
    const results = await Promise.race([Promise.all(zips.map(z => priceAtZip(db, food, z))), timeout]);
    if (results === 'timeout') return none('Store prices took too long to check.');
    const mine = results.find(r => r.zip === userZip);
    const dflt = results.find(r => r.zip === RULES.defaultZip);
    const rows = [...new Map(results.flatMap(r => (r.hit ? [r.hit.row] : [])).map(r => [r.location_id, r])).values()];
    return {
      rows,
      defaultPrice: dflt?.hit ? Math.round(dflt.hit.row.price_per_serving * 100) / 100 : null,
      forUser: mine?.hit && mine.home
        ? { zip: userZip, store: mine.hit.storeName, product: [mine.hit.row.brand, mine.hit.row.description].filter(Boolean).join(' · ') || mine.hit.row.product_id, perServing: mine.hit.row.price_per_serving, flags: mine.hit.flags }
        : null,
      note: mine?.home ? (mine.hit ? null : `No matching product at ${mine.home.name} or nearby stores.`) : `No Kroger-family store near ${userZip}.`,
      sizeCandidates: dflt?.hit?.sizes ?? [],
    };
  } catch (e) {
    console.error('[food-import] pricing', e);
    return none('Store prices couldn’t be checked right now.');
  }
}

// ---------- purchase options ----------

export type OptionPricing = {
  /** Per option (same order as the input): its food_option_price rows, keyed by the ZIP's home store. */
  rows: FoodPriceRow[][];
  /** Per option: price per serving at the default ZIP's store -> food_option.price. */
  defaultPrices: (number | null)[];
  /** Per option: price per serving at the shopper's store, for the summary. */
  userPrices: (number | null)[];
  /** Average of the priced options at the default store -> food.price. */
  average: number | null;
  /** Per option: products for the AI's package sizes (default store). */
  sizeCandidates: SizeCandidate[][];
};

/**
 * Price each purchase option (raw, rotisserie, frozen, canned …) at the shopper's store and the default store,
 * with the same rules as the food itself. Like priceNewFood it never throws and has its own time cap.
 */
export async function priceOptions(serving: ServingInfo, options: PurchaseOption[], userId: string): Promise<OptionPricing> {
  const empty: OptionPricing = { rows: options.map(() => []), defaultPrices: options.map(() => null), userPrices: options.map(() => null), average: null, sizeCandidates: options.map(() => []) };
  if (!options.length) return empty;
  try {
    if (!(await env('KROGER_CLIENT_ID')) || !(await env('KROGER_CLIENT_SECRET'))) return empty;
    const db = await adminClient();
    const { data: profile } = await db.from('profiles').select('zip_code').eq('user_id', userId).maybeSingle();
    const userZip = /^\d{5}$/.test(profile?.zip_code ?? '') ? String(profile?.zip_code) : RULES.defaultZip;
    const zips = [...new Set([userZip, RULES.defaultZip])];
    const work = Promise.all(options.map(async o => {
      const food = optionPriceFood(serving, o);
      const results = await Promise.all(zips.map(z => priceAtZip(db, food, z)));
      const at = (zip: string) => results.find(r => r.zip === zip)?.hit?.row ?? null;
      return {
        rows: [...new Map(results.flatMap(r => (r.hit ? [r.hit.row] : [])).map(r => [r.location_id, r])).values()],
        dflt: at(RULES.defaultZip)?.price_per_serving ?? null,
        user: at(userZip)?.price_per_serving ?? null,
        sizes: results.find(r => r.zip === RULES.defaultZip)?.hit?.sizes ?? [],
      };
    }));
    const timeout = new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), OPTION_TIMEOUT_MS));
    const done = await Promise.race([work, timeout]);
    if (done === 'timeout') return empty;
    const defaultPrices = done.map(d => (d.dflt == null ? null : Math.round(d.dflt * 100) / 100));
    return { rows: done.map(d => d.rows), defaultPrices, userPrices: done.map(d => d.user), average: averagePrice(defaultPrices), sizeCandidates: done.map(d => d.sizes) };
  } catch (e) {
    console.error('[food-import] option pricing', e);
    return empty;
  }
}


// ---------- purchase styles from the shelf (purchase-styles.ts) ----------

const STYLES_TIMEOUT_MS = 30_000;

/**
 * Search the default store's shelf for the food (its usual term, the plain word, and the frozen / canned / dried
 * aisles), have the AI sort what's there into styles, and price each style from its own products. Never throws:
 * no Kroger key, no products or an AI error just means no styles (the food is priced on its own as before).
 * Styles are priced at the default store; the price refresh worker localizes them like any option.
 */
export async function discoverOptions(serving: ServingInfo, term: string, must: string[]): Promise<{ options: PurchaseOption[]; pricing: OptionPricing }> {
  const none = { options: [] as PurchaseOption[], pricing: { rows: [], defaultPrices: [], userPrices: [], average: null, sizeCandidates: [] } as OptionPricing };
  try {
    if (!(await env('KROGER_CLIENT_ID')) || !(await env('KROGER_CLIENT_SECRET'))) return none;
    const work = (async () => {
      const db = await adminClient();
      const home = await storeForZip(db, RULES.defaultZip);
      if (!home) return none;
      const core = coreWord(serving.food_name, must);
      if (!core) return none;
      const lists = await Promise.all(styleSearchTerms(term || serving.food_name, core).map(t => kroger().searchProducts(t, home.location_id).catch(() => [])));
      const products = shelfProducts(core, lists);
      if (products.length < 2) return none;
      const { askClaude } = await import('./claude.server');
      const servingText = `${serving.serving_size} ${serving.unit}${serving.serving_grams ? ` (${Math.round(Number(serving.serving_grams))} g)` : ''}`;
      const answer = await askClaude<{ styles?: AiStyle[] }>({ system: STYLES_SYSTEM, prompt: stylesPrompt(serving.food_name, servingText, products), tool: STYLES_TOOL as never, maxTokens: 1200 });
      const styles = cleanStyles(answer.styles, products, serving.food_name, core);
      // One style = nothing to choose between: the food's own price and sizes cover it.
      if (styles.length < 2) return none;
      const priced = styles.map(s => {
        const { best, scored } = priceStyle(serving, s);
        const row: FoodPriceRow | null = best ? {
          location_id: home.location_id, source_location_id: null, product_id: best.product_id, upc: best.upc || null, brand: best.brand || null,
          description: best.description || null, package_size: best.size || null, sold_by: best.sold_by || null, package_price: Number(best.regular),
          package_grams: best.package_grams ?? null, serving_grams: best.priced_g ?? (Number(serving.serving_grams) || 1),
          price_per_serving: round4(best.price_per_serving ?? 0), store_brand: isStoreBrand(best), flags: (best.flags ?? []).join('; ') || null,
        } : null;
        return { option: s.option, row, sizes: sizeCandidates(scored) };
      });
      const defaultPrices = priced.map(p => (p.row ? Math.round(p.row.price_per_serving * 100) / 100 : null));
      return {
        options: priced.map(p => p.option),
        pricing: { rows: priced.map(p => (p.row ? [p.row] : [])), defaultPrices, userPrices: defaultPrices, average: averagePrice(defaultPrices), sizeCandidates: priced.map(p => p.sizes) },
      };
    })();
    const timeout = new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), STYLES_TIMEOUT_MS));
    const done = await Promise.race([work, timeout]);
    return done === 'timeout' ? none : done;
  } catch (e) {
    console.error('[food-import] purchase styles', e);
    return none;
  }
}
