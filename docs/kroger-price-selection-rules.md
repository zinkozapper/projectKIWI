# Kroger price selection rules

How Kiwi turns a food into a localized price. Written so the add-food workflow can follow the same rules later.
Code: `src/lib/food-import/pricing.ts` (rules + scaling) and `kroger.server.ts` (API), shared by the add-food workflow (`price.server.ts`) and the backfill script (`scripts/kroger/`). Per-food and per-category rules: `src/lib/food-import/price-rules.json`.

**New foods (add-food workflow):** there are no per-food rules yet, so Claude supplies the grocery search term and 1–2 words the product name must contain; category rules, brand order, organic fallback, scaling and backup stores apply as below. The food is priced at the user's ZIP store and at the default ZIP's store (→ `food.price`). A missing key, no store, or no match saves the food unpriced instead of failing.
Tables: `profiles.zip_code`, `kroger_store`, `zip_store`, `food_price` (migration `0010_kiwi_localized_food_price.sql`).

## 1. Source and store

- **Kroger Products API** (free developer app at https://developer.kroger.com, scope `product.compact`). It covers all Kroger banners, including Smith's in Utah.
- A user's ZIP picks the **nearest Kroger-family store within 10 miles** (Locations API). Prices are stored **per store**, not per user, and `zip_store` caches which store a ZIP uses.
- **Default ZIP: 84601 (downtown Provo).** Every profile starts there. The default store's prices are also written to `food.price`, which is the app's fallback when a user's ZIP has no store priced yet.

## 2. Which product counts as "the price"

1. Search Kroger with the food's `term` (defaults to the food name) at that store.
2. A candidate must:
   - have a **regular** price at that store (sale/promo prices are ignored, so budgets stay steady),
   - **not be organic** (brand or description) — unless nothing non-organic qualifies, then organic is allowed and flagged,
   - be in one of the **Kroger categories** allowed for its food group (fruit/vegetables → Produce, meat → Meat & Seafood, dairy → Dairy …; per-food overrides where Kroger's categories are inconsistent),
   - contain every `must` term as a whole word, plurals allowed (`a|b` = either one), and none of the `exclude` terms (category-wide + per food).
3. Rank the eligible candidates:
   1. **Store brand** (Kroger, Private Selection, Simple Truth, Smart Way, Heritage Farm …), including products whose name starts with a store brand ("Kroger® Fresh Lemons Bag" is listed under the brand "Fresh Citrus")
   2. Unbranded: no brand, "Fresh …" produce labels, all-caps commodity labels on fresh meat/produce ("PORK")
   3. National brands — used only when no store brand exists, and flagged
   - Within a tier: **lowest regular price per serving**, then Kroger's search rank.
4. A person reviews every pick in `candidates.csv` before anything is loaded (move the `x`).

## 2b. When nothing qualifies

Tried in this order; the first product that passes section 2 wins:

1. **Home store, main search.**
2. **Home store, the food's alternates** (`alternates` in `price-rules.json`), in order: another preparation of the same food (canned or frozen) or the closest substitute. An alternate can re-express the serving in its own form (`servingGrams`) and count only part of the package (`packageYield`):
   - Chickpeas / lentils: canned, drained. 50 g dry chickpeas = 116 g cooked (USDA raw 378 vs cooked 163 kcal/100 g); 48 g dry lentils = 147 g cooked (352 vs 115). A 15.5 oz can drains to about 56 % of its net weight.
   - Frozen mixed berries: triple berry blend → berry medley → frozen blueberries.
   - Nonfat cheese: reduced-fat shredded cheese → part-skim mozzarella.
3. **Up to 3 backup stores** within 25 miles, repeating steps 1–2 at each. Kroger publishes no store size, so stores are ranked by how many departments they list (bakery, deli, pharmacy, fuel …) as a proxy for the largest stores.
4. Otherwise the food stays **unpriced**.

A backup-store price is still saved under the ZIP's home store (that is what the app looks up); `food_price.source_location_id` records the store it came from, and the flags say which alternate was used.

## 3. Price per serving

Prices are scaled to the **same serving the nutrients use**, on the **as-bought (raw/dry) basis** from the USDA pull — e.g. 4 oz raw chicken, ¼ cup dry lentils (48 g), 1 medium apple.

| Package | Serving | Price per serving |
|---|---|---|
| By weight (16 oz, 1 lb, 2 kg) | grams | package price × serving g ÷ package g |
| Multi-item sizes | | "6 ct / 18 oz" = 18 oz total; "4 pk / 15.5 oz" = 4 × 15.5 oz |
| Sold by weight (produce, `soldBy = WEIGHT`) | grams | price per lb × serving g ÷ 453.6 |
| Each / count, per-unit serving | 1 unit, 1 clove | package price ÷ count (garlic: ÷ 10 cloves per bulb) |
| Volume (1 gal, 16.9 fl oz), volume serving | cup, tbsp | package price × serving ml ÷ package ml |
| Volume package, gram serving | grams | uses density: dairy 1.03 g/ml, oils 0.92 g/ml (flagged) |
| Count package, gram serving | eggs | package price ÷ count × serving g ÷ 50 g per egg (flagged) |

Serving grams come from the food's `serving_size`/`unit` (oz, g) or, for cup/tbsp/unit servings, from the USDA pull files (`data/usda/import-log.csv`, `existing-factor-updates.csv`, `kiwi-foods.csv`).

## 4. Checks

- If no candidate qualifies after section 2b, the food stays **unpriced** (price 0, which the app treats as no price). Other forms are only used through the explicit alternates in section 2b, with their serving conversion.
- Flag a price per serving below $0.02 or above $4.00.
- Flag national-brand fallbacks, density conversions, per-lb produce and count conversions.
- Exactly one selected product per food; foods with none or several are reported and not loaded.

## Purchase options ("prep styles")

How a food is sold — chicken breast: Raw, Rotisserie, Frozen, Canned. Code: `src/lib/food-import/purchase-options.ts` (AI instructions, cleanup, pricing input), tables `food_option`, `food_option_price`, `shopping_list_item.food_option_id` (migration `0018_kiwi_food_options.sql`).

1. **Which options.** Claude lists the forms most stores actually sell, **at most one per form**: fresh, frozen, canned, dried, ready_to_eat. Options are general: never brands, package sizes or two kinds of the same form. The form Kiwi's nutrients describe comes first. A food sold only one way (oil, honey, eggs, milk) gets no options; fewer than 2 options are dropped.
2. **Search.** Each option has its own search term and must-words. It is searched in the aisle for its form (frozen → Frozen; canned → Canned & Packaged …; fresh → the food group's categories), and the form's words are allowed past the group's excludes (meat normally excludes "cooked" and "rotisserie"; produce excludes "frozen" and "canned"). Everything else in sections 2–2b applies: store brand first, no organic unless it's the only choice, regular price, backup stores. The food's own per-food rules in `price-rules.json` are not used for its options.
3. **Same serving.** Every option is priced for the food's serving:
   - `as_bought` (raw, frozen raw, dried): the raw/dry serving grams, like the food.
   - `prepared` (rotisserie, canned meat or beans, cooked rice cups): the cooked weight of that serving, `factor × 100` g (4 oz raw chicken ≈ 94 g cooked).
   - Canned foods packed in liquid count only the drained share of the can (`package_yield` 0.6).
   - Items sold per item with no weight (a rotisserie chicken) use Claude's estimate of edible grams per item (`unit_grams`, ≈ 700 g).
4. **Prices.** `food_option.price` is the default store's price per serving; `food_option_price` holds every store's. A list item with an option picked costs that option's price; with none picked (or an unpriced one), the **average of the priced options**. `food.price` is set to that average so the rest of the app agrees. Nutrients are the food's own for every option.
5. **Existing foods.** `scripts/kroger/options-backfill.mjs --ai` asks Claude for each food's options (review `data/kroger/<zip>/options.json`), then `--price` prices them and writes `options.csv` + `options.sql`. Foods without a cook ratio whose nutrients are for a cooked/canned form (e.g. Black Beans) price a dried option on the same gram serving; review those rows.

## Package sizes ("as bought")

A food is added to the list the way it's sold: one package. Code: `src/lib/food-import/package-sizes.ts` (candidates, AI instructions, cleanup, fixed-rule fallback), `src/lib/food-packages.ts` (the app), table `food_package`, `shopping_list_item.food_package_id` / `price_estimate`, `pantry_item.food_package_id` (migration `0019_kiwi_package_sizes.sql`).

1. **Candidates.** The eligible products from the search that found the food's (or option's) pick, in the same brand tier (store brand stays store brand; the next tier is added only when the best tier has a single size). One product per distinct package size, the cheapest per serving, smallest first, at most 12.
2. **AI picks.** Claude picks **1–3** sizes, everyday size first, with a short label ("1 lb", "3 lb family pack", "15 oz can"). Products sold by weight get a number of pounds instead. Unknown picks are dropped. If Claude errors or takes over 15 s, the rules pick: best value per serving first, then the smallest and largest.
3. **Servings.** `servings = package price ÷ price per serving` (× pounds for weight-priced items), so a size's servings use the same serving as the nutrients and price. In the app, one package's servings are spread across the trip (4 servings on a 7-day plan = 4/7 of a serving a day); pantry packages work the same way.
4. **Prices.** A package costs the shopper's store price per serving × its servings (so localized prices still apply), else its own shelf price. With no price at all, the list row asks the shopper for an estimate (`price_estimate`) and the budget uses it.
5. **Existing foods.** Migration 0019 seeded one size per priced food from `food_price`. `node --env-file=.env scripts/kroger/package-sizes-backfill.mjs` adds the AI-picked sizes (per option once options exist) and writes `data/kroger/<zip>/package-sizes.json` (review) + `package-sizes.sql`. It fills the same 3 slots per food/option, so list and pantry rows pointing at a size keep working.

## Running it

```bash
# .env: KROGER_CLIENT_ID=..., KROGER_CLIENT_SECRET=... (plus the existing VITE_SUPABASE_* values)
node --env-file=.env scripts/kroger/1-search.mjs            # default ZIP 84601 -> data/kroger/84601/candidates.csv
#   review the x marks; after editing price-rules.json, re-run with --reselect (no API calls)
node scripts/kroger/2-build.mjs                              # -> food-prices.csv + food-prices.sql
# run food-prices.sql in the Supabase SQL editor (service role; RLS blocks the app's key)
```

Other ZIPs: add `--zip 84604` to both steps. `--only 1,2,3` searches just those food IDs.

## First load (Nov 2026)

Smith's, 350 N Freedom Blvd, Provo (location 70600136). 100 of 101 foods priced, all at the home store. Alternates used: chickpeas (canned, drained), frozen mixed berries (triple berry blend), nonfat cheese (reduced-fat shredded). Acerola is unpriced: nothing at the home store or the 3 backup Marketplaces (Lehi, Saratoga Springs, Springville).
