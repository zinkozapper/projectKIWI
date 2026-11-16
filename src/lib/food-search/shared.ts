// Semantic food search (shared by browser and server): when a search has no exact match, Claude picks
// the catalog foods closest in meaning ("soda" -> sparkling water, "pb" -> peanut butter, "fajitas" ->
// chicken, peppers, tortillas). Only ids from Kiwi's own catalog are kept.
export const MAX_SIMILAR = 6;
export const MAX_QUERY_LENGTH = 60;

export type SimilarInput = { query: string };
export type SimilarResult = { ids: string[] };
export type CatalogLine = { id: string; name: string; group: string | null };

export const SIMILAR_SYSTEM = `You help shoppers search Kiwi, a small grocery catalog for young adults.
A search found no food whose name matches. Pick the catalog foods the shopper most likely wants:
what they meant (typo, plural, brand or regional name, another language), the main ingredients of a dish they typed,
or the closest healthy substitute. Order best first. Return an empty list when nothing in the catalog is reasonably close.
Use only ids from the catalog. Never invent foods.`;

export const SIMILAR_TOOL = {
  name: 'pick_similar_foods',
  description: 'Return the catalog foods closest to the search, best first.',
  input_schema: {
    type: 'object',
    properties: {
      ids: { type: 'array', items: { type: 'string' }, maxItems: MAX_SIMILAR, description: 'Catalog food ids, best match first.' },
    },
    required: ['ids'],
  },
};

export function cleanQuery(query: unknown): string {
  return typeof query === 'string' ? query.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH) : '';
}

// Lowercase, letters and digits only: "Soda!" and "soda" share one cache entry.
export const cacheKey = (query: string) => query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function similarPrompt(query: string, catalog: CatalogLine[]): string {
  const lines = catalog.map(f => `${f.id} | ${f.name}${f.group ? ` | ${f.group}` : ''}`).join('\n');
  return `Search: "${query}"\n\nCatalog (id | name | food group):\n${lines}`;
}

// Keep known ids only, once each, in Claude's order.
export function normalizeIds(raw: unknown, known: Set<string>): string[] {
  const ids = (raw as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const id of ids) {
    const value = String(id).trim();
    if (known.has(value) && !out.includes(value)) out.push(value);
    if (out.length >= MAX_SIMILAR) break;
  }
  return out;
}
