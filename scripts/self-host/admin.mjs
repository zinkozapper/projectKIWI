#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const input = createInterface({ input: stdin, output: stdout });
const email = (await input.question('Existing account email: ')).trim();
input.close();

if (!email || email.length > 320 || /[\x00-\x1f\x7f]/.test(email)) {
  console.error('Enter a valid account email.');
  process.exit(1);
}

// Hex encoding keeps all user input out of SQL syntax and command-line arguments.
const encodedEmail = Buffer.from(email, 'utf8').toString('hex');
const sql = `
DO $kiwi$
DECLARE target uuid;
BEGIN
  SELECT id INTO STRICT target FROM auth.users
    WHERE lower(email) = lower(convert_from(decode('${encodedEmail}', 'hex'), 'UTF8'));
  INSERT INTO public.app_admin (user_id, note) VALUES (target, 'local bootstrap')
    ON CONFLICT (user_id) DO NOTHING;
END
$kiwi$;
`;
const result = spawnSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: sql, stdio: ['pipe', 'inherit', 'inherit'] });
if (result.error) console.error(result.error.message);
if (result.status !== 0) process.exit(result.status || 1);
console.log('Account is an admin.');
