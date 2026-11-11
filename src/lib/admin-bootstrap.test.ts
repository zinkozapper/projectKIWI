import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'kiwi-admin-test-'));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it('passes the email as encoded SQL input, not command arguments', () => {
  writeFileSync(join(dir, 'docker'), '#!/bin/sh\nprintf "%s\n" "$@" > "$CAPTURE_ARGS"\ncat > "$CAPTURE_SQL"\n', { mode: 0o755 });
  const args = join(dir, 'args');
  const sql = join(dir, 'sql');
  const email = "test''); DROP TABLE public.app_admin;--@example.com";
  const result = spawnSync(process.execPath, [resolve('scripts/self-host/admin.mjs')], {
    input: `${email}\n`, encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env['PATH']}`, CAPTURE_ARGS: args, CAPTURE_SQL: sql },
  });
  expect(result.status).toBe(0);
  expect(readFileSync(args, 'utf8')).not.toContain(email);
  const query = readFileSync(sql, 'utf8');
  expect(query).not.toContain(email);
  expect(query).toContain(Buffer.from(email).toString('hex'));
  expect(query).toContain('INTO STRICT');
});
