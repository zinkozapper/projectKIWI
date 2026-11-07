import { describe, expect, it, vi } from 'vitest';
import { krogerClient, type KrogerStore } from './kroger.server';
import type { PriceFood } from './pricing';

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const product = (description: string, regular: number, categories = ['Frozen']) => ({ productId: description, brand: 'Private Selection', description, categories, items: [{ size: '48 oz', soldBy: 'UNIT', price: { regular } }] });
const store = (id: string): KrogerStore => ({ location_id: id, chain: 'SMITHS', name: id, address: null, city: null, state: null, zip_code: null, latitude: null, longitude: null, departments: 1 });

function fakeKroger(stock: Record<string, Record<string, unknown[]>>) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    if (u.pathname.endsWith('/token')) return json({ access_token: 't', expires_in: 1800 });
    if (u.pathname.endsWith('/locations')) return json({ data: [
      { locationId: 'HOME', chain: 'SMITHS', departments: [1, 2] },
      { locationId: 'SMALL', chain: 'SMITHS', departments: [1] },
      { locationId: 'BIG', chain: 'SMITHS', departments: [1, 2, 3, 4, 5] },
    ] });
    const term = u.searchParams.get('filter.term') ?? '', loc = u.searchParams.get('filter.locationId') ?? '';
    calls.push(`${loc}:${term}`);
    return json({ data: stock[loc]?.[term] ?? [] });
  }) as unknown as typeof fetch;
  return { client: krogerClient(() => ({ id: 'a', secret: 'b' }), { fetchImpl }), calls };
}

// Frozen Mixed Berries (food 45) has alternates in price-rules.json
const berries: PriceFood = { food_id: 45, food_name: 'Frozen Mixed Berries', food_category_id: 3, serving_size: 100, unit: 'g' };

describe('kroger priceFood', () => {
  it('tries the home store with every alternate before any backup store', async () => {
    const { client, calls } = fakeKroger({ BIG: { 'triple berry blend': [product('Private Selection® Triple Berry Blend', 12.99)] } });
    const more = vi.fn(() => client.alternateStores('84601', 'HOME'));
    const r = await client.priceFood(berries, store('HOME'), more);
    expect(r.store?.location_id).toBe('BIG'); // most departments first
    expect(r.spec?.label).toBe('triple berry blend');
    expect(r.best?.price_per_serving).toBeCloseTo(0.9546, 3);
    expect(calls.slice(0, 4).every(x => x.startsWith('HOME:'))).toBe(true);
    expect(calls[4]).toBe('BIG:frozen mixed berries');
  });

  it('skips the backup-store lookup when the home store has it', async () => {
    const { client } = fakeKroger({ HOME: { 'frozen mixed berries': [product('Kroger® Frozen Mixed Berries', 9.99)] } });
    const more = vi.fn(async () => []);
    const r = await client.priceFood(berries, store('HOME'), more);
    expect(r.best?.description).toBe('Kroger® Frozen Mixed Berries');
    expect(more).not.toHaveBeenCalled();
  });

  it('prices a new food from its AI search term', async () => {
    const { client, calls } = fakeKroger({ HOME: { 'dry red lentils': [product('Kroger® Red Lentils', 2.29, ['Pasta, Sauces, Grain'])] } });
    const lentils: PriceFood = { food_name: 'Red Lentils', food_category_id: 1, serving_size: 0.25, unit: 'cup', serving_grams: 48, search: { term: 'dry red lentils', must: ['lentil'] } };
    const r = await client.priceFood({ ...lentils, food_category_id: 2 }, store('HOME'));
    expect(calls).toEqual(['HOME:dry red lentils']);
    expect(r.best?.price_per_serving).toBeCloseTo(2.29 * 48 / (48 * 28.3495), 3);
  });
});
