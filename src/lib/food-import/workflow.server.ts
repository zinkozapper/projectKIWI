// AI food import workflow (server side). Level 1 DFD: README "AI food workflow".
//   1. search   – user's request → USDA search → rules rank candidates → Claude picks 3–5 options / asks a question
//   2. add      – user picks an option → rules compute serving, sodium, cross-check (with the raw/dry record) →
//                 Claude names, categorizes, tags flavor and picks pairings from the catalog → food + pairings saved
// Every step is logged on public.food_import_request.
import { getRequest } from '@tanstack/react-start/server';
import { adminClient } from './env.server';
import { askClaude } from './claude.server';
import { fdcDetail, searchFdc } from './usda.server';
import { priceNewFood, type PricingOutcome } from './price.server';
import {
  EXCLUDE_PREPARED, FLAVOR_TAGS, FOOD_GROUPS, GROUP_RULES, NUTRIENT_COLUMNS, SERVING_CHOICES,
  cleanFlavorTags, computeFood, isFoodGroup, isServingChoice, legacyNutrition, median, pickRawReference, rankCandidates, servingColumns,
  type Candidate, type DataType, type FdcFood, type FoodGroup,
} from './rules';
import { FOOD_LIMIT_STEP, HOW_BOUGHT, type AddResult, type FinderStatus, type HowBought, type SearchResult } from './shared';
import type { Json } from '@/integrations/supabase/types';

type Caller = { id: string; isAdmin: boolean };

class UserError extends Error {}
export const isUserError = (e: unknown): e is UserError => e instanceof UserError;

const clip = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------- Auth & quota ----------

async function caller(): Promise<Caller> {
  const header = getRequest()?.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new UserError('Please sign in again to add foods.');
  const db = await adminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new UserError('Your session expired. Please sign in again.');
  const { data: adminRow } = await db.from('app_admin').select('user_id').eq('user_id', data.user.id).maybeSingle();
  return { id: data.user.id, isAdmin: !!adminRow };
}

async function statusFor(who: Caller): Promise<FinderStatus> {
  const db = await adminClient();
  const [{ count }, { data: quota }, { count: pending }] = await Promise.all([
    db.from('food').select('food_id', { count: 'exact', head: true }).eq('added_by', who.id),
    db.from('user_food_quota').select('food_limit').eq('user_id', who.id).maybeSingle(),
    db.from('food_import_request').select('request_id', { count: 'exact', head: true }).eq('user_id', who.id).eq('kind', 'quota').eq('status', 'pending_admin'),
  ]);
  const added = count ?? 0;
  const limit = who.isAdmin ? null : (quota?.food_limit ?? FOOD_LIMIT_STEP);
  return { isAdmin: who.isAdmin, added, limit, remaining: limit == null ? null : Math.max(0, limit - added), quotaPending: (pending ?? 0) > 0 };
}

function assertUnderLimit(s: FinderStatus) {
  if (s.remaining !== null && s.remaining <= 0) {
    throw new UserError(`You’ve added ${s.added} foods, your current limit. Ask an admin to approve ${FOOD_LIMIT_STEP} more.`);
  }
}

type RequestRow = { request_id: number; user_id: string; status: string; query: string; how_bought: string | null; notes: string | null; rounds: Json; raw_fdc_id: number | null; chosen_fdc_id: number | null };

async function loadRequest(id: number, who: Caller): Promise<RequestRow> {
  const db = await adminClient();
  const { data } = await db.from('food_import_request').select('request_id,user_id,status,query,how_bought,notes,rounds,raw_fdc_id,chosen_fdc_id').eq('request_id', id).maybeSingle();
  if (!data) throw new UserError('That request no longer exists.');
  const own = data.user_id === who.id;
  if (!own && !who.isAdmin) throw new UserError('That request belongs to someone else.');
  const workable = data.status === 'open' || (who.isAdmin && data.status === 'pending_admin');
  if (!workable) throw new UserError(`That request is already ${data.status.replace('_', ' ')}.`);
  return data as RequestRow;
}

