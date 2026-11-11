import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const addFood = vi.fn(async () => null);
vi.mock('./context', () => ({ useWorkspace: () => ({ addFood, listItems: [] }) }));

const status = { isAdmin: false, added: 2, limit: 10, remaining: 8, quotaPending: false };
const fns = vi.hoisted(() => ({
  finderStatus: vi.fn(),
  finderCapability: vi.fn(),
  finderSearch: vi.fn(),
  finderAdd: vi.fn(),
  finderSubmitToAdmin: vi.fn(),
  finderCancel: vi.fn(),
  finderRequestMore: vi.fn(),
}));
vi.mock('@/lib/food-import/functions', () => fns);

const { FoodFinder } = await import('./food-finder');

const option = { fdcId: 1, label: 'Brown lentils', reason: 'Cooked without fat', serving: '1/4 cup', description: 'Lentils, from dried, no added fat', dataType: 'Survey (FNDDS)', coverage: 27 };
describe('FoodFinder', () => {
  it('adds the chosen option in one click', async () => {
    fns.finderStatus.mockResolvedValue({ ok: true, data: status });
    fns.finderSearch.mockResolvedValue({ ok: true, data: { requestId: 7, group: 'legume', groupLabel: 'Beans & legumes', options: [option], followUpQuestion: 'Brown, green or red?', noGoodMatch: false, existing: [], status } });
    fns.finderAdd.mockResolvedValue({ ok: true, data: {
      food: { food_id: 101, food_name: 'Lentils', emoji: '🫘', unit: 'cup', price: 0, serving_size: 0.25, nutrition: {}, food_description: '', pairs: [1], needs_review: false, food_category: null },
      status: { ...status, added: 3, remaining: 7 },
      alreadyExisted: false,
      summary: { serving: '1/4 cup', servingGrams: 48, nutrients: [{ key: 'calories_kcal', label: 'Calories', unit: 'kcal', value: 168.96 }, { key: 'sodium_mg', label: 'Sodium', unit: 'mg', value: 2.88 }], flavorTags: ['earthy'], pairs: ['Rice'], needsReview: false, source: 'USDA Survey (FNDDS): Lentils, from dried, no added fat' },
    } });

    render(<FoodFinder open onOpenChange={() => {}} initialQuery="lentils" />);
    expect(await screen.findByText(/2 of 10 foods added/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Dry, cooked at home/ }));
    fireEvent.click(screen.getByRole('button', { name: /Find it/ }));
    await screen.findByText('Brown lentils');
    expect(fns.finderSearch).toHaveBeenCalledWith({ data: { query: 'lentils', howBought: 'dry', notes: '' } });
    expect(screen.getByText('Brown, green or red?')).toBeTruthy();

    fireEvent.click(screen.getByText('Brown lentils'));
    await screen.findByText(/is now in Kiwi for everyone/);
    expect(fns.finderAdd).toHaveBeenCalledWith({ data: { requestId: 7, fdcId: 1, group: 'legume', serving: '1/4 cup' } });
    expect(screen.getByText('Per 1/4 cup')).toBeTruthy();
    expect(screen.getByText('2.88 mg')).toBeTruthy();
    expect(screen.getByText(/Pairs well with Rice/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Add to my list/ }));
    await waitFor(() => expect(addFood).toHaveBeenCalledWith('101'));
  });

  it('shows the limit screen and server errors', async () => {
    fns.finderStatus.mockResolvedValue({ ok: true, data: { ...status, added: 10, remaining: 0 } });
    fns.finderRequestMore.mockResolvedValue({ ok: false, error: 'USDA is down' });
    render(<FoodFinder open onOpenChange={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Request 10 more foods/ }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'USDA is down');
  });

  it('disables the finder when a self-hosted server has no configuration', async () => {
    vi.stubEnv('VITE_KIWI_SELF_HOSTED', 'true');
    fns.finderStatus.mockResolvedValue({ ok: true, data: status });
    fns.finderCapability.mockResolvedValue({ ok: true, data: { enabled: false } });
    render(<FoodFinder open onOpenChange={() => {}} />);
    expect(await screen.findByText('The food finder is not configured on this server.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Find it/ })).toBeNull();
    vi.unstubAllEnvs();
  });
});
