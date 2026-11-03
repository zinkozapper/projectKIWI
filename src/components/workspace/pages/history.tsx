import { Link } from '@tanstack/react-router';
import { ArrowRight, BookmarkPlus, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodById } from '@/lib/foods';
import { useWorkspace } from '../context';

export function HistoryPage() {
  const { trips, items, repeatTrip } = useWorkspace();
  const completed = trips.filter(t => t.status === 'completed');

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE GOOD OLD STAPLES</div>
          <h1>Your past trips<span className="brand-dot">.</span></h1>
          <p>Good groceries are worth repeating.</p>
        </div>
      </div>
      <div className="history-list">
        {completed.length ? completed.map(t => {
          const purchasedItems = items.filter(i => i.trip_id === t.id);
          return (
            <div className="history-row" key={t.id}>
              <div>
                <span className="section-kicker">{new Date(t.completed_at || t.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                <h2>{t.days}-day grocery trip</h2>
                <p>{purchasedItems.length} items · est. ${purchasedItems.reduce((s, i) => s + (foodById(i.food_id)?.price || 0) * i.quantity, 0).toFixed(2)}</p>
                <div className="history-foods">
                  {purchasedItems.slice(0, 7).map(i => <span title={foodById(i.food_id)?.name} key={i.id}>{foodById(i.food_id)?.emoji}</span>)}
                </div>
              </div>
              <Button variant="outline" onClick={() => repeatTrip(t)}><BookmarkPlus size={16} /> Repeat list</Button>
            </div>
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
