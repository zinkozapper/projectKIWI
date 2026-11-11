export function resolvedPrice(generic: number | undefined, local: number | undefined, mode: 'loading' | 'generic' | 'local'): number | null {
  const value = mode === 'generic' ? generic : local;
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export function priceFreshness(snapshotAt: string | null, now = Date.now()): 'fresh' | 'stale' | 'unknown' {
  const time = snapshotAt ? Date.parse(snapshotAt) : NaN;
  if (!Number.isFinite(time)) return 'unknown';
  return now - time > 30 * 24 * 60 * 60 * 1000 ? 'stale' : 'fresh';
}
