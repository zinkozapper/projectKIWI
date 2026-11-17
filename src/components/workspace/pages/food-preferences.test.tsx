import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const setFoodPreference = vi.fn(async () => true);
const removeFoodPreference = vi.fn(async () => true);
const prefs: Record<string, boolean> = { spinach: true, apple: true, liver: false };

vi.mock('@/lib/foods', () => ({
  foods: [
    { id: 'spinach', name: 'Spinach', emoji: '🥬', category: 'Vegetables', note: 'Leafy' },
    { id: 'apple', name: 'Apple', emoji: '🍎', category: 'Fruit', note: 'Crisp' },
    { id: 'liver', name: 'Liver', emoji: '🥩', category: 'Protein', note: 'Iron' },
    { id: 'rice', name: 'Rice', emoji: '🍚', category: 'Grains', note: 'Plain' },
  ],
}));
vi.mock('../context', () => ({
  useWorkspace: () => ({ search: '', results: [], setSearch: vi.fn(), foodPreferences: prefs, setFoodPreference, removeFoodPreference }),
}));
vi.mock('@/hooks/use-close-matches', () => ({ useCloseMatches: () => ({ foods: [], status: 'idle' }) }));

const { FoodPreferencesPage } = await import('./food-preferences');

afterEach(() => {
  cleanup();
  setFoodPreference.mockClear();
  removeFoodPreference.mockClear();
});

const section = (heading: string) => screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement;

describe('Liked foods page', () => {
  it('lists liked foods A to Z and disliked foods separately', () => {
    render(<FoodPreferencesPage />);
    const likedNames = [...section('Liked').querySelectorAll('strong')].map(n => n.textContent);
    const dislikedNames = [...section('Disliked').querySelectorAll('strong')].map(n => n.textContent);
    expect(likedNames).toEqual(['Apple', 'Spinach']);
    expect(dislikedNames).toEqual(['Liver']);
  });

  it('moves a liked food to disliked and removes one from the list', async () => {
    render(<FoodPreferencesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Apple to disliked' }));
    await waitFor(() => expect(setFoodPreference).toHaveBeenCalledWith('apple', false));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Spinach from this list' }));
    await waitFor(() => expect(removeFoodPreference).toHaveBeenCalledWith('spinach'));
  });
});
