
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Minus, Plus, Search, ShoppingBasket, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodById, getFoodPairings, nutrientKeys, nutrientLabels, nutrientUnits } from '@/lib/foods';
import { useWorkspace } from '../context';
import { NutrientBar } from '../nutrient-bar';

export function PlanPage() {
  const navigate = useNavigate();
  const {
    days, budget, search, selected, results, listItems, pantry, combined, daily, spend,
    suggestions, setSearch, setSelected, fail,
    addFood, updateQuantity, removeItem,
  } = useWorkspace();

  const pairingSuggestions = getFoodPairings(
    foodById(selected),
    [...listItems.map(item => item.food_id), ...pantry.map(item => item.food_id)],
    daily,
    Math.max(0, budget - spend)
  );
  const period = days === 28 ? '1 month' : `${days / 7} ${days === 7 ? 'week' : 'weeks'}`;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Your grocery plan<span className="brand-dot">.</span></h1>
          <p>Build your list, then shop.</p>
        </div>
        {listItems.length > 0 && (
          <Button className="shop-action" onClick={() => navigate({ to: '/plan/shop' })}>
            <ShoppingBasket size={17} /> Shop this list ({listItems.length}) <ArrowRight size={16} />
          </Button>
        )}
      </div>

      <div className="budget-progress plan-budget-progress">
        <div className="plan-budget-copy">
          <span>Budget</span>
          <strong>${spend.toFixed(2)} / ${budget.toFixed(0)} · {period}</strong>
          <Link to="/profile">Edit</Link>
        </div>
        <div className="track">
          <div
            className={spend > budget ? 'fill warning' : 'fill'}
            style={{ width: `${Math.min(100, budget ? spend / budget * 100 : 0)}%` }}
          />
        </div>
      </div>

      <div className="plan-grid">
        <div className="left-column">
          <section className="section-block grocery-list-section">
            <div className="section-title">
              <div>
                <h2>Your grocery list</h2>
              </div>
              <span className="count-pill">{listItems.length} {listItems.length === 1 ? 'item' : 'items'}</span>
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
              <span>ITEM</span>
              <span>PRICE</span>
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
                Search above to add foods to your list.
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
                <h2>Suggestions</h2>
              </div>
            </div>

            <p className="section-note">
              Foods that can help fill nutrition gaps.
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
                    No suggestions right now.
                  </p>
                )}
            </div>
          </section>

          {listItems.some(item => item.food_id === selected) && pairingSuggestions.length > 0 && (
            <section className="section-block pairing-block">
              <div className="section-title">
                <h2>Pairs well with {foodById(selected)?.name}</h2>
              </div>
              <div className="pair-list">
                {pairingSuggestions.map(f => (
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
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="right-column">
          <section className="nutrition-panel nutrition-summary">
            <h2>Nutrition</h2>
            <p>Daily average across {days} days, including pantry foods.</p>
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
              Based on approximate package nutrition. Actual needs and portions may vary.
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
