# Kroger price selection rules

How Kiwi turns a food into a localized price. Written so the add-food workflow can follow the same rules later.
Code: `scripts/kroger/` (shared logic in `lib.mjs`, per-food rules in `price-rules.json`).
Tables: `profiles.zip_code`, `kroger_store`, `zip_store`, `food_price` (migration `0010_kiwi_localized_food_price.sql`).

## 1. Source and store

- **Kroger Products API** (free developer app at https://developer.kroger.com, scope `product.compact`). It covers all Kroger banners, including Smith's in Utah.
- A user's ZIP picks the **nearest Kroger-family store within 10 miles** (Locations API). Prices are stored **per store**, not per user, and `zip_store` caches which store a ZIP uses.
- **Default ZIP: 84601 (downtown Provo).** Every profile starts there. The default store's prices are also written to `food.price`, which is the app's fallback when a user's ZIP has no store priced yet.

## 2. Which product counts as "the price"

1. Search Kroger with the food's `term` (defaults to the food name) at that store.
2. A candidate must:
   - have a **regular** price at that store (sale/promo prices are ignored, so budgets stay steady),
   - **not be organic** (brand or description),
   - contain every `must` term (`a|b` = either one), and none of the `exclude` terms (category-wide + per food).
3. Rank the eligible candidates:
   1. **Store brand** (Kroger, Private Selection, Simple Truth, Smart Way, Heritage Farm …)
   2. Unbranded produce
   3. National brands — used only when no store brand exists, and flagged
   - Within a tier: **lowest regular price per serving**, then Kroger's search rank.
4. A person reviews every pick in `candidates.csv` before anything is loaded (move the `x`).

## 3. Price per serving

Prices are scaled to the **same serving the nutrients use**, on the **as-bought (raw/dry) basis** from the USDA pull — e.g. 4 oz raw chicken, ¼ cup dry lentils (48 g), 1 medium apple.

| Package | Serving | Price per serving |
|---|---|---|
| By weight (16 oz, 1 lb, 2 kg) | grams | package price × serving g ÷ package g |
| Sold by weight (produce, `soldBy = WEIGHT`) | grams | price per lb × serving g ÷ 453.6 |
| Each / count, per-unit serving | 1 unit, 1 clove | package price ÷ count (garlic: ÷ 10 cloves per bulb) |
| Volume (1 gal, 16.9 fl oz), volume serving | cup, tbsp | package price × serving ml ÷ package ml |
| Volume package, gram serving | grams | uses density: dairy 1.03 g/ml, oils 0.92 g/ml (flagged) |
| Count package, gram serving | eggs | package price ÷ count × serving g ÷ 50 g per egg (flagged) |

Serving grams come from the food's `serving_size`/`unit` (oz, g) or, for cup/tbsp/unit servings, from the USDA pull files (`data/usda/import-log.csv`, `existing-factor-updates.csv`, `kiwi-foods.csv`).

## 4. Checks

- Flag a price per serving below $0.02 or above $4.00.
- Flag national-brand fallbacks, density conversions, per-lb produce and count conversions.
- Exactly one selected product per food; foods with none or several are reported and not loaded.

## Running it

```bash
# .env: KROGER_CLIENT_ID=..., KROGER_CLIENT_SECRET=... (plus the existing VITE_SUPABASE_* values)
node --env-file=.env scripts/kroger/1-search.mjs            # default ZIP 84601 -> data/kroger/84601/candidates.csv
#   review the x marks; after editing price-rules.json, re-run with --reselect (no API calls)
node scripts/kroger/2-build.mjs                              # -> food-prices.csv + food-prices.sql
# run food-prices.sql in the Supabase SQL editor (service role; RLS blocks the app's key)
```

Other ZIPs: add `--zip 84604` to both steps. `--only 1,2,3` searches just those food IDs.
