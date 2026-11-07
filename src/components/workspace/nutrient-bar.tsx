import { formatAmount, NUTRIENTS, nutrientGroups, nutrientLimits, type NutrientKey, type Nutrients } from '@/lib/foods';

// base = the part of value that comes from the pantry. When given, the bar shows two segments:
// solid for the pantry, lighter for the grocery list, so My Plan and My Pantry read the same way.
export function NutrientBar({ name, value, target, unit, limit = false, base }: { name: string; value: number; target: number; unit: string; limit?: boolean; base?: number | undefined }) {
  const pct = target > 0 ? Math.min(100, Math.round(value / target * 100)) : 0;
  const basePct = base === undefined || target <= 0 ? pct : Math.min(pct, Math.round(Math.max(0, base) / target * 100));
  const gap = Math.max(0, target - value);
  const over = limit && value > target;
  const fill = limit ? (over ? 'fill warning' : 'fill') : (pct < 60 ? 'fill low' : 'fill');
  const note = limit
    ? (over ? `${formatAmount(value - target)} ${unit} over the daily limit` : `${formatAmount(gap)} ${unit} under the daily limit`)
    : (gap > 0 ? `${formatAmount(gap)} ${unit} remaining` : 'Target met');
  return (
    <div className="nutrient">
      <div className="nutrient-top"><strong>{name}</strong><span>{formatAmount(value)} / {formatAmount(target)} {unit}{limit ? ' max' : ''}</span></div>
      {base === undefined
        ? <div className="track"><div className={fill} style={{ width: `${pct}%` }} /></div>
        : (
          <div className="track stacked" title={`${formatAmount(Math.max(0, base))} ${unit} from your pantry, ${formatAmount(Math.max(0, value - base))} ${unit} from your list`}>
            <div className={fill} style={{ width: `${basePct}%` }} />
            <div className={`${fill} planned`} style={{ width: `${pct - basePct}%` }} />
          </div>
        )}
      <small>{note}</small>
    </div>
  );
}

// Macros always open; vitamins and minerals fold away so 27 bars don't flood the panel.
// base (optional) = pantry share of each value; see NutrientBar.
export function NutrientPanel({ values, targets, hide = [], base }: { values: Nutrients; targets: Nutrients; hide?: NutrientKey[]; base?: Nutrients | undefined }) {
  return (
    <div className="nutrient-groups">
      {base && (
        <div className="nutrient-legend" aria-hidden="true">
          <span><i className="swatch" /> In your pantry</span>
          <span><i className="swatch planned" /> On your list</span>
        </div>
      )}
      {nutrientGroups.map(({ group, label }) => {
        const bars = NUTRIENTS.filter(n => n.group === group && !hide.includes(n.key)).map(n => (
          <NutrientBar key={n.key} name={n.label} value={values[n.key]} target={targets[n.key]} unit={n.unit} limit={nutrientLimits.has(n.key)} base={base?.[n.key]} />
        ));
        if (group === 'macros') return <div className="nutrient-list" key={group}>{bars}</div>;
        const met = NUTRIENTS.filter(n => n.group === group && !nutrientLimits.has(n.key) && values[n.key] >= targets[n.key]).length;
        const total = NUTRIENTS.filter(n => n.group === group && !nutrientLimits.has(n.key)).length;
        return (
          <details className="nutrient-group" key={group}>
            <summary><span>{label}</span><small>{met} of {total} met</small></summary>
            <div className="nutrient-list">{bars}</div>
          </details>
        );
      })}
    </div>
  );
}
