
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Minus, Plus, Search, ShoppingBasket, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodById, getFoodPairings, nutrientKeys, nutrientLabels, nutrientUnits } from '@/lib/foods';
import { useWorkspace } from '../context';
import { NutrientBar } from '../nutrient-bar';

export function PlanPage() {
  const navigate = useNavigate();
  const {
    days, budget, search, selected, results, listItems, pantry, combined, daily, spend, coverage,
    suggestions, setSearch, setSelected, fail,
    addFood, updateQuantity, removeItem,
  } = useWorkspace();

  const pairingSuggestions = getFoodPairings(
    foodById(selected),
    [...listItems.map(item => item.food_id), ...pantry.map(item => item.food_id)],
    daily,
    Math.max(0, budget - spend)
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Your grocery plan<span className="brand-dot">.</span></h1>
          <p>Build a balanced grocery list within your budget.</p>
        </div>
        <Button className="shop-action" onClick={() => navigate({ to: '/plan/shop' })}>
          <ShoppingBasket size={17} /> Shop this list <ArrowRight size={16} />
        </Button>
      </div>

      <div className="budget-progress plan-budget-progress">
        <span>${spend.toFixed(2)} of ${budget.toFixed(0)} estimated for {days / 7} {days === 7 ? 'week' : 'weeks'}</span>
        <div className="track">
          <div
            className={spend > budget ? 'fill warning' : 'fill'}
            style={{ width: `${Math.min(100, budget ? spend / budget * 100 : 0)}%` }}
          />
        </div>
      </div>

      <div className="plan-grid">
        <div className="left-column">
          <section className="section-block">
            <div className="section-title">
              <div>
                <h2>What’s going in your cart?</h2>
              </div>
              <span className="count-pill">{listItems.length} items</span>
            </div>

            <div className="searchbox">
              <Search size={19} />
              <input
                aria-label="Search foods"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search foods, like eggs or spinach…"
              />
            </div>

            {search && (
              <div className="search-results">
                {results.length
                  ? results.map(f => (
                    <div key={f.id} className="search-result">
                      <span className="food-emoji">{f.emoji}</span>
                      <div>
                        <strong>{f.name}</strong>
                        <small>{f.category} · ${f.price.toFixed(2)} / {f.unit}</small>
                      </div>
                      <Button size="icon" title={`Add ${f.name}`} onClick={() => addFood(f.id)}>
                        <Plus size={17} />
                      </Button>
                    </div>
                  ))
                  : <p className="empty-inline">No exact match. Try “beans”, “rice”, or “yogurt”.</p>}
              </div>
            )}

            <div className="list-head">
              <span>YOUR LIST</span>
              <span>EST. PRICE</span>
            </div>

            {listItems.length ? (
              <div className="grocery-list">
                {listItems.map(item => {
                  const f = foodById(item.food_id);
                  if (!f) return null;

                  return (
                    <div
                      className="grocery-row"
                      key={item.id}
                      onClick={() => setSelected(f.id)}
                    >
                      <span className="food-emoji">{f.emoji}</span>
                      <div className="food-description">
                        <strong>{f.name}</strong>
                        <small>{f.note}</small>
                      </div>
                      <div className="qty-control" onClick={e => e.stopPropagation()}>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Decrease quantity"
                          onClick={() => updateQuantity(item, Number(item.quantity) - 1)}
                        >
                          <Minus size={13} />
                        </Button>
                        <input
                          aria-label={`${f.name} quantity`}
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => {
                            const q = Number(e.target.value);
                            if (q > 0) updateQuantity(item, q);
                            else fail('Quantity must be a positive number.');
                          }}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Increase quantity"
                          onClick={() => updateQuantity(item, Number(item.quantity) + 1)}
                        >
                          <Plus size={13} />
                        </Button>
                      </div>
                      <span className="row-price">
                        ${(f.price * item.quantity).toFixed(2)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="remove"
                        title={`Remove ${f.name}`}
                        onClick={e => {
                          e.stopPropagation();
                          removeItem(item);
                        }}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                Your list is ready for its first item. Search above or try a suggestion below.
              </div>
            )}

            <div className="list-total">
              <span>Estimated total</span>
              <strong>${spend.toFixed(2)}</strong>
            </div>
          </section>

          <section className="section-block suggestions-block">
            <div className="section-title">
              <div>
                <h2>Good things to add</h2>
              </div>
            </div>

            <p className="section-note">
              Simple whole foods that help fill your biggest gaps.
            </p>

            <div className="suggestion-grid">
              {suggestions.length
                ? suggestions.map(({ food: f, reasons }) => (
                  <div className="suggestion" key={f.id}>
                    <span className="suggestion-emoji">{f.emoji}</span>
                    <div className="suggestion-copy">
                      <strong>{f.name}</strong>
                      <small>{f.note}</small>
                      <span className="suggestion-price">
                        ${f.price.toFixed(2)} · {reasons.join(' + ')}
                      </span>
                    </div>
                    <Button
                      size="icon"
                      title={`Add ${f.name}`}
                      onClick={() => addFood(f.id)}
                    >
                      <Plus size={16} />
                    </Button>
                  </div>
                ))
                : (
                  <p className="empty-inline">
                    No suggestions fit the remaining budget. Try adjusting your budget.
                  </p>
                )}
            </div>
          </section>

          <section className="section-block pairing-block">
            <div className="section-title">
              <div>
                <h2>Pairs well with {foodById(selected)?.name || 'your list'}</h2>
              </div>
            </div>

            <p className="section-note">
              Discover foods that naturally belong together in everyday meals.
            </p>

            <div className="pair-list">
              {pairingSuggestions.length
                ? pairingSuggestions.map(f => (
                  <div className="pair" key={f.id}>
                    <span className="food-emoji">{f.emoji}</span>
                    <div>
                      <strong>{f.name}</strong>
                      <small>{f.note}</small>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addFood(f.id)}
                    >
                      <Plus size={15} /> Add
                    </Button>
                  </div>
                ))
                : (
                  <p className="empty-inline">
                    Select a food from your grocery list to discover delicious meal pairings.
                    Suggestions must also fit your remaining budget.
                  </p>
                )}
            </div>
          </section>
        </div>

        <div className="right-column">
          <section className="nutrition-panel">
            <h2>How’s your list looking?</h2>
            <p>Estimated daily average across {days} days, including your pantry.</p>

            <div className="coverage-number">
              <span>{coverage}%</span>
              <small>of core targets<br />in a good range</small>
            </div>

            <div className="nutrient-list">
              {nutrientKeys.map(k => (
                <NutrientBar
                  key={k}
                  name={nutrientLabels[k]}
                  value={combined[k] / days}
                  target={daily[k]}
                  unit={nutrientUnits[k]}
                />
              ))}
            </div>

            <div className="nutrition-foot">
              Based on approximate package nutrition. Your needs and actual portions may vary.
            </div>
          </section>

          <div className="tip-band">
            <span>✳</span>
            <p>
              <strong>Small swaps, big difference.</strong>
              <br />
              Canned, frozen, and ready-to-eat still count.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
