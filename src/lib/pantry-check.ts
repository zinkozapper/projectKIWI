// The pantry is persistent: a food stays until the user marks it gone. Before a new shopping trip
// starts (first add to an empty plan, "Check pantry" on My Plan, or repeating a past trip), the user
// confirms what's still at home. Foods still there keep counting toward nutrition and are not
// suggested or re-added, so a 20 lb bag of rice isn't on the list every week.

export type PantryCheckItem = { id: string; food_id: string };

// A check is due when a new trip is about to start and there is something in the pantry to confirm.
// While a trip is active the pantry was already confirmed for it.
export function needsPantryCheck(hasActiveTrip: boolean, pantryCount: number): boolean {
  return !hasActiveTrip && pantryCount > 0;
}

// goneIds are pantry_item ids the user marked as gone or used up.
export function splitPantryCheck<T extends PantryCheckItem>(pantry: T[], goneIds: Iterable<string>) {
  const gone = new Set(goneIds);
  return {
    keep: pantry.filter(p => !gone.has(p.id)),
    remove: pantry.filter(p => gone.has(p.id)),
  };
}

// Food ids the user still has after the check.
export function stillHaveFoodIds(keep: PantryCheckItem[]): Set<string> {
  return new Set(keep.map(p => p.food_id));
}

// Repeating a past trip skips foods that are still in the pantry.
export function itemsToRepeat<T extends { food_id: string }>(old: T[], stillHave: Set<string>) {
  return {
    copy: old.filter(i => !stillHave.has(i.food_id)),
    skipped: old.filter(i => stillHave.has(i.food_id)),
  };
}
