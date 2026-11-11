import { ArrowLeft, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { foods } from '@/lib/foods';
import { useWorkspace } from '../context';

export function FoodPreferencesPage() {
  const {
    foodPreferences,
    setFoodPreference,
    removeFoodPreference,
  } = useWorkspace();

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
                  onClick={() => void setFoodPreference(String(food.id), false)}
                >
                  <ThumbsDown size={16} />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  title={`Remove ${food.name} preference`}
                  onClick={() => void removeFoodPreference(String(food.id))}
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
                  onClick={() => void setFoodPreference(String(food.id), true)}
                >
                  <ThumbsUp size={16} />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  title={`Remove ${food.name} preference`}
                  onClick={() => void removeFoodPreference(String(food.id))}
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
    </>
  );
}