import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('generates balanced psql conditionals for each migration', () => {
  const script = readFileSync('self-host/migrate.sh', 'utf8');
  const fn = script.match(/apply_file\(\) \{[\s\S]*?\n\}/)?.[0];
  expect(fn).toBeDefined();
  const result = spawnSync('sh', ['-c', `tmp=$(mktemp)\n${fn}\napply_file 123 /migration.sql\ncat "$tmp"\nrm "$tmp"`], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('\\if :apply\n');
  expect(result.stdout).toContain('\\endif\n');
  expect(result.stdout).not.toContain('\x1b');
});

it('includes the first-session migration after earlier migrations', () => {
  const script = readFileSync('self-host/migrate.sh', 'utf8');
  expect(script).toContain('20260101000030 "$root/drizzle/migrations/0014_kiwi_first_session.sql"');
  expect(script).toContain('"$root/drizzle/migrations/0014_kiwi_first_session.sql" "$root/supabase/seed.sql"');
});
