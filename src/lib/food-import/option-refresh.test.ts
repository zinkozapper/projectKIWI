import { describe, expect, it, vi } from 'vitest';
import { collectOptionPrices, type KrogerClient, type KrogerStore, type OptionToPrice } from './kroger.server';

const option = (food_option_id: number, over: Partial<OptionToPrice> = {}): OptionToPrice => ({
  food_option_id, form: 'fresh', search_term: 'boneless skinless chicken breast', must: ['breast'], basis: 'as_bought', package_yield: 1,
  food_name: 'Chicken breast', food_category_id: 1, serving_size: 4, unit: 'oz', serving_grams: 113.4, prepared_grams: 94, ...over,
});

describe('purchase option refresh', () => {
  it('prices each option with its own search, keyed by option id, and records backup stores', async () => {
    const home = { location_id: 'home', name: 'Home' } as KrogerStore;
    const backup = { location_id: 'backup', name: 'Backup' } as KrogerStore;
    const best = { product_id: 'p', brand: 'Kroger', description: 'Kroger® Rotisserie Chicken', regular: 7, price_per_serving: 0.94, priced_g: 94, flags: [] };
    const client = {
      alternateStores: vi.fn(async () => [backup]),
      priceFood: vi.fn(async (food: { food_id: number | null; search?: { term?: string } }, store: KrogerStore, more: () => Promise<KrogerStore[]>) => {
        expect(food.food_id).toBeNull(); // an option id must never pick up a food's price-rules entry
        if (food.search?.term === 'rotisserie chicken') return { best, store: (await more())[0] };
        return {};
      }),
    };
    const { prices, stores } = await collectOptionPrices(client as unknown as KrogerClient, [
      option(11),
      option(12, { form: 'ready_to_eat', search_term: 'rotisserie chicken', must: ['rotisserie'], basis: 'prepared', unit_grams: 700 }),
    ], home, '84601');
    expect(prices).toEqual([expect.objectContaining({ food_option_id: 12, location_id: 'home', source_location_id: 'backup', serving_grams: 94, flags: 'from backup store: Backup' })]);
    expect(stores).toEqual([backup]);
  });
});
