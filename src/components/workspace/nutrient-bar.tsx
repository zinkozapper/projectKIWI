import { useState } from 'react';
import { Info, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatAmount, NUTRIENTS, nutrientGroups, nutrientLimits, type NutrientKey, type Nutrients } from '@/lib/foods';
import { NUTRIENT_INFO } from '@/lib/nutrient-info';

// "i" button next to a nutrient's name: what it does for the body, plus (on My Plan) a button that
// switches the suggestions to foods high in it. Limits (sodium, omega-6) and calories have no button.
function NutrientInfo({ nutrient, name, onRecommend }: { nutrient: NutrientKey; name: string; onRecommend?: ((k: NutrientKey) => void) | undefined }) {
  const [open, setOpen] = useState(false);
  const canRecommend = !!onRecommend && nutrient !== 'calories' && !nutrientLimits.has(nutrient);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="nutrient-info-button" aria-label={`What does ${name} do?`}>
          <Info size={14} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="nutrient-info-pop" align="start">
        <strong>{name}</strong>
        <p>{NUTRIENT_INFO[nutrient]}</p>
        {canRecommend && (
          <Button size="sm" onClick={() => { setOpen(false); onRecommend(nutrient); }}>
            <Sparkles size={14} aria-hidden="true" /> Recommend foods
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// base = the part of value that comes from the pantry. When given, the bar shows two segments:
// solid for the pantry, lighter for the grocery list, so My Plan and My Pantry read the same way.
export function NutrientBar({ nutrient, name, value, target, unit, limit = false, base, onRecommend }: { nutrient?: NutrientKey; name: string; value: number; target: number; unit: string; limit?: boolean; base?: number | undefined; onRecommend?: ((k: NutrientKey) => void) | undefined }) {
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
      <div className="nutrient-top"><span className="nutrient-name"><strong>{name}</strong>{nutrient && <NutrientInfo nutrient={nutrient} name={name} onRecommend={onRecommend} />}</span><span>{formatAmount(value)} / {formatAmount(target)} {unit}{limit ? ' max' : ''}</span></div>
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
export function NutrientPanel({ values, targets, hide = [], base, onRecommend }: { values: Nutrients; targets: Nutrients; hide?: NutrientKey[]; base?: Nutrients | undefined; onRecommend?: ((k: NutrientKey) => void) | undefined }) {
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
          <NutrientBar key={n.key} nutrient={n.key} onRecommend={onRecommend} name={n.label} value={values[n.key]} target={targets[n.key]} unit={n.unit} limit={nutrientLimits.has(n.key)} base={base?.[n.key]} />
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
