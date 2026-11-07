import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { foodById } from '@/lib/foods';
import { useWorkspace } from './context';

// Shown before a new shopping trip starts. Every pantry food starts as "Still have"; the user taps
// the ones that are gone or used up. Foods still at home keep counting toward My Plan's nutrition
// and aren't suggested again.
export function PantryCheckDialog() {
  const { pantry, pantryCheckOpen, finishPantryCheck } = useWorkspace();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pantryCheckOpen) setGone(new Set());
  }, [pantryCheckOpen]);

  const stocked = pantry
    .map(item => ({ item, food: foodById(item.food_id) }))
    .filter(x => x.food)
    .sort((a, b) => a.food!.name.localeCompare(b.food!.name));
  const stillHave = pantry.length - gone.size;

  function toggle(id: string) {
    setGone(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirm() {
    setSaving(true);
    try {
      await finishPantryCheck([...gone]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={pantryCheckOpen} onOpenChange={open => { if (!open && !saving) void finishPantryCheck(null); }}>
      <DialogContent className="pantry-dialog pantry-check-dialog">
        <DialogHeader>
          <DialogTitle>What’s still in your pantry?</DialogTitle>
          <DialogDescription>
            Before you plan this trip, tap anything that’s gone or used up. Foods you still have count toward your nutrition and won’t be added to your list again.
          </DialogDescription>
        </DialogHeader>

        <div className="pantry-check-list" role="group" aria-label="Pantry foods">
          {stocked.map(({ item, food }) => {
            const isGone = gone.has(item.id);
            return (
              <button
                type="button"
                key={item.id}
                className={isGone ? 'pantry-check-row gone' : 'pantry-check-row'}
                aria-pressed={isGone}
                aria-label={isGone ? `${food!.name}: marked gone. Tap if you still have it.` : `${food!.name}: still have. Tap if it's gone.`}
                onClick={() => toggle(item.id)}
              >
                <span className="food-emoji" aria-hidden="true">{food!.emoji}</span>
                <strong>{food!.name}</strong>
                <span className="pantry-check-state">
                  {isGone ? <><X size={14} aria-hidden="true" /> Gone</> : <><Check size={14} aria-hidden="true" /> Still have</>}
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter className="pantry-check-footer">
          <small>{stillHave} still at home{gone.size ? ` · ${gone.size} gone` : ''}</small>
          <Button onClick={() => void confirm()} disabled={saving}>
            {saving ? 'Saving…' : gone.size ? 'Update pantry and plan' : 'All still here, start planning'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
