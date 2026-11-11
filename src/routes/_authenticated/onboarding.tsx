import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace/context';

export const Route = createFileRoute('/_authenticated/onboarding')({
  head: () => ({ meta: [{ title: 'Kiwi — Welcome' }] }),
  component: Onboarding,
});

function Onboarding() {
  const { userId, isFirstSession } = useWorkspace();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const welcomeKey = `kiwi-pantry-welcome-${userId}`;

  useEffect(() => {
    if (!isFirstSession) {
      void navigate({ to: '/plan', replace: true });
      return;
    }
    try {
      if (localStorage.getItem(welcomeKey) === 'seen') {
        void navigate({ to: '/plan/pantry', replace: true });
        return;
      }
    } catch { /* Continue without saved state. */ }
    setReady(true);
  }, [isFirstSession, navigate, welcomeKey]);

  if (!ready) return null;
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-start justify-center gap-5 font-[Arial,sans-serif] leading-relaxed [&_h1]:font-[Arial,sans-serif]">
      <h1>Welcome to Kiwi</h1>
      <p className="text-xl">Kiwi helps you plan affordable groceries around your nutrition needs.</p>
      <p className="text-xl font-semibold">Start by adding foods you already have.</p>
      <Button onClick={() => {
        try { localStorage.setItem(welcomeKey, 'seen'); } catch { /* Continue without saved state. */ }
        void navigate({ to: '/plan/pantry' });
      }}>Go to your pantry <ArrowRight size={16} /></Button>
    </section>
  );
}
