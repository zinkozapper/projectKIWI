import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('creates matching credentials without replacing existing configuration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kiwi-setup-'));
  try {
    copyFileSync('self-host/setup.mjs', join(dir, 'setup.mjs'));
    copyFileSync('self-host/.env.example', join(dir, '.env.example'));
    const run = () => spawnSync(process.execPath, [join(dir, 'setup.mjs')], { encoding: 'utf8' });
    const path = join(dir, '.env');
    const template = readFileSync(join(dir, '.env.example'), 'utf8');
    const partial = template.replace('POSTGRES_PASSWORD=', 'POSTGRES_PASSWORD=existing');
    writeFileSync(path, partial);
    expect(run().status).not.toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(partial);
    writeFileSync(path, template.replace('PUBLIC_URL=', 'PUBLIC_URL=https://kiwi.local'));
    expect(run().status).toBe(0);
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('PUBLIC_URL=https://kiwi.local');
    const values = Object.fromEntries(text.split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }));
    expect(values['POSTGRES_PASSWORD']).toMatch(/^[a-f0-9]{64}$/);
    for (const [key, role] of [['SUPABASE_PUBLISHABLE_KEY', 'anon'], ['SUPABASE_SERVICE_ROLE_KEY', 'service_role']] as const) {
      const [header, payload, signature] = values[key]!.split('.');
      expect(JSON.parse(Buffer.from(payload!, 'base64url').toString()).role).toBe(role);
      expect(signature).toBe(createHmac('sha256', values['JWT_SECRET']!).update(`${header}.${payload}`).digest('base64url'));
    }
    expect(run().status).not.toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(text);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
