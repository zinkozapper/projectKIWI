
import { useEffect, useState } from 'react';
import { Search, ThumbsDown, ThumbsUp, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foods } from '@/lib/foods';
import { LIMITS } from '@/lib/validation';
import { useWorkspace } from '../context';
import { CloseMatchNote } from '../close-match-note';
import { useCloseMatches } from '@/hooks/use-close-matches';

type PendingUndo = {
  foodId: string;
  foodName: string;
  previousPreference: boolean | undefined;
  message: string;
};

export function FoodPreferencesPage() {
  const {
    search,
    results,
    setSearch,
    foodPreferences,
    setFoodPreference,
    removeFoodPreference,
  } = useWorkspace();

  const [lastChange, setLastChange] = useState<PendingUndo | null>(null);
  // No exact match: show close matches (synonyms, look-alike spellings, then AI picks) instead.
  const close = useCloseMatches(search, !results.length);
  const shownResults = results.length ? results : close.foods;

  // Keep the Undo notification visible for 8 seconds.
  useEffect(() => {
    if (!lastChange) return;

    const timer = window.setTimeout(() => setLastChange(null), 8000);

    return () => window.clearTimeout(timer);
  }, [lastChange]);

  async function changePreference(
    foodId: string,
    foodName: string,
    liked: boolean
  ) {
    const previousPreference = foodPreferences[foodId];

    // Clicking the currently selected preference removes it.
    const removing = previousPreference === liked;

    const succeeded = removing
      ? await removeFoodPreference(foodId)
      : await setFoodPreference(foodId, liked);

    if (!succeeded) return;

    setLastChange({
      foodId,
      foodName,
      previousPreference,
      message: removing
        ? `Removed ${foodName} from ${liked ? 'liked' : 'disliked'} foods.`
        : `Added ${foodName} to ${liked ? 'liked' : 'disliked'} foods.`,
    });
  }

  async function removePreference(foodId: string, foodName: string) {
    const previousPreference = foodPreferences[foodId];

    const succeeded = await removeFoodPreference(foodId);

    if (!succeeded) return;

    setLastChange({
      foodId,
      foodName,
      previousPreference,
      message: `Removed ${foodName} from your preferences.`,
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

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  const likedFoods = foods
    .filter(food => foodPreferences[String(food.id)] === true)
    .sort(byName);

  const dislikedFoods = foods
    .filter(food => foodPreferences[String(food.id)] === false)
    .sort(byName);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Liked foods</h1>
          <p>
            See and change the foods you liked or disliked. Tap the thumbs on a
            suggestion in My plan to add more.
          </p>
        </div>
      </div>

      <section className="section-block suggestions-block">
        <div className="section-title">
          <div>
            <h2>Liked</h2>
          </div>
          <span className="count-pill">
            {likedFoods.length} {likedFoods.length === 1 ? 'food' : 'foods'}
          </span>
        </div>

        <p className="section-note">
          KIWI will prioritize recommending these foods.
        </p>

        <div className="suggestion-grid">
          {likedFoods.length ? likedFoods.map(food => (
            <div className="suggestion" key={food.id}>
              <span className="suggestion-emoji">{food.emoji}</span>

              <div className="suggestion-copy">
                <strong>{food.name}</strong>
                <small>{food.note}</small>
              </div>

              <div className="suggestion-actions">
                <Button
                  size="icon"
                  variant="outline"
                  title={`Move ${food.name} to disliked`}
                  aria-label={`Move ${food.name} to disliked`}
                  onClick={() =>
                    void changePreference(String(food.id), food.name, false)
                  }
                >
                  <ThumbsDown size={16} />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  title={`Remove ${food.name} from this list`}
                  aria-label={`Remove ${food.name} from this list`}
                  onClick={() =>
                    void removePreference(String(food.id), food.name)
                  }
                >
                  <X size={16} />
                </Button>
              </div>
            </div>
          )) : (
            <p className="empty-inline">No liked foods yet. Tap the thumbs up on a suggestion, or search below.</p>
          )}
        </div>
      </section>

      <section className="section-block suggestions-block">
        <div className="section-title">
          <div>
            <h2>Disliked</h2>
          </div>
          <span className="count-pill">
            {dislikedFoods.length} {dislikedFoods.length === 1 ? 'food' : 'foods'}
          </span>
        </div>

        <p className="section-note">
          KIWI won't suggest these foods. Remove one to see it again.
        </p>

        <div className="suggestion-grid">
          {dislikedFoods.length ? dislikedFoods.map(food => (
            <div className="suggestion" key={food.id}>
              <span className="suggestion-emoji">{food.emoji}</span>

              <div className="suggestion-copy">
                <strong>{food.name}</strong>
                <small>{food.note}</small>
              </div>

              <div className="suggestion-actions">
                <Button
                  size="icon"
                  variant="outline"
                  title={`Move ${food.name} to liked`}
                  aria-label={`Move ${food.name} to liked`}
                  onClick={() =>
                    void changePreference(String(food.id), food.name, true)
                  }
                >
                  <ThumbsUp size={16} />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  title={`Remove ${food.name} from this list`}
                  aria-label={`Remove ${food.name} from this list`}
                  onClick={() =>
                    void removePreference(String(food.id), food.name)
                  }
                >
                  <X size={16} />
                </Button>
              </div>
            </div>
          )) : (
            <p className="empty-inline">You haven't disliked any foods yet.</p>
          )}
        </div>
      </section>

      {/* Search for any food to like or dislike */}
      <section className="section-block suggestions-block">
        <div className="section-title">
          <div>
            <h2>Add more foods</h2>
          </div>
        </div>

        <p className="section-note">
          Search for any food and tell KIWI whether you like it.
        </p>

        <div className="list-search">
          <div className="searchbox">
            <Search size={19} aria-hidden="true" />
            <input
              aria-label="Search foods"
              maxLength={LIMITS.search}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search foods, like eggs or spinach…"
              onKeyDown={e => {
                if (e.key === 'Escape') setSearch('');
              }}
            />

            {search && (
              <button
                type="button"
                className="searchbox-clear"
                aria-label="Clear search"
                onClick={() => setSearch('')}
              >
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </div>

          {search.trim() && (
            <div className="search-results food-preferences-results">
              {!results.length && <CloseMatchNote query={search} close={close} />}
              {shownResults.map(food => {
                  const preference = foodPreferences[food.id];

                  return (
                    <div className="search-result" key={food.id}>
                      <span className="food-emoji">{food.emoji}</span>

                      <div className="suggestion-copy">
                        <strong>{food.name}</strong>
                        <small>{food.category} · {food.note}</small>
                      </div>

                      <div className="suggestion-actions">
                        <Button
                          size="icon"
                          variant={preference === true ? 'default' : 'outline'}
                          title={`Like ${food.name}`}
                          aria-label={`Like ${food.name}`}
                          aria-pressed={preference === true}
                          onClick={() =>
                            void changePreference(food.id, food.name, true)
                          }
                        >
                          <ThumbsUp size={16} />
                        </Button>

                        <Button
                          size="icon"
                          variant={preference === false ? 'default' : 'outline'}
                          title={`Dislike ${food.name}`}
                          aria-label={`Dislike ${food.name}`}
                          aria-pressed={preference === false}
                          onClick={() =>
                            void changePreference(food.id, food.name, false)
                          }
                        >
                          <ThumbsDown size={16} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </section>

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
