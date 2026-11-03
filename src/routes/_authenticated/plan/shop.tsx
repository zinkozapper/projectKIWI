import { createFileRoute } from '@tanstack/react-router';
import { ShopPage } from '@/components/workspace/pages/shop';

const title = 'Kiwi — Shopping mode';
const description = 'Check items off your grocery list while you shop.';

export const Route = createFileRoute('/_authenticated/plan/shop')({
  head: () => ({ meta: [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }] }),
  component: ShopPage,
});
