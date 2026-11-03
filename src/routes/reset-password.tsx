import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import groceries from '@/assets/kiwi-groceries.webp';

export const Route = createFileRoute('/reset-password')({
  head: () => ({ meta: [{ title: 'Kiwi — Reset your password' }, { name: 'description', content: 'Choose a new password for your Kiwi account.' }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else {
      setNotice('Your password has been updated.');
      window.setTimeout(() => navigate({ to: '/', replace: true }), 1200);
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="brand brand-large"><span className="brand-icon"><Leaf size={23} strokeWidth={2.5} /></span><span>kiwi<span className="brand-dot">.</span></span></div>
        <p className="login-tagline">Eat Healthy. Live Happy</p>
        <section className="login-card login-card-github" aria-labelledby="reset-title">
          <h1 id="reset-title">Choose a new password</h1>
          <form onSubmit={submit} className="login-form">
            <label>New password<input required type="password" minLength={6} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            {notice && <p className="form-success" role="status">{notice}</p>}
            <Button className="login-submit" disabled={busy} type="submit">{busy ? 'Updating…' : 'Update password'}</Button>
          </form>
          <div className="enroll-cta"><span>Link expired? <Link to="/forgot-password">Request a new one</Link></span></div>
        </section>
      </div>
      <div className="auth-photo login-photo"><img src={groceries} width={800} height={1000} fetchPriority="high" decoding="async" alt="A balanced grocery haul with fresh produce and pantry staples" /><div className="photo-caption"><span className="photo-sparkle">✳</span><span>Good food.<br />Good days.</span></div></div>
    </div>
  );
}
