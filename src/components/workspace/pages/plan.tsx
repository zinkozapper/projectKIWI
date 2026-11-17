
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, ChefHat, CircleHelp, House, Minus, Plus, Search, ShoppingBasket, Sparkles, ThumbsDown, ThumbsUp, Trash2, Undo2, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePhoneLayout } from '@/hooks/use-phone-layout';
import { useCloseMatches } from '@/hooks/use-close-matches';
import { budgetWeeksLabel, daysLeftInPeriod, formatBudgetPeriod } from '@/lib/budget-period';
import { foodById, formatAmount, getFoodPairings, nutrientKeys, nutrientLabels, nutrientLimits, NUTRIENTS, type Food, type NutrientKey, type Nutrients } from '@/lib/foods';
import { NUTRIENT_INFO, searchNutrients } from '@/lib/nutrient-info';
import { boostTitle, MIN_BOOST_PERCENT } from '@/lib/recommendation-boosts';
import { nutrientGap } from '@/lib/nutrient-suggestions';
import { logRecommendationAdded, logRecommendationDismissed, logRecommendationsShown, type RecommendationSource, type ShownRecommendation } from '@/lib/recommendation-events';
import { useWorkspace } from '../context';
import { FoodFinder } from '../food-finder';
import { CloseMatchNote } from '../close-match-note';
import { NutrientPanel } from '../nutrient-bar';
import { PrepSelect } from '../prep-select';
import { PriceEstimate, SizeSelect } from '../package-controls';
import { customLabel, customUnitsFor, defaultPackage, packageCaption, packageNoun, servingsText } from '@/lib/food-packages';
import { LIMITS, numberKeyGuard } from '@/lib/validation';

// "Suggestions for vitamin A", "for zinc", "for omega-3 (ALA)": vitamins keep their capital letter.
const suggestionHeading = (k: NutrientKey) => {
  const label = nutrientLabels[k];
  return /^Vitamin /.test(label) ? label.replace(/^Vitamin/, 'vitamin') : label.charAt(0).toLowerCase() + label.slice(1);
};

