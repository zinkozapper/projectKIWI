import { describe, expect, it } from 'vitest';
import { priceFreshness, resolvedPrice } from './resolved-prices';

describe('resolvedPrice', () => {
  it('uses generic prices only when local pricing is disabled', () => {
    expect(resolvedPrice(2, undefined, 'generic')).toBe(2);
    expect(resolvedPrice(2, undefined, 'local')).toBeNull();
    expect(resolvedPrice(2, 1.5, 'local')).toBe(1.5);
    expect(resolvedPrice(2, undefined, 'loading')).toBeNull();
  });
  it('does not treat zero or invalid prices as free', () => {
    expect(resolvedPrice(0, undefined, 'generic')).toBeNull();
    expect(resolvedPrice(4, 0, 'local')).toBeNull();
    expect(resolvedPrice(NaN, undefined, 'generic')).toBeNull();
  });
});

describe('priceFreshness', () => {
  const now = Date.parse('2026-11-11T00:00:00Z');
  it('marks only snapshots older than 30 days stale', () => {
    expect(priceFreshness('2026-10-12T00:00:00Z', now)).toBe('fresh');
    expect(priceFreshness('2026-10-11T23:59:59Z', now)).toBe('stale');
  });
  it('does not claim freshness when metadata is absent or inaccessible', () => {
    expect(priceFreshness(null, now)).toBe('unknown');
    expect(priceFreshness('invalid', now)).toBe('unknown');
  });
});
