import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FdcFood } from './rules';

// ---------- In-memory stand-in for the Supabase service-role client ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows keep the fake small
type Row = any;
type Tables = 'food' | 'food_category' | 'food_import_request' | 'app_admin' | 'user_food_quota' | 'food_price';
const db = {} as Partial<Record<Tables, Row[]>> & Record<string, Row[] | undefined>;
let nextId: Partial<Record<string, number>> = {};
const pk: Partial<Record<string, string>> = { food: 'food_id', food_import_request: 'request_id', food_category: 'food_category_id' };

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  let payload: Row = {};
  let head = false;
  let count = false;
  const api = {
    select(_cols?: string, opts?: { count?: string; head?: boolean }) { if (opts?.head) head = true; if (opts?.count) count = true; return api; },
    insert(row: Row) { op = 'insert'; payload = row; return api; },
    update(row: Row) { op = 'update'; payload = row; return api; },
    upsert(row: Row) { op = 'upsert'; payload = row; return api; },
    eq(col: string, v: unknown) { filters.push(r => r[col] === v); return api; },
    in(col: string, vs: unknown[]) { filters.push(r => vs.includes(r[col])); return api; },
    ilike(col: string, v: string) { filters.push(r => String(r[col]).toLowerCase() === v.toLowerCase()); return api; },
    order() { return api; },
    run() {
      const rows: Row[] = (db[table] ||= []);
      if (op === 'upsert') { const list = Array.isArray(payload) ? payload : [payload]; rows.push(...list); return { data: list, error: null }; }
      if (op === 'insert') {
        const key = pk[table];
        const row: Row = { status: 'open', kind: 'food', rounds: [], raw_fdc_id: null, chosen_fdc_id: null, pairs: [], ...payload };
        if (key && row[key] == null) row[key] = (nextId[table] = (nextId[table] ?? 100) + 1);
        if (table === 'food' && rows.some(r => String(r.food_name).toLowerCase() === String(row.food_name).toLowerCase())) return { data: null, error: { code: '23505', message: 'dupe' } };
        if (table === 'food') row.food_category = { category_description: 'Proteins & Seafood' };
        rows.push(row);
        return { data: [row], error: null };
      }
      const hit = rows.filter(r => filters.every(f => f(r)));
      if (op === 'update') { hit.forEach(r => Object.assign(r, payload)); return { data: hit, error: null }; }
      return { data: head ? null : hit, error: null, count: count ? hit.length : null };
    },
    single() { const r = api.run(); return Promise.resolve({ ...r, data: (r.data as Row[] | null)?.[0] ?? null }); },
    maybeSingle() { return api.single(); },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(api.run()).then(res, rej); },
  };
  return api;
}

let currentUser = 'user-1';
const fakeClient = {
  from: (t: string) => query(t),
  auth: { getUser: async (token: string) => (token === 'good' ? { data: { user: { id: currentUser } }, error: null } : { data: { user: null }, error: new Error('bad') }) },
};

vi.mock('./env.server', () => ({ adminClient: async () => fakeClient }));
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => ({ headers: new Headers({ authorization: 'Bearer good' }) }) }));

// ---------- USDA + Claude stand-ins ----------
const n = (number: string, value: number, unitName = 'G') => ({ nutrientNumber: number, value, unitName });
const records: Record<number, FdcFood> = {
  1: { fdcId: 1, description: 'Lentils, from dried, no added fat', dataType: 'Survey (FNDDS)', foodNutrients: [n('208', 115, 'KCAL'), n('203', 9), n('205', 20), n('204', 0.4), n('307', 238, 'MG')] },
  2: { fdcId: 2, description: 'Lentils, from dried, fat added', dataType: 'Survey (FNDDS)', foodNutrients: [n('208', 166, 'KCAL')] },
  3: { fdcId: 3, description: 'Lentils, raw', dataType: 'SR Legacy', foodNutrients: [n('208', 352, 'KCAL'), n('307', 6, 'MG')], foodPortions: [{ amount: 1, modifier: 'cup', measureUnit: { name: 'undetermined' }, gramWeight: 192 }] },
  4: { fdcId: 4, description: 'Apricots, raw', dataType: 'SR Legacy', foodNutrients: [n('208', 48, 'KCAL')] },
};
const searchFdc = vi.fn(async (q: string) => (q.includes('raw') ? [records[4]!, records[3]!] : [records[2]!, records[1]!]));
vi.mock('./usda.server', () => ({
  searchFdc: (q: string) => searchFdc(q),
  fdcDetail: async (id: number) => records[id],
  fdcDetails: async (ids: number[]) => ids.map(id => records[id]),
}));
const askClaude = vi.fn();
vi.mock('./claude.server', () => ({ askClaude: (a: unknown) => askClaude(a) }));

