import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ArrowRight, BookmarkPlus, History, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodById, formatAmount } from '@/lib/foods';
import { useWorkspace } from '../context';

export function HistoryPage() {
  const { trips, items, addTripToPlan, deleteTrip, renameTrip, priceOf } = useWorkspace();
  const [undo, setUndo] = useState<{ restore: () => void; index: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const completed = trips.filter(t => t.status === 'completed');
  const entries: (typeof completed[number] | null)[] = [...completed];
  if (undo) entries.splice(undo.index, 0, null);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Past Trips</h1>
        </div>
      </div>
      <div className="history-list">
        {entries.length ? entries.map(t => {
          if (!t) return undo && <div key="undo" className="history-undo" role="status">Trip deleted. <Button variant="ghost" onClick={() => { undo.restore(); setUndo(null); }}>Undo</Button></div>;
          const tripItems = items.filter(i => i.trip_id === t.id);
          return (
            <section className="history-trip" key={t.id}>
              <div className="history-trip-heading">
                <div>
                  <span className="section-kicker">{new Date(t.completed_at || t.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  <h2>{editing?.id === t.id ? (
                    <input className="history-name-input" aria-label="Trip name" maxLength={100} autoFocus value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} onBlur={() => { void renameTrip(t, editing.name); setEditing(null); }} onKeyDown={e => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setEditing(null);
                    }} />
                  ) : <button className="history-name" type="button" title="Rename trip" aria-label={`Rename ${t.name || `${t.days}-day grocery trip`}`} onClick={() => setEditing({ id: t.id, name: t.name || `${t.days}-day grocery trip` })}>{t.name || `${t.days}-day grocery trip`}</button>}</h2>
                  <p>{tripItems.length} items · est. ${tripItems.reduce((s, i) => s + (priceOf(i.food_id) ?? 0) * i.quantity, 0).toFixed(2)}{tripItems.some(i => priceOf(i.food_id) === null) && ' · Partial estimate; some prices unknown'}</p>
                </div>
              </div>
              <details className="history-details">
                <summary>View items</summary>
                <ul className="history-items">
                {tripItems.map(item => {
                  const food = foodById(item.food_id);
                  return (
                    <li className="history-item" key={item.id}>
                      <span className="shop-food-emoji" aria-hidden="true">{food?.emoji ?? '🛒'}</span>
                      <span className="shop-cart-name">{food?.name ?? 'Unavailable food'}<small>{formatAmount(Number(item.quantity))} {Number(item.quantity) === 1 ? 'serving' : 'servings'}{food && ` · ${formatAmount(food.servings)} ${food.unit} each`}</small></span>
                      {food && <span className="shop-item-price">{priceOf(food.id) != null ? `$${(priceOf(food.id)! * item.quantity).toFixed(2)}` : 'Price unknown'}<small>estimated</small></span>}
                    </li>
                  );
                })}
                </ul>
              </details>
              <Button className="history-repeat" variant="outline" onClick={() => addTripToPlan(t)}><BookmarkPlus size={16} /> Add list to plan</Button>
              <Button className="history-delete" variant="ghost" size="icon" aria-label="Delete trip" onClick={() => {
                const pending = { restore: deleteTrip(t), index: completed.indexOf(t) };
                setUndo(pending);
                window.setTimeout(() => setUndo(current => current === pending ? null : current), 6000);
              }}><Trash2 size={16} /></Button>
            </section>
          );
        }) : (
          <div className="empty-state tall">
            <History size={30} />
            <h2>Your history starts here</h2>
            <p>Finish a grocery trip and it’ll show up here for easy repeats.</p>
            <Button asChild><Link to="/plan">Start planning <ArrowRight size={16} /></Link></Button>
          </div>
        )}
      </div>
    </>
  );
}
