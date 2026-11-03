import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import groceries from '@/assets/kiwi-groceries.webp';
import { Leaf } from 'lucide-react';

export const Route = createFileRoute('/enroll')({
  head: () => ({ meta: [{ title: 'Kiwi — Create your account' }, { name: 'description', content: 'Create a Kiwi account and start planning affordable, balanced groceries.' }, { property: 'og:title', content: 'Kiwi — Create your account' }, { property: 'og:description', content: 'Start planning groceries that fit your week.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: Enroll,
});

function Enroll() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: '/plan', replace: true });
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
      if (data.session) navigate({ to: '/plan' });
      else setNotice('Check your email to confirm your account, then sign in.');
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

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="brand brand-large"><span className="brand-icon"><Leaf size={23} strokeWidth={2.5} /></span><span>kiwi<span className="brand-dot">.</span></span></div>
        <p className="login-tagline">Eat Healthy. Live Happy</p>
        <section className="login-card login-card-github" aria-labelledby="enroll-title">
          <h1 id="enroll-title">Create your Kiwi account</h1>
          <form onSubmit={submit} className="login-form">
            <label>Email address<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
            <label>Password<input required type="password" minLength={6} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            {notice && <p className="form-success" role="status">{notice}</p>}
            <Button className="login-submit" disabled={busy} type="submit">{busy ? 'One moment…' : 'Create account'}</Button>
          </form>
          <div className="divider login-divider"><span>or</span></div>
          <Button className="google-button" variant="outline" type="button" onClick={google}><span className="google-g">G</span> Continue with Google</Button>
          <div className="enroll-cta"><span>Already have an account? <Link to="/">Sign in</Link></span></div>
        </section>
      </div>
      <div className="auth-photo login-photo">
        <img src={groceries} width={800} height={1000} fetchPriority="high" decoding="async" alt="A balanced grocery haul with chicken, fruit, vegetables and pantry staples" />
        <div className="photo-caption"><span className="photo-sparkle">✳</span><span>Good food.<br />Good days.</span></div>
      </div>
    </div>
  );
}
