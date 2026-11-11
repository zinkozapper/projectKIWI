import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Leaf, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { isSuccessfulAuthCallback, signedInDestination } from '@/lib/first-session';

export const Route = createFileRoute('/error')({
  head: () => ({ meta: [{ title: 'Kiwi — Something went wrong' }, { name: 'description', content: 'Something went wrong while signing you in.' }] }),
  component: ErrorScreen,
});

function ErrorScreen() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user && isSuccessfulAuthCallback(window.location.search, window.location.hash)) {
        navigate({ to: await signedInDestination(), replace: true });
      } else {
        setSignedIn(Boolean(data.user));
      }
    });
  }, [navigate]);

  return (
    <div className="error-page">
      <section className="error-card" aria-labelledby="error-title">
        <div className="brand brand-large"><span className="brand-icon"><Leaf size={23} strokeWidth={2.5} /></span><span>kiwi<span className="brand-dot">.</span></span></div>
        <div className="error-mark"><TriangleAlert size={22} /></div>
        <h1 id="error-title">Sorry, you’ve run into an error!</h1>
        <p>Please contact the developers if this keeps happening.</p>
        <Button className="login-submit" type="button" onClick={() => navigate({ to: signedIn ? '/plan' : '/' })}>
          {signedIn ? 'Back to your plan' : 'Back to sign in'}
        </Button>
      </section>
    </div>
  );
}
