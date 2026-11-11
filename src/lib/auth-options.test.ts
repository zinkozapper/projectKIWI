import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('authentication options', () => {
  it('preserves hosted Google and passkey behavior', async () => {
    vi.stubEnv('VITE_KIWI_SELF_HOSTED', 'false');
    vi.stubEnv('VITE_GOOGLE_SIGN_IN', 'true');
    vi.stubEnv('VITE_KIWI_PASSKEYS', 'false');
    const options = await import('./auth-options');
    expect(options.googleSignInEnabled).toBe(true);
    expect(options.passkeysEnabled).toBe(true);
  });

  it('disables Google and passkeys by default on self-hosted builds', async () => {
    vi.stubEnv('VITE_KIWI_SELF_HOSTED', 'true');
    vi.stubEnv('VITE_GOOGLE_SIGN_IN', 'true');
    vi.stubEnv('VITE_KIWI_PASSKEYS', '');
    const options = await import('./auth-options');
    expect(options.selfHosted).toBe(true);
    expect(options.googleSignInEnabled).toBe(false);
    expect(options.passkeysEnabled).toBe(false);
  });

  it('allows explicitly enabled self-hosted passkeys', async () => {
    vi.stubEnv('VITE_KIWI_SELF_HOSTED', 'true');
    vi.stubEnv('VITE_KIWI_PASSKEYS', 'true');
    const options = await import('./auth-options');
    expect(options.passkeysEnabled).toBe(true);
  });
});
