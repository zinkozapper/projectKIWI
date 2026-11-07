import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodById, nutrientKeys, type Nutrients } from '@/lib/foods';
import { useWorkspace } from '../context';
import { NutrientPanel } from '../nutrient-bar';
import { PantryAddDialog } from '../pantry-add-dialog';

export function PantryPage() {
  const { pantry, days, daily, pantryTotals, removePantry } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const perDay = Object.fromEntries(nutrientKeys.map(k => [k, pantryTotals[k] / days])) as Nutrients;
  const stocked = pantry.map(item => ({ item, food: foodById(item.food_id) })).filter(x => x.food).sort((a, b) => a.food!.name.localeCompare(b.food!.name));

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Your pantry<span className="brand-dot">.</span></h1>
          <p>What’s already at home. Finished trips fill it in for you.</p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus size={16} /> Add to pantry</Button>
      </div>
      <div className="pantry-grid">
        <section className="section-block">
          <div className="section-title">
            <div><h2>In your kitchen</h2></div>
            <span className="count-pill">{pantry.length} {pantry.length === 1 ? 'food' : 'foods'}</span>
          </div>
          {stocked.length ? (
            <>
              <p className="pantry-hint">Ran out of something? Tap it to take it out of your pantry.</p>
              <div className="pantry-items">
                {stocked.map(({ item, food }) => (
                  <Button variant="outline" key={item.id} className="pantry-item" onClick={() => void removePantry(item.id)} aria-label={`Remove ${food!.name} from your pantry`}>
                    <span aria-hidden="true">{food!.emoji}</span>{food!.name}<X size={15} aria-hidden="true" />
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              Your pantry is empty. Add what you have at home, or finish a shopping trip and it fills in automatically.
            </div>
          )}
          <div className="pantry-footer">
            <Button variant="outline" onClick={() => setAdding(true)}><Plus size={16} /> Add foods</Button>
            <Button asChild variant="ghost"><Link to="/plan">Continue to plan <ArrowRight size={16} /></Link></Button>
          </div>
        </section>
        <section className="nutrition-panel pantry-snapshot">
          <h2>What you have covered</h2>
          <p>{pantry.length ? `Daily average across ${days} days, counting each pantry food as 1 serving a day.` : 'Your pantry is empty. Add a few staples to see a snapshot, or go straight to planning.'}</p>
          {pantry.length > 0 && <NutrientPanel values={perDay} targets={daily} hide={['calories']} />}
          <Button asChild className="snapshot-button"><Link to="/plan">Fill the gaps <ArrowRight size={16} /></Link></Button>
        </section>
      </div>
      <PantryAddDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
