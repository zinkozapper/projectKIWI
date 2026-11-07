// Localized Kroger price for a food the add-food workflow is about to save. Server-only.
// The user's ZIP (profiles.zip_code, default 84601) picks their store; zip_store caches ZIP -> store so the
// Locations API is only called for a ZIP Kiwi hasn't seen. The food is priced at the user's store and at the
// default ZIP's store (food.price = the default store's price, the app-wide fallback).
// Never throws: a missing key or a Kroger outage just means the food is saved unpriced (price 0).
import { adminClient, env } from './env.server';
import { krogerClient, type KrogerClient, type KrogerStore } from './kroger.server';
import { RULES, isStoreBrand, type PriceFood } from './pricing';

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
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const PRICE_TIMEOUT_MS = 20_000;
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
  const flags = [...(b.flags ?? []), ...(hit.store.location_id !== home.location_id ? [`from backup store: ${hit.store.name}`] : [])];
  const row: FoodPriceRow = {
    location_id: home.location_id,
    source_location_id: hit.store.location_id !== home.location_id ? hit.store.location_id : null,
    product_id: b.product_id, upc: b.upc || null, brand: b.brand || null, description: b.description || null,
    package_size: b.size || null, sold_by: b.sold_by || null, package_price: Number(b.regular),
    package_grams: b.package_grams ?? null, serving_grams: b.priced_g ?? (Number(food.serving_grams) || 1),
    price_per_serving: round4(b.price_per_serving ?? 0), store_brand: isStoreBrand(b), flags: flags.join('; ') || null,
  };
  return { zip, home, hit: { row, storeName: hit.store.name, flags } };
}

export async function priceNewFood(food: PriceFood, userId: string): Promise<PricingOutcome> {
  const none = (note: string): PricingOutcome => ({ rows: [], defaultPrice: null, forUser: null, note });
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
    };
  } catch (e) {
    console.error('[food-import] pricing', e);
    return none('Store prices couldn’t be checked right now.');
  }
}
