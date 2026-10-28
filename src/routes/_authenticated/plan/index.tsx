import { createFileRoute } from '@tanstack/react-router';
import { PlanPage } from '@/components/workspace/pages/plan';

const title = 'Kiwi — Your grocery planner';
const description = 'Build a weekly grocery list and see how it supports your nutrition targets.';

export const Route = createFileRoute('/_authenticated/plan/')({
  head: () => ({ meta: [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: PlanPage,
});
