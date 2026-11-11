import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Plus, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodById, nutrientKeys, type Food, type Nutrients } from '@/lib/foods';
import { useWorkspace } from '../context';
import { NutrientPanel } from '../nutrient-bar';
import { PantryAddDialog } from '../pantry-add-dialog';

export function PantryPage() {
  const { pantry, listItems, days, daily, pantryTotals, combined, addPantry, removePantry, profile, isFirstSession } = useWorkspace();
  const [adding, setAdding] = useState(false);
  // One tap marks a food gone, so keep an Undo around for a few seconds in case it was a mis-tap.
  const [lastRemoved, setLastRemoved] = useState<Food | null>(null);

  useEffect(() => {
    if (!lastRemoved) return;
    const timer = window.setTimeout(() => setLastRemoved(null), 8000);
    return () => window.clearTimeout(timer);
  }, [lastRemoved]);

  async function markGone(pantryItemId: string, food: Food) {
    await removePantry(pantryItemId);
    setLastRemoved(food);
  }

  async function undoRemove() {
    if (!lastRemoved) return;
    const food = lastRemoved;
    setLastRemoved(null);
    await addPantry(food.id);
  }
  // Same numbers as My Plan: pantry (solid) plus the grocery list (light).
  const perDay = (n: Nutrients) => Object.fromEntries(nutrientKeys.map(k => [k, n[k] / days])) as Nutrients;
  const hasAnything = pantry.length > 0 || listItems.length > 0;
  const stocked = pantry.map(item => ({ item, food: foodById(item.food_id) })).filter(x => x.food).sort((a, b) => a.food!.name.localeCompare(b.food!.name));

  return (
    <>
      {!profile && !isFirstSession && (
        <p className="section-note">
          You're currently using default nutrition estimates. Complete your profile
          using the account button to get nutrition goals personalized to you.
        </p>
      )}
      
      <div className="page-heading">
        <div>
          <h1>Your pantry</h1>
          {!isFirstSession && <p>What’s already at home. Foods stay until you mark them gone. Finished trips fill it in for you.</p>}
        </div>
        <Button variant={isFirstSession && pantry.length > 0 ? 'outline' : 'default'} onClick={() => setAdding(true)}><Plus size={16} /> Add to pantry</Button>
      </div>
      <div className={isFirstSession ? '' : 'pantry-grid'}>
        <section className="section-block">
          <div className="section-title">
            <div><h2>In your kitchen</h2></div>
            <span className="count-pill">{pantry.length} {pantry.length === 1 ? 'food' : 'foods'}</span>
          </div>
          {stocked.length ? (
            <>
              <p className="pantry-hint">Ran out or used it up? Tap it to mark it gone. Anything still here counts toward your plan and won’t be suggested again.</p>
              <div className="pantry-items">
                {stocked.map(({ item, food }) => (
                  <Button variant="outline" key={item.id} className="pantry-item" onClick={() => void markGone(item.id, food!)} aria-label={`Remove ${food!.name} from your pantry`}>
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
          {lastRemoved && (
            <div className="undo-bar" role="status">
              <span>Removed {lastRemoved.name}.</span>
              <Button variant="ghost" size="sm" onClick={() => void undoRemove()}><Undo2 size={15} aria-hidden="true" /> Undo</Button>
            </div>
          )}
          <div className="pantry-footer">
            {!isFirstSession && <Button variant="outline" onClick={() => setAdding(true)}><Plus size={16} /> Add foods</Button>}
            <Button asChild variant={isFirstSession && pantry.length > 0 ? 'default' : 'ghost'}><Link to="/plan">{isFirstSession && pantry.length === 0 ? 'Skip to plan' : 'Continue to plan'} <ArrowRight size={16} /></Link></Button>
          </div>
        </section>
        {!isFirstSession && <section className="nutrition-panel pantry-snapshot">
          <h2>What you have covered</h2>
          <p>{hasAnything
            ? `Daily average across ${days} days: your pantry (1 serving a day each) plus ${listItems.length ? `the ${listItems.length} ${listItems.length === 1 ? 'food' : 'foods'} on your list` : 'your list, which is empty so far'}. My Plan shows the same numbers.`
            : 'Your pantry is empty. Add a few staples to see a snapshot, or go straight to planning.'}</p>
          {hasAnything && <NutrientPanel values={perDay(combined)} base={perDay(pantryTotals)} targets={daily} hide={['calories']} />}
          <Button asChild variant={isFirstSession ? 'outline' : 'default'} className="snapshot-button"><Link to="/plan">Fill the gaps <ArrowRight size={16} /></Link></Button>
        </section>}
      </div>
      <PantryAddDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
