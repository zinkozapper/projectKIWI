import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import groceries from '@/assets/kiwi-groceries.webp';

export const Route = createFileRoute('/forgot-password')({
  head: () => ({ meta: [{ title: 'Kiwi — Reset your password' }, { name: 'description', content: 'Request a password reset link for your Kiwi account.' }] }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setNotice('If an account exists for that email, a password reset link is on its way.');
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="brand brand-large"><span className="brand-icon"><Leaf size={23} strokeWidth={2.5} /></span><span>kiwi<span className="brand-dot">.</span></span></div>
        <p className="login-tagline">Eat Healthy. Live Happy</p>
        <section className="login-card login-card-github" aria-labelledby="forgot-title">
          <h1 id="forgot-title">Reset your password</h1>
          <form onSubmit={submit} className="login-form">
            <label>Email address<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            {notice && <p className="form-success" role="status">{notice}</p>}
            <Button className="login-submit" disabled={busy} type="submit">{busy ? 'Sending…' : 'Send reset link'}</Button>
          </form>
          <div className="enroll-cta"><span><Link to="/">Back to sign in</Link></span></div>
        </section>
      </div>
      <div className="auth-photo login-photo"><img src={groceries} width={800} height={1000} fetchPriority="high" decoding="async" alt="A balanced grocery haul with fresh produce and pantry staples" /><div className="photo-caption"><span className="photo-sparkle">✳</span><span>Good food.<br />Good days.</span></div></div>
    </div>
  );
}
