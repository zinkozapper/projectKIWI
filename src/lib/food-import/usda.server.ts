// USDA FoodData Central API (https://fdc.nal.usda.gov/api-guide). Server-only: uses FDC_API_KEY.
import { requireEnv } from './env.server';
import type { DataType, FdcFood } from './rules';

const API = 'https://api.nal.usda.gov/fdc/v1';

async function call<T>(path: string, body: unknown): Promise<T> {
  const key = await requireEnv('FDC_API_KEY');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}?api_key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return (await res.json()) as T;
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      await new Promise(r => setTimeout(r, 1500 * attempt));
      continue;
    }
    throw new Error(res.status === 429 ? 'USDA is rate-limiting requests right now. Try again in a minute.' : `USDA search failed (${res.status}).`);
  }
}

// POST search: the GET form rejects "Survey (FNDDS)" in the dataType list (found in Sprint 1).
export async function searchFdc(query: string, dataTypes: DataType[], pageSize = 25) {
  const r = await call<{ foods?: FdcFood[] }>('/foods/search', { query, dataType: dataTypes, pageSize });
  return r.foods || [];
}

export async function fdcDetails(ids: number[]): Promise<FdcFood[]> {
  if (!ids.length) return [];
  return call<FdcFood[]>('/foods', { fdcIds: ids, format: 'full' });
}

export async function fdcDetail(id: number) {
  const [food] = await fdcDetails([id]);
  if (!food) throw new Error(`USDA record ${id} wasn't found.`);
  return food;
}
