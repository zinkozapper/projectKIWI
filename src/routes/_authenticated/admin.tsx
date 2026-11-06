import { createFileRoute } from '@tanstack/react-router';
import { AdminPage } from '@/components/workspace/pages/admin';

const title = 'Kiwi — Admin dashboard';
const description = 'OKR metrics and accounts for Kiwi admins.';

export const Route = createFileRoute('/_authenticated/admin')({
  head: () => ({ meta: [{ title }, { name: 'description', content: description }, { name: 'robots', content: 'noindex' }] }),
  component: AdminPage,
});
