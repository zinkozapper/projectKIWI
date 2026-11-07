import { formatAmount, NUTRIENTS, nutrientGroups, nutrientLimits, type NutrientKey, type Nutrients } from '@/lib/foods';

export function NutrientBar({ name, value, target, unit, limit = false }: { name: string; value: number; target: number; unit: string; limit?: boolean }) {
  const pct = target > 0 ? Math.min(100, Math.round(value / target * 100)) : 0;
  const gap = Math.max(0, target - value);
  const over = limit && value > target;
  const fill = limit ? (over ? 'fill warning' : 'fill') : (pct < 60 ? 'fill low' : 'fill');
  const note = limit
    ? (over ? `${formatAmount(value - target)} ${unit} over the daily limit` : `${formatAmount(gap)} ${unit} under the daily limit`)
    : (gap > 0 ? `${formatAmount(gap)} ${unit} remaining` : 'Target met');
  return (
    <div className="nutrient">
      <div className="nutrient-top"><strong>{name}</strong><span>{formatAmount(value)} / {formatAmount(target)} {unit}{limit ? ' max' : ''}</span></div>
      <div className="track"><div className={fill} style={{ width: `${pct}%` }} /></div>
      <small>{note}</small>
    </div>
  );
}

// Macros always open; vitamins and minerals fold away so 27 bars don't flood the panel.
export function NutrientPanel({ values, targets, hide = [] }: { values: Nutrients; targets: Nutrients; hide?: NutrientKey[] }) {
  return (
    <div className="nutrient-groups">
      {nutrientGroups.map(({ group, label }) => {
        const bars = NUTRIENTS.filter(n => n.group === group && !hide.includes(n.key)).map(n => (
          <NutrientBar key={n.key} name={n.label} value={values[n.key]} target={targets[n.key]} unit={n.unit} limit={nutrientLimits.has(n.key)} />
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
