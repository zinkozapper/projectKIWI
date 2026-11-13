import { createFileRoute } from '@tanstack/react-router';
import { RecipesPage } from '@/components/workspace/pages/recipes';

const title = 'Kiwi — Recipes';
const description = 'Recipe ideas from your grocery list, and the recipes you saved.';

export const Route = createFileRoute('/_authenticated/plan/recipes')({
  head: () => ({ meta: [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }] }),
  component: RecipesPage,
});