// ---------- Kroger pricing stand-in (price.server is tested through kroger.server.test.ts) ----------
const unpriced = { rows: [], defaultPrice: null, forUser: null, note: 'Store prices aren’t set up yet.' };
const priceNewFood = vi.fn();
vi.mock('./price.server', () => ({ priceNewFood: (...a: unknown[]) => priceNewFood(...a) }));

const wf = await import('./workflow.server');

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  nextId = {};
  currentUser = 'user-1';
  db.food = [
    { food_id: 1, food_name: 'Rice', food_category: null, food_group: 'grain', flavor_profile: [], emoji: '🍚', cook_ratio: 2.5, pairs: [], added_by: null },
    { food_id: 2, food_name: 'Garlic', food_group: 'vegetable', flavor_profile: [], emoji: '🧄', cook_ratio: null, pairs: [], added_by: null },
    { food_id: 3, food_name: 'Chickpeas / Garbanzo Beans', food_group: 'legume', flavor_profile: [], emoji: '', cook_ratio: 2.32, pairs: [], added_by: null },
  ];
  db.food_category = [{ food_category_id: 1, category_description: 'Proteins & Seafood' }];
  db.app_admin = [];
  priceNewFood.mockReset();
  priceNewFood.mockResolvedValue(unpriced);
  askClaude.mockReset();
  askClaude
    .mockResolvedValueOnce({ group: 'legume', options: [{ fdcId: 1, label: 'Brown lentils', reason: 'Cooked without fat', serving: '1/4 cup' }, { fdcId: 999, label: 'invented', reason: '', serving: '1 cup' }], followUpQuestion: null, noGoodMatch: false })
    .mockResolvedValueOnce({ name: 'Lentils', description: 'Dried brown lentils', emoji: '🫘', categoryId: 1, flavorTags: ['earthy', 'crunchy'], pairIds: [1, 2, 404], groceryTerm: 'dry brown lentils', groceryMust: ['lentil'] });
});

