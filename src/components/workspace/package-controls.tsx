// Package size dropdown and "your price" box for list rows and the pantry (migration 0019).
// Inline theme-variable styles like prep-select.tsx, so these don't depend on the shared stylesheet.
import { useEffect, useState, type CSSProperties } from 'react';
import { packageCaption, type FoodPackage } from '@/lib/food-packages';

const selectStyle: CSSProperties = {
  height: 28, maxWidth: '100%', padding: '0 6px', border: '1px solid var(--border)', borderRadius: 5,
  background: 'var(--card)', color: 'var(--foreground)', fontSize: 12, cursor: 'pointer', justifySelf: 'start',
};
const stop = { onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(), onKeyDown: (e: { stopPropagation: () => void }) => e.stopPropagation() };
const money = (n: number | null) => (n == null ? '' : ` · $${n.toFixed(2)}`);

/**
 * Size picker (max 3 sizes). With one size it shows the size as text. `value` null on an older row counted in
 * servings shows "Pick a size", and picking one turns the row into one package.
 */
export function SizeSelect({ foodName, packages, value, onChange, priceOf, className }: {
  foodName: string;
  packages: FoodPackage[];
  value: string | null;
  onChange: (packageId: string) => void;
  /** Price of one package at the shopper's store (null = unknown). */
  priceOf: (pkg: FoodPackage) => number | null;
  className?: string;
}) {
  if (!packages.length) return null;
  const current = packages.find(p => p.id === value);
  if (packages.length === 1 && current) {
    return <small className={className} style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{packageCaption(current)}</small>;
  }
  return (
    <select
      className={className}
      style={selectStyle}
      aria-label={`Package size for ${foodName}`}
      title="Package size. Prices are per package."
      value={current ? current.id : ''}
      {...stop}
      onChange={e => { if (e.target.value) onChange(e.target.value); }}
    >
      {!current && <option value="">Pick a size</option>}
      {packages.map(p => <option key={p.id} value={p.id}>{packageCaption(p)}{money(priceOf(p))}</option>)}
    </select>
  );
}

/** Fallback when Kiwi has no store price: the shopper types what they expect to pay. Saves on blur or Enter. */
export function PriceEstimate({ foodName, value, per, onSave }: {
  foodName: string;
  value: number | null;
  /** What the price is for, e.g. "package" or "serving". */
  per: string;
  onSave: (price: number | null) => void;
}) {
  const [draft, setDraft] = useState(value == null ? '' : value.toFixed(2));
  useEffect(() => setDraft(value == null ? '' : value.toFixed(2)), [value]);
  const commit = () => {
    const t = draft.trim();
    if (t === '') { if (value != null) onSave(null); return; }
    const n = Number(t.replace(/^\$/, ''));
    if (n !== value) onSave(n);
  };
  // Just a small box in the price column: "est." until the shopper types a price.
  return (
    <input
      className="price-estimate"
      {...stop}
      aria-label={`Your price estimate for ${foodName}, per ${per}`}
      title={`No store price found. Enter what you expect to pay per ${per}.`}
      type="text"
      inputMode="decimal"
      placeholder="est."
      value={draft}
      onChange={e => setDraft(e.target.value.replace(/[^0-9.$]/g, '').slice(0, 8))}
      onBlur={commit}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}
