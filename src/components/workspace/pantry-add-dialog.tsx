import { useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { foodById, foods, searchFoods, type Food } from '@/lib/foods';
import { useWorkspace } from './context';

const MAX_PICKS = 8;

// Quick picks from the user's own data: foods bought on finished trips (most often first), then liked
// foods. Foods already in the pantry are left out, so a pick disappears once it's added.
function usePantryPicks(): Food[] {
  const { trips, items, pantry, foodPreferences } = useWorkspace();
  return useMemo(() => {
    const finished = new Set(trips.filter(t => t.status === 'completed').map(t => t.id));
    const counts = new Map<string, number>();
    for (const i of items) if (i.purchased && finished.has(i.trip_id)) counts.set(i.food_id, (counts.get(i.food_id) || 0) + 1);
    const bought = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const liked = Object.entries(foodPreferences).filter(([, isLiked]) => isLiked).map(([id]) => id);
    const inPantry = new Set(pantry.map(p => p.food_id));
    const disliked = new Set(Object.entries(foodPreferences).filter(([, isLiked]) => !isLiked).map(([id]) => id));
    return [...new Set([...bought, ...liked])]
      .filter(id => !inPantry.has(id) && !disliked.has(id))
      .map(id => foodById(id))
      .filter((f): f is Food => !!f)
      .slice(0, MAX_PICKS);
  }, [trips, items, pantry, foodPreferences]);
}

export function PantryAddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { pantry, addPantry } = useWorkspace();
  const [query, setQuery] = useState('');
  const picks = usePantryPicks();
  const results = searchFoods(foods, query, 8);
  const has = (id: string) => pantry.some(p => p.food_id === id);

  function close(next: boolean) {
    if (!next) setQuery('');
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="pantry-dialog">
        <DialogHeader>
          <DialogTitle>Add to your pantry</DialogTitle>
          <DialogDescription>Pick what’s already at home. Each food counts as 1 serving a day toward your plan.</DialogDescription>
        </DialogHeader>

        {picks.length > 0 && (
          <div className="pantry-picks">
            <h3>Your usual picks</h3>
            <div>
              {picks.map(f => (
                <Button key={f.id} variant="outline" className="pantry-pick" onClick={() => void addPantry(f.id)} aria-label={`Add ${f.name} to your pantry`}>
                  <span aria-hidden="true">{f.emoji}</span>{f.name}<Plus size={14} aria-hidden="true" />
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="searchbox">
          <Search size={18} aria-hidden="true" />
          <input aria-label="Search foods to add to your pantry" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search foods, like rice or eggs…" autoFocus />
        </div>

        {query.trim() && (
          results.length ? (
            <div className="pantry-results">
              {results.map(f => {
                const added = has(f.id);
                return (
                  <button type="button" key={f.id} className="search-result" disabled={added} onClick={() => void addPantry(f.id)} aria-label={added ? `${f.name} is in your pantry` : `Add ${f.name} to your pantry`}>
                    <span className="food-emoji" aria-hidden="true">{f.emoji}</span>
                    <div><strong>{f.name}</strong><small>{f.category}</small></div>
                    {added ? <span className="in-pantry"><Check size={14} aria-hidden="true" /> In pantry</span> : <Plus size={17} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ) : <p className="empty-inline">No match. Try “beans”, “rice”, or “yogurt”.</p>
        )}

        <DialogFooter>
          <Button onClick={() => close(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
