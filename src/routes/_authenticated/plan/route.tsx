import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceProvider } from '@/components/workspace/context';
import { WorkspaceShell } from '@/components/workspace/shell';

export const Route = createFileRoute('/_authenticated/plan')({
  component: PlanLayout,
});

function PlanLayout() {
  return (
    <WorkspaceProvider>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}