type Round = { at: string; query: string; answer?: string; candidates: Candidate[]; options: SearchResult['options']; group: FoodGroup; followUpQuestion: string | null; noGoodMatch: boolean };
const roundsOf = (r: RequestRow) => (Array.isArray(r.rounds) ? (r.rounds as unknown as Round[]) : []);

async function catalog() {
  const db = await adminClient();
  const { data, error } = await db.from('food').select('food_id,food_name,food_group,flavor_profile,emoji,cook_ratio').order('food_id');
  if (error) throw error;
  return data || [];
}

// ---------- Step 1: search ----------

type RankAnswer = {
  group: string;
  options: { fdcId: number; label: string; reason: string; serving: string }[];
  followUpQuestion?: string | null;
  noGoodMatch?: boolean;
};

const RANK_SYSTEM = `You help shoppers add a grocery food to Kiwi, a nutrition-aware grocery planner. You are given the shopper's request and candidate records from USDA FoodData Central (already filtered and ordered by how many nutrients each record has). Choose the records that best match what the shopper buys.

Rules (Kiwi's record-selection spec):
- Only choose fdcIds from the candidate list. Never invent records or nutrient values.
- Prefer records with more nutrients (higher coverage) when they match equally well; FNDDS ("Survey") records usually have the most.
- Meat, poultry and seafood: choose a COOKED record with NO added fat (steamed, boiled, roasted, baked, broiled), never fried or breaded.
- Grains, pasta and dried beans/lentils: choose a COOKED record with no added fat (Kiwi converts it back to the dry amount you buy).
- Fruits and vegetables: choose RAW. Pick the most common variety and the way it's most commonly eaten (e.g. apples raw with skin).
- Packaged/processed products (frozen mixes, protein bars, sauces): Branded records are fine; pick a generic, widely sold product.
- group: one of ${FOOD_GROUPS.join(', ')}.
- serving: what one purchase unit should be, one of: ${SERVING_CHOICES.join(', ')}. Meat/seafood "4 oz"; grains/legumes "1/4 cup"; produce bought individually (apple, banana, onion, avocado) "1 unit"; produce bought by weight or container (berries, greens) "100 g"; garlic "1 clove"; bread "2 oz" or tortillas "1 unit"; cheese/nuts "1 oz"; milk "1 cup"; oils, sauces, sweeteners "1 tbsp".
- label: a short, plain food name for the option (e.g. "Brown lentils", "Gala apple"), max 40 characters.
- reason: one short line on why this record fits (e.g. "Most complete record; cooked without fat").
- Return 3–5 options, best first. If the request is ambiguous in a way that changes the record (e.g. "beans": which kind?), also ask ONE short followUpQuestion. If nothing in the list is the requested food, return no options and set noGoodMatch to true.`;

const RANK_TOOL = {
  name: 'choose_usda_records',
  description: 'Return the best USDA records for the shopper to choose from.',
  input_schema: {
    type: 'object',
    properties: {
      group: { type: 'string', enum: [...FOOD_GROUPS] },
      options: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            fdcId: { type: 'integer' },
            label: { type: 'string' },
            reason: { type: 'string' },
            serving: { type: 'string', enum: [...SERVING_CHOICES] },
          },
          required: ['fdcId', 'label', 'reason', 'serving'],
        },
      },
      followUpQuestion: { type: ['string', 'null'] },
      noGoodMatch: { type: 'boolean' },
    },
    required: ['group', 'options', 'noGoodMatch'],
  },
};

export type SearchInput = { query: string; howBought: HowBought; notes?: string; requestId?: number; answer?: string };

