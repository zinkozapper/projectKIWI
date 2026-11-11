import { createServerFn } from '@tanstack/react-start';

// Only configuration presence is public; credentials stay on the server.
export const localizedPricingEnabled = createServerFn({ method: 'GET' }).handler(async () => {
  if (import.meta.env['VITE_KIWI_SELF_HOSTED'] !== 'true') return false;
  const { env } = await import('./food-import/env.server');
  return !!((await env('KROGER_CLIENT_ID')) && (await env('KROGER_CLIENT_SECRET')));
});
