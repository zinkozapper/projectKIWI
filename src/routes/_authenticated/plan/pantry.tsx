import { createFileRoute } from '@tanstack/react-router';
import { PantryPage } from '@/components/workspace/pages/pantry';

const title = 'Kiwi — Your pantry';
const description = 'Keep track of what is already in your kitchen and see what it covers.';

export const Route = createFileRoute('/_authenticated/plan/pantry')({
  head: () => ({ meta: [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }] }),
  component: PantryPage,
});
