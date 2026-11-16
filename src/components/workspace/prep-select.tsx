// Prep-style dropdown for a food with purchase options (raw, rotisserie, frozen, canned …).
// There is no "Any": an item without a pick shows (and is priced as) the food's default, most whole style.
// Styles are inline (theme variables) so this component doesn't depend on the shared stylesheet.
import type { CSSProperties } from 'react';
import { resolveOptionId, type FoodOption } from '@/lib/food-options';

export const selectStyle = {
  // Sized to its text (field-sizing), with our own chevron so it sits 10px in from the right edge.
  height: 30, maxWidth: '100%', margin: 0, padding: '0 30px 0 10px', border: '1px solid var(--border)', borderRadius: 5,
  appearance: 'none', WebkitAppearance: 'none', fieldSizing: 'content',
  background: `var(--card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center`,
  color: 'var(--foreground)', fontSize: 12, cursor: 'pointer', justifySelf: 'start',
} as CSSProperties;

export function PrepSelect({ foodName, options, value, onChange, priceOf, average, className }: {
  foodName: string;
  options: FoodOption[];
  value: string | null;
  onChange: (optionId: string | null) => void;
  /** Price per serving of one option at the shopper's store (null = unknown). */
  priceOf: (option: FoodOption) => number | null;
  /** Unused (kept for callers): prices now come from the chosen size. */
  average: number | null;
  className?: string;
}) {
  if (options.length < 2) return null;
  return (
    <select
      className={className}
      style={selectStyle}
      aria-label={`How you'll buy ${foodName}`}
      title="How you'll buy it. It sets which sizes you can pick; the size sets the price."
      value={resolveOptionId(value, options) ?? ''}
      // The list row opens food details on click; keep the dropdown from triggering it.
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      onChange={e => onChange(e.target.value || null)}
    >
      {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}
