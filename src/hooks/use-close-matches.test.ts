import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { foods, type Food } from '@/lib/foods';

const findSimilarFoods = vi.fn();
vi.mock('@/lib/food-search/functions', () => ({ findSimilarFoods: (arg: unknown) => findSimilarFoods(arg) }));

const { useCloseMatches } = await import('./use-close-matches');

const food = (id: string, name: string) => ({ id, name, category: 'Test' }) as Food;

describe('useCloseMatches', () => {
  afterEach(() => {
    foods.splice(0, foods.length);
    findSimilarFoods.mockReset();
  });

  it('shows local close matches at once, then puts the AI picks first', async () => {
    foods.push(food('1', 'Tofu'), food('2', 'Lime'), food('3', 'Lemon'));
    findSimilarFoods.mockResolvedValue({ ok: true, data: { ids: ['2', '99'] } });
    const { result } = renderHook(() => useCloseMatches('tofo', true));
    expect(result.current.foods.map(f => f.name)).toEqual(['Tofu']);
    expect(result.current.searching).toBe(true);
    await waitFor(() => expect(result.current.searching).toBe(false));
    expect(result.current.foods.map(f => f.name)).toEqual(['Lime', 'Tofu']);
    expect(findSimilarFoods).toHaveBeenCalledWith({ data: { query: 'tofo' } });
  });

  it('keeps the local matches when the AI call fails, and does nothing when there is an exact match', async () => {
    foods.push(food('1', 'Pasta'));
    findSimilarFoods.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCloseMatches('noodles', true));
    await waitFor(() => expect(result.current.searching).toBe(false));
    expect(result.current.foods.map(f => f.name)).toEqual(['Pasta']);

    const exact = renderHook(() => useCloseMatches('pasta', false));
    expect(exact.result.current.foods).toEqual([]);
  });
});
