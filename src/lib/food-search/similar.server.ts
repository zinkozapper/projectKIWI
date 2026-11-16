// Semantic food search (server side). Uses ANTHROPIC_API_KEY through the food finder's askClaude, the
// same as recipes. The caller must be signed in so the key can't be used anonymously. Answers are cached
// in memory per search text, so the same no-match search costs one AI call per server start.
import { getRequest } from '@tanstack/react-start/server';
import { adminClient } from '@/lib/food-import/env.server';
import { askClaude } from '@/lib/food-import/claude.server';
import { cacheKey, cleanQuery, normalizeIds, SIMILAR_SYSTEM, SIMILAR_TOOL, similarPrompt, type CatalogLine, type SimilarInput, type SimilarResult } from './shared';

const CATALOG_TTL_MS = 5 * 60_000;
const MAX_CACHED = 500;

let catalogCache: { at: number; lines: CatalogLine[] } | null = null;
const answers = new Map<string, string[]>();

async function requireUser() {
  const header = getRequest()?.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new Error('Please sign in again.');
  const db = await adminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error('Your session expired. Please sign in again.');
  return db;
}

async function catalog(db: Awaited<ReturnType<typeof adminClient>>): Promise<CatalogLine[]> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.lines;
  const { data, error } = await db.from('food').select('food_id,food_name,food_group').order('food_id');
  if (error) throw error;
  const lines = (data || []).map(f => ({ id: String(f.food_id), name: f.food_name, group: f.food_group }));
  catalogCache = { at: Date.now(), lines };
  return lines;
}

export async function findSimilar(input: SimilarInput): Promise<SimilarResult> {
  const query = cleanQuery(input?.query);
  const key = cacheKey(query);
  if (key.length < 3) return { ids: [] };
  const db = await requireUser();
  const cached = answers.get(key);
  if (cached) return { ids: cached };

  const lines = await catalog(db);
  const raw = await askClaude<unknown>({ system: SIMILAR_SYSTEM, prompt: similarPrompt(query, lines), tool: SIMILAR_TOOL, maxTokens: 300 });
  const ids = normalizeIds(raw, new Set(lines.map(l => l.id)));
  if (answers.size >= MAX_CACHED) answers.delete(answers.keys().next().value!);
  answers.set(key, ids);
  return { ids };
}
