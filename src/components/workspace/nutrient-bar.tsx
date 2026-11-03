export function NutrientBar({ name, value, target, unit }: { name: string; value: number; target: number; unit: string }) {
  const pct = Math.min(100, Math.round(value / target * 100));
  const gap = Math.max(0, target - value);
  return (
    <div className="nutrient">
      <div className="nutrient-top"><strong>{name}</strong><span>{Math.round(value)} / {Math.round(target)} {unit}</span></div>
      <div className="track"><div className={pct < 60 ? 'fill low' : 'fill'} style={{ width: `${pct}%` }} /></div>
      <small>{gap > 0 ? `${Math.round(gap)} ${unit} remaining` : 'Target met'}</small>
    </div>
  );
}
