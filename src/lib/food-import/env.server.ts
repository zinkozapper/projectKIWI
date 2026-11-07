// Server-only configuration for the food import workflow.
// On Elastic Beanstalk, secrets come from the environment's properties (see README "AI food workflow").
// Locally, `npm run dev` doesn't put non-VITE values from .env into process.env, so read .env as a fallback.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

let dotEnv: Record<string, string> | null = null;

async function readDotEnv() {
  if (dotEnv) return dotEnv;
  dotEnv = {};
  try {
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(`${process.cwd()}/.env`, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m?.[1]) dotEnv[m[1]] = (m[2] ?? '').replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // no .env (production) — fine
  }
  return dotEnv;
}

export async function env(name: string): Promise<string | undefined> {
  const value = process.env[name];
  if (value) return value;
  return (await readDotEnv())[name] || undefined;
}

export async function requireEnv(name: string) {
  const value = await env(name);
  if (!value) throw new Error(`The food finder isn't configured yet (missing ${name} on the server).`);
  return value;
}

// The deploy only passes VITE_SUPABASE_URL at build time, so fall back to the value baked into the bundle.
export async function supabaseUrl() {
  return (await env('SUPABASE_URL')) || (await env('VITE_SUPABASE_URL')) || import.meta.env['VITE_SUPABASE_URL'] || '';
}

let admin: ReturnType<typeof createClient<Database>> | undefined;

// Service-role client: bypasses RLS. Only used after the caller has been authenticated.
export async function adminClient() {
  if (admin) return admin;
  const url = await supabaseUrl();
  const key = await requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url) throw new Error('The food finder isn’t configured yet (missing SUPABASE_URL on the server).');
  const opaque = key.startsWith('sb_secret_') || key.startsWith('sb_publishable_');
  admin = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      // New-style Supabase keys are not JWTs, so they go in the apikey header only (same as client.server.ts).
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (opaque && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
        headers.set('apikey', key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  return admin;
}
