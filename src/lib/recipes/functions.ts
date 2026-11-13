// Server function for recipe suggestions. This file ships to the browser as an RPC stub; the handler
// (and the API key in suggest.server.ts) runs only on the server. The Supabase session token is
// attached by attachSupabaseAuth (src/start.ts).
import { createServerFn } from '@tanstack/react-start';
import type { SuggestInput, SuggestResult } from './shared';

export type RecipeResult = { ok: true; data: SuggestResult } | { ok: false; error: string };

export const suggestRecipes = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => {
    if (!d || typeof d !== 'object') throw new Error('Invalid input');
    return d as SuggestInput;
  })
  .handler(async ({ data }): Promise<RecipeResult> => {
    const { suggest, isRecipeError } = await import('./suggest.server');
    try {
      return { ok: true, data: await suggest(data) };
    } catch (e) {
      if (!isRecipeError(e)) console.error('[recipes]', e);
      const text = e instanceof Error ? e.message : '';
      return { ok: false, error: isRecipeError(e) || /AI assistant|configured/i.test(text) ? text : 'Something went wrong. Please try again.' };
    }
  });
