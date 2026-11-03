# USDA FoodData Central — Record Selection Rules

Rules for choosing which FoodData Central (FDC) record supplies a food's nutrition data.
Used for the Sprint 1 food load and intended as the spec for the future automated import.

Source: FDC API — `https://api.nal.usda.gov/fdc/v1/` (`/foods/search`, `/food/{fdcId}`). Requires an api.data.gov key.

## 1. Which dataset

1. Search these data types: **Survey (FNDDS)**, **Foundation**, **SR Legacy**.
2. **Filter by description first.** Each food has `must` terms (all must appear) and `exclude` terms (none may appear) in `foods-to-import.json`. Prepared foods also exclude "fat added", "made with oil", "made with butter" and "fried".
   _Why:_ FNDDS records always list every nutrient, so ranking by coverage alone picks unrelated FNDDS records (for example, "Bread, zucchini" for zucchini, or "Flaxseed oil" for ground flax).
   Score the remaining candidates by **coverage**: the number of target nutrients (section 5) with a non-null value.
3. Pick the candidate with the **highest coverage**. Tie-break order: FNDDS → Foundation → SR Legacy.
4. **Exception: processed or packaged foods** (for example, frozen mixed berries) use **Branded** records. Pick the most generic, widely sold product. Branded `foodNutrients` are per 100 g.
5. Raw/dry reference records: prefer SR Legacy, because it carries household portion weights (cup, tbsp); then search order. Only calories and portion weights are used from them.
6. Every pick is reviewed by a person in `data/usda/candidates.csv` before it is imported.

## 2. Basis: what you buy, per serving

Kiwi models **what the user buys**: nutrients in a raw or uncooked serving. USDA reports many foods as prepared, so every food gets a **factor** (column A of the `/100g` sheet):

```
per-serving value = prepared value per 100 g × factor
```

| Food group | Pull from USDA | Serving (unprepared) | Factor |
|---|---|---|---|
| Meat, seafood | Cooked, **no added fat**; cooked and raw records from the **same dataset** (SR Legacy/Foundation) | 4 oz raw | (serving g ÷ 100) × (raw kcal/100g ÷ cooked kcal/100g) |
| Grains (rice, couscous, pasta) | Cooked, no added fat | 1/4 cup dry | (serving g ÷ 100) × (dry kcal/100g ÷ cooked kcal/100g) |
| Legumes (from dried) | Cooked from dried, no added fat | 1/4 cup dry | same as grains |
| Bread, tortillas | As sold | Sliced bread: 2 oz. Tortillas: 1 medium | serving g ÷ 100 |
| Fruits | **Raw** | **Per unit** (1 medium) if bought individually (apple, banana, kiwi, citrus); **grams** if bought by weight or container (berries) | serving g ÷ 100 |
| Vegetables | **Raw** | **Per unit** if bought individually (1 medium, 1 clove); otherwise 100 g | serving g ÷ 100 |
| Dairy | As sold | Per item (1 cup milk, 1 oz cheese) | serving g ÷ 100 |
| Nuts, seeds | As sold | 1 oz | serving g ÷ 100 |
| Condiments, sweeteners | As sold | 1 tbsp | serving g ÷ 100 |

## 3. Cooked → raw conversion (calorie ratio)

- For prepared groups, select **two records**: the prepared record (supplies every nutrient) and a raw or dry reference record (supplies **calories only**, plus portion weights for volume servings).
- The raw-to-cooked calorie ratio captures the weight change (water gained or lost). The same factor scales every nutrient.
- Raw/dry references come from Foundation or SR Legacy, because FNDDS does not include raw meat or dry grains.
- **Meats: the cooked and raw records must come from the same dataset.** Mixing FNDDS cooked with SR raw gave shrimp a yield above 100%. FNDDS is not used for meats.
- **Sodium for prepared foods comes from the raw/dry record**, scaled to the serving. FNDDS cooked grains and legumes assume salt added during cooking (even "no added fat" versions), and some SR cooked meats include moisture-retaining additives. Kiwi models what you buy, so cooking salt is excluded. Example: lentils show 342 mg per 1/4 cup dry from the cooked record vs about 3 mg dry. _Status: rule adopted; not yet applied to the Sprint 1 dataset. Implement in the automated import._
- **Per-unit servings (`1 unit`) = the average gram weight of one whole item:**
  1. Ignore portions that aren't one whole item: cup, slice, wedge, piece, RACC, and variety sizes like cherry, plum or miniature.
  2. Use the **medium** portion if there is one.
  3. Otherwise use the one whole-item portion ("1 whole", "1 fruit", "1 regular", "1 banana").
  4. Otherwise average the small and large portions.
