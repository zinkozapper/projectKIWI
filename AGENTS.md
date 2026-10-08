<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting published git history — force pushing, or rebasing/amending/squashing commits that are already pushed — as it rewrites history on Lovable's side and the user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the curated grocery catalog and approximate per-package nutrition in `src/lib/foods.ts` so every screen uses the same estimates.

- Use `/` for public sign-in and `/plan` for the account-gated planning workspace; tab-like screens remain within the workspace for fast in-app movement.
- Use the ERD tables (users, pantry, pantry_item, shopping_list, shopping_list_item, food, food_category) for app data; foods load from the database via loadCatalog in src/lib/foods.ts. Old trips/trip_items/pantry_items are deprecated.
