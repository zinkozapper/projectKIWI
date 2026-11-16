// Purchase styles from the shelf: instead of the AI imagining how a food is sold (and Kroger then matching
// whatever contains the word — "frozen kale" -> a frittata), we search the store first and the AI sorts the
// products it actually finds into styles (Fresh, Frozen, Canned …), leaving out anything that isn't the food.
// Each style keeps its member products, so its price and its package sizes come from those same products.
// Pure (no network) so the add-food workflow and scripts/kroger/styles-backfill.mjs share it.
import { RULES, rankCandidates, type Candidate, type Scored } from './pricing.ts';
import { DRAINED_YIELD, FORM_LABELS, PURCHASE_FORMS, optionPriceFood, type PurchaseForm, type PurchaseOption, type ServingInfo } from './purchase-options.ts';

export const MAX_STYLES = 4;
const MAX_PRODUCTS = 40;

export type ShelfProduct = Candidate & { key: number };

const clip = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lc = (s: unknown) => String(s ?? '').toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isForm = (s: unknown): s is PurchaseForm => (PURCHASE_FORMS as readonly string[]).includes(String(s));

/**
 * The word every product must contain: from the first must word (its plural spelling when it lists one, which
 * also searches better: "blueberries", not "blueberry"), else the name's last word.
 */
export function coreWord(foodName: string, must: string[] = []): string {
  const alts = (must[0] ?? '').split('|').map(a => a.trim().toLowerCase()).filter(Boolean);
  const fromMust = alts.find(a => a.endsWith('s')) ?? alts[0];
  if (fromMust) return fromMust;
  const words = lc(foodName).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  return words[words.length - 1] ?? '';
}

/** Singular and plural spellings of a word: blueberry / blueberries, peaches / peach, grapes / grape. */
export function spellings(word: string): string[] {
  const w = word.toLowerCase(), out = new Set([w]);
  if (w.endsWith('ies')) out.add(`${w.slice(0, -3)}y`);
  if (w.endsWith('y')) out.add(`${w.slice(0, -1)}ies`);
  if (w.endsWith('es')) out.add(w.slice(0, -2));
  if (w.endsWith('s')) out.add(w.slice(0, -1));
  return [...out].filter(Boolean);
}

/** Store searches that show the food's whole shelf: the usual term, the plain word, and the frozen/canned/dried aisles. */
export function styleSearchTerms(term: string, core: string): string[] {
  const t = [term, core, `frozen ${core}`, `canned ${core}`, `dried ${core}`].map(s => s.trim().toLowerCase()).filter(Boolean);
  return [...new Set(t)];
}

/**
 * Products to show the AI: one row per product, from every search (taken in turns so each aisle is represented),
 * whose name has the core word (plural endings allowed), with a regular price, and not an always-excluded item.
 */
export function shelfProducts(core: string, lists: Candidate[][], max = MAX_PRODUCTS): ShelfProduct[] {
  const word = new RegExp(`(^|[^a-z0-9])(${spellings(core).map(escape).join('|')})(s|es)?($|[^a-z0-9])`, 'i');
  const always = RULES.excludeAlways.map(lc);
  const ok = (c: Candidate) => Number(c.regular) > 0 && word.test(c.description) && !always.some(x => lc(c.description).includes(x));
  const seen = new Set<string>(), out: ShelfProduct[] = [];
  const longest = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < longest && out.length < max; i++) {
    for (const list of lists) {
      const c = list[i];
      if (!c || seen.has(c.product_id) || !ok(c)) continue;
      seen.add(c.product_id);
      out.push({ ...c, key: out.length });
      if (out.length >= max) break;
    }
  }
  return out;
}

// ---------- AI step ----------
export const STYLES_SYSTEM = `You help Kiwi, a nutrition-aware grocery planner. You get one food and the products a grocery store returned when searching for it. Sort the products into the purchase styles a shopper chooses between, using only what is actually on this list. Rules:
- First drop every product that is not this food itself: dishes, meals, mixes, desserts, sauces, snacks or drinks that merely contain it (for kale: drop frittatas and salad kits; for lemon: drop sorbet and lemonade), and different foods with a similar name.
- A style is a way the food itself is sold: fresh/raw, frozen, canned, dried, or ready to eat (cooked, shredded, sliced, pre-cut). At most one style per form, at most 4 styles, each with at least one product key from the list. Never invent a style the list doesn't show.
- Put the style Kiwi's nutrition is based on first (usually fresh/raw, or dried for dry grains and beans).
- If every good product is sold the same way, return that single style.
- label: 1–2 plain everyday words ("Fresh", "Frozen", "Canned", "Dried", "Shredded", "Cooked"), max 20 characters, no jargon.
- term: a 2–4 word store search that finds this style again later (e.g. "frozen broccoli florets").
- basis: "as_bought" when it is bought raw/dry like Kiwi's serving (fresh, frozen raw, dried); "prepared" when it is already cooked or ready to eat (canned beans or meat, rotisserie, cooked rice cups).
- drained: true only for canned foods packed in liquid that is poured off (beans, vegetables, tuna).
- eachGrams: only when products of this style are sold per item with no weight on the label: edible grams in one item.`;

