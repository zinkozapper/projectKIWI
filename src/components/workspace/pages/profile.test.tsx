import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { ProfileDraft } from '../context';

const saveProfile = vi.fn(async (_draft: ProfileDraft) => ({ ok: true as const }));
const start: ProfileDraft = {
  display_name: 'Alex', age: '23', height_ft: '5', height_in: '7', weight_lb: '150', gender: 'female',
  activity: 'moderate', goal: 'maintain', budget: '75', budget_weeks: '1', budget_start: '2026-11-01', zip_code: '84601',
};
let draftStore: { draft: ProfileDraft; set: (d: ProfileDraft) => void };

vi.mock('../context', () => ({
  useWorkspace: () => ({ profileDraft: draftStore.draft, setProfileDraft: draftStore.set, saveProfile, signOut: vi.fn() }),
}));
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { passkey: { list: async () => ({ data: [] }) } } } }));
vi.mock('@/lib/auth-options', () => ({ passkeysEnabled: false }));

const { ProfilePage } = await import('./profile');

function Harness({ initial = start }: { initial?: ProfileDraft }) {
  const [draft, set] = useState(initial);
  draftStore = { draft, set };
  return <ProfilePage />;
}

afterEach(() => {
  cleanup();
  saveProfile.mockClear();
  vi.useRealTimers();
});

describe('Profile auto-save', () => {
  it('has no Save button and saves once after the user stops typing', async () => {
    vi.useFakeTimers();
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /save profile/i })).toBeNull();
    const weight = screen.getByPlaceholderText('e.g. 150');
    fireEvent.change(weight, { target: { value: '15' } });
    fireEvent.change(weight, { target: { value: '155' } });
    expect(saveProfile).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(saveProfile.mock.calls[0]![0].weight_lb).toBe('155');
    expect(screen.getByRole('status').textContent).toMatch(/All changes saved/);
  });

  it('does not save an invalid draft and shows the field error', async () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText('e.g. 23'), { target: { value: '' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(saveProfile).not.toHaveBeenCalled();
    expect(screen.getByText('Age is required.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Fix the highlighted fields/);
  });

  it('saves right away when the user leaves a field', async () => {
    render(<Harness />);
    const name = screen.getByPlaceholderText('e.g. Alex');
    fireEvent.change(name, { target: { value: 'Sam' } });
    await act(async () => { fireEvent.blur(name); });
    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(saveProfile.mock.calls[0]![0].display_name).toBe('Sam');
  });

  it('saves a pending edit when the page closes', async () => {
    const view = render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText('e.g. 150'), { target: { value: '160' } });
    await act(async () => { view.unmount(); });
    expect(saveProfile).toHaveBeenCalledTimes(1);
  });

  it('does not save on load or when an edit is undone', async () => {
    vi.useFakeTimers();
    render(<Harness />);
    const weight = screen.getByPlaceholderText('e.g. 150');
    fireEvent.change(weight, { target: { value: '151' } });
    fireEvent.change(weight, { target: { value: '150' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(saveProfile).not.toHaveBeenCalled();
  });
});
