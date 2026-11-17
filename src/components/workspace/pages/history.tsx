
import { Link } from '@tanstack/react-router';
import { customLabel } from '@/lib/food-packages';
import { useState } from 'react';
import { ArrowRight, BookmarkPlus, History, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodById, formatAmount } from '@/lib/foods';
import { useWorkspace } from '../context';

export function HistoryPage() {
  const {
    trips,
    items,
    addTripToPlan,
    deleteTrip,
    renameTrip,
    toggleTripFavorite,
    lineCost,
    packageOf,
  } = useWorkspace();

  const [undo, setUndo] = useState<{ restore: () => void; index: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const completed = trips.filter(t => t.status === 'completed');
  const favorites = completed.filter(t => t.is_favorite);
  const regularTrips = completed.filter(t => !t.is_favorite);

  const entries: (typeof regularTrips[number] | null)[] = [...regularTrips];
  if (undo) entries.splice(undo.index, 0, null);

  const renderTrip = (t: typeof completed[number], allowDelete: boolean) => {
    const tripItems = items.filter(i => i.trip_id === t.id);

    return (
      <section className="history-trip" key={t.id}>
        <div className="history-trip-heading">
          <div>
            <span className="section-kicker">
              {new Date(t.completed_at || t.created_at).toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>

            <h2>
              {editing?.id === t.id ? (
                <input
                  className="history-name-input"
                  aria-label="Trip name"
                  maxLength={100}
                  autoFocus
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  onBlur={() => {
                    void renameTrip(t, editing.name);
                    setEditing(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <button
                  className="history-name"
                  type="button"
                  title="Rename trip"
                  aria-label={`Rename ${t.name || `${t.days}-day grocery trip`}`}
                  onClick={() => setEditing({
                    id: t.id,
                    name: t.name || `${t.days}-day grocery trip`,
                  })}
                >
                  {t.name || `${t.days}-day grocery trip`}
                </button>
              )}
            </h2>

            <p>
              {tripItems.length} items · est. $
              {tripItems.reduce((s, i) => s + (lineCost(i) ?? 0), 0).toFixed(2)}
              {tripItems.some(i => lineCost(i) === null) &&
                ' · Partial estimate; some prices unknown'}
            </p>
          </div>
        </div>

        <div className="history-trip-actions">
          <Button
            className="history-favorite-toggle"
            variant="ghost"
            size="icon"
            aria-label={t.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            title={t.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => void toggleTripFavorite(t)}
          >
            <Star size={18} fill={t.is_favorite ? 'currentColor' : 'none'} />
          </Button>

          {allowDelete && (
            <Button
              className="history-delete"
              variant="ghost"
              size="icon"
              aria-label="Delete trip"
              onClick={() => {
                const pending = {
                  restore: deleteTrip(t),
                  index: regularTrips.indexOf(t),
                };

                setUndo(pending);
                window.setTimeout(() => {
                  setUndo(current => current === pending ? null : current);
                }, 6000);
              }}
            >
              <Trash2 size={16} />
            </Button>
          )}
        </div>

        <details className="history-details">
          <summary>View items</summary>
          <ul className="history-items">
            {tripItems.map(item => {
              const food = foodById(item.food_id);

              return (
                <li className="history-item" key={item.id}>
                  <span className="shop-food-emoji" aria-hidden="true">
                    {food?.emoji ?? '🛒'}
                  </span>

                  <span className="shop-cart-name">
                    {food?.name ?? 'Unavailable food'}
                    <small>
                      {packageOf(item)
                        ? `${Number(item.quantity)} × ${item.custom_amount != null && item.custom_unit ? customLabel(item.custom_amount, item.custom_unit) : packageOf(item)!.label}`
                        : <>{formatAmount(Number(item.quantity))} {Number(item.quantity) === 1 ? 'serving' : 'servings'}{food && ` · ${formatAmount(food.servings)} ${food.unit} each`}</>}
                    </small>
                  </span>

                  {food && (
                    <span className="shop-item-price">
                      {lineCost(item) != null
                        ? `$${lineCost(item)!.toFixed(2)}`
                        : 'Price unknown'}
                      <small>estimated</small>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>

        <Button
          className="history-repeat"
          variant="outline"
          onClick={() => addTripToPlan(t)}
        >
          <BookmarkPlus size={16} /> Add list to plan
        </Button>
      </section>
    );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Past Trips</h1>
        </div>
      </div>

      <section className="history-favorites">
        <h2>Favorite Carts</h2>

        {favorites.length ? (
          <div className="history-list">
            {favorites.map(t => renderTrip(t, false))}
          </div>
        ) : (
          <p className="history-favorites-empty">
            Star a past trip to save it here for quick access.
          </p>
        )}
      </section>

      <section>
        <h2>Shopping History</h2>

        <div className="history-list">
          {entries.length ? (
            entries.map(t => {
              if (!t) {
                return undo && (
                  <div key="undo" className="history-undo" role="status">
                    Trip deleted.
                    <Button
                      variant="ghost"
                      onClick={() => {
                        undo.restore();
                        setUndo(null);
                      }}
                    >
                      Undo
                    </Button>
                  </div>
                );
              }

              return renderTrip(t, true);
            })
          ) : completed.length ? (
            <p>All your past trips are saved in Favorite Carts.</p>
          ) : (
            <div className="empty-state tall">
              <History size={30} />
              <h2>Your history starts here</h2>
              <p>Finish a grocery trip and it’ll show up here for easy repeats.</p>
              <Button asChild>
                <Link to="/plan">
                  Start planning <ArrowRight size={16} />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
