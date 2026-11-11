import { afterEach, describe, expect, it, vi } from 'vitest';

const values = vi.hoisted(() => ({ OPENAI_BASE_URL: 'http://localhost:1234/v1', OPENAI_MODEL: 'model', FDC_API_KEY: 'key' } as Record<string, string>));
vi.mock('./env.server', () => ({ env: async (name: string) => values[name] }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('food finder capability', () => {
  it('requires a valid endpoint, model and USDA key in self-hosted builds', async () => {
    vi.stubEnv('VITE_KIWI_SELF_HOSTED', 'true');
    const { finderEnabled } = await import('./capability.server');
    expect(await finderEnabled()).toBe(true);
    values['FDC_API_KEY'] = '';
    expect(await finderEnabled()).toBe(false);
    values['FDC_API_KEY'] = 'key';
    values['OPENAI_BASE_URL'] = 'http://user:password@localhost';
    expect(await finderEnabled()).toBe(false);
    values['OPENAI_BASE_URL'] = 'http://localhost:1234/v1';
  });

  it('does not gate hosted builds', async () => {
    vi.stubEnv('VITE_KIWI_SELF_HOSTED', 'false');
    values['FDC_API_KEY'] = '';
    const { finderEnabled } = await import('./capability.server');
    expect(await finderEnabled()).toBe(true);
    values['FDC_API_KEY'] = 'key';
  });
});
