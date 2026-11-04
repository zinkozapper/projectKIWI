> [!IMPORTANT]
> This project syncs with a hosted editor. Avoid rewriting published git history — force pushing, or rebasing/amending/squashing commits that are already pushed — because it can break project history and synchronization.

# Kiwi — agent notes

Kiwi helps people plan affordable groceries around their nutrition gaps. The stack is React 19 + TypeScript, TanStack Start/TanStack Router, Vite/Nitro, Tailwind CSS v4 + shadcn/Radix UI, and Supabase for auth, Postgres, and RLS. Pushes to `main` deploy to AWS Elastic Beanstalk.

## Commands

Use npm (the README and deploy workflow both use it). Node 22+ is expected.

```bash
npm install
npm run dev        # Vite dev server, port 8080
npm run build      # production build into .output
npm run preview    # preview the production build, port 4173
npm test           # Vitest, single run
npm run test:watch # Vitest watch mode
npm run lint
npm run format     # repo-wide Prettier write; avoid running it on unrelated files
```

Environment setup: copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. `FDC_API_KEY` is only for the USDA scripts. Server-only values (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CRON_SECRET`) must never be exposed through `VITE_` variables.

`npm run lint` currently reports many Prettier style errors across existing files because the repo uses single quotes while Prettier's defaults expect double quotes. Do not mass-reformat unrelated files or treat lint as a clean gate; match the surrounding style and keep changes scoped.

## Routing and app structure

TanStack Start uses file-based routing in `src/routes/`. Do not create `src/pages/`, `src/routes/_app/index.tsx`, or `app/layout.tsx`. The root layout is `src/routes/__root.tsx`, and `src/routeTree.gen.ts` is generated — never edit it by hand. Adding a route file regenerates the tree during dev/build.

Public routes:

- `/` — public sign-in
- `/enroll` — create account
- `/forgot-password`, `/reset-password` — password reset flow
- `/error` — auth/error landing screen

Account-gated routes use the `_authenticated` layout (`src/routes/_authenticated/route.tsx`), which checks the Supabase session on the client, redirects to `/` when signed out, and wraps pages in `WorkspaceProvider` + `WorkspaceShell`. Sign-in supports email/password, Google OAuth, and passkeys; `/profile` manages passkeys.

- `/plan` — main grocery planner
- `/plan/pantry` — pantry
- `/plan/shop` — in-store shopping mode
- `/plan/history` — completed trips
- `/profile` — profile and passkeys

Keep planner tab-like screens under `/plan` for fast in-app movement. Add new planner screens as files under `src/routes/_authenticated/plan/`, then add the page component under `src/components/workspace/pages/` and a nav entry in `src/components/workspace/shell.tsx`.

## Data model

Use the ERD tables for app data:

- `users` — one row per auth user, created by the `handle_new_kiwi_user` trigger
- `profiles` — nutrition profile (`age`, `height_cm`, `weight_kg`, `gender`, `activity`, `goal`, `budget`)
- `pantry` — one pantry per user
- `pantry_item` — foods in a pantry
- `shopping_list` — a grocery trip (`days`, `budget`, `status`, timestamps)
- `shopping_list_item` — foods on a list, including `is_purchased`
- `food`, `food_category` — the shared grocery catalog

`profiles` is not created by the sign-up trigger; the workspace sends users to `/profile` when it is missing. Old `trips`, `trip_items`, and `pantry_items` tables are deprecated; do not add code that reads or writes them.

All user-owned tables have RLS policies scoped to `auth.uid()`, including nested ownership for pantry/list items. Any new table needs matching grants and RLS policies. The client talks to Supabase directly; RLS is the security boundary. Do not move private data into SSR without adding server-side auth checks.

Known inconsistency: the login page writes a best-effort row to `user_login_events`, but that table is not in the Drizzle migrations or generated Supabase types. The write only logs a console error on failure. If login tracking becomes required, add a migration and regenerate types.

## Supabase integration

Files under `src/integrations/supabase/` are generated integration code:

- `client.ts` — browser/SSR-safe client proxy; do not edit
- `client.server.ts` — service-role admin client; import dynamically inside server handlers only
- `auth-attacher.ts` — attaches the session bearer token to server-function RPCs
- `auth-middleware.ts` — `requireSupabaseAuth` for server functions
- `types.ts` — generated database types; regenerate after schema changes instead of hand editing

`src/start.ts` registers `attachSupabaseAuth` as a function middleware and the CSRF middleware for server functions. If you edit `start.ts`, keep both registrations.

The browser client stores the session in `localStorage` when "Remember me" is checked and `sessionStorage` otherwise. It also strips the `Authorization` header for opaque `sb_publishable_`/`sb_secret_` keys, which are not bearer JWTs.

## Food catalog and nutrition

The source of truth for foods is Supabase `food` joined with `food_category`. `src/lib/foods.ts` loads it through `loadCatalog()`, which caches rows in the exported `foods` array. Call `loadCatalog()` before relying on `foodById()` or `totals()`; the workspace provider does this during startup. The cache is populated once per browser session, so reload to pick up database changes.

- `food.nutrition` is approximate nutrition per package/serving, and `totals()` multiplies those values by item quantity.
- `food.price` is the approximate price per package/unit.
- `serving_size` and `unit` describe what the user buys.
- Keep nutrition estimates consistent between the database and `src/lib/foods.ts`.

Curated meal pairings, aliases, nutrient labels/units, and nutrition target calculations live in `src/lib/foods.ts`. `MEAL_PAIRINGS`, `ADDITIONAL_PAIRINGS`, and `FOOD_ALIASES` drive `getFoodPairings()`; it filters by budget and already-selected foods and returns at most three suggestions. The `food.pairs` database column is loaded into `Food.pairs` but is not what drives recommendations. If foods are renamed in the database, update the pairing names/aliases too, or recommendations will silently drop.

`targets(profile)` estimates daily nutrient goals from the profile. The profile UI stores height/weight in cm/kg but accepts feet/inches and pounds, converting in `src/components/workspace/context.tsx`.

## USDA import pipeline

The nutrition import rules are documented in `docs/usda-record-selection-rules.md`; follow that spec rather than guessing at USDA records. The scripts are dependency-free Node scripts and read `FDC_API_KEY` from `.env`.

```bash
node --env-file=.env scripts/usda/1-search.mjs          # search FDC, write candidates.csv
node --env-file=.env scripts/usda/2-build.mjs           # build per-100g/per-serving CSVs + import log
node --env-file=.env scripts/usda/3-merge.mjs           # merge into kiwi-foods.csv
node --env-file=.env scripts/usda/4-export-supabase.mjs # export Supabase import CSVs
```

Review the `x` marks in `data/usda/candidates.csv` between steps 1 and 2. Group rules and per-food overrides live in `scripts/usda/foods-to-import.json`. Import `data/usda/supabase/food_category.csv` before `data/usda/supabase/food.csv` because foods reference categories. Missing nutrient values are stored as 0 per the current data decision.

## UI and code style

- Reusable shadcn/ui components are in `src/components/ui/`; the shadcn config is `components.json`.
- Workspace state and Supabase mutations live in `src/components/workspace/context.tsx`. Pages consume it through `useWorkspace()`.
- Global styles are in `src/styles.css`; Tailwind v4 is wired through `@tailwindcss/vite`.
- The `@/*` path alias maps to `src/*`.
- Prefer existing components, CSS classes, and patterns. Use single quotes and the existing formatting style.

## Testing

Tests use Vitest with jsdom and Testing Library. Setup mocks `window.scrollTo` and `matchMedia` in `src/test/setup.ts`. The routing test (`src/test/app-routing.test.tsx`) intentionally asserts only that the router mounts and paints, not page content, because routes are rewritten as the app grows. Keep that contract.

Add tests as `src/**/*.{test,spec}.{ts,tsx}`. `npm test` currently passes.

## Database changes

Database migrations are raw SQL in `drizzle/migrations/`. `drizzle/schema.ts` is intentionally blank and auto-generated; do not put the real schema there. There is no npm script that applies migrations, so apply new SQL to Supabase manually and keep `src/integrations/supabase/types.ts` regenerated from the database.

## Deployment

`.github/workflows/deploy.yml` deploys every push to `main`:

1. Node 22, `npm ci --legacy-peer-deps`
2. `npm run build` with `NITRO_PRESET=node-server` and `VITE_*` values from GitHub secrets
3. Packages `.output/{Procfile,server,public}` and uploads a new Elastic Beanstalk application version
4. Updates the `Kiwi-nitrition-env` environment and fails if health is `Red`

`vite.config.ts` defaults to the `cloudflare-module` Nitro preset for local builds; deployment overrides it with `node-server`. Do not commit `.env`, service keys, or other secrets.

## Generated and ignored files

Do not edit generated output or caches:

- `src/routeTree.gen.ts`
- `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-attacher.ts`, `auth-middleware.ts`, `types.ts`
- `drizzle/schema.ts`
- `.output/`, `.wrangler/`, `.nitro/`, `.vite/`, `coverage/`
