// Run as a separate long-lived process: node --env-file=.env scripts/kroger/worker.mjs
import postgres from 'postgres';
import { collectPrices, krogerClient } from '../../src/lib/food-import/kroger.server.ts';

const { DATABASE_URL, KROGER_CLIENT_ID, KROGER_CLIENT_SECRET } = process.env;
if (!DATABASE_URL || !KROGER_CLIENT_ID || !KROGER_CLIENT_SECRET) throw new Error('DATABASE_URL, KROGER_CLIENT_ID and KROGER_CLIENT_SECRET are required');
const sql = postgres(DATABASE_URL, { max: 1, prepare: false });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Rate limit every request, including token and retries; the worker processes one store at a time.
let lastRequest = 0;
const client = krogerClient(() => ({ id: KROGER_CLIENT_ID, secret: KROGER_CLIENT_SECRET }), {
  fetchImpl: async (...args) => {
    await sleep(Math.max(0, 1000 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    return fetch(...args);
  },
});

async function refresh(zip) {
  const store = await client.nearestStore(zip);
  if (!store) throw new Error('No Kroger store found near this ZIP');
  const [snapshot] = await sql`select revision, clock_timestamp() as started_at from public.price_catalog_revision where singleton`;
  const [fresh] = await sql`select completed_at from public.price_store_refresh where location_id = ${store.location_id} and completed_at > now() - interval '30 days' and catalog_revision = ${snapshot.revision}`;
  if (fresh) {
    await sql`insert into public.zip_store (zip_code, location_id, fetched_at) values (${zip}, ${store.location_id}, now()) on conflict (zip_code) do update set location_id = excluded.location_id, fetched_at = now()`;
    return fresh.completed_at;
  }
  const foods = await sql`select food_id, food_name, food_category_id, serving_size, unit, factor * 100 / coalesce(nullif(cook_ratio, 0), 1) as serving_grams from public.food order by food_id`;
  const { prices, stores } = await collectPrices(client, foods, store, zip);
  // Publish an entire successful snapshot at once: failures never erase the previous prices.
  await sql.begin(async tx => {
    for (const { departments, ...storeRow } of [store, ...stores]) {
      await tx`insert into public.kroger_store ${tx(storeRow)} on conflict (location_id) do update set name = excluded.name, chain = excluded.chain, address = excluded.address, city = excluded.city, state = excluded.state, zip_code = excluded.zip_code, latitude = excluded.latitude, longitude = excluded.longitude, fetched_at = now()`;
    }
    await tx`delete from public.food_price where location_id = ${store.location_id}`;
    if (prices.length) await tx`insert into public.food_price ${tx(prices)}`;
    await tx`insert into public.zip_store (zip_code, location_id, fetched_at) values (${zip}, ${store.location_id}, now()) on conflict (zip_code) do update set location_id = excluded.location_id, fetched_at = now()`;
    await tx`insert into public.price_store_refresh (location_id, completed_at, catalog_revision) values (${store.location_id}, ${snapshot.started_at}, ${snapshot.revision}) on conflict (location_id) do update set completed_at = excluded.completed_at, catalog_revision = excluded.catalog_revision`;
  });
  return snapshot.started_at;
}

async function run() {
  const [{ locked }] = await sql`select pg_try_advisory_lock(74835921) as locked`;
  if (!locked) throw new Error('Another pricing worker is already running');
  for (;;) {
    const [job] = await sql`select zip_code, requested_at::text as requested_at from public.price_refresh_queue where next_attempt_at <= now() order by next_attempt_at limit 1`;
    if (!job) { await sleep(15000); continue; }
    try {
      const completedAt = await refresh(job.zip_code);
      await sql`update public.price_refresh_queue set completed_at = ${completedAt}, next_attempt_at = case when requested_at > ${job.requested_at}::timestamptz then least(next_attempt_at, now()) else ${completedAt}::timestamptz + interval '30 days' end, last_error = null where zip_code = ${job.zip_code}`;
    } catch (error) {
      console.error('[pricing]', job.zip_code, error);
      await sql`update public.price_refresh_queue set next_attempt_at = now() + interval '1 hour', last_error = ${String(error).slice(0, 500)} where zip_code = ${job.zip_code}`;
    }
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => sql.end());