export async function search(input: SearchInput): Promise<SearchResult> {
  const who = await caller();
  const status = await statusFor(who);
  assertUnderLimit(status);
  const db = await adminClient();

  const query = clip(input.query, 80);
  const answer = clip(input.answer, 200);
  const notes = clip(input.notes, 300);
  if (query.length < 2) throw new UserError('Type the food you’d like to add.');
  const howBought = HOW_BOUGHT.some(h => h.id === input.howBought) ? input.howBought : 'not_sure';

  let request: RequestRow;
  if (input.requestId) {
    request = await loadRequest(input.requestId, who);
  } else {
    const { data, error } = await db.from('food_import_request')
      .insert({ user_id: who.id, query, how_bought: howBought, notes: notes || null })
      .select('request_id,user_id,status,query,how_bought,notes,rounds,raw_fdc_id,chosen_fdc_id').single();
    if (error) throw error;
    request = data as RequestRow;
  }

  // Already in the catalog? Offer it instead of a duplicate.
  const foods = await catalog();
  const q = norm(query);
  const existing = foods
    .filter(f => { const n = norm(f.food_name); return n === q || n.includes(q) || (q.includes(n) && n.length >= 4); })
    .slice(0, 4)
    .map(f => ({ id: String(f.food_id), name: f.food_name }));

  const searchText = answer ? `${query} ${answer}` : query;
  const types: DataType[] = howBought === 'packaged' ? ['Branded', 'Survey (FNDDS)', 'SR Legacy'] : ['Survey (FNDDS)', 'Foundation', 'SR Legacy'];
  const hits = await searchFdc(searchText, types, 30);
  const candidates = rankCandidates(hits.filter(h => !EXCLUDE_PREPARED.some(t => h.description.toLowerCase().includes(t))), null, 12);

  let ai: RankAnswer = { group: 'other', options: [], followUpQuestion: null, noGoodMatch: true };
  if (candidates.length) {
    const howLabel = HOW_BOUGHT.find(h => h.id === howBought)?.label ?? 'Not sure';
    const lines = candidates.map(c => `${c.fdcId} | ${c.description}${c.brand ? ` (${c.brand})` : ''} | ${c.dataType} | ${c.coverage}/27 nutrients | ${Math.round(c.kcal ?? 0)} kcal/100 g`);
    const prior = roundsOf(request).map(r => `- searched "${r.query}"${r.answer ? ` (answer: ${r.answer})` : ''}`).join('\n');
    ai = await askClaude<RankAnswer>({
      system: RANK_SYSTEM,
      tool: RANK_TOOL,
      prompt: `Shopper wants to add: "${query}"\nHow they buy it: ${howLabel}${notes ? `\nNotes: ${notes}` : ''}${answer ? `\nAnswer to your earlier question: ${answer}` : ''}${prior ? `\nEarlier in this request:\n${prior}` : ''}\n\nCandidates (fdcId | description | dataset | coverage | energy):\n${lines.join('\n')}`,
    });
  }

  const group: FoodGroup = isFoodGroup(ai.group) ? ai.group : 'other';
  const byId = new Map(candidates.map(c => [c.fdcId, c]));
  const seen = new Set<number>();
  const options = (ai.options || [])
    .filter(o => byId.has(Number(o.fdcId)) && !seen.has(Number(o.fdcId)) && seen.add(Number(o.fdcId)))
    .slice(0, 5)
    .map(o => {
      const c = byId.get(Number(o.fdcId))!;
      return {
        fdcId: c.fdcId,
        label: clip(o.label, 40) || c.description,
        reason: clip(o.reason, 140),
        serving: isServingChoice(o.serving) ? o.serving : GROUP_RULES[group].serving,
        description: c.description,
        dataType: c.dataType,
        brand: c.brand,
        coverage: c.coverage,
      };
    });
  const followUpQuestion = clip(ai.followUpQuestion, 160) || null;
  const noGoodMatch = !options.length;

  const round: Round = { at: new Date().toISOString(), query, ...(answer ? { answer } : {}), candidates, options, group, followUpQuestion, noGoodMatch };
  await db.from('food_import_request')
    .update({ rounds: [...roundsOf(request), round] as unknown as Json, updated_at: new Date().toISOString() })
    .eq('request_id', request.request_id);

  return { requestId: request.request_id, group, groupLabel: GROUP_RULES[group].label, options, followUpQuestion, noGoodMatch, existing, status };
}

