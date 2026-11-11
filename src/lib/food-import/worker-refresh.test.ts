import { describe, expect, it, vi } from 'vitest';
import { collectPrices, type KrogerClient, type KrogerStore } from './kroger.server';

describe('full catalog refresh', () => {
  it('uses home-first matching, caches backups and records their source', async () => {
    const home = { location_id: 'home', name: 'Home' };
    const backup = { location_id: 'backup', name: 'Backup' };
    const best = { product_id: 'p', brand: 'Kroger', description: 'Kroger Test', regular: 2, price_per_serving: 0.5, flags: [] };
    const client = {
      alternateStores: vi.fn(async () => [backup]),
      priceFood: vi.fn(async (food: { food_id: number }, store: typeof home, more: () => Promise<(typeof backup)[]>) => {
        if (food.food_id === 1) return { best, store };
        const [alternate] = await more();
        return food.food_id === 2 ? { best, store: alternate } : {};
      }),
    };
    const foods = [1, 2, 3].map(food_id => ({ food_id, food_name: 'Test', food_category_id: null, serving_size: 1, unit: 'each' }));
    const { prices, stores } = await collectPrices(client as unknown as KrogerClient, foods, home as KrogerStore, '84601');
    expect(client.alternateStores).toHaveBeenCalledTimes(1);
    expect(prices).toHaveLength(2);
    expect(prices[0]?.source_location_id).toBeNull();
    expect(prices[1]).toMatchObject({ location_id: 'home', source_location_id: 'backup', flags: 'from backup store: Backup' });
    expect(stores).toEqual([backup]);
  });
  it('propagates failures instead of publishing a partial snapshot', async () => {
    const client = { priceFood: vi.fn().mockRejectedValue(new Error('outage')) };
    await expect(collectPrices(client as unknown as KrogerClient, [{ food_id: 1, food_name: 'Test', food_category_id: null, serving_size: 1, unit: 'each' }], { location_id: 'home' } as KrogerStore, '84601')).rejects.toThrow('outage');
  });
});
