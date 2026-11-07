import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PriceFood } from './pricing';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tiny fake of the Supabase client
type Row = any;
const tables: Record<string, Row[]> = {};
const fakeDb = {
  from(t: string) {
    const filters: [string, unknown][] = [];
    const api = {
      select: () => api,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return api; },
      upsert: async (row: Row) => { (tables[t] ||= []).push(row); return { error: null }; },
      maybeSingle: async () => {
        const hit = (tables[t] || []).find(r => filters.every(([c, v]) => r[c] === v)) ?? null;
        if (hit && t === 'zip_store') return { data: { ...hit, kroger_store: (tables['kroger_store'] || []).find(s => s.location_id === hit.location_id) ?? null } };
        return { data: hit };
      },
    };
    return api;
  },
};
const envVals: Record<string, string | undefined> = {};
vi.mock('./env.server', () => ({ adminClient: async () => fakeDb, env: async (k: string) => envVals[k] }));

const store = (id: string) => ({ location_id: id, chain: 'SMITHS', name: `Smith's ${id}`, address: null, city: null, state: null, zip_code: null, latitude: null, longitude: null, departments: 3 });
const nearestStore = vi.fn(async (zip: string) => store(zip === '84601' ? 'PROVO' : 'OREM'));
const priceFood = vi.fn(async (_food: PriceFood, home: { location_id: string }) => ({
  best: { product_id: 'p', upc: '', brand: 'Kroger', description: 'Kroger® Red Lentils', size: '16 oz', sold_by: 'UNIT', regular: 2, package_grams: 453.6, priced_g: 48, price_per_serving: home.location_id === 'PROVO' ? 0.2116 : 0.25, flags: [] },
  store: store(home.location_id), spec: { label: 'primary' }, tried: [],
}));
vi.mock('./kroger.server', () => ({ krogerClient: () => ({ nearestStore, priceFood, alternateStores: async () => [] }) }));

const { priceNewFood } = await import('./price.server');
const lentils: PriceFood = { food_name: 'Red Lentils', food_category_id: 1, serving_size: 0.25, unit: 'cup', serving_grams: 48, search: { term: 'dry red lentils' } };

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  envVals['KROGER_CLIENT_ID'] = 'id'; envVals['KROGER_CLIENT_SECRET'] = 'secret';
  nearestStore.mockClear(); priceFood.mockClear();
});

describe('priceNewFood', () => {
  it('prices at the user’s ZIP store and the default store, caching ZIP -> store', async () => {
    tables['profiles'] = [{ user_id: 'u1', zip_code: '84057' }];
    const r = await priceNewFood(lentils, 'u1');
    expect(r.defaultPrice).toBe(0.21); // Provo price -> food.price
    expect(r.forUser).toMatchObject({ zip: '84057', store: "Smith's OREM", perServing: 0.25 });
    expect(r.rows.map(x => x.location_id).sort()).toEqual(['OREM', 'PROVO']);
    expect(tables['zip_store']!.map(z => z.zip_code).sort()).toEqual(['84057', '84601']);

    nearestStore.mockClear();
    await priceNewFood(lentils, 'u1');
    expect(nearestStore).not.toHaveBeenCalled(); // both ZIPs now cached
  });

  it('uses 84601 when the profile has no ZIP, and prices once', async () => {
    const r = await priceNewFood(lentils, 'nobody');
    expect(r.forUser?.zip).toBe('84601');
    expect(priceFood).toHaveBeenCalledTimes(1);
    expect(r.rows).toHaveLength(1);
  });

  it('returns unpriced (never throws) without keys or when Kroger fails', async () => {
    envVals['KROGER_CLIENT_ID'] = undefined;
    expect(await priceNewFood(lentils, 'u1')).toMatchObject({ rows: [], defaultPrice: null, note: expect.stringMatching(/set up/) });
    envVals['KROGER_CLIENT_ID'] = 'id';
    nearestStore.mockRejectedValueOnce(new Error('Kroger /locations failed (503).'));
    const r = await priceNewFood(lentils, 'u1');
    expect(r.rows).toEqual([]);
    expect(r.note).toMatch(/couldn’t be checked/);
  });
});