describe('food import workflow', () => {
  it('adds the chosen option automatically, with serving, sodium, flavor tags and two-way pairings', async () => {
    const s = await wf.search({ query: 'lentils', howBought: 'dry' });
    expect(s.options.map(o => o.fdcId)).toEqual([1]); // fat-added record filtered, invented id dropped
    expect(s.group).toBe('legume');
    const rankPrompt = askClaude.mock.calls[0]![0] as { prompt: string };
    expect(rankPrompt.prompt).not.toContain('fat added');

    const r = await wf.add({ requestId: s.requestId, fdcId: 1, group: 'legume', serving: '1/4 cup' });
    expect(r.alreadyExisted).toBe(false);
    expect(r.summary!.servingGrams).toBe(48); // 1/4 cup measured on the dry record, apricots ignored
    expect(r.summary!.nutrients.find(x => x.key === 'sodium_mg')!.value).toBeCloseTo(2.88, 2);
    expect(r.summary!.flavorTags).toEqual(['earthy']); // "crunchy" isn't in the vocabulary
    expect(r.summary!.pairs).toEqual(['Rice', 'Garlic']); // unknown id 404 dropped

    const food = db.food!.find(f => f.food_name === 'Lentils')!;
    expect(food).toMatchObject({ added_by: 'user-1', raw_fdc_id: 3, pairs: [1, 2], serving_size: 0.25, unit: 'cup', food_group: 'legume' });
    expect(db.food!.find(f => f.food_id === 1)!.pairs).toEqual([food.food_id]);
    expect(r.status.added).toBe(1);
    expect(db.food_import_request![0]!.status).toBe('added');
  });

  it('rejects options that were never offered and reuses a food that already exists', async () => {
    const s = await wf.search({ query: 'lentils', howBought: 'dry' });
    await expect(wf.add({ requestId: s.requestId, fdcId: 4, group: 'legume', serving: '1/4 cup' })).rejects.toThrow(/options/);
    askClaude.mockReset();
    askClaude.mockResolvedValueOnce({ name: 'rice', description: '', emoji: '🍚', categoryId: 1, flavorTags: [], pairIds: [] });
    const r = await wf.add({ requestId: s.requestId, fdcId: 1, group: 'legume', serving: '1/4 cup' });
    expect(r.alreadyExisted).toBe(true);
    expect(r.food.food_id).toBe(1);
    expect(db.food).toHaveLength(3);
  });

  it('enforces the 10-food limit and queues one request for more', async () => {
    for (let i = 0; i < 10; i++) db.food!.push({ food_id: 50 + i, food_name: `f${i}`, added_by: 'user-1', pairs: [] });
    await expect(wf.search({ query: 'lentils', howBought: 'dry' })).rejects.toThrow(/limit/);
    const st = await wf.requestMoreFoods({ note: 'more please' });
    await wf.requestMoreFoods({});
    expect(st.quotaPending).toBe(true);
    expect(db.food_import_request!.filter(r => r.kind === 'quota')).toHaveLength(1);
  });

  it('lets users hand a request to admins, and only admins work on someone else’s request', async () => {
    const s = await wf.search({ query: 'lentils', howBought: 'dry' });
    await wf.submitToAdmin({ requestId: s.requestId, note: 'the black ones' });
    expect(db.food_import_request![0]!.status).toBe('pending_admin');

    currentUser = 'user-2';
    await expect(wf.search({ query: 'lentils', howBought: 'dry', requestId: s.requestId })).rejects.toThrow(/someone else/);
    db.app_admin!.push({ user_id: 'user-2' });
    askClaude.mockResolvedValueOnce({ group: 'legume', options: [{ fdcId: 1, label: 'Lentils', reason: '', serving: '1/4 cup' }], noGoodMatch: false });
    const again = await wf.search({ query: 'black lentils', howBought: 'dry', requestId: s.requestId });
    expect(again.status.limit).toBeNull();
  });

  it('prices the new food at the shopper’s store and saves it', async () => {
    priceNewFood.mockResolvedValueOnce({
      rows: [{ location_id: '70600136', source_location_id: null, product_id: 'p1', upc: null, brand: 'La Preferida', description: 'La Preferida® Lentils (Dry)', package_size: '16 oz', sold_by: 'UNIT', package_price: 1.79, package_grams: 453.6, serving_grams: 48, price_per_serving: 0.1894, store_brand: false, flags: 'no store brand: national brand used' }],
      defaultPrice: 0.19,
      forUser: { zip: '84601', store: 'Smith’s Provo', product: 'La Preferida · La Preferida® Lentils (Dry)', perServing: 0.1894, flags: [] },
      note: null,
    });
    const s = await wf.search({ query: 'lentils', howBought: 'dry' });
    const r = await wf.add({ requestId: s.requestId, fdcId: 1, group: 'legume', serving: '1/4 cup' });

    // AI search term, the computed as-bought grams and the AI's category go to pricing
    expect(priceNewFood).toHaveBeenCalledWith(expect.objectContaining({ food_name: 'Lentils', food_category_id: 1, serving_size: 0.25, unit: 'cup', serving_grams: 48, search: { term: 'dry brown lentils', must: ['lentil'] } }), 'user-1');
    const food = db.food!.find(f => f.food_name === 'Lentils')!;
    expect(food.price).toBe(0.19);
    expect(db.food_price).toEqual([expect.objectContaining({ food_id: food.food_id, location_id: '70600136', price_per_serving: 0.1894 })]);
    expect(r.summary!.price).toMatchObject({ perServing: 0.1894, store: 'Smith’s Provo' });
    expect(r.summary!.priceNote).toBeNull();
  });

  it('still adds the food, unpriced, when no store price is found', async () => {
    const s = await wf.search({ query: 'lentils', howBought: 'dry' });
    const r = await wf.add({ requestId: s.requestId, fdcId: 1, group: 'legume', serving: '1/4 cup' });
    expect(db.food!.find(f => f.food_name === 'Lentils')!.price).toBe(0);
    expect(db.food_price ?? []).toHaveLength(0);
    expect(r.summary!.price).toBeNull();
    expect(r.summary!.priceNote).toMatch(/set up/);
  });

  it('does not look up a price when the food already exists', async () => {
    const s = await wf.search({ query: 'lentils', howBought: 'dry' });
    askClaude.mockReset();
    askClaude.mockResolvedValueOnce({ name: 'rice', description: '', emoji: '🍚', categoryId: 1, flavorTags: [], pairIds: [], groceryTerm: 'rice' });
    await wf.add({ requestId: s.requestId, fdcId: 1, group: 'legume', serving: '1/4 cup' });
    expect(priceNewFood).not.toHaveBeenCalled();
  });
});