// ---------- Step 2: add ----------

type EnrichAnswer = { name: string; description: string; emoji: string; categoryId: number; flavorTags: string[]; pairIds: number[]; groceryTerm?: string; groceryMust?: string[] };

const ENRICH_SYSTEM = `You catalog a new grocery food for Kiwi, a nutrition-aware grocery planner. Given the USDA record the shopper chose and Kiwi's existing catalog, return:
- name: the plain grocery name a shopper would search for (max 40 characters, no USDA jargon like "NFS" or "from dried").
- description: one short line (max 90 characters) on what it is or how it's commonly used.
- emoji: a single emoji that best represents the food.
- categoryId: the best matching category id from the list.
- flavorTags: 2–4 tags describing its flavor profile, only from: ${FLAVOR_TAGS.join(', ')}.
- pairIds: 3–6 ids of catalog foods that pair well with it in everyday meals (flavor and meal compatibility). Only use ids from the catalog list; never the food itself.
- groceryTerm: what to type into a grocery store's search box to find this food as it is bought (2–5 words, plain store wording, e.g. "boneless skinless chicken thighs", "dry red lentils", "frozen mixed berries"). Not organic, no brand names.
- groceryMust: 1–2 words that any correct product's name must contain (e.g. ["thigh"], ["lentil"], ["berry|berries"]); use "a|b" when either spelling works.`;

const ENRICH_TOOL = {
  name: 'catalog_food',
  description: 'Name, categorize, tag and pair the new food.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      emoji: { type: 'string' },
      categoryId: { type: 'integer' },
      flavorTags: { type: 'array', items: { type: 'string', enum: [...FLAVOR_TAGS] }, maxItems: 4 },
      pairIds: { type: 'array', items: { type: 'integer' }, maxItems: 6 },
      groceryTerm: { type: 'string' },
      groceryMust: { type: 'array', items: { type: 'string' }, maxItems: 2 },
    },
    required: ['name', 'description', 'emoji', 'categoryId', 'flavorTags', 'pairIds', 'groceryTerm'],
  },
};

async function rawReferenceFor(record: FdcFood, group: FoodGroup) {
  const rule = GROUP_RULES[group];
  if (rule.mode !== 'prepared') return null;
  const core = norm(record.description.split(',')[0] ?? '').replace(/s$/, '');
  const hits = await searchFdc(`${record.description.split(',')[0]} ${rule.rawSearch ?? 'raw'}`, ['SR Legacy', 'Foundation'], 25);
  const pick = pickRawReference(hits.filter(h => norm(h.description).includes(core)), record, group);
  return pick ? fdcDetail(pick.fdcId) : null; // details include portion weights
}

function groupMedianRatio(foods: Awaited<ReturnType<typeof catalog>>, group: FoodGroup) {
  return median(foods.filter(f => f.food_group === group && f.cook_ratio != null).map(f => Number(f.cook_ratio)));
}

const SUMMARY_NUTRIENTS: [string, string, string][] = [
  ['calories_kcal', 'Calories', 'kcal'], ['protein_g', 'Protein', 'g'], ['carbohydrate_g', 'Carbs', 'g'], ['fat_g', 'Fat', 'g'],
  ['fiber_g', 'Fiber', 'g'], ['sodium_mg', 'Sodium', 'mg'],
];

export type AddInput = { requestId: number; fdcId: number; group: FoodGroup; serving: string };

