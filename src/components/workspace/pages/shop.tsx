import { Link } from '@tanstack/react-router';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodById } from '@/lib/foods';
import { useWorkspace } from '../context';

export function ShopPage() {
  const { active, listItems, purchased, removeItem, undoPurchase, finishTrip } = useWorkspace();

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">IN-STORE MODE</div>
          <h1>Let’s get shopping<span className="brand-dot">.</span></h1>
          <p>Tap an item when it’s in your cart.</p>
        </div>
        <Button asChild variant="outline"><Link to="/plan"><ChevronLeft size={16} /> Back to plan</Link></Button>
      </div>
      <div className="shopping-wrap">
        <div className="shop-progress"><strong>{listItems.length} left to pick up</strong><span>{purchased.length} in your cart</span></div>
        {listItems.length ? listItems.map(i => {
          const f = foodById(i.food_id);
          if (!f) return null;
          return (
            <Button variant="ghost" className="shop-row" key={i.id} onClick={() => removeItem(i, true)}>
              <span className="shop-checkbox" />
              <span className="food-emoji">{f.emoji}</span>
              <span className="shop-row-name">{f.name}<small>{i.quantity} × {f.unit}</small></span>
              <span>${(f.price * i.quantity).toFixed(2)}</span>
            </Button>
          );
        }) : (
          <div className="shop-complete">
            <span>✓</span>
            <h2>{purchased.length ? 'All done!' : 'Your list is empty'}</h2>
            <p>{purchased.length ? 'Everything on this trip has been checked off.' : 'Add foods to your plan to make a shopping list.'}</p>
          </div>
        )}
        {purchased.length > 0 && (
          <div className="purchased-items">
            <h3>In your cart · {purchased.length}</h3>
            {purchased.map(i => {
              const f = foodById(i.food_id);
              return f ? <div key={i.id}>{f.emoji} {f.name}<Button variant="ghost" size="sm" onClick={() => undoPurchase(i)}>Undo</Button></div> : null;
            })}
          </div>
        )}
        {active && <Button className="finish-button" onClick={finishTrip}>Finish trip & save to history <ArrowRight size={16} /></Button>}
      </div>
    </>
  );
}
