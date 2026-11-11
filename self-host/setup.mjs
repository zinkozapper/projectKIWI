import { createHmac, randomBytes } from 'node:crypto';
import { copyFileSync, constants, lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const file = join(dir, '.env');
try {
  try {
    copyFileSync(join(dir, '.env.example'), file, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (!lstatSync(file).isFile()) throw new Error('.env must be a regular file.');

  let text = readFileSync(file, 'utf8');
  const keys = ['POSTGRES_PASSWORD', 'JWT_SECRET', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  for (const key of keys) {
    const matches = [...text.matchAll(new RegExp(`^[ \\t]*${key}[ \\t]*=([^\\r\\n]*)`, 'gm'))];
    if (matches.length !== 1 || matches[0][1].trim()) {
      throw new Error(`${key} is missing, duplicated, or already set. Existing credentials were not changed.`);
    }
  }

  const password = randomBytes(32).toString('hex');
  const secret = randomBytes(32).toString('hex');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = role => {
    const now = Math.floor(Date.now() / 1000);
    const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'supabase', iat: now, exp: now + 10 * 365 * 24 * 60 * 60 })}`;
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
  };
  const values = [password, secret, token('anon'), token('service_role')];
  for (const [index, key] of keys.entries()) {
    text = text.replace(new RegExp(`^[ \\t]*${key}[ \\t]*=[^\\r\\n]*`, 'm'), `${key}=${values[index]}`);
  }

  const temporary = join(dir, `.env.setup-${randomBytes(8).toString('hex')}`);
  try {
    writeFileSync(temporary, text, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, file);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  console.log('Created self-host credentials in .env. Keep this file private.');
} catch (error) {
  console.error(`Setup failed: ${error.message}`);
  process.exitCode = 1;
}
