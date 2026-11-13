
import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ThumbsDown, ThumbsUp, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foods } from '@/lib/foods';
import { useWorkspace } from '../context';

type PendingUndo = {
  foodId: string;
  foodName: string;
  previousPreference: boolean | undefined;
  message: string;
};

export function FoodPreferencesPage() {
  const {
    foodPreferences,
    setFoodPreference,
    removeFoodPreference,
  } = useWorkspace();

  const [lastChange, setLastChange] = useState<PendingUndo | null>(null);

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

    const succeeded = await setFoodPreference(foodId, liked);

    if (!succeeded) return;

    setLastChange({
      foodId,
      foodName,
      previousPreference,
      message: `Added ${foodName} to ${liked ? 'liked' : 'disliked'} foods.`,
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

  const likedFoods = foods.filter(
    food => foodPreferences[String(food.id)] === true
  );

  const dislikedFoods = foods.filter(
    food => foodPreferences[String(food.id)] === false
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Food preferences</h1>
          <p>Manage which foods KIWI recommends to you.</p>
        </div>

        <Button asChild variant="outline">
          <Link to="/profile">
            <ArrowLeft size={16} /> Back to profile
          </Link>
        </Button>
      </div>

      <section className="section-block suggestions-block">
        <div className="section-title">
          <div>
            <h2>Liked foods</h2>
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
                  title={`Dislike ${food.name}`}
                  onClick={() =>
                    void changePreference(String(food.id), food.name, false)
                  }
                >
                  <ThumbsDown size={16} />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  title={`Remove ${food.name} preference`}
                  onClick={() =>
                    void removePreference(String(food.id), food.name)
                  }
                >
                  <X size={16} />
                </Button>
              </div>
            </div>
          )) : (
            <p className="empty-inline">You haven't liked any foods yet.</p>
          )}
        </div>
      </section>

      <section className="section-block suggestions-block">
        <div className="section-title">
          <div>
            <h2>Disliked foods</h2>
          </div>
          <span className="count-pill">
            {dislikedFoods.length} {dislikedFoods.length === 1 ? 'food' : 'foods'}
          </span>
        </div>

        <p className="section-note">
          KIWI will prioritize recommending these foods less often.
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
                  title={`Like ${food.name}`}
                  onClick={() =>
                    void changePreference(String(food.id), food.name, true)
                  }
                >
                  <ThumbsUp size={16} />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  title={`Remove ${food.name} preference`}
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
