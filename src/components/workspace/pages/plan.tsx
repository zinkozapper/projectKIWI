
import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, ChefHat, House, Minus, Plus, Search, ShoppingBasket, Sparkles, ThumbsDown, ThumbsUp, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePhoneLayout } from '@/hooks/use-phone-layout';
import { budgetWeeksLabel, daysLeftInPeriod, formatBudgetPeriod } from '@/lib/budget-period';
import { foodById, formatAmount, getFoodPairings, nutrientKeys, nutrientLimits, NUTRIENTS, type Food, type Nutrients } from '@/lib/foods';
import { boostTitle } from '@/lib/recommendation-boosts';
import { logRecommendationAdded, logRecommendationsShown, type RecommendationSource, type ShownRecommendation } from '@/lib/recommendation-events';
import { useWorkspace } from '../context';
import { FoodFinder } from '../food-finder';
import { NutrientPanel } from '../nutrient-bar';

const perDay = (n: Nutrients, days: number) => Object.fromEntries(nutrientKeys.map(k => [k, n[k] / days])) as Nutrients;

function addFoodOnCardKeyDown(e: KeyboardEvent<HTMLDivElement>, add: () => void) {
  if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  add();
}

export function PlanPage() {
  const navigate = useNavigate();
  const [foodDetails, setFoodDetails] = useState<Food | null>(null);
  const [detailsFromSearch, setDetailsFromSearch] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [lastChange, setLastChange] = useState<{
    foodId: string;
    foodName: string;
    previousPreference: boolean | undefined;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!lastChange) return;

    const timer = window.setTimeout(() => setLastChange(null), 8000);
    return () => window.clearTimeout(timer);
  }, [lastChange]);

  async function changePreference(foodId: string, foodName: string, liked: boolean) {
    const previousPreference = foodPreferences[foodId];

    const succeeded = await setFoodPreference(foodId, liked);
    if (!succeeded) return;

    setLastChange({
      foodId,
      foodName,
      previousPreference,
      message: `Added ${foodName} to ${liked ? 'liked' : 'disliked'} foods.`,
    });
  }

  async function undoPreferenceChange() {
    if (!lastChange) return;

    const previousChange = lastChange;
    setLastChange(null);

    if (previousChange.previousPreference === undefined) {
      await removeFoodPreference(previousChange.foodId);
    } else {
      await setFoodPreference(
        previousChange.foodId,
        previousChange.previousPreference
      );
    }
  }
  // On phones the nutrition panel sits below everything else, so food details open in a dialog
  // instead, and the plan's nutrition summary moves above the list as a collapsible section.
  const isPhone = usePhoneLayout();

  const {
    days, budget, budgetPeriod, periodSpent, budgetRemaining, search, selected, results, listItems, pantry, combined, pantryTotals, daily, spend, active,
    suggestions, foodGapScores, foodPreferences, setFoodPreference, removeFoodPreference, setSearch, setSelected, fail,
    addFood, updateQuantity, removeItem, pantryCheckDue, startPlan, profile, isFirstSession, priceOf, hasUnpricedBudgetItems,
  } = useWorkspace();
  const inPantry = (foodId: string) => pantry.some(p => p.food_id === foodId);

    const pairingSuggestions = getFoodPairings(
    foodById(selected),
    [...listItems.map(item => item.food_id), ...pantry.map(item => item.food_id)],
    daily,
    budgetRemaining,
    foodPreferences,
    days,
    priceOf
  );

  const showPairings = listItems.some(item => item.food_id === selected) && pairingSuggestions.length > 0;
  const recommendedFoods = showPairings ? pairingSuggestions : suggestions.map(suggestion => suggestion.food);
  const recommendationSource: RecommendationSource = showPairings ? 'pairing' : 'nutrient_gap';
  const recommendationAnchor = showPairings ? selected : '';

  useEffect(() => {
    // The phone dialog closes itself; a touch to scroll must not clear it.
    if (!foodDetails || isPhone || detailsFromSearch) return;
    const clearOnOutsideFoodClick = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const clickedFoodId = event.target.closest('[data-food-id]')?.getAttribute('data-food-id');
      if (clickedFoodId !== foodDetails.id) setFoodDetails(null);
    };
    document.addEventListener('pointerdown', clearOnOutsideFoodClick);
    return () => document.removeEventListener('pointerdown', clearOnOutsideFoodClick);
  }, [foodDetails, isPhone, detailsFromSearch]);

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

  const planPerDay = perDay(combined, days);
  const goalNutrients = NUTRIENTS.filter(n => !nutrientLimits.has(n.key));
  const goalsMet = goalNutrients.filter(n => planPerDay[n.key] >= daily[n.key]).length;
  const planNutritionNote = `Daily average across ${days} days from your pantry plus your list. Each + adds 1 serving a day; pantry foods count as 1 serving a day.`;
  const planNutritionFoot = 'Based on approximate package nutrition. Actual needs and portions may vary.';

  return (
    <>
      {!profile && !isFirstSession && (
        <p className="section-note">
          You're currently using default nutrition estimates. Complete your profile
          using the account button to get nutrition goals personalized to you.
        </p>
      )}

      <div className="page-heading">
        <div>
          <h1>Your grocery plan</h1>
        </div>
        <Button asChild variant="outline">
          <Link to="/plan/recipes"><ChefHat size={16} /> Recipes</Link>
        </Button>
      </div>

      {!isFirstSession && <div className="budget-progress plan-budget-progress">
        <div className="plan-budget-copy">
          <span>Budget · {formatBudgetPeriod(budgetPeriod)}</span>
          <strong>${used.toFixed(2)} / ${budget.toFixed(0)} per {budgetWeeksLabel(budgetPeriod.weeks).replace(/^1 /, '')}</strong>
          {hasUnpricedBudgetItems && <small>Partial estimate: some items have unknown prices.</small>}
          <small className="plan-budget-detail">
            ${periodSpent.toFixed(2)} bought + ${spend.toFixed(2)} planned · {budgetRemaining >= 0 ? `$${budgetRemaining.toFixed(2)} left` : `$${(-budgetRemaining).toFixed(2)} over`} · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
          </small>
          <Link to="/profile">Edit</Link>
        </div>
        <div className="track budget-track">
          <div className={used > budget ? 'fill warning' : 'fill'} style={{ width: `${pct(periodSpent)}%` }} />
          <div className={used > budget ? 'fill planned warning' : 'fill planned'} style={{ width: `${Math.max(0, pct(used) - pct(periodSpent))}%` }} />
        </div>
      </div>}

      {pantryCheckDue && !isFirstSession && (
        <div className="pantry-check-banner">
          <div>
            <strong>New trip? Check your pantry first.</strong>
            <small>You have {pantry.length} {pantry.length === 1 ? 'food' : 'foods'} at home. Mark anything that’s gone so your plan counts what you still have and doesn’t suggest buying it again.</small>
          </div>
          <Button variant="outline" onClick={() => void startPlan()}><House size={16} /> Check pantry</Button>
        </div>
      )}

      {isPhone && (
        <details className="nutrition-panel phone-nutrition-summary">
          <summary>
            <span>Nutrition</span>
            <small>{goalsMet} of {goalNutrients.length} daily targets met</small>
          </summary>
          <p>{planNutritionNote}</p>
          <NutrientPanel values={planPerDay} base={perDay(pantryTotals, days)} targets={daily} />
          <div className="nutrition-foot">{planNutritionFoot}</div>
        </details>
      )}

      <div className="plan-grid">
        <div className="left-column">
          <section className="section-block grocery-list-section">
            <div className="section-title">
              <div>
                <h2>Your grocery list</h2>
              </div>
              <Button onClick={() => setSearchOpen(true)}><Plus size={16} /> Add to list</Button>
            </div>

            <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
              <DialogContent className="pantry-dialog">
                <DialogHeader>
                  <DialogTitle>Add to your grocery list</DialogTitle>
                  <DialogDescription>Search for foods to add to your list.</DialogDescription>
                </DialogHeader>
              <div className="searchbox">
                <Search size={19} />
                <input
                  aria-label="Search foods"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search foods, like eggs or spinach…"
                  autoFocus
                />
              </div>

              {search.trim() && (
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
                          <button type="button" className="food-name-button" aria-label={`Show nutrition for ${f.name}`} onClick={e => { e.stopPropagation(); setDetailsFromSearch(true); setFoodDetails(f); }}>
                            <strong>{f.name}</strong>
                          </button>
                          <small>{f.category} · {priceOf(f.id) != null ? `$${priceOf(f.id)!.toFixed(2)} / ${f.unit}` : 'Price unknown'}{inPantry(f.id) && <span className="in-pantry-note"> · In your pantry</span>}</small>
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
              <Button onClick={() => setSearchOpen(false)}>Done</Button>
              </DialogContent>
            </Dialog>
            <FoodFinder open={finderOpen} onOpenChange={setFinderOpen} initialQuery={search.trim()} onFinished={() => setSearch('')} />

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
                        <small>{inPantry(f.id) && <span className="in-pantry-note">Already in your pantry · </span>}{f.note}</small>
                      </div>
                      {/* quantity is total servings; the control works in servings per day across the plan. */}
                      <div className="qty-control per-day" onClick={e => e.stopPropagation()}>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="One less serving a day"
                          onClick={() => {
                            const next = Number(item.quantity) - days;
                            if (next > 0) updateQuantity(item, next);
                            else removeItem(item);
                          }}
                        >
                          <Minus size={13} />
                        </Button>
                        <input
                          aria-label={`${f.name} servings per day`}
                          type="number"
                          min="1"
                          step="1"
                          value={Number(formatAmount(Number(item.quantity) / days).replace(/,/g, ''))}
                          onChange={e => {
                            const q = Number(e.target.value);
                            if (q > 0) updateQuantity(item, q * days);
                            else fail('Servings per day must be a positive number.');
                          }}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          title="One more serving a day"
                          onClick={() => updateQuantity(item, Number(item.quantity) + days)}
                        >
                          <Plus size={13} />
                        </Button>
                      </div>
                      <span className="qty-caption">/day · {formatAmount(Number(item.quantity))} total</span>
                      <span className="row-price">
                        {priceOf(f.id) != null ? `$${(priceOf(f.id)! * item.quantity).toFixed(2)}` : 'Price unknown'}
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
                Add foods to start your grocery list.
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
                  const scored = foodGapScores.find(suggestion => suggestion.food.id === f.id);
                  const boosts = scored?.boosts ?? [];
                  const addCost = (priceOf(f.id) ?? 0) * days;
                  const overBudget = addCost > 0 && addCost > budgetRemaining;
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
                          {addCost > 0 ? `$${addCost.toFixed(2)} for ${days} days` : 'Price unknown'}{overBudget ? ' · Over budget, best value' : ''}{boosts.length ? '' : ` · Pairs well with ${foodById(selected)?.name ?? 'your list'}`}
                        </span>
                        {boosts.length > 0 && (
                          <ul className="boost-chips" aria-label={`Nutrients ${f.name} helps with`}>
                            {boosts.map(boost => (
                              <li key={boost.key} className="boost-chip" title={boostTitle(boost)}>
                                {boost.label} <span>+{boost.percentage}%</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="suggestion-actions" onClick={e => e.stopPropagation()}>
                        <Button
                          size="icon"
                          variant={preference === true ? 'default' : 'outline'}
                          title={`Like ${f.name}`}
                          aria-label={`Like ${f.name}`}
                          aria-pressed={preference === true}
                          onClick={() => void changePreference(f.id, f.name, true)}
                        >
                          <ThumbsUp size={16} />
                        </Button>
                        <Button
                          size="icon"
                          variant={preference === false ? 'default' : 'outline'}
                          title={`Dislike ${f.name}`}
                          aria-label={`Dislike ${f.name}`}
                          aria-pressed={preference === false}
                          onClick={() => void changePreference(f.id, f.name, false)}
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

        {!isPhone && (
          <div className="right-column">
            <section className="nutrition-panel nutrition-summary">
              <h2>{foodDetails?.name ?? 'Nutrition'}</h2>
              <p>{foodDetails
                ? 'Nutrition per listed serving, compared with your daily targets.'
                : planNutritionNote}</p>
              {foodDetails
                ? <NutrientPanel values={foodDetails.nutrition} targets={daily} />
                : <NutrientPanel values={planPerDay} base={perDay(pantryTotals, days)} targets={daily} />}
              <div className="nutrition-foot">
                {foodDetails
                  ? 'Approximate nutrition for the listed serving. Actual values may vary.'
                  : planNutritionFoot}
              </div>
            </section>
          </div>
        )}
      </div>

      {listItems.length > 0 && (
        <Button className="shop-action" onClick={() => navigate({ to: '/plan/shop' })}>
          <ShoppingBasket size={17} /> Shop this list ({listItems.length}) <ArrowRight size={16} />
        </Button>
      )}

      {(isPhone || detailsFromSearch) && (
        <Dialog open={!!foodDetails} onOpenChange={open => { if (!open) { setFoodDetails(null); setDetailsFromSearch(false); } }}>
          <DialogContent className="food-details-dialog">
            {foodDetails && (
              <>
                <DialogHeader>
                  <DialogTitle>{foodDetails.emoji} {foodDetails.name}</DialogTitle>
                  <DialogDescription>Nutrition per listed serving, compared with your daily targets.</DialogDescription>
                </DialogHeader>
                <NutrientPanel values={foodDetails.nutrition} targets={daily} />
                <div className="nutrition-foot">Approximate nutrition for the listed serving. Actual values may vary.</div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
      {lastChange && (
        <div className="undo-bar" role="status">
          <span>{lastChange.message}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void undoPreferenceChange()}
          >
            <Undo2 size={15} aria-hidden="true" /> Undo
          </Button>
        </div>
      )}
    </>
  );
}
