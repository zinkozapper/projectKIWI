import { Link } from '@tanstack/react-router';
import { ArrowRight, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foods, nutrientKeys, nutrientLabels, nutrientUnits } from '@/lib/foods';
import { useWorkspace } from '../context';
import { NutrientBar } from '../nutrient-bar';

export function PantryPage() {
  const { pantry, days, daily, pantryTotals, addPantry, removePantry } = useWorkspace();

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">START WITH WHAT YOU HAVE</div>
          <h1>Your pantry<span className="brand-dot">.</span></h1>
          <p>Keep what’s already at home in the picture.</p>
        </div>
        <Button asChild><Link to="/plan">Plan a trip <ArrowRight size={16} /></Link></Button>
      </div>
      <div className="pantry-grid">
        <section className="section-block">
          <div className="section-title"><div><span className="section-kicker">QUICK ADD</span><h2>Already in your kitchen?</h2></div></div>
          <div className="pantry-choices">
            {foods.map(f => {
              const inPantry = pantry.some(i => i.food_id === f.id);
              return (
                <Button variant="outline" key={f.id} className={inPantry ? 'pantry-chip chosen' : 'pantry-chip'} onClick={() => inPantry ? removePantry(pantry.find(i => i.food_id === f.id)?.id || '') : addPantry(f.id)}>
                  <span>{f.emoji}</span>{f.name}{inPantry ? <Check size={15} /> : <Plus size={15} />}
                </Button>
              );
            })}
          </div>
          <div className="pantry-footer">
            {pantry.length} items in your pantry
            <Button asChild variant="ghost"><Link to="/plan">Continue to plan <ArrowRight size={16} /></Link></Button>
          </div>
        </section>
        <section className="nutrition-panel pantry-snapshot">
          <span className="section-kicker">PANTRY ONLY</span>
          <h2>What you have covered</h2>
          <p>{pantry.length ? 'A limited snapshot based on foods currently in your pantry. Quantities and actual portions may vary.' : 'Your pantry is empty. Add a few staples to see a snapshot, or go straight to planning.'}</p>
          {pantry.length > 0 && (
            <div className="nutrient-list">
              {nutrientKeys.filter(k => k !== 'calories').map(k => <NutrientBar key={k} name={nutrientLabels[k]} value={pantryTotals[k] / days} target={daily[k]} unit={nutrientUnits[k]} />)}
            </div>
          )}
          <Button asChild className="snapshot-button"><Link to="/plan">Fill the gaps <ArrowRight size={16} /></Link></Button>
        </section>
      </div>
    </>
  );
}
