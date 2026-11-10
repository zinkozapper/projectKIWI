import { createFileRoute } from '@tanstack/react-router';
import { FoodPreferencesPage } from '@/components/workspace/pages/food-preferences';

const title = 'Kiwi — Food preferences';
const description = 'Manage your liked and disliked foods.';

export const Route = createFileRoute('/_authenticated/food-preferences')({
  head: () => ({
    meta: [
      { title },
      { name: 'description', content: description },
    ],
  }),
  component: FoodPreferencesPage,
});