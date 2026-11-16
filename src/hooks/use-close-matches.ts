// "No exact match" fallback for food search boxes. Shows close matches right away (synonyms, dishes,
// look-alike spellings, from closeFoodMatches), then asks the server for semantic matches (Claude picks
// from the catalog) and puts those first. Semantic answers are cached per search for the session.
import { useEffect, useMemo, useState } from 'react';
import { closeFoodMatches, foodById, foods, type Food } from '@/lib/foods';
import { cacheKey, cleanQuery, MAX_SIMILAR } from '@/lib/food-search/shared';

const SEMANTIC_DELAY_MS = 500;
const semanticCache = new Map<string, string[]>();

export type CloseMatches = { foods: Food[]; searching: boolean };

export function useCloseMatches(query: string, noExactMatch: boolean, limit = MAX_SIMILAR): CloseMatches {
  const text = cleanQuery(query);
  const key = cacheKey(text);
  const active = noExactMatch && key.length >= 2;
  const local = useMemo(() => (active ? closeFoodMatches(foods, text, limit) : []), [active, text, limit]);
  const [semantic, setSemantic] = useState<{ key: string; ids: string[] } | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!active || key.length < 3) return;
    const cached = semanticCache.get(key);
    if (cached) {
      setSemantic({ key, ids: cached });
      return;
    }
    let cancelled = false;
    setPending(key);
    const timer = setTimeout(async () => {
      let ids: string[] = [];
      try {
        const { findSimilarFoods } = await import('@/lib/food-search/functions');
        const res = await findSimilarFoods({ data: { query: text } });
        if (res.ok) {
          ids = res.data.ids;
          semanticCache.set(key, ids);
        }
      } catch {
        // Offline or not configured: the local close matches are still shown.
      }
      if (!cancelled) {
        setSemantic({ key, ids });
        setPending(p => (p === key ? null : p));
      }
    }, SEMANTIC_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setPending(p => (p === key ? null : p));
    };
  }, [active, key, text]);

  return useMemo(() => {
    if (!active) return { foods: [], searching: false };
    const smart = semantic?.key === key ? semantic.ids.map(id => foodById(id)).filter((f): f is Food => !!f) : [];
    const merged = [...smart, ...local.filter(f => !smart.some(s => s.id === f.id))].slice(0, limit);
    return { foods: merged, searching: pending === key };
  }, [active, key, semantic, local, pending, limit]);
}
