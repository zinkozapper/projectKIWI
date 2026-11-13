import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Bookmark, BookmarkCheck, ChefHat, Clock, LoaderCircle, Plus, Sparkles, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodById } from '@/lib/foods';
import { suggestRecipes } from '@/lib/recipes/functions';
import {
  cartAdditions, FOOD_GROUP_LABELS, FOOD_GROUPS, ingredientStatus, listEntries, recipeKey, STATUS_LABELS,
  type FoodGroup, type Recipe, type SavedRecipe,
} from '@/lib/recipes/shared';
import { deleteRecipe, loadSavedRecipes, saveRecipe, setRecipeFoodGroups } from '@/lib/recipes/store';
import { useWorkspace } from '../context';

type Picks = Record<string, Set<number>>;

const errorText = (e: unknown) => (e && typeof e === 'object' && 'message' in e && String(e.message)) || 'unknown error';

export function RecipesPage() {
  const { userId, listItems, pantry, foodPreferences, addFoods, fail } = useWorkspace();
  const listIds = useMemo(() => new Set(listItems.map(i => i.food_id)), [listItems]);
  const pantryIds = useMemo(() => new Set(pantry.map(p => p.food_id)), [pantry]);

  const [suggested, setSuggested] = useState<Recipe[]>([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState('');
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [filter, setFilter] = useState<FoodGroup | 'all'>('all');
  // Which ingredient rows are ticked, per card. Defaults to the cart additions (missing catalog foods).
  const [picks, setPicks] = useState<Picks>({});
  const [adding, setAdding] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!userId) return;
    let live = true;
    loadSavedRecipes(userId)
      .then(rows => { if (live) setSaved(rows); })
      .catch(e => fail('Could not load saved recipes: ' + errorText(e)))
      .finally(() => { if (live) setSavedLoading(false); });
    return () => { live = false; };
  }, [userId]);

  const defaultPicks = (r: Recipe) => new Set(r.ingredients.flatMap((i, n) => (ingredientStatus(i, listIds, pantryIds) === 'missing' ? [n] : [])));
  const picksFor = (key: string, r: Recipe) => picks[key] ?? defaultPicks(r);

  async function ask() {
    setAsking(true);
    setAskError('');
    setNotice('');
    const result = await suggestRecipes({
      data: {
        listFoodIds: [...listIds],
        pantryFoodIds: [...pantryIds],
        dislikedFoodIds: Object.keys(foodPreferences).filter(id => foodPreferences[id] === false),
      },
    }).catch(() => ({ ok: false as const, error: 'Could not reach Kiwi. Check your connection and try again.' }));
    setAsking(false);
    if (!result.ok) {
      setAskError(result.error);
      return;
    }
    setSuggested(result.data.recipes);
    setPicks(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => k.startsWith('saved:'))));
  }

  async function addPicked(key: string, r: Recipe) {
    const chosen = r.ingredients.filter((_, n) => picksFor(key, r).has(n));
    const entries = listEntries(chosen);
    if (!entries.length) return;
    setAdding(key);
    const count = await addFoods(entries);
    setAdding('');
    if (count) {
      setNotice(`Added ${count} ${count === 1 ? 'food' : 'foods'} for ${r.title} to your list.`);
      setPicks(prev => ({ ...prev, [key]: new Set() }));
    }
  }

  async function save(r: Recipe) {
    const key = recipeKey(r);
    setSavingKey(key);
    try {
      const row = await saveRecipe(userId, r);
      setSaved(prev => [row, ...prev]);
      setNotice(`Saved ${r.title}.`);
    } catch (e) {
      fail('Could not save the recipe: ' + errorText(e));
    } finally {
      setSavingKey('');
    }
  }

  async function toggleSavedGroup(r: SavedRecipe, g: FoodGroup) {
    const next = r.foodGroups.includes(g) ? r.foodGroups.filter(x => x !== g) : FOOD_GROUPS.filter(x => x === g || r.foodGroups.includes(x));
    setSaved(prev => prev.map(s => (s.id === r.id ? { ...s, foodGroups: next } : s)));
    try {
      await setRecipeFoodGroups(r.id, next);
    } catch (e) {
      setSaved(prev => prev.map(s => (s.id === r.id ? { ...s, foodGroups: r.foodGroups } : s)));
      fail('Could not update food groups: ' + errorText(e));
    }
  }

  function toggleSuggestedGroup(index: number, g: FoodGroup) {
    setSuggested(prev => prev.map((r, n) => {
      if (n !== index) return r;
      const next = r.foodGroups.includes(g) ? r.foodGroups.filter(x => x !== g) : FOOD_GROUPS.filter(x => x === g || r.foodGroups.includes(x));
      return { ...r, foodGroups: next };
    }));
  }

  async function remove(r: SavedRecipe) {
    const before = saved;
    setSaved(prev => prev.filter(s => s.id !== r.id));
    try {
      await deleteRecipe(r.id);
    } catch (e) {
      setSaved(before);
      fail('Could not delete the recipe: ' + errorText(e));
    }
  }

  const savedTitles = new Set(saved.map(s => recipeKey(s)));
  const groupsInUse = FOOD_GROUPS.filter(g => saved.some(s => s.foodGroups.includes(g)));
  const shownSaved = filter === 'all' ? saved : saved.filter(s => s.foodGroups.includes(filter));
  const nothingToCook = !listIds.size && !pantryIds.size;

  const card = (key: string, r: Recipe, extra: { saved?: SavedRecipe; index?: number }) => {
    const chosen = picksFor(key, r);
    const toAdd = listEntries(r.ingredients.filter((_, n) => chosen.has(n))).length;
    const missing = cartAdditions(r, listIds, pantryIds).length;
    const isSaved = !!extra.saved || savedTitles.has(recipeKey(r));
    const toggleGroup = (g: FoodGroup) => (extra.saved ? void toggleSavedGroup(extra.saved, g) : toggleSuggestedGroup(extra.index ?? 0, g));
    return (
      <article className="recipe-card" key={key} aria-label={r.title}>
        <header className="recipe-card-head">
          <div>
            <h3>{r.title}</h3>
            {r.summary && <p>{r.summary}</p>}
            <div className="recipe-meta">
              {r.minutes != null && <span><Clock size={13} aria-hidden="true" /> {r.minutes} min</span>}
              <span><Users size={13} aria-hidden="true" /> Serves {r.servings}</span>
              <span>{missing ? `${missing} to buy` : 'You have everything in Kiwi'}</span>
            </div>
          </div>
          {extra.saved
            ? <Button size="icon" variant="ghost" title={`Delete ${r.title}`} aria-label={`Delete ${r.title}`} onClick={() => void remove(extra.saved!)}><Trash2 size={16} /></Button>
            : (
              <Button variant={isSaved ? 'secondary' : 'outline'} disabled={isSaved || savingKey === key} onClick={() => void save(r)}>
                {isSaved ? <><BookmarkCheck size={16} /> Saved</> : <><Bookmark size={16} /> Save</>}
              </Button>
            )}
        </header>

        <div className="recipe-groups" role="group" aria-label={`Food groups for ${r.title}`}>
          {FOOD_GROUPS.map(g => (
            <button
              key={g}
              type="button"
              className={r.foodGroups.includes(g) ? 'group-chip on' : 'group-chip'}
              aria-pressed={r.foodGroups.includes(g)}
              onClick={() => toggleGroup(g)}
            >
              {FOOD_GROUP_LABELS[g]}
            </button>
          ))}
        </div>

        <ul className="recipe-ingredients">
          {r.ingredients.map((i, n) => {
            const status = ingredientStatus(i, listIds, pantryIds);
            const food = i.foodId ? foodById(i.foodId) : undefined;
            const id = `${key}-ing-${n}`;
            return (
              <li key={n} className={`recipe-ingredient ${status}`}>
                <input
                  id={id}
                  type="checkbox"
                  disabled={!i.foodId}
                  checked={chosen.has(n)}
                  onChange={e => setPicks(prev => {
                    const next = new Set(picksFor(key, r));
                    if (e.target.checked) next.add(n); else next.delete(n);
                    return { ...prev, [key]: next };
                  })}
                />
                <label htmlFor={id}>
                  <span className="recipe-ingredient-name">{food?.emoji ? `${food.emoji} ` : ''}{i.name}{i.amount && <small> · {i.amount}</small>}</span>
                  <span className="recipe-ingredient-status">
                    {STATUS_LABELS[status]}{food && status !== 'not_in_catalog' ? ` · ${i.servings} × ${food.name}` : ''}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {r.steps.length > 0 && (
          <details className="recipe-steps">
            <summary>Steps</summary>
            <ol>{r.steps.map((s, n) => <li key={n}>{s}</li>)}</ol>
          </details>
        )}

        <Button className="recipe-add" disabled={!toAdd || adding === key} onClick={() => void addPicked(key, r)}>
          {adding === key ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
          {toAdd ? `Add ${toAdd} to my list` : 'Pick ingredients to add'}
        </Button>
      </article>
    );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Recipes</h1>
          <p>Ideas built from your grocery list, and the recipes you saved.</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/plan"><ArrowLeft size={16} /> Back to my plan</Link>
        </Button>
      </div>

      {notice && <p className="recipe-notice" role="status">{notice}</p>}

      <section className="section-block">
        <div className="section-title">
          <div><h2>Suggestions from your list</h2></div>
          <Button onClick={() => void ask()} disabled={asking || nothingToCook}>
            {asking ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
            {asking ? 'Thinking…' : suggested.length ? 'Suggest 3 more' : 'Suggest recipes from my list'}
          </Button>
        </div>
        <p className="section-note">
          {nothingToCook
            ? <>Add foods to <Link to="/plan">your grocery list</Link> first.</>
            : `Claude suggests 3 recipes using your ${listIds.size} list ${listIds.size === 1 ? 'food' : 'foods'}${pantryIds.size ? ` and ${pantryIds.size} pantry ${pantryIds.size === 1 ? 'food' : 'foods'}` : ''}. Ticked ingredients are the ones you still need.`}
        </p>
        {askError && <p className="recipe-error" role="alert">{askError}</p>}
        {suggested.length > 0 && (
          <div className="recipe-grid">
            {suggested.map((r, index) => card(`new:${index}:${recipeKey(r)}`, r, { index }))}
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-title">
          <div><h2>Saved recipes</h2></div>
          <span className="count-pill">{saved.length} {saved.length === 1 ? 'recipe' : 'recipes'}</span>
        </div>
        {groupsInUse.length > 0 && (
          <div className="recipe-groups recipe-filter" role="group" aria-label="Show saved recipes by food group">
            <button type="button" className={filter === 'all' ? 'group-chip on' : 'group-chip'} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
            {groupsInUse.map(g => (
              <button key={g} type="button" className={filter === g ? 'group-chip on' : 'group-chip'} aria-pressed={filter === g} onClick={() => setFilter(g)}>
                {FOOD_GROUP_LABELS[g]}
              </button>
            ))}
          </div>
        )}
        {savedLoading
          ? <p className="empty-inline">Loading…</p>
          : shownSaved.length
            ? <div className="recipe-grid">{shownSaved.map(r => card(`saved:${r.id}`, r, { saved: r }))}</div>
            : <div className="empty-state"><ChefHat size={18} aria-hidden="true" /> {saved.length ? 'No saved recipes in this food group.' : 'Save a suggestion to keep it here.'}</div>}
      </section>
    </>
  );
}
