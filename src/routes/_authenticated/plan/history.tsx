import { createFileRoute } from '@tanstack/react-router';
import { HistoryPage } from '@/components/workspace/pages/history';

const title = 'Kiwi — Your past trips';
const description = 'Look back at completed grocery trips and repeat your favorites.';

export const Route = createFileRoute('/_authenticated/plan/history')({
  head: () => ({ meta: [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }] }),
  component: HistoryPage,
});
