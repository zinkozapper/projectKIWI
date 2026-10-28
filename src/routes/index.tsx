import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import groceries from '@/assets/kiwi-groceries.webp';
import { KeyRound, Leaf } from 'lucide-react';

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Kiwi — Simple grocery planning' }, { name: 'description', content: 'Plan affordable groceries around your nutrition needs, without tracking every meal.' }, { property: 'og:title', content: 'Kiwi — Simple grocery planning' }, { property: 'og:description', content: 'A simpler way to shop for balanced meals.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(true);

  useEffect(() => {
    setPasskeySupported('PublicKeyCredential' in window);
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') || params.get('error_code')) {
      navigate({ to: '/error', replace: true });
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: '/plan', replace: true });
    });
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password to sign in.');
      setShake(false);
      requestAnimationFrame(() => setShake(true));
      window.setTimeout(() => setShake(false), 350);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: '/plan' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/error` } });
    if (error) navigate({ to: '/error' });
  }

  async function passkey() {
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPasskey();
    setBusy(false);
    if (error) navigate({ to: '/error' });
    else navigate({ to: '/plan' });
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="brand brand-large"><span className="brand-icon"><Leaf size={23} strokeWidth={2.5} /></span><span>kiwi<span className="brand-dot">.</span></span></div>
        <p className="login-tagline">Eat Healthy. Live Happy</p>
        <section className="login-card login-card-github" aria-labelledby="login-title">
          <h1 id="login-title">Sign in to Kiwi</h1>
          <form onSubmit={submit} className={`login-form${shake ? ' login-shake' : ''}`}>
            <label>Email address<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
            <div className="login-password-label"><label htmlFor="login-password">Password</label><Link className="text-link" to="/forgot-password">Forgot password?</Link></div>
            <input id="login-password" className="login-password-input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <Button className="login-submit" disabled={busy} type="submit">{busy ? 'One moment…' : 'Sign in'}</Button>
          </form>
          <div className="divider login-divider"><span>or</span></div>
          <Button className="google-button" variant="outline" type="button" onClick={google}><span className="google-g">G</span> Sign in with Google</Button>
          {passkeySupported && <Button className="google-button" variant="outline" type="button" onClick={passkey} disabled={busy}><KeyRound size={16} /> Sign in with a passkey</Button>}
          <div className="enroll-cta">
            <span>New to Kiwi? <Link to="/enroll">Create an account</Link></span>
          </div>
        </section>
      </div>
      <div className="auth-photo login-photo"><img src={groceries} width={800} height={1000} fetchPriority="high" decoding="async" alt="A balanced grocery haul with fresh produce and pantry staples" /><div className="photo-caption"><span className="photo-sparkle">✳</span><span>Good food.<br />Good days.</span></div></div>
    </div>
  );
}
