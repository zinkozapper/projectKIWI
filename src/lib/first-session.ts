import { supabase } from '@/integrations/supabase/client';

export async function isFirstAccountSession(): Promise<boolean> {
  try {
    const { data, error } = await (supabase.rpc as any)('is_first_account_session');
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.error('Could not check first account session:', error);
    return false;
  }
}

export async function signedInDestination(): Promise<'/plan' | '/onboarding'> {
  return await isFirstAccountSession() ? '/onboarding' : '/plan';
}

export function isSuccessfulAuthCallback(search: string, hash: string): boolean {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  return (query.has('code') || fragment.has('access_token')) &&
    !['error', 'error_code', 'error_description'].some(key => query.has(key) || fragment.has(key));
}
