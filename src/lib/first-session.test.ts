import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { isFirstAccountSession, isSuccessfulAuthCallback, signedInDestination } from './first-session';

describe('first account session', () => {
  beforeEach(() => rpc.mockReset());

  it('routes the first session to onboarding', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await signedInDestination()).toBe('/onboarding');
    expect(rpc).toHaveBeenCalledWith('is_first_account_session');
  });

  it('routes subsequent sessions to the plan', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await signedInDestination()).toBe('/plan');
  });

  it('fails closed if the session check fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await isFirstAccountSession()).toBe(false);
    log.mockRestore();
  });

  it('does not treat OAuth error callbacks as successful', () => {
    expect(isSuccessfulAuthCallback('?code=abc', '')).toBe(true);
    expect(isSuccessfulAuthCallback('', '')).toBe(false);
    expect(isSuccessfulAuthCallback('?error=access_denied', '')).toBe(false);
    expect(isSuccessfulAuthCallback('', '#error_code=expired')).toBe(false);
  });
});
