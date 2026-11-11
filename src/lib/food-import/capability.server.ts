import { env } from './env.server';

export const selfHosted = import.meta.env['VITE_KIWI_SELF_HOSTED'] === 'true';

export async function finderEnabled() {
  if (!selfHosted) return true;
  const [base, model, fdc] = await Promise.all([env('OPENAI_BASE_URL'), env('OPENAI_MODEL'), env('FDC_API_KEY')]);
  if (!base?.trim() || !model?.trim() || !fdc?.trim()) return false;
  try {
    const url = new URL(base);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export async function requireFinderEnabled() {
  if (!await finderEnabled()) throw new Error('The food finder is not configured on this server.');
}
