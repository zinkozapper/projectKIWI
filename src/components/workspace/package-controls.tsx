// Package size dropdown and "your price" box for list rows and the pantry (migration 0019).
// Inline theme-variable styles like prep-select.tsx, so these don't depend on the shared stylesheet.
import { useEffect, useState } from 'react';
import { customLabel, defaultPackage, type CustomUnit, type FoodPackage } from '@/lib/food-packages';
import { selectStyle } from './prep-select';

const stop = { onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(), onKeyDown: (e: { stopPropagation: () => void }) => e.stopPropagation() };
const money = (n: number | null) => (n == null ? '' : ` · $${n.toFixed(2)}`);

const CUSTOM = '__custom';
const boxStyle = { height: 28, padding: '0 6px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--card)', color: 'var(--foreground)', fontSize: 14 } as const;

/**
 * Size picker (max 3 sizes). Always a dropdown: a row without a size yet takes the smallest one, so it never asks
 * "Pick a size". With `onCustom`, a "Custom amount" option opens an amount box and a unit dropdown; Kiwi scales the
 * price and servings from the nearest store size (food-packages.ts customAmount).
 */
export function SizeSelect({ foodName, packages, value, onChange, priceOf, className, custom, customUnits, customPrice, onCustom, autoDefault }: {
  foodName: string;
  packages: FoodPackage[];
  value: string | null;
  onChange: (packageId: string) => void;
  /** Price of one package at the shopper's store (null = unknown). */
  priceOf: (pkg: FoodPackage) => number | null;
  className?: string;
  /** The row's saved custom amount, if any. */
  custom?: { amount: number; unit: CustomUnit } | null;
  customUnits?: CustomUnit[];
  /** Price of the saved custom amount (null = unknown). */
  customPrice?: number | null;
  onCustom?: (amount: number, unit: CustomUnit) => void;
  /** Save the smallest size on a row that has none yet (list rows; the pantry keeps sizeless rows as servings). */
  autoDefault?: boolean;
}) {
  const smallest = defaultPackage(packages);
  const current = packages.find(p => p.id === value);
  const units = customUnits ?? [];
  const canCustom = !!onCustom && units.length > 0;
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(custom ? String(custom.amount) : '');
  const [unit, setUnit] = useState<CustomUnit>(custom?.unit ?? units[0] ?? 'oz');
  useEffect(() => { if (custom) { setAmount(String(custom.amount)); setUnit(custom.unit); } }, [custom?.amount, custom?.unit]);
  // An older row counted in servings (or one whose size was removed) becomes one of the smallest size.
  useEffect(() => { if (autoDefault && !current && smallest && !custom) onChange(smallest.id); }, [current?.id, smallest?.id, !!custom]);
  if (!packages.length) return null;

  const showCustom = canCustom && (editing || !!custom);
  const save = (nextAmount = amount, nextUnit = unit) => {
    const t = nextAmount.trim();
    if (t === '') { if (!custom) setEditing(false); return; }
    const n = Number(t);
    if (custom && n === custom.amount && nextUnit === custom.unit) return;
    onCustom!(n, nextUnit);
  };

  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <select
        className={className}
        style={selectStyle}
        aria-label={`Amount to buy for ${foodName}`}
        title="Amount to buy. Prices are per package."
        value={showCustom ? CUSTOM : current ? current.id : autoDefault ? smallest?.id : ''}
        {...stop}
        onChange={e => {
          if (e.target.value === CUSTOM) { setEditing(true); if (!custom) setAmount(''); return; }
          setEditing(false);
          if (e.target.value) onChange(e.target.value);
        }}
      >
        {!current && !autoDefault && !showCustom && <option value="">Pick a size</option>}
        {packages.map(p => <option key={p.id} value={p.id}>{p.label}{money(priceOf(p))}</option>)}
        {canCustom && <option value={CUSTOM}>{custom ? `Custom: ${customLabel(custom.amount, custom.unit)}${money(customPrice ?? null)}` : 'Custom amount…'}</option>}
      </select>
      {showCustom && (
        <span style={{ display: 'inline-flex', gap: 4 }} {...stop}>
          <input
            aria-label={`Custom amount of ${foodName}`}
            title="How much you want to buy"
            type="text"
            inputMode="decimal"
            placeholder="amount"
            autoFocus={editing && !custom}
            style={{ ...boxStyle, width: 64, textAlign: 'right' }}
            value={amount}
            onChange={e => {
              // Digits and one decimal point, at most 2 decimal places and 6 characters.
              const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
              if (/^\d{0,5}(\.\d{0,2})?$/.test(v)) setAmount(v);
            }}
            onBlur={() => save()}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
          <select
            aria-label={`Unit for the custom amount of ${foodName}`}
            style={{ ...selectStyle, width: 'auto' }}
            value={unit}
            onChange={e => { const u = e.target.value as CustomUnit; setUnit(u); if (amount.trim()) save(amount, u); }}
          >
            {units.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </span>
      )}
    </span>
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
