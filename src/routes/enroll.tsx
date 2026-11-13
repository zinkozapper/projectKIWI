
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { googleSignInEnabled, selfHosted } from '@/lib/auth-options';
import { signedInDestination } from '@/lib/first-session';
import { Button } from '@/components/ui/button';
import groceries from '@/assets/kiwi-groceries.webp';
import { Eye, EyeOff, Leaf } from 'lucide-react';

export const Route = createFileRoute('/enroll')({
  head: () => ({ meta: [{ title: 'Kiwi — Create your account' }, { name: 'description', content: 'Create a Kiwi account and start planning affordable, balanced groceries.' }, { property: 'og:title', content: 'Kiwi — Create your account' }, { property: 'og:description', content: 'Start planning groceries that fit your week.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: Enroll,
});

function Enroll() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) navigate({ to: await signedInDestination(), replace: true });
    });
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      if (data.session) navigate({ to: await signedInDestination() });
      else setNotice(selfHosted ? 'Account created. If you cannot sign in, contact your administrator.' : 'Check your email to confirm your account, then sign in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } });
    if (error) navigate({ to: '/error' });
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="brand brand-large"><span className="brand-icon"><Leaf size={23} strokeWidth={2.5} /></span><span>kiwi<span className="brand-dot">.</span></span></div>
        <p className="login-tagline">Eat Healthy. Live Happy</p>
        <section className="login-card login-card-github" aria-labelledby="enroll-title">
          <h1 id="enroll-title">Create your Kiwi account</h1>
          <form onSubmit={submit} className="login-form">
            <label>Email address<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>

            <label>Password</label>
            <div className="password-field">
              <input
                required
                className="login-password-input"
                type={showPassword ? 'text' : 'password'}
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}
            {notice && <p className="form-success" role="status">{notice}</p>}
            <Button className="login-submit" disabled={busy} type="submit">{busy ? 'One moment…' : 'Create account'}</Button>
          </form>
          {googleSignInEnabled && (
            <>
              <div className="divider login-divider"><span>or</span></div>
              <Button className="google-button" variant="outline" type="button" onClick={google}><span className="google-g">G</span> Continue with Google</Button>
            </>
          )}
          <div className="enroll-cta"><span>Already have an account? <Link to="/">Sign in</Link></span></div>
        </section>
      </div>
      <div className="auth-photo login-photo">
        <img src={groceries} width={800} height={1000} fetchPriority="high" decoding="async" alt="A balanced grocery haul with chicken, fruit, vegetables and pantry staples" />
      </div>
    </div>
  );
}
