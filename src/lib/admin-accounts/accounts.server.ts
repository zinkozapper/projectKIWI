// Admin account management (server side): create, edit and delete Kiwi accounts from the admin page.
// Creating and deleting sign-in accounts needs the Supabase service role, so this runs only on the server.
// Every call first checks that the caller's session token belongs to someone in public.app_admin.
import { getRequest } from '@tanstack/react-start/server';
import { adminClient } from '@/lib/food-import/env.server';
import { checkAccountInput, type AccountInput, type AccountUpdate } from './shared';

export class AccountError extends Error {}
export const isAccountError = (e: unknown): e is AccountError => e instanceof AccountError;

async function requireAdmin() {
  const header = getRequest()?.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new AccountError('Please sign in again.');
  const db = await adminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new AccountError('Your session expired. Please sign in again.');
  const { data: row } = await db.from('app_admin').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (!row) throw new AccountError('Admins only.');
  return { db, adminId: data.user.id };
}

function check<T>(problem: string | null, value: T) {
  if (problem) throw new AccountError(problem);
  return value;
}

// Supabase's auth messages are already readable ("A user with this email address has already been registered").
function authFailed(error: { message?: string } | null, fallback: string): never {
  throw new AccountError(error?.message || fallback);
}

export async function createAccount(input: AccountInput) {
  const v = check(checkAccountInput(input, { passwordRequired: true }), input);
  const { db, adminId } = await requireAdmin();

  const { data, error } = await db.auth.admin.createUser({
    email: v.email.trim(),
    password: v.password,
    // Admin-made accounts can sign in right away; email confirmation is off in this project anyway.
    email_confirm: true,
    user_metadata: { first_name: v.firstName.trim(), last_name: v.lastName.trim() },
  });
  if (error || !data.user) authFailed(error, 'Could not create the account.');
  const userId = data.user.id;

  // The handle_new_kiwi_user trigger already made the users + pantry rows; set the names again in case
  // an older version of the trigger is installed.
  await db.from('users').upsert({ user_id: userId, email: v.email.trim(), first_name: v.firstName.trim(), last_name: v.lastName.trim() });
  if (v.makeAdmin) {
    const { error: adminError } = await db.from('app_admin').upsert({ user_id: userId, granted_by: adminId });
    if (adminError) throw new AccountError('Account created, but making it an admin failed. Use Make admin in the list.');
  }
  return { userId };
}

export async function updateAccount(input: AccountUpdate) {
  const v = check(checkAccountInput(input, { passwordRequired: false }), input);
  if (!v.userId) throw new AccountError('Missing account id.');
  const { db } = await requireAdmin();

  const { data: current, error: getError } = await db.auth.admin.getUserById(v.userId);
  if (getError || !current.user) throw new AccountError('That account no longer exists.');

  const email = v.email.trim();
  const changes: { email?: string; email_confirm?: boolean; password?: string; user_metadata: Record<string, string> } = {
    user_metadata: { ...(current.user.user_metadata || {}), first_name: v.firstName.trim(), last_name: v.lastName.trim() },
  };
  if (email.toLowerCase() !== (current.user.email || '').toLowerCase()) {
    changes.email = email;
    changes.email_confirm = true;
  }
  if (v.password) changes.password = v.password;

  const { error } = await db.auth.admin.updateUserById(v.userId, changes);
  if (error) authFailed(error, 'Could not update the account.');

  const { error: rowError } = await db.from('users')
    .update({ email, first_name: v.firstName.trim(), last_name: v.lastName.trim() })
    .eq('user_id', v.userId);
  if (rowError) throw new AccountError('Sign-in details were saved, but the name could not be updated.');
  return { userId: v.userId };
}

export async function deleteAccount(input: { userId: string }) {
  const userId = String(input?.userId || '');
  if (!userId) throw new AccountError('Missing account id.');
  const { db, adminId } = await requireAdmin();
  if (userId === adminId) throw new AccountError('You can’t delete your own account from the admin page.');

  // Never leave Kiwi without an admin.
  const { data: target } = await db.from('app_admin').select('user_id').eq('user_id', userId).maybeSingle();
  if (target) {
    const { count } = await db.from('app_admin').select('user_id', { count: 'exact', head: true });
    if ((count ?? 0) <= 1) throw new AccountError('That’s the last admin. Make someone else an admin first.');
  }

  // Deleting the auth user cascades to users, profiles, pantry, lists, events and app_admin.
  // Foods they added to the catalog stay, with added_by cleared.
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) authFailed(error, 'Could not delete the account.');
  return { userId };
}
