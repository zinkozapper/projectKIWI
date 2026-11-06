import { Link } from '@tanstack/react-router';
import { ArrowRight, Check, ChevronDown, ChevronLeft, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodById } from '@/lib/foods';
import { useWorkspace } from '../context';

export function ShopPage() {
  const { active, listItems, purchased, removeItem, undoPurchase, finishTrip } = useWorkspace();
  const totalItems = listItems.length + purchased.length;
  const progress = totalItems ? (purchased.length / totalItems) * 100 : 0;
  const estimatedTotal = [...listItems, ...purchased].reduce((total, item) => {
    return total + (foodById(item.food_id)?.price ?? 0) * item.quantity;
  }, 0);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="shop-eyebrow">Shopping mode</span>
          <h1>Let’s get shopping<span className="brand-dot">.</span></h1>
          <p>Tap an item when it’s in your cart.</p>
        </div>
        <Button asChild variant="outline" className="shop-back-button"><Link to="/plan"><ChevronLeft size={16} /> Back to plan</Link></Button>
      </div>
      <div className="shopping-wrap shopping-experience">
        <section className="shop-overview" aria-label="Trip progress">
          <div className="shop-overview-heading">
            <div className="shop-overview-title">
              <span className="shop-overview-icon"><ShoppingCart size={19} aria-hidden="true" /></span>
              <div><span className="shop-overview-label">This trip</span><h2>Your shopping progress</h2></div>
            </div>
            <div className="shop-estimate"><span>Estimated total</span><strong>${estimatedTotal.toFixed(2)}</strong></div>
          </div>
          <div className="shop-progress-copy">
            <strong>{purchased.length} of {totalItems} {totalItems === 1 ? 'item' : 'items'} picked up</strong>
            <span>{listItems.length ? `${listItems.length} left to find` : totalItems ? 'Everything is in your cart' : 'Your list is ready when you are'}</span>
          </div>
          <div
            className="shop-progress-track"
            role="progressbar"
            aria-label="Shopping progress"
            aria-valuemin={0}
            aria-valuemax={Math.max(totalItems, 1)}
            aria-valuenow={purchased.length}
            aria-valuetext={totalItems ? `${purchased.length} of ${totalItems} items picked up` : 'No items on this trip'}
          >
            <span className="shop-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </section>

        <section className="shop-list-panel" aria-labelledby="shop-list-title">
          <div className="shop-list-heading">
            <div><span className="shop-overview-label">Your list</span><h2 id="shop-list-title">Pick these up</h2></div>
            {listItems.length > 0 && <span className="shop-items-left">{listItems.length} left</span>}
          </div>
          {listItems.length ? (
            <div className="shop-list-items">
              {listItems.map((item, index) => {
                const food = foodById(item.food_id);
                if (!food) return null;
                return (
                  <Button
                    variant="ghost"
                    className="shop-row"
                    key={item.id}
                    style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}
                    aria-label={`Mark ${food.name} as picked up`}
                    onClick={() => removeItem(item, true)}
                  >
                    <span className="shop-checkbox" aria-hidden="true" />
                    <span className="shop-food-emoji" aria-hidden="true">{food.emoji}</span>
                    <span className="shop-row-name">{food.name}<small>{item.quantity} × {food.unit}</small></span>
                    <span className="shop-item-price">${(food.price * item.quantity).toFixed(2)}<small>estimated</small></span>
                  </Button>
                );
              })}
            </div>
          ) : (
            <div className="shop-complete">
              <span className="shop-complete-icon"><Check size={25} aria-hidden="true" /></span>
              <h3>{purchased.length ? 'All done!' : 'Your list is empty'}</h3>
              <p>{purchased.length ? 'Everything on this trip has been checked off.' : 'Add foods to your plan to make a shopping list.'}</p>
            </div>
          )}
        </section>

        {purchased.length > 0 && (
          <details className="shop-cart" open>
            <summary className="shop-cart-summary">
              <span className="shop-cart-icon"><ShoppingCart size={18} aria-hidden="true" /></span>
              <span className="shop-cart-title"><strong>In your cart</strong></span>
              <span className="shop-cart-count" key={purchased.length}>{purchased.length}</span>
              <ChevronDown className="shop-cart-chevron" size={18} aria-hidden="true" />
            </summary>
            <div className="shop-cart-items">
              {purchased.map(item => {
                const food = foodById(item.food_id);
                return food ? (
                  <Button
                    variant="ghost"
                    className="shop-cart-row"
                    key={item.id}
                    aria-label={`Move ${food.name} back to your shopping list`}
                    onClick={() => undoPurchase(item)}
                  >
                    <span className="shop-cart-check"><Check size={15} aria-hidden="true" /></span>
                    <span className="shop-cart-name">{food.name}<small>{item.quantity} × {food.unit}</small></span>
                    <span className="shop-cart-price">${(food.price * item.quantity).toFixed(2)}</span>
                  </Button>
                ) : null;
              })}
            </div>
          </details>
        )}
        {active && <Button className="finish-button shop-finish-button" onClick={finishTrip}>Finish trip & save to history <ArrowRight size={16} /></Button>}
      </div>
    </>
  );
}
