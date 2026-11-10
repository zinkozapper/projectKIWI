// Server functions for adding, editing and deleting accounts on the admin page. This file ships to the
// browser as RPC stubs; the handlers (and the service-role key in accounts.server.ts) run only on the server.
// The caller's Supabase session token is attached by attachSupabaseAuth (src/start.ts).
import { createServerFn } from '@tanstack/react-start';
import type { AccountInput, AccountUpdate } from './shared';

export type AccountResult = { ok: true; userId: string } | { ok: false; error: string };

async function run(fn: () => Promise<{ userId: string }>): Promise<AccountResult> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    const { isAccountError } = await import('./accounts.server');
    if (isAccountError(e)) return { ok: false, error: e.message };
    console.error('[admin-accounts]', e);
    const text = e instanceof Error ? e.message : '';
    return { ok: false, error: /configured|SUPABASE/i.test(text) ? text : 'Something went wrong. Please try again.' };
  }
}

const obj = <T,>(d: unknown) => {
  if (!d || typeof d !== 'object') throw new Error('Invalid input');
  return d as T;
};

export const adminCreateAccount = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => obj<AccountInput>(d))
  .handler(({ data }) => run(async () => (await import('./accounts.server')).createAccount(data)));

export const adminUpdateAccount = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => obj<AccountUpdate>(d))
  .handler(({ data }) => run(async () => (await import('./accounts.server')).updateAccount(data)));

export const adminDeleteAccount = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => obj<{ userId: string }>(d))
  .handler(({ data }) => run(async () => (await import('./accounts.server')).deleteAccount(data)));
