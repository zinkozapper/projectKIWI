import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { WorkspaceProvider } from '@/components/workspace/context';
import { WorkspaceShell } from '@/components/workspace/shell';
import { applyScheme, applyTheme, getStoredScheme, resolveTheme } from '@/lib/theme';
export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session?.user) {
        navigate({ to: '/', replace: true });
        return;
      }
      applyTheme(resolveTheme());
      applyScheme(getStoredScheme());
    });
    return () => { active = false; };
  }, [navigate]);

  // No private data is rendered on the server; Supabase RLS protects all data requests.
  return <WorkspaceProvider><WorkspaceShell /></WorkspaceProvider>;
}
