import { beforeEach, describe, expect, it, vi } from 'vitest';

const { insert } = vi.hoisted(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ insert })) },
}));

import { logAppOpen, resetLoginEventCache } from './login-events';

// Newer Node versions ship their own localStorage global that is undefined in tests and hides
// jsdom's, so give the tests a simple in-memory one.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

describe('login events', () => {
  beforeEach(() => {
    insert.mockClear();
    insert.mockResolvedValue({ error: null });
    resetLoginEventCache();
    localStorage.clear();
  });

  it('logs one app_open per user per day', async () => {
    await logAppOpen('u1', new Date('2026-11-05T08:00:00Z'));
    await logAppOpen('u1', new Date('2026-11-05T20:00:00Z'));
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({ user_id: 'u1', event_type: 'app_open' });

    await logAppOpen('u1', new Date('2026-11-06T08:00:00Z'));
    await logAppOpen('u2', new Date('2026-11-06T08:00:00Z'));
    expect(insert).toHaveBeenCalledTimes(3);
  });

  it('remembers the day across page loads', async () => {
    await logAppOpen('u1', new Date('2026-11-05T08:00:00Z'));
    resetLoginEventCache(); // a reload clears memory but not localStorage
    await logAppOpen('u1', new Date('2026-11-05T09:00:00Z'));
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('retries later the same day if the insert failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    insert.mockResolvedValueOnce({ error: { message: 'offline' } });
    await logAppOpen('u1', new Date('2026-11-05T08:00:00Z'));
    await logAppOpen('u1', new Date('2026-11-05T09:00:00Z'));
    expect(insert).toHaveBeenCalledTimes(2);
  });
});
