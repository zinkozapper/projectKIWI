import { createFileRoute } from '@tanstack/react-router';
import { ProfilePage } from '@/components/workspace/pages/profile';

const title = 'Kiwi — Your profile';
const description = 'Tell us about you so your grocery plan fits your needs.';

export const Route = createFileRoute('/_authenticated/plan/profile')({
  head: () => ({ meta: [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }] }),
  component: ProfilePage,
});