export const STYLES_TOOL = {
  name: 'purchase_styles',
  description: 'Sort the store products into the purchase styles of this food.',
  input_schema: {
    type: 'object',
    properties: {
      styles: {
        type: 'array',
        maxItems: MAX_STYLES,
        items: {
          type: 'object',
          properties: {
            form: { type: 'string', enum: [...PURCHASE_FORMS] },
            label: { type: 'string' },
            term: { type: 'string' },
            basis: { type: 'string', enum: ['as_bought', 'prepared'] },
            drained: { type: 'boolean' },
            eachGrams: { type: 'number' },
            keys: { type: 'array', items: { type: 'integer' } },
          },
          required: ['form', 'label', 'term', 'basis', 'keys'],
        },
      },
    },
    required: ['styles'],
  },
} as const;

export function stylesPrompt(foodName: string, servingText: string, products: ShelfProduct[]): string {
  const rows = products.map(p => `${p.key}. ${[p.brand, p.description].filter(Boolean).join(' · ')} | ${p.size || p.sold_by || '?'} | $${Number(p.regular).toFixed(2)} | aisle: ${p.categories || '?'}`);
  return `Food: ${foodName}\nKiwi's serving: ${servingText}\nProducts:\n${rows.join('\n')}`;
}

export type AiStyle = { form?: unknown; label?: unknown; term?: unknown; basis?: unknown; drained?: unknown; eachGrams?: unknown; keys?: unknown };
export type Style = { option: PurchaseOption; members: ShelfProduct[] };

/** Clean the AI's styles: known forms, one per form, only keys from the list, each product in one style, max 4. */
export function cleanStyles(raw: unknown, products: ShelfProduct[], foodName: string, core: string): Style[] {
  const list = Array.isArray(raw) ? (raw as AiStyle[]) : [];
  const used = new Set<number>(), forms = new Set<string>(), out: Style[] = [];
  for (const s of list) {
    if (out.length >= MAX_STYLES) break;
    if (!s || !isForm(s.form) || forms.has(s.form)) continue;
    const keys = (Array.isArray(s.keys) ? s.keys : []).map(Number).filter(k => Number.isInteger(k) && !used.has(k));
    const members = keys.map(k => products.find(p => p.key === k)).filter((p): p is ShelfProduct => !!p);
    if (!members.length) continue;
    members.forEach(m => used.add(m.key));
    forms.add(s.form);
    out.push({
      option: {
        form: s.form,
        label: clip(s.label, 20) || FORM_LABELS[s.form],
        search_term: clip(s.term, 60) || `${s.form === 'fresh' ? '' : `${FORM_LABELS[s.form]} `}${foodName}`.trim().toLowerCase(),
        must: core ? [core] : [],
        basis: s.basis === 'prepared' ? 'prepared' : 'as_bought',
        package_yield: s.drained === true && s.form === 'canned' ? DRAINED_YIELD : 1,
        unit_grams: Number(s.eachGrams) > 0 && Number(s.eachGrams) < 5000 ? Math.round(Number(s.eachGrams)) : null,
        sort_order: out.length,
      },
      members,
    });
  }
  return out;
}

/**
 * Price one style from its own products with the usual rules (store brand first, then the lowest price per
 * serving, organic only if nothing else). The AI already picked the products, so the aisle and food-group
 * filters don't apply again (a relaxed spec); scored members also feed the package sizes (sizeCandidates).
 */
export function priceStyle(serving: ServingInfo, style: Style): { food: ReturnType<typeof optionPriceFood>; best: Scored | undefined; scored: Scored[] } {
  const food = optionPriceFood(serving, style.option);
  const { best, scored } = rankCandidates(food, style.members, { label: 'primary', relaxed: true });
  return { food, best, scored };
}
