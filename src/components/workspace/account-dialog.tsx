import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle, Save, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { AdminUser } from '@/lib/admin';
import { adminCreateAccount, adminUpdateAccount } from '@/lib/admin-accounts/functions';
import { checkAccountInput, MAX_NAME, MIN_PASSWORD } from '@/lib/admin-accounts/shared';

// Add a new account (account = null) or edit an existing one from the admin user list.
export function AccountDialog({ open, account, onClose, onSaved }: {
  open: boolean;
  account: AdminUser | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const editing = !!account;
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(account?.email ?? '');
    setFirstName(account?.first_name ?? '');
    setLastName(account?.last_name ?? '');
    setPassword('');
    setMakeAdmin(false);
    setError('');
  }, [open, account]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = { email, firstName, lastName, password, makeAdmin };
    const problem = checkAccountInput(input, { passwordRequired: !editing });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = account
        ? await adminUpdateAccount({ data: { ...input, userId: account.user_id } })
        : await adminCreateAccount({ data: input });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(editing ? `Saved changes to ${email.trim()}.` : `Created ${email.trim()}. They can sign in now.`);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !busy) onClose(); }}>
      <DialogContent className="account-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit account' : 'Add an account'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Change the name or sign-in email. Leave the password blank to keep the current one.'
              : 'The account can sign in right away with this email and password.'}
          </DialogDescription>
        </DialogHeader>

        <form className="auth-form account-form" onSubmit={submit} noValidate>
          <div className="account-name-row">
            <label>First name
              <input autoFocus maxLength={MAX_NAME} autoComplete="off" value={firstName} onChange={e => setFirstName(e.target.value)} />
            </label>
            <label>Last name
              <input maxLength={MAX_NAME} autoComplete="off" value={lastName} onChange={e => setLastName(e.target.value)} />
            </label>
          </div>
          <label>Email
            <input type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label>{editing ? 'New password (optional)' : 'Password'}
            <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={password} onChange={e => setPassword(e.target.value)} placeholder={`At least ${MIN_PASSWORD} characters`} />
          </label>
          {!editing && (
            <label className="account-check">
              <input type="checkbox" checked={makeAdmin} onChange={e => setMakeAdmin(e.target.checked)} />
              Make this account an admin
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="account-actions">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : editing ? <Save size={16} /> : <UserPlus size={16} />}
              {editing ? 'Save changes' : 'Create account'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
