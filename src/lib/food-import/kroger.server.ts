// Kroger Products + Locations API (https://developer.kroger.com, scope product.compact). Server-only.
// No app imports, so the backfill script (scripts/kroger) can use it too: credentials come in as a getter.
import { RULES, foodRules, foodSpecs, rankCandidates, type Candidate, type PriceFood, type Ranked, type Spec } from './pricing.ts';

const API = 'https://api.kroger.com/v1';

export type KrogerStore = {
  location_id: string; chain: string | null; name: string; address: string | null; city: string | null; state: string | null;
  zip_code: string | null; latitude: number | null; longitude: number | null; departments: number;
};

type Credentials = () => Promise<{ id: string | undefined; secret: string | undefined }> | { id: string | undefined; secret: string | undefined };
type RawLocation = {
  locationId: string; chain?: string; name?: string; departments?: unknown[];
  address?: { addressLine1?: string; city?: string; state?: string; zipCode?: string };
  geolocation?: { latitude?: number; longitude?: number };
};
type RawProduct = {
  productId: string; upc?: string; brand?: string; description?: string; categories?: string[];
  items?: { size?: string; soldBy?: string; price?: { regular?: number; promo?: number } }[];
};

const toStore = (s: RawLocation): KrogerStore => ({
  location_id: s.locationId, chain: s.chain ?? null, name: s.name ?? s.locationId,
  address: s.address?.addressLine1 ?? null, city: s.address?.city ?? null, state: s.address?.state ?? null, zip_code: s.address?.zipCode ?? null,
  latitude: s.geolocation?.latitude ?? null, longitude: s.geolocation?.longitude ?? null, departments: (s.departments ?? []).length,
});
const chainOk = (l: RawLocation) => !RULES.storeChains.length || RULES.storeChains.includes(String(l.chain).toUpperCase());

export function krogerClient(credentials: Credentials, { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}) {
  let token: { value: string; exp: number } | null = null;

  async function getToken() {
    if (token && token.exp > Date.now()) return token.value;
    const { id, secret } = await credentials();
    if (!id || !secret) throw new Error('Kroger pricing isn’t configured (missing KROGER_CLIENT_ID / KROGER_CLIENT_SECRET).');
    const res = await fetchImpl(`${API}/connect/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${btoa(`${id}:${secret}`)}` },
      body: 'grant_type=client_credentials&scope=product.compact',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Kroger sign-in failed (${res.status}).`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
    return token.value;
  }

  async function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = `${API}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${await getToken()}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
      if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)); continue; }
      if (!res.ok) throw new Error(`Kroger ${path} failed (${res.status}).`);
      return (await res.json()) as T;
    }
    throw new Error(`Kroger ${path}: gave up after retries.`);
  }

  /** Nearest Kroger-family grocery store for a ZIP. */
  async function nearestStore(zip: string, radiusMiles = RULES.storeRadiusMiles): Promise<KrogerStore | null> {
    const j = await get<{ data?: RawLocation[] }>('/locations', { 'filter.zipCode.near': zip, 'filter.radiusInMiles': radiusMiles, 'filter.limit': 10 });
    const s = (j.data ?? []).find(chainOk) ?? j.data?.[0];
    return s ? toStore(s) : null;
  }

  /**
   * Backup stores for foods the home store can't price. Kroger publishes no store size, so stores are ranked
   * by how many departments they list (bakery, deli, pharmacy, fuel …) as a proxy for the biggest stores nearby.
   */
  async function alternateStores(zip: string, homeId: string, n = RULES.altStores.max, radiusMiles = RULES.altStores.radiusMiles): Promise<KrogerStore[]> {
    const j = await get<{ data?: RawLocation[] }>('/locations', { 'filter.zipCode.near': zip, 'filter.radiusInMiles': radiusMiles, 'filter.limit': 50 });
    return (j.data ?? []).filter(l => chainOk(l) && l.locationId !== homeId).map(toStore).sort((a, b) => b.departments - a.departments).slice(0, n);
  }

  /** Products for a search term at one store, flattened to one row per item that has a price there. */
  async function searchProducts(term: string, locationId: string, limit = 50): Promise<Candidate[]> {
    const j = await get<{ data?: RawProduct[] }>('/products', { 'filter.term': term, 'filter.locationId': locationId, 'filter.limit': limit });
    const rows: Candidate[] = [];
    (j.data ?? []).forEach((p, rank) => (p.items ?? []).forEach(it => rows.push({
      rank, product_id: p.productId, upc: p.upc ?? '', brand: p.brand ?? '', description: p.description ?? '',
      categories: (p.categories ?? []).join('; '), size: it.size ?? '', sold_by: it.soldBy ?? '',
      regular: it.price?.regular ?? null, promo: it.price?.promo ?? null,
    })));
    return rows;
  }

  /**
   * Price one food (docs/kroger-price-selection-rules.md §2b): each store in order — home first — trying the main
   * search and then the food's alternates; the first eligible product wins. `moreStores` is only called if the
   * home store has nothing, so the extra Locations call is skipped for most foods.
   */
  async function priceFood(food: PriceFood, home: KrogerStore, moreStores?: () => Promise<KrogerStore[]>) {
    const tried: { store: KrogerStore; spec: Spec; result: Ranked }[] = [];
    const tryStore = async (store: KrogerStore) => {
      for (const spec of foodSpecs(food)) {
        const result = rankCandidates(food, await searchProducts(foodRules(food, spec).term, store.location_id), spec);
        tried.push({ store, spec, result });
        if (result.best) return { best: result.best, store, spec };
      }
      return null;
    };
    const atHome = await tryStore(home);
    if (atHome) return { ...atHome, tried };
    for (const store of (await moreStores?.()) ?? []) {
      const hit = await tryStore(store);
      if (hit) return { ...hit, tried };
    }
    return { best: undefined, store: undefined, spec: undefined, tried };
  }

  return { nearestStore, alternateStores, searchProducts, priceFood };
}
export type KrogerClient = ReturnType<typeof krogerClient>;
