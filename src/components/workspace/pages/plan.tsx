
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Minus, Plus, Search, ShoppingBasket, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { budgetWeeksLabel, daysLeftInPeriod, formatBudgetPeriod } from '@/lib/budget-period';
import { foodById, getFoodPairings, nutrientKeys, nutrientLabels, nutrientUnits, type Food } from '@/lib/foods';
import { logRecommendationAdded, logRecommendationsShown, type RecommendationSource, type ShownRecommendation } from '@/lib/recommendation-events';
import { useWorkspace } from '../context';
import { FoodFinder } from '../food-finder';
import { NutrientBar } from '../nutrient-bar';

function addFoodOnCardKeyDown(e: KeyboardEvent<HTMLDivElement>, add: () => void) {
  if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  add();
}

export function PlanPage() {
  const navigate = useNavigate();
  const [foodDetails, setFoodDetails] = useState<Food | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const searchArea = useRef<HTMLDivElement>(null);

  const {
    days, budget, budgetPeriod, periodSpent, budgetRemaining, search, selected, results, listItems, pantry, combined, daily, spend, active,
    suggestions, foodGapScores, foodPreferences, setFoodPreference, setSearch, setSelected, fail,
    addFood, updateQuantity, removeItem,
  } = useWorkspace();

    const pairingSuggestions = getFoodPairings(
    foodById(selected),
    [...listItems.map(item => item.food_id), ...pantry.map(item => item.food_id)],
    daily,
    Math.max(0, budgetRemaining),
    foodPreferences
  );

  const showPairings = listItems.some(item => item.food_id === selected) && pairingSuggestions.length > 0;
  const recommendedFoods = showPairings ? pairingSuggestions : suggestions.map(suggestion => suggestion.food);
  const recommendationSource: RecommendationSource = showPairings ? 'pairing' : 'nutrient_gap';
  const recommendationAnchor = showPairings ? selected : '';

  useEffect(() => {
    if (!searchOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!searchArea.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [searchOpen]);

  useEffect(() => {
    if (!foodDetails) return;
    const clearOnOutsideFoodClick = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const clickedFoodId = event.target.closest('[data-food-id]')?.getAttribute('data-food-id');
      if (clickedFoodId !== foodDetails.id) setFoodDetails(null);
    };
    document.addEventListener('pointerdown', clearOnOutsideFoodClick);
    return () => document.removeEventListener('pointerdown', clearOnOutsideFoodClick);
  }, [foodDetails]);

  // Log only the recommendations currently shown in the combined section.
  const recommendedFoodIds = recommendedFoods.map(food => food.id).join(',');
  useEffect(() => {
    void logRecommendationsShown(
      recommendedFoods.map((food, i): ShownRecommendation => ({
        source: recommendationSource,
        foodId: food.id,
        ...(recommendationAnchor ? { anchorFoodId: recommendationAnchor } : {}),
        rank: i + 1,
      })),
      active?.id
    );
  }, [recommendedFoodIds, recommendationSource, recommendationAnchor]);

  async function addRecommended(source: RecommendationSource, foodId: string, anchorFoodId?: string) {
    const item = await addFood(foodId);
    if (item) void logRecommendationAdded({ source, foodId, anchorFoodId }, item.trip_id, item.id);
  }

  // Bar: solid = already bought this period, light = planned on the current list.
  const used = periodSpent + spend;
  const pct = (n: number) => (budget ? Math.min(100, n / budget * 100) : 0);
  const daysLeft = daysLeftInPeriod(budgetPeriod);

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
          <span>Budget · {formatBudgetPeriod(budgetPeriod)}</span>
          <strong>${used.toFixed(2)} / ${budget.toFixed(0)} per {budgetWeeksLabel(budgetPeriod.weeks).replace(/^1 /, '')}</strong>
          <small className="plan-budget-detail">
            ${periodSpent.toFixed(2)} bought + ${spend.toFixed(2)} planned · {budgetRemaining >= 0 ? `$${budgetRemaining.toFixed(2)} left` : `$${(-budgetRemaining).toFixed(2)} over`} · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
          </small>
          <Link to="/profile">Edit</Link>
        </div>
        <div className="track budget-track">
          <div className={used > budget ? 'fill warning' : 'fill'} style={{ width: `${pct(periodSpent)}%` }} />
          <div className={used > budget ? 'fill planned warning' : 'fill planned'} style={{ width: `${Math.max(0, pct(used) - pct(periodSpent))}%` }} />
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

            <div ref={searchArea}>
              <div className="searchbox">
                <Search size={19} />
                <input
                  aria-label="Search foods"
                  value={search}
                  onFocus={() => setSearchOpen(true)}
                  onChange={e => { setSearch(e.target.value); setSearchOpen(true); }}
                  placeholder="Search foods, like eggs or spinach…"
                />
              </div>

              {searchOpen && search && (
                <div className="search-results">
                  {results.length
                    ? results.map(f => (
                      <div
                        key={f.id}
                        className="search-result food-card-clickable"
                        data-food-id={f.id}
                        role="group"
                        aria-label={`Add ${f.name} to your grocery list`}
                        tabIndex={0}
                        onClick={() => void addFood(f.id)}
                        onKeyDown={e => addFoodOnCardKeyDown(e, () => void addFood(f.id))}
                      >
                        <span className="food-emoji">{f.emoji}</span>
                        <div>
                          <button type="button" className="food-name-button" aria-label={`Show nutrition for ${f.name}`} onClick={e => { e.stopPropagation(); setFoodDetails(f); }}>
                            <strong>{f.name}</strong>
                          </button>
                          <small>{f.category} · ${f.price.toFixed(2)} / {f.unit}</small>
                        </div>
                        <Button size="icon" title={`Add ${f.name}`} onClick={e => { e.stopPropagation(); void addFood(f.id); }}>
                          <Plus size={17} />
                        </Button>
                      </div>
                    ))
                    : <p className="empty-inline">No exact match. Try “beans”, “rice”, or “yogurt”.</p>}
                  <button type="button" className="finder-launch" onClick={() => { setSearchOpen(false); setFinderOpen(true); }}>
                    <Sparkles size={15} aria-hidden="true" /> Can’t find it? Add “{search.trim()}” to Kiwi
                  </button>
                </div>
              )}
              <FoodFinder open={finderOpen} onOpenChange={setFinderOpen} initialQuery={search.trim()} onFinished={() => setSearch('')} />
            </div>

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
                      data-food-id={f.id}
                      onClick={() => { setSelected(f.id); setFoodDetails(f); }}
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
              {showPairings
                ? `Pairs well with ${foodById(selected)?.name} and can help fill nutrition gaps.`
                : 'Foods that can help fill nutrition gaps.'}
            </p>

            <div className="suggestion-grid">
              {recommendedFoods.length
                ? recommendedFoods.map(f => {
                  const reasons = foodGapScores.find(suggestion => suggestion.food.id === f.id)?.reasons ?? [];
                  const preference = foodPreferences[f.id];

                  return (
                    <div
                      className="suggestion food-card-clickable"
                      key={f.id}
                      data-food-id={f.id}
                      role="group"
                      aria-label={`Add ${f.name} to your grocery list`}
                      tabIndex={0}
                      onClick={() => void addRecommended(recommendationSource, f.id, recommendationAnchor || undefined)}
                      onKeyDown={e => addFoodOnCardKeyDown(e, () => void addRecommended(recommendationSource, f.id, recommendationAnchor || undefined))}
                    >
                      <span className="suggestion-emoji">{f.emoji}</span>
                      <div className="suggestion-copy">
                        <button type="button" className="food-name-button" aria-label={`Show nutrition for ${f.name}`} onClick={e => { e.stopPropagation(); setFoodDetails(f); }}>
                          <strong>{f.name}</strong>
                        </button>
                        <small>{f.note}</small>
                        <span className="suggestion-price">
                          ${f.price.toFixed(2)} · {reasons.length ? reasons.join(' + ') : `Pairs well with ${foodById(selected)?.name ?? 'your list'}`}
                        </span>
                      </div>

                      <div className="suggestion-actions" onClick={e => e.stopPropagation()}>
                        <Button
                          size="icon"
                          variant={preference === true ? 'default' : 'outline'}
                          title={`Like ${f.name}`}
                          aria-label={`Like ${f.name}`}
                          aria-pressed={preference === true}
                          onClick={() => void setFoodPreference(f.id, true)}
                        >
                          <ThumbsUp size={16} />
                        </Button>
                        <Button
                          size="icon"
                          variant={preference === false ? 'default' : 'outline'}
                          title={`Dislike ${f.name}`}
                          aria-label={`Dislike ${f.name}`}
                          aria-pressed={preference === false}
                          onClick={() => void setFoodPreference(f.id, false)}
                        >
                          <ThumbsDown size={16} />
                        </Button>
                        <Button
                          size="icon"
                          title={`Add ${f.name}`}
                          onClick={() => void addRecommended(recommendationSource, f.id, recommendationAnchor || undefined)}
                        >
                          <Plus size={16} />
                        </Button>
                      </div>
                    </div>
                  );
                })
                : (
                  <p className="empty-inline">
                    No suggestions right now.
                  </p>
                )}
            </div>
          </section>

        </div>

        <div className="right-column">
          <section className="nutrition-panel nutrition-summary">
            <h2>{foodDetails?.name ?? 'Nutrition'}</h2>
            <p>{foodDetails
              ? 'Nutrition per listed serving, compared with your daily targets.'
              : `Daily average across ${days} days, including pantry foods.`}</p>
            <div className="nutrient-list">
              {nutrientKeys.map(k => (
                <NutrientBar
                  key={k}
                  name={nutrientLabels[k]}
                  value={foodDetails ? foodDetails.nutrition[k] : combined[k] / days}
                  target={daily[k]}
                  unit={nutrientUnits[k]}
                />
              ))}
            </div>
            <div className="nutrition-foot">
              {foodDetails
                ? 'Approximate nutrition for the listed serving. Actual values may vary.'
                : 'Based on approximate package nutrition. Actual needs and portions may vary.'}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
