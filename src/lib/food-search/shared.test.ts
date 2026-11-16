import { describe, expect, it } from 'vitest';
import { cacheKey, cleanQuery, normalizeIds, similarPrompt } from './shared';

describe('semantic food search helpers', () => {
  it('keeps only known ids, once each, at most six', () => {
    const known = new Set(['1', '2', '3', '4', '5', '6', '7']);
    expect(normalizeIds({ ids: ['2', 99, '2', ' 3 ', '1', '4', '5', '6', '7'] }, known)).toEqual(['2', '3', '1', '4', '5', '6']);
    expect(normalizeIds(null, known)).toEqual([]);
    expect(normalizeIds({ ids: 'nope' }, known)).toEqual([]);
  });

  it('cleans the query and shares a cache key across punctuation and case', () => {
    expect(cleanQuery('  Soda   pop ')).toBe('Soda pop');
    expect(cleanQuery(42)).toBe('');
    expect(cleanQuery('x'.repeat(100))).toHaveLength(60);
    expect(cacheKey('Soda!')).toBe(cacheKey('soda'));
  });

  it('lists the catalog in the prompt', () => {
    expect(similarPrompt('soda', [{ id: '7', name: 'Lime', group: 'fruit' }])).toContain('7 | Lime | fruit');
  });
});
