import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';

// Logs recommendation impressions and outcomes to public.recommendation_event (migration 0003).
// The OKR metric is: impressions with an 'added' event / impressions with a 'shown' event.

export type RecommendationSource = 'nutrient_gap' | 'pairing';
export type ShownRecommendation = { source: RecommendationSource; foodId: string; anchorFoodId?: string | undefined; rank: number };
type RecommendationRef = Omit<ShownRecommendation, 'rank'>;
type EventRow = TablesInsert<'recommendation_event'>;

// One impression per recommended food per page load, keyed by source + anchor + food. A food that keeps
// showing across re-renders or tab switches is the same impression, so 'shown' is only logged once.
// A reload starts new impressions.
const impressions = new Map<string, string>();

const keyOf = (r: RecommendationRef) => `${r.source}:${r.anchorFoodId ?? ''}:${r.foodId}`;
const toId = (id: string | null | undefined) => (id ? Number(id) : null);

function newImpressionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Tracking must never break the planner, so failures only go to the console.
async function insertEvents(rows: EventRow[]) {
  if (!rows.length) return;
  const { error } = await supabase
    .from('recommendation_event')
    .upsert(rows, { onConflict: 'impression_id,event_type', ignoreDuplicates: true });
  if (error) console.error('Failed to log recommendation event:', error);
}

export function logRecommendationsShown(recs: ShownRecommendation[], shoppingListId?: string) {
  const rows = recs.filter(r => !impressions.has(keyOf(r))).map((r): EventRow => {
    const impressionId = newImpressionId();
    impressions.set(keyOf(r), impressionId);
    return {
      impression_id: impressionId,
      event_type: 'shown',
      source: r.source,
      food_id: Number(r.foodId),
      anchor_food_id: toId(r.anchorFoodId),
      rank: r.rank,
      shopping_list_id: toId(shoppingListId),
    };
  });
  return insertEvents(rows);
}

function logOutcome(eventType: 'added' | 'dismissed', rec: RecommendationRef, shoppingListId?: string, shoppingListItemId?: string) {
  const impressionId = impressions.get(keyOf(rec));
  if (!impressionId) return Promise.resolve();
  // The impression is finished. If the food is recommended again later, that is a new impression.
  impressions.delete(keyOf(rec));
  return insertEvents([{
    impression_id: impressionId,
    event_type: eventType,
    source: rec.source,
    food_id: Number(rec.foodId),
    anchor_food_id: toId(rec.anchorFoodId),
    shopping_list_id: toId(shoppingListId),
    shopping_list_item_id: toId(shoppingListItemId),
  }]);
}

export const logRecommendationAdded = (rec: RecommendationRef, shoppingListId?: string, shoppingListItemId?: string) =>
  logOutcome('added', rec, shoppingListId, shoppingListItemId);

export const logRecommendationDismissed = (rec: RecommendationRef, shoppingListId?: string) =>
  logOutcome('dismissed', rec, shoppingListId);

// Call on sign-out so the next user in this tab starts with fresh impressions.
export function resetRecommendationImpressions() {
  impressions.clear();
}
