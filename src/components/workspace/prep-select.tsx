// Prep-style dropdown for a food with purchase options (raw, rotisserie, frozen, canned …).
// "Any" = no preference: the item is priced at the average of the options.
// Styles are inline (theme variables) so this component doesn't depend on the shared stylesheet.
import type { CSSProperties } from 'react';
import type { FoodOption } from '@/lib/food-options';

const style: CSSProperties = {
  height: 30, maxWidth: '100%', minWidth: 120, margin: '6px 0 2px', padding: '0 28px 0 10px', border: '1px solid var(--border)', borderRadius: 5,
  background: 'var(--card)', color: 'var(--foreground)', fontSize: 12, cursor: 'pointer', justifySelf: 'start',
};
const money = (n: number | null) => (n == null ? '' : ` · $${n.toFixed(2)}`);

export function PrepSelect({ foodName, options, value, onChange, priceOf, average, className }: {
  foodName: string;
  options: FoodOption[];
  value: string | null;
  onChange: (optionId: string | null) => void;
  /** Price per serving of one option at the shopper's store (null = unknown). */
  priceOf: (option: FoodOption) => number | null;
  /** Average of the priced options: what "Any" costs per serving. */
  average: number | null;
  className?: string;
}) {
  if (options.length < 2) return null;
  return (
    <select
      className={className}
      style={style}
      aria-label={`How you'll buy ${foodName} (prices per serving)`}
      title="How you'll buy it. Prices are per serving."
      value={value && options.some(o => o.id === value) ? value : ''}
      // The list row opens food details on click; keep the dropdown from triggering it.
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      onChange={e => onChange(e.target.value || null)}
    >
      <option value="">Any{average != null ? ` (avg $${average.toFixed(2)})` : ''}</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.label}{money(priceOf(o))}</option>)}
    </select>
  );
}
