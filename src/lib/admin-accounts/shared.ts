// Shared between the admin page and the server: account form shape and validation.

export interface AccountInput {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  makeAdmin?: boolean;
}

export interface AccountUpdate extends AccountInput {
  userId: string;
}

export const MIN_PASSWORD = 8;
export const MAX_NAME = 60;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns the first problem as a sentence, or null when the input is fine.
export function checkAccountInput(input: Partial<AccountInput> | null | undefined, opts: { passwordRequired: boolean }): string | null {
  const email = String(input?.email ?? '').trim();
  const first = String(input?.firstName ?? '').trim();
  const last = String(input?.lastName ?? '').trim();
  const password = String(input?.password ?? '');
  if (!EMAIL.test(email) || email.length > 254) return 'Enter a valid email address.';
  if (!first) return 'Enter a first name.';
  if (first.length > MAX_NAME || last.length > MAX_NAME) return `Names can be at most ${MAX_NAME} characters.`;
  if (opts.passwordRequired && !password) return 'Enter a password.';
  if (password && password.length < MIN_PASSWORD) return `Passwords need at least ${MIN_PASSWORD} characters.`;
  return null;
}