- Portion weights for existing rows come from SR Legacy first (most complete small/medium/large weights), then FNDDS. Foundation records usually only carry a RACC (reference serving), not unit weights.
- If USDA has no whole-unit weight for a food, use 100 g instead (for example, butternut squash).
- The rule also applies to the existing Nutrient Map rows: `rescaleExisting` in the config recomputes their serving and factor from USDA portion weights, leaving nutrient values unchanged. Output: `data/usda/existing-factor-updates.csv`.
- Gram weights come from the record's USDA portion data (or the label for Branded records). Fixed servings like oz or g are converted directly (1 oz = 28.3495 g).
- Worked example: chicken breast 144 kcal cooked × 0.94 = 135.36 kcal per 4 oz raw.
- Group rules and per-food overrides live in `scripts/usda/foods-to-import.json`.

## 4. Ambiguous foods

- Pick the **most common variety** and the **most common way it is eaten**. Examples: apples raw with skin; tomatoes raw red.
- "Soy Sauce / Tamari" → **soy sauce**.
- Record any judgment call in the import log, with its FDC ID.

## 5. Target nutrients and units

Values are stored per 100 g in the units below, which match the Nutrient Map CSV. USDA µg values are converted to mg (÷1000).

| Column | FDC nutrient # (verify on first run) | Unit |
|---|---|---|
| Calories | 208 (fallback 958, then 957) | kcal |
| Protein | 203 | g |
| Carbohydrate | 205 | g |
| Fiber | 291 | g |
| Lipids | 204 | g |
| Omega-3 (ALA) | 851 (FNDDS: 619) | g |
| Omega-6 (linoleic) | 675 (FNDDS: 618) | g |
| Vit. A (RAE) | 320 | mg |
| Vit. E (alpha-tocopherol) | 323 | mg |
| Vit. K (phylloquinone) | 430 | mg |
| B1 Thiamin | 404 | mg |
| B2 Riboflavin | 405 | mg |
| B3 Niacin | 406 | mg |
| B6 | 415 | mg |
| B9 Folate (DFE) | 435 | mg |
| B12 | 418 | mg |
| Vit. C | 401 | mg |
| Choline | 421 | mg |
| Sodium | 307 | mg |
| Potassium | 306 | mg |
| Calcium | 301 | mg |
| Phosphorus | 305 | mg |
| Magnesium | 304 | mg |
| Iron | 303 | mg |
| Zinc | 309 | mg |
| Copper | 312 | mg |
| Selenium | 317 | mg |

Out of scope for now: vitamin D, price.

## 6. Validation

- **Missing values are stored as 0** in the merged dataset (`kiwi-foods.csv`). This is a Sprint 1 decision. A blank in the source bank can mean a true zero (carbs in meat) or untracked data (protein in bananas). Backfilling real values from USDA is a future improvement.

- Calories within ±20% of 4·protein + 4·carbs + 9·fat. Flag anything outside this.
  - Known exceptions (accepted after review): high-fiber or acidic fruits (citrus, berries), whose fiber and organic acids carry fewer calories than standard carbs; vinegar (calories from acetic acid); alcohol and sugar alcohols.
- Check `portions_on_record` in `import-log.csv` to confirm each serving matched a sensible portion. If none fits, set `servingGrams` on the food.
- No duplicate food names. Every row keeps its source `fdc_id`, `data_type` and description.

## Running the import

```bash
# add FDC_API_KEY=... to .env (free: https://api.data.gov/signup)
node --env-file=.env scripts/usda/1-search.mjs   # -> data/usda/candidates.csv (review the x marks)
node --env-file=.env scripts/usda/2-build.mjs    # -> new-foods-100g.csv, new-foods-serving.csv, import-log.csv
```