// Step 2 + 3 in one call: the user picked a USDA option, so everything else is automatic.
// Rules compute the serving, sodium and cross-check; Claude names, categorizes, tags and pairs; then it's saved.
export async function add(input: AddInput): Promise<AddResult> {
  const who = await caller();
  assertUnderLimit(await statusFor(who));
  const request = await loadRequest(input.requestId, who);
  const offered = roundsOf(request).some(r => r.candidates?.some(c => c.fdcId === input.fdcId));
  if (!offered) throw new UserError('Pick one of the options from your search.');
  const group = isFoodGroup(input.group) ? input.group : 'other';
  const serving = isServingChoice(input.serving) ? input.serving : GROUP_RULES[group].serving;

  const db = await adminClient();
  const [record, foods, { data: cats }] = await Promise.all([fdcDetail(input.fdcId), catalog(), db.from('food_category').select('food_category_id,category_description').order('food_category_id')]);
  const raw = await rawReferenceFor(record, group);
  let computed;
  try {
    computed = computeFood({ group, serving, record, raw, groupMedianRatio: groupMedianRatio(foods, group) });
  } catch (e) {
    throw new UserError(e instanceof Error ? e.message : 'That record can’t be used.');
  }

  // AI step: name, category, flavor profile (fixed vocabulary) and pairings (existing foods only).
  const categories = (cats || []).map(c => ({ id: c.food_category_id, name: c.category_description }));
  const catalogLines = foods.map(f => `${f.food_id} | ${f.food_name} | ${f.food_group ?? ''}${f.flavor_profile?.length ? ` | ${f.flavor_profile.join(' ')}` : ''}`);
  const ai = await askClaude<EnrichAnswer>({
    system: ENRICH_SYSTEM,
    tool: ENRICH_TOOL,
    prompt: `Shopper asked for: "${request.query}"\nChosen USDA record: ${record.description} (${record.dataType})\nGroup: ${GROUP_RULES[group].label}\n\nCategories (id | name):\n${categories.map(c => `${c.id} | ${c.name}`).join('\n')}\n\nCatalog (id | name | group | flavor tags):\n${catalogLines.join('\n')}`,
  });

  const name = clip(ai.name, 60) || clip(record.description.split(',')[0], 60);
  const byName = foods.find(f => f.food_name.toLowerCase() === name.toLowerCase());
  if (byName) {
    // Same food already in the catalog: use it instead of adding a duplicate.
    const { data: food } = await db.from('food').select('*, food_category(category_description)').eq('food_id', byName.food_id).single();
    await db.from('food_import_request').update({ status: 'cancelled', food_id: byName.food_id, chosen_fdc_id: record.fdcId, updated_at: new Date().toISOString() }).eq('request_id', request.request_id);
    if (!food) throw new UserError(`“${name}” is already in Kiwi.`);
    return { food, status: await statusFor(who), alreadyExisted: true, summary: null };
  }

  const ids = new Set(foods.map(f => f.food_id));
  const pairIds = [...new Set((ai.pairIds || []).map(Number).filter(id => ids.has(id)))].slice(0, 6);
  const categoryId = categories.some(c => c.id === Number(ai.categoryId)) ? Number(ai.categoryId) : categories[categories.length - 1]?.id ?? null;
  const flavorTags = cleanFlavorTags(ai.flavorTags);
  const { serving_size, unit } = servingColumns(computed.serving);

  // Store price (Kroger, docs/kroger-price-selection-rules.md): the AI's grocery search term + the same
  // selection rules as the backfill. Runs before the insert so food.price is set; never blocks adding the food.
  const pricing: PricingOutcome = await priceNewFood({
    food_name: name,
    food_category_id: categoryId,
    serving_size,
    unit,
    serving_grams: computed.servingGrams,
    search: { term: clip(ai.groceryTerm, 60) || name, must: (ai.groceryMust || []).map(t => clip(t, 30)).filter(Boolean).slice(0, 2) },
  }, who.id);

  const row = {
    food_name: name,
    food_description: clip(ai.description, 120),
    emoji: Array.from(String(ai.emoji || '')).slice(0, 2).join('') || '🥗',
    food_category_id: categoryId,
    serving_size,
    unit,
    factor: computed.factor,
    price: pricing.defaultPrice ?? 0,
    source: `USDA FDC ${record.dataType} (AI food finder)`,
    fdc_id: record.fdcId,
    raw_fdc_id: raw?.fdcId ?? null,
    food_group: group,
    cook_ratio: computed.cookRatio,
    flavor_profile: flavorTags,
    pairs: pairIds,
    nutrition: legacyNutrition(computed.perServing),
    needs_review: computed.needsReview,
    review_notes: computed.flags.length ? computed.flags.map(f => f.message).join(' ') : null,
    added_by: who.id,
    ...Object.fromEntries(NUTRIENT_COLUMNS.map(([col]) => [col, computed.per100[col]])),
  };

  const { data: food, error } = await db.from('food').insert(row).select('*, food_category(category_description)').single();
  if (error) {
    if (error.code === '23505') throw new UserError(`“${name}” is already in Kiwi.`);
    throw error;
  }

  if (pricing.rows.length) {
    const { error: priceError } = await db.from('food_price').upsert(pricing.rows.map(r => ({ ...r, food_id: food.food_id })), { onConflict: 'food_id,location_id' });
    if (priceError) console.error('[food-import] saving price', priceError);
  }

  // Pairings go both ways so the partner foods suggest the new one too.
  if (pairIds.length) {
    const { data: partners } = await db.from('food').select('food_id,pairs').in('food_id', pairIds);
    await Promise.all((partners || []).map(p => (p.pairs.includes(food.food_id) ? null : db.from('food').update({ pairs: [...p.pairs, food.food_id] }).eq('food_id', p.food_id))));
  }

  await db.from('food_import_request').update({
    status: 'added',
    food_id: food.food_id,
    chosen_fdc_id: record.fdcId,
    raw_fdc_id: raw?.fdcId ?? null,
    updated_at: new Date().toISOString(),
    ...(request.user_id !== who.id ? { resolved_by: who.id, resolved_at: new Date().toISOString() } : {}),
  }).eq('request_id', request.request_id);

  const nameOf = new Map(foods.map(f => [f.food_id, f.food_name]));
  return {
    food,
    status: await statusFor(who),
    alreadyExisted: false,
    summary: {
      serving: computed.serving,
      servingGrams: computed.servingGrams,
      nutrients: SUMMARY_NUTRIENTS.map(([key, label, unitLabel]) => ({ key, label, unit: unitLabel, value: computed.perServing[key as keyof typeof computed.perServing] })),
      flavorTags,
      pairs: pairIds.map(id => nameOf.get(id) ?? '').filter(Boolean),
      needsReview: computed.needsReview,
      source: `USDA ${record.dataType}: ${record.description}`,
      price: pricing.forUser,
      priceNote: pricing.note,
    },
  };
}