// More than this many servings of one food a day is almost certainly a typo.
const MAX_SERVINGS_PER_DAY = 10;
const MAX_PACKAGES = 20;

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
  const [finderOpen, setFinderOpen] = useState(false);
  // Prep style picked in the search results before adding (food id -> option id; null = any).
  const [searchPrep, setSearchPrep] = useState<Record<string, string | null>>({});
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

    // Clicking the currently selected preference removes it.
    const removing = previousPreference === liked;

    const succeeded = removing
      ? await removeFoodPreference(foodId)
      : await setFoodPreference(foodId, liked);

    if (!succeeded) return;

    // A thumbs-down on a shown suggestion takes it out of the suggestions; count it as dismissed (OKR 1).
    if (!liked && !removing && recommendedFoods.some(f => f.id === foodId)) {
      void logRecommendationDismissed({ source: sourceFor(foodId), foodId, anchorFoodId: anchorFor(foodId) }, active?.id);
    }

    setLastChange({
      foodId,
      foodName,
      previousPreference,
      message: removing
        ? `Removed ${foodName} from ${liked ? 'liked' : 'disliked'} foods.`
        : `Added ${foodName} to ${liked ? 'liked' : 'disliked'} foods.`,
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
    suggestions, foodGapScores, suggestionNutrient, suggestionNutrientChosen, setSuggestionFocus, foodPreferences, likedFoods, setFoodPreference, removeFoodPreference, setSearch, setSelected, fail,
    addFood, updateQuantity, removeItem, pantryCheckDue, startPlan, profile, isFirstSession, priceOf, hasUnpricedBudgetItems,
    optionsFor, optionPriceOf, itemPrice, setItemOption, packagesFor, packageOf, packagePriceOf, itemServings, lineCost, setItemPackage, setItemCustom, customOf, setItemEstimate,
  } = useWorkspace();
  const inPantry = (foodId: string) => pantry.some(p => p.food_id === foodId);
  // No exact match: show close matches (synonyms, look-alike spellings, then AI picks) instead.
  const close = useCloseMatches(search, !results.length);
  const shownResults = results.length ? results : close.foods;
  const likedCount = likedFoods.length;

    const pairingSuggestions = getFoodPairings(
    foodById(selected),
    [...listItems.map(item => item.food_id), ...pantry.map(item => item.food_id)],
    daily,
    budgetRemaining,
    foodPreferences,
    days,
    priceOf
  );

  // Suggestions are always for one nutrient (the heading names it). Foods that pair with the food just added
  // come first, but only when they also help that nutrient; the rest are the nutrient's best foods.
  const focusGap = suggestionNutrient ? nutrientGap(suggestionNutrient, daily, combined, days) : null;
  const helpsFocus = (f: Food) => {
    if (!suggestionNutrient || !focusGap) return false;
    const base = focusGap.remaining > 0 ? focusGap.remaining : focusGap.target;
    return base > 0 && (Number(f.nutrition[suggestionNutrient]) || 0) / base * 100 >= MIN_BOOST_PERCENT;
  };
  const anchorOnList = !suggestionNutrientChosen && listItems.some(item => item.food_id === selected);
  const focusPairings = anchorOnList ? pairingSuggestions.filter(helpsFocus) : [];
  const showPairings = focusPairings.length > 0;

  // "Recommend foods" (nutrient info popup) and the nutrient search both focus the suggestions on one
  // nutrient and scroll down to them.
  const suggestionsRef = useRef<HTMLElement>(null);
  const [nutrientQuery, setNutrientQuery] = useState('');
  const [scrollRequest, setScrollRequest] = useState(0);
  const nutrientMatches = searchNutrients(nutrientQuery).filter(k => k !== 'calories' && !nutrientLimits.has(k));
  function recommendFor(nutrient: NutrientKey) {
    setSuggestionFocus(nutrient);
    setNutrientQuery('');
    setFoodDetails(null);
    setDetailsFromSearch(false);
    setScrollRequest(n => n + 1);
  }
  useEffect(() => {
    if (!scrollRequest) return;
    // Wait a frame so a closing dialog or popover doesn't fight the scroll.
    const frame = window.requestAnimationFrame(() => suggestionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [scrollRequest]);
  const pairingIds = new Set(focusPairings.map(f => f.id));
  const recommendedFoods = [...focusPairings, ...suggestions.map(suggestion => suggestion.food).filter(f => !pairingIds.has(f.id))].slice(0, 3);
  const sourceFor = (id: string): RecommendationSource => (pairingIds.has(id) ? 'pairing' : 'nutrient_gap');
  const anchorFor = (id: string) => (pairingIds.has(id) ? selected : undefined);

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
        source: sourceFor(food.id),
        foodId: food.id,
        ...(pairingIds.has(food.id) ? { anchorFoodId: selected } : {}),
        rank: i + 1,
      })),
      active?.id
    );
  }, [recommendedFoodIds, showPairings ? selected : '']);

  async function addRecommended(source: RecommendationSource, foodId: string, anchorFoodId?: string) {
    const item = await addFood(foodId);
    // After picking a suggestion for a nutrient they asked about, go back to the priority order.
    if (item && source === 'nutrient_gap' && suggestionNutrientChosen) setSuggestionFocus(null);
    if (item) void logRecommendationAdded({ source, foodId, anchorFoodId }, item.trip_id, item.id);
  }

  const used = periodSpent + spend;
  const daysLeft = daysLeftInPeriod(budgetPeriod);

  const planPerDay = perDay(combined, days);
  const goalNutrients = NUTRIENTS.filter(n => !nutrientLimits.has(n.key));
  const goalsMet = goalNutrients.filter(n => planPerDay[n.key] >= daily[n.key]).length;
  const planNutritionNote = `Daily average across ${days} days from your pantry plus your list. Each + adds a package as it's sold, and its servings are spread across the ${days} days, like the pantry's.`;
  // What one + adds: "3 lb · 12 servings · $8.97", or the per-serving price for a food with no sizes.
  const addLabel = (foodId: string, optionId?: string | null) => {
    const pkg = defaultPackage(packagesFor(foodId, optionId));
    if (pkg) {
      const price = packagePriceOf(pkg, optionId);
      return `${packageCaption(pkg)}${price != null ? ` · $${price.toFixed(2)}` : ' · Price unknown'}`;
    }
    const per = priceOf(foodId);
    return per != null ? `$${per.toFixed(2)} a serving` : 'Price unknown';
  };
  const sizeLabel = (foodId: string) => {
    const pkg = defaultPackage(packagesFor(foodId));
    return pkg ? packageCaption(pkg) : `1 serving a day for ${days} days`;
  };
  const oneAddCost = (foodId: string) => {
    const pkg = defaultPackage(packagesFor(foodId));
    return pkg ? packagePriceOf(pkg) ?? 0 : (priceOf(foodId) ?? 0) * days;
  };
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
        </div>
      </div>}

      {pantryCheckDue && !isFirstSession && (
        <div className="pantry-check-banner">
          <div>
            <strong>Used anything up since your last trip?</strong>
            <small>You have {pantry.length} {pantry.length === 1 ? 'food' : 'foods'} at home. Mark anything that’s gone so your plan counts what you still have and doesn’t suggest buying it again.</small>
          </div>
          <Button variant="outline" onClick={() => void startPlan()}><House size={16} /> Update pantry</Button>
        </div>
      )}

      {isPhone && (
        <details className="nutrition-panel phone-nutrition-summary">
          <summary>
            <span>Nutrition</span>
            <small>{goalsMet} of {goalNutrients.length} daily targets met</small>
          </summary>
          <p>{planNutritionNote}</p>
          <NutrientPanel values={planPerDay} base={perDay(pantryTotals, days)} targets={daily} onRecommend={recommendFor} />
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
            </div>

            <div className="list-search">
              <div className="searchbox">
                <Search size={19} aria-hidden="true" />
                <input
                  aria-label="Search foods"
                  maxLength={LIMITS.search}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search foods, like eggs or spinach…"
                  onKeyDown={e => { if (e.key === 'Escape') setSearch(''); }}
                />
                {search && (
                  <button type="button" className="searchbox-clear" aria-label="Clear search" onClick={() => setSearch('')}>
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </div>

              {search.trim() && (
                <div className="search-results">
                  {!results.length && <CloseMatchNote query={search} close={close} />}
                  {shownResults.map(f => (
                      <div
                        key={f.id}
                        className="search-result food-card-clickable"
                        data-food-id={f.id}
                        role="group"
                        aria-label={`Add ${f.name} to your grocery list`}
                        tabIndex={0}
                        onClick={() => void addFood(f.id, 1, searchPrep[f.id])}
                        onKeyDown={e => addFoodOnCardKeyDown(e, () => void addFood(f.id, 1, searchPrep[f.id]))}
                      >
                        <span className="food-emoji">{f.emoji}</span>
                        <div>
                          <button type="button" className="food-name-button" aria-label={`Show nutrition for ${f.name}`} onClick={e => { e.stopPropagation(); setDetailsFromSearch(true); setFoodDetails(f); }}>
                            <strong>{f.name}</strong>
                          </button>
                          <small>{f.category} · {addLabel(f.id, searchPrep[f.id])}{inPantry(f.id) && <span className="in-pantry-note"> · In your pantry</span>}</small>
                          <PrepSelect foodName={f.name} options={optionsFor(f.id)} value={searchPrep[f.id] ?? null} average={priceOf(f.id)} priceOf={optionPriceOf}
                            onChange={id => setSearchPrep(prev => ({ ...prev, [f.id]: id }))} />
                        </div>
                        <Button size="icon" title={`Add ${f.name}`} onClick={e => { e.stopPropagation(); void addFood(f.id, 1, searchPrep[f.id]); }}>
                          <Plus size={17} />
                        </Button>
                      </div>
                  ))}
                  <button type="button" className="finder-launch" onClick={() => setFinderOpen(true)}>
                    <Sparkles size={15} aria-hidden="true" /> {shownResults.length ? 'Not what you want?' : 'Can’t find it?'} Add “{search.trim()}” to Kiwi
                  </button>
                </div>
              )}
            </div>
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
                  const pkg = packageOf(item);
                  const cost = lineCost(item);
                  const custom = item.custom_amount != null && item.custom_unit && customOf(item) ? { amount: item.custom_amount, unit: item.custom_unit } : null;
                  // A store price wins; the estimate box only shows while Kiwi has none.
                  const storePriced = itemPrice(item) != null || (pkg?.price ?? 0) > 0;

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
                        <div className="row-selects">
                          <PrepSelect foodName={f.name} options={optionsFor(f.id)} value={item.option_id} average={priceOf(f.id)} priceOf={optionPriceOf}
                            onChange={id => void setItemOption(item, id)} />
                          <SizeSelect foodName={f.name} packages={packagesFor(f.id, item.option_id)} value={item.package_id} autoDefault
                            priceOf={p => packagePriceOf(p, item.option_id)} onChange={id => void setItemPackage(item, id)}
                            custom={custom} customUnits={customUnitsFor(packagesFor(f.id, item.option_id))}
                            customPrice={custom && cost != null ? cost / Number(item.quantity) : null}
                            onCustom={(amount, unit) => void setItemCustom(item, amount, unit)} />
                        </div>
                      </div>
                      {pkg ? (
                        // Bought as packages: quantity = packages; their servings are spread across the trip.
                        <div className="qty-control" onClick={e => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" title="One less package" onClick={() => {
                            const next = Number(item.quantity) - 1;
                            if (next > 0) updateQuantity(item, next);
                            else removeItem(item);
                          }}>
                            <Minus size={13} />
                          </Button>
                          <input
                            aria-label={`${f.name} packages`}
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max={MAX_PACKAGES}
                            step="1"
                            onKeyDown={numberKeyGuard(true)}
                            value={Number(item.quantity)}
                            onChange={e => {
                              if (e.target.value === '') return;
                              const q = Number(e.target.value);
                              if (!Number.isInteger(q) || q < 1) fail('Packages must be a whole number, 1 or more.');
                              else if (q > MAX_PACKAGES) fail(`That’s more than ${MAX_PACKAGES} packages. Pick a smaller number.`);
                              else updateQuantity(item, q);
                            }}
                          />
                          <Button size="icon" variant="ghost" title="One more package" disabled={Number(item.quantity) >= MAX_PACKAGES}
                            onClick={() => updateQuantity(item, Number(item.quantity) + 1)}>
                            <Plus size={13} />
                          </Button>
                        </div>
                      ) : (
                      /* Older rows and foods with no sizes: quantity is total servings, shown per day across the plan. */
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
                          inputMode="numeric"
                          min="1"
                          max={MAX_SERVINGS_PER_DAY}
                          step="1"
                          onKeyDown={numberKeyGuard(true)}
                          value={Number(formatAmount(Number(item.quantity) / days).replace(/,/g, ''))}
                          onChange={e => {
                            if (e.target.value === '') return;
                            const q = Number(e.target.value);
                            if (!Number.isInteger(q) || q < 1) fail('Servings per day must be a whole number, 1 or more.');
                            else if (q > MAX_SERVINGS_PER_DAY) fail(`That’s more than ${MAX_SERVINGS_PER_DAY} servings a day. Pick a smaller number.`);
                            else updateQuantity(item, q * days);
                          }}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          title="One more serving a day"
                          disabled={Number(item.quantity) / days >= MAX_SERVINGS_PER_DAY}
                          onClick={() => updateQuantity(item, Number(item.quantity) + days)}
                        >
                          <Plus size={13} />
                        </Button>
                      </div>
                      )}
                      <span className="qty-caption">
                        {pkg
                          ? `${custom ? `${Number(item.quantity) === 1 ? '' : `${Number(item.quantity)} × `}${customLabel(custom.amount, custom.unit)}` : packageNoun(pkg, Number(item.quantity))} · ${servingsText(itemServings(item), formatAmount)}`
                          : `${Number(item.quantity) / days === 1 ? 'serving' : 'servings'} a day · ${formatAmount(Number(item.quantity))} for the trip`}
                      </span>
                      <span className="row-price">
                        {storePriced && cost != null
                          ? `$${cost.toFixed(2)}`
                          : <PriceEstimate foodName={f.name} value={item.price_estimate} per={pkg ? 'package' : 'serving'} onSave={v => void setItemEstimate(item, v)} />}
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

          <section className="section-block suggestions-block" ref={suggestionsRef} id="suggestions">
            <div className="section-title">
              <div>
                <h2>{suggestionNutrient ? `Suggestions for ${suggestionHeading(suggestionNutrient)}` : 'Suggestions'}</h2>
              </div>
              <div className="suggestions-title-actions">
                {suggestionNutrientChosen && (
                  <Button variant="ghost" size="sm" onClick={() => setSuggestionFocus(null)}>
                    <X size={14} aria-hidden="true" /> Back to top gaps
                  </Button>
                )}
                <Button asChild variant="ghost" size="sm" className="liked-foods-link">
                  <Link to="/food-preferences" title="See and edit the foods you liked or disliked">
                    <ThumbsUp size={14} aria-hidden="true" /> Liked foods{likedCount > 0 ? ` (${likedCount})` : ''}
                  </Link>
                </Button>
              </div>
            </div>

            <p className="section-note">
              {suggestionNutrient && showPairings
                ? `Your next nutrition gap to fill. Foods that pair well with ${foodById(selected)?.name} come first.`
                : suggestionNutrient
                  ? suggestionNutrientChosen
                    ? `Foods high in ${nutrientLabels[suggestionNutrient].toLowerCase()}. ${NUTRIENT_INFO[suggestionNutrient]}`
                    : `Your next nutrition gap to fill. Foods that also help with other gaps come first.`
                  : 'Foods that can help fill nutrition gaps.'}
            </p>

            <div className="nutrient-search">
              <div className="nutrient-search-row">
                <div className="searchbox nutrient-searchbox">
                  <Search size={17} aria-hidden="true" />
                  <input
                    aria-label="Find foods by nutrient"
                    maxLength={30}
                    value={nutrientQuery}
                    onChange={e => setNutrientQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && nutrientMatches[0]) { e.preventDefault(); recommendFor(nutrientMatches[0]); }
                      if (e.key === 'Escape') setNutrientQuery('');
                    }}
                    placeholder="Find foods by nutrient, like iron or vitamin C"
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="nutrient-info-button nutrient-search-help" aria-label="How does nutrient search work?">
                      <CircleHelp size={18} aria-hidden="true" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="nutrient-info-pop" align="end">
                    <strong>Search by nutrient</strong>
                    <p>Type a nutrient, like iron, calcium or vitamin C. Pick it, and the suggestions below show foods that have a lot of it.</p>
                  </PopoverContent>
                </Popover>
              </div>
              {nutrientQuery.trim() && (
                <div className="nutrient-search-results" role="list" aria-label="Matching nutrients">
                  {nutrientMatches.length
                    ? nutrientMatches.map(k => (
                      <button type="button" role="listitem" key={k} className="nutrient-search-result" onClick={() => recommendFor(k)}>
                        <strong>{nutrientLabels[k]}</strong>
                        <small>{NUTRIENT_INFO[k]}</small>
                      </button>
                    ))
                    : <p className="empty-inline">No nutrient matches “{nutrientQuery.trim()}”. Try iron, zinc or vitamin A.</p>}
                </div>
              )}
            </div>

            <div className="suggestion-grid">
              {recommendedFoods.length
                ? recommendedFoods.map(f => {
                  const scored = suggestions.find(suggestion => suggestion.food.id === f.id) ?? foodGapScores.find(suggestion => suggestion.food.id === f.id);
                  const boosts = scored?.boosts ?? [];
                  const addCost = oneAddCost(f.id);
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
                      onClick={() => void addRecommended(sourceFor(f.id), f.id, anchorFor(f.id))}
                      onKeyDown={e => addFoodOnCardKeyDown(e, () => void addRecommended(sourceFor(f.id), f.id, anchorFor(f.id)))}
                    >
                      <span className="suggestion-emoji">{f.emoji}</span>
                      <div className="suggestion-copy">
                        <button type="button" className="food-name-button" aria-label={`Show nutrition for ${f.name}`} onClick={e => { e.stopPropagation(); setFoodDetails(f); }}>
                          <strong>{f.name}</strong>
                        </button>
                        <small>{f.note}</small>
                        <span className="suggestion-price">
                          {addCost > 0 ? `$${addCost.toFixed(2)} · ${sizeLabel(f.id)}` : 'Price unknown'}{overBudget ? ' · Over budget, best value' : ''}{pairingIds.has(f.id) ? ` · Pairs well with ${foodById(selected)?.name ?? 'your list'}` : ''}
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
                          onClick={() => void addRecommended(sourceFor(f.id), f.id, anchorFor(f.id))}
                        >
                          <Plus size={16} />
                        </Button>
                      </div>
                    </div>
                  );
                })
                : (
                  <p className="empty-inline">
                    {suggestionNutrientChosen && suggestionNutrient
                      ? `No foods left to suggest for ${nutrientLabels[suggestionNutrient].toLowerCase()}. Everything high in it is already on your list or in your pantry.`
                      : 'No suggestions right now.'}
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
                ? <NutrientPanel values={foodDetails.nutrition} targets={daily} onRecommend={recommendFor} />
                : <NutrientPanel values={planPerDay} base={perDay(pantryTotals, days)} targets={daily} onRecommend={recommendFor} />}
              <div className="nutrition-foot">
                {foodDetails
                  ? 'Approximate nutrition for the listed serving. Actual values may vary.'
                  : planNutritionFoot}
              </div>
            </section>
          </div>
        )}
      </div>

      {(isPhone || detailsFromSearch) && (
        <Dialog open={!!foodDetails} onOpenChange={open => { if (!open) { setFoodDetails(null); setDetailsFromSearch(false); } }}>
          <DialogContent className="food-details-dialog">
            {foodDetails && (
              <>
                <DialogHeader>
                  <DialogTitle>{foodDetails.emoji} {foodDetails.name}</DialogTitle>
                  <DialogDescription>Nutrition per listed serving, compared with your daily targets.</DialogDescription>
                </DialogHeader>
                <NutrientPanel values={foodDetails.nutrition} targets={daily} onRecommend={recommendFor} />
                <div className="nutrition-foot">Approximate nutrition for the listed serving. Actual values may vary.</div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
      {lastChange && (
        <div className="undo-bar" role="status">
          <span>{lastChange.message}</span>
          <div className="undo-bar-actions">
            <Button asChild variant="ghost" size="sm">
              <Link to="/food-preferences">View</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void undoPreferenceChange()}
            >
              <Undo2 size={15} aria-hidden="true" /> Undo
            </Button>
          </div>
        </div>
      )}
      {listItems.length > 0 && (
        <Button className="shop-action" onClick={() => navigate({ to: '/plan/shop' })}>
          <ShoppingBasket size={17} /> Shop this list ({listItems.length}) <ArrowRight size={16} />
        </Button>
      )}
    </>
  );
}
