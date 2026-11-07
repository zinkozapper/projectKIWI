// Server functions for the AI food finder. This file ships to the browser as RPC stubs; the handler bodies
// (and the dynamically imported *.server.ts modules holding the API keys) run only on the server.
// The browser's Supabase session token is attached by attachSupabaseAuth (src/start.ts).
import { createServerFn } from '@tanstack/react-start';
import type { AddResult, FinderStatus, SearchResult } from './shared';
import type { AddInput, SearchInput } from './workflow.server';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const { isUserError } = await import('./workflow.server');
    if (!isUserError(e)) console.error('[food-import]', e);
    const text = e instanceof Error ? e.message : '';
    const message = isUserError(e) || /USDA|AI assistant|configured|record/i.test(text) ? text : 'Something went wrong. Please try again.';
    return { ok: false, error: message };
  }
}

const obj = <T,>(d: unknown) => {
  if (!d || typeof d !== 'object') throw new Error('Invalid input');
  return d as T;
};

export const finderStatus = createServerFn({ method: 'POST' })
  .handler(() => run<FinderStatus>(async () => (await import('./workflow.server')).getStatus()));

export const finderSearch = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => obj<SearchInput>(d))
  .handler(({ data }) => run<SearchResult>(async () => (await import('./workflow.server')).search(data)));

export const finderAdd = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => obj<AddInput>(d))
  .handler(({ data }) => run<AddResult>(async () => (await import('./workflow.server')).add(data)));

export const finderSubmitToAdmin = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => obj<{ requestId: number; note?: string }>(d))
  .handler(({ data }) => run(async () => (await import('./workflow.server')).submitToAdmin(data)));

export const finderCancel = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => obj<{ requestId: number }>(d))
  .handler(({ data }) => run(async () => (await import('./workflow.server')).cancel(data)));

export const finderRequestMore = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => obj<{ note?: string }>(d))
  .handler(({ data }) => run<FinderStatus>(async () => (await import('./workflow.server')).requestMoreFoods(data)));