// ---------- Hand-offs ----------

export async function submitToAdmin(input: { requestId: number; note?: string }) {
  const who = await caller();
  const request = await loadRequest(input.requestId, who);
  const note = clip(input.note, 300);
  const db = await adminClient();
  await db.from('food_import_request').update({
    status: 'pending_admin',
    notes: [request.notes, note].filter(Boolean).join(' — ') || null,
    updated_at: new Date().toISOString(),
  }).eq('request_id', request.request_id);
  return { ok: true };
}

export async function cancel(input: { requestId: number }) {
  const who = await caller();
  const request = await loadRequest(input.requestId, who);
  if (request.status !== 'open') return { ok: true }; // admins don't cancel someone's queued request from the finder
  const db = await adminClient();
  await db.from('food_import_request').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('request_id', request.request_id);
  return { ok: true };
}

export async function requestMoreFoods(input: { note?: string }) {
  const who = await caller();
  const status = await statusFor(who);
  if (status.isAdmin) return status;
  if (!status.quotaPending) {
    const db = await adminClient();
    await db.from('food_import_request').insert({
      user_id: who.id,
      kind: 'quota',
      status: 'pending_admin',
      query: `${FOOD_LIMIT_STEP} more foods`,
      notes: clip(input.note, 300) || null,
    });
  }
  return statusFor(who);
}

export async function getStatus() {
  return statusFor(await caller());
}
