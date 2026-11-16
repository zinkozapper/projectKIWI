import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Minus, Plus, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodById, nutrientKeys, type Food, type Nutrients } from '@/lib/foods';
import { useWorkspace } from '../context';
import { NutrientPanel } from '../nutrient-bar';
import { PantryAddDialog } from '../pantry-add-dialog';
import { SizeSelect } from '../package-controls';
import { formatAmount } from '@/lib/foods';

export function PantryPage() {
  const { pantry, listItems, days, daily, pantryTotals, combined, addPantry, removePantry, profile, isFirstSession, packagesFor, packageOf, packagePriceOf, pantryServings, setPantryQuantity, setPantryPackage } = useWorkspace();
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
              <p className="pantry-hint">Set how many packages you have; their servings are spread across your {days}-day plan. Used it up? Tap the name to mark it gone.</p>
              <div className="pantry-stock">
                {stocked.map(({ item, food }) => {
                  const pkg = packageOf(item);
                  const q = Number(item.quantity);
                  return (
                    <div className="pantry-stock-row" key={item.id}>
                      <Button variant="outline" className="pantry-item" onClick={() => void markGone(item.id, food!)} aria-label={`Remove ${food!.name} from your pantry`}>
                        <span aria-hidden="true">{food!.emoji}</span>{food!.name}<X size={15} aria-hidden="true" />
                      </Button>
                      <div className="pantry-stock-amount">
                        <SizeSelect foodName={food!.name} packages={packagesFor(food!.id)} value={item.package_id}
                          priceOf={p => packagePriceOf(p)} onChange={id => void setPantryPackage(item, id)} />
                        <div className="qty-control">
                          <Button size="icon" variant="ghost" title={q <= 1 ? `Mark ${food!.name} gone` : 'One less'} onClick={() => (q <= 1 ? void markGone(item.id, food!) : void setPantryQuantity(item, q - 1))}>
                            <Minus size={13} />
                          </Button>
                          <span className="pantry-qty" aria-live="polite" aria-label={`${formatAmount(q)} ${pkg ? 'packages' : "weeks' worth"} of ${food!.name}`}>{formatAmount(q)}</span>
                          <Button size="icon" variant="ghost" title="One more" disabled={q >= 99} onClick={() => void setPantryQuantity(item, q + 1)}>
                            <Plus size={13} />
                          </Button>
                        </div>
                        <small className="qty-caption">
                          {pkg ? `${q === 1 ? 'pack' : 'packs'} · ` : `${q === 1 ? 'week' : 'weeks'} · `}{formatAmount(pantryServings(item) / days)}/day
                        </small>
                      </div>
                    </div>
                  );
                })}
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
            ? `Daily average across ${days} days: what's in your pantry, spread across the plan, plus ${listItems.length ? `the ${listItems.length} ${listItems.length === 1 ? 'food' : 'foods'} on your list` : 'your list, which is empty so far'}. My Plan shows the same numbers.`
            : 'Your pantry is empty. Add a few staples to see a snapshot, or go straight to planning.'}</p>
          {hasAnything && <NutrientPanel values={perDay(combined)} base={perDay(pantryTotals)} targets={daily} hide={['calories']} />}
          <Button asChild variant={isFirstSession ? 'outline' : 'default'} className="snapshot-button"><Link to="/plan">Fill the gaps <ArrowRight size={16} /></Link></Button>
        </section>}
      </div>
      <PantryAddDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
