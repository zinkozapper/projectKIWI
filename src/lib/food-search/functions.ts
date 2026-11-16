// Server function for semantic food search. This file ships to the browser as an RPC stub; the handler
// (and the API key) runs only on the server. The Supabase session token is attached by attachSupabaseAuth.
import { createServerFn } from '@tanstack/react-start';
import type { SimilarInput, SimilarResult } from './shared';

export type SimilarResponse = { ok: true; data: SimilarResult } | { ok: false };

export const findSimilarFoods = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (!d || typeof d !== 'object') throw new Error('Invalid input');
    return d as SimilarInput;
  })
  .handler(async ({ data }): Promise<SimilarResponse> => {
    const { findSimilar } = await import('./similar.server');
    try {
      return { ok: true, data: await findSimilar(data) };
    } catch (e) {
      // Close matches are a nice-to-have: the local fuzzy matches still show, so just log.
      console.error('[food-search]', e instanceof Error ? e.message : e);
      return { ok: false };
    }
  });
