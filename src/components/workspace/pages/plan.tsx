import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Minus, Plus, Search, ShoppingBasket, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodById, nutrientKeys, nutrientLabels, nutrientUnits, type Nutrients } from '@/lib/foods';
import { useWorkspace } from '../context';
import { NutrientBar } from '../nutrient-bar';

export function PlanPage() {
  const navigate = useNavigate();
  const {
    days, budget, search, selected, results, listItems, combined, daily, spend, coverage,
    biggestGaps, suggestions, setDays, setBudget, setSearch, setSelected, fail,
    addFood, updateQuantity, removeItem, saveTripSettings,
  } = useWorkspace();

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE EASY WAY TO EAT WELL</div>
          <h1>Your grocery plan<span className="brand-dot">.</span></h1>
          <p>Build a balanced week, one good choice at a time.</p>
        </div>
        <Button className="shop-action" onClick={() => navigate({ to: '/plan/shop' })}><ShoppingBasket size={17} /> Shop this list <ArrowRight size={16} /></Button>
      </div>
      <div className="plan-controls">
        <div>
          <span className="control-label">SHOPPING FOR</span>
          <div className="segmented">
            {[3, 5, 7, 14].map(d => <Button key={d} variant="ghost" className={days === d ? 'selected' : ''} onClick={() => saveTripSettings(d, budget)}>{d} days</Button>)}
          </div>
        </div>
        <div className="budget-setting">
          <span className="control-label">YOUR BUDGET</span>
          <label className="budget-input">
            <span>$</span>
            <input aria-label="Trip budget" type="number" min="0" value={budget} onChange={e => setBudget(Number(e.target.value))} onBlur={() => saveTripSettings(days, Math.max(0, budget))} />
          </label>
        </div>
        <div className="budget-progress">
          <span>${spend.toFixed(2)} of ${budget.toFixed(0)} estimated</span>
          <div className="track"><div className={spend > budget ? 'fill warning' : 'fill'} style={{ width: `${Math.min(100, budget ? spend / budget * 100 : 0)}%` }} /></div>
        </div>
      </div>
      <div className="plan-grid">
        <div className="left-column">
          <section className="section-block">
            <div className="section-title">
              <div><span className="section-kicker">01 / BUILD YOUR LIST</span><h2>What’s going in your cart?</h2></div>
              <span className="count-pill">{listItems.length} items</span>
            </div>
            <div className="searchbox">
              <Search size={19} />
              <input aria-label="Search foods" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search foods, like eggs or spinach…" />
              <span className="search-shortcut">FOOD SEARCH</span>
            </div>
            {search && (
              <div className="search-results">
                {results.length
                  ? results.map(f => (
                    <div key={f.id} className="search-result">
                      <span className="food-emoji">{f.emoji}</span>
                      <div><strong>{f.name}</strong><small>{f.category} · ${f.price.toFixed(2)} / {f.unit}</small></div>
                      <Button size="icon" title={`Add ${f.name}`} onClick={() => addFood(f.id)}><Plus size={17} /></Button>
                    </div>
                  ))
                  : <p className="empty-inline">No exact match. Try “beans”, “rice”, or “yogurt”.</p>}
              </div>
            )}
            <div className="list-head"><span>YOUR LIST</span><span>EST. PRICE</span></div>
            {listItems.length ? (
              <div className="grocery-list">
                {listItems.map(item => {
                  const f = foodById(item.food_id);
                  if (!f) return null;
                  return (
                    <div className="grocery-row" key={item.id} onClick={() => setSelected(f.id)}>
                      <span className="food-emoji">{f.emoji}</span>
                      <div className="food-description"><strong>{f.name}</strong><small>{f.note}</small></div>
                      <div className="qty-control" onClick={e => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" title="Decrease quantity" onClick={() => updateQuantity(item, Number(item.quantity) - 1)}><Minus size={13} /></Button>
                        <input aria-label={`${f.name} quantity`} type="number" min="1" value={item.quantity} onChange={e => {
                          const q = Number(e.target.value);
                          if (q > 0) updateQuantity(item, q);
                          else fail('Quantity must be a positive number.');
                        }} />
                        <Button size="icon" variant="ghost" title="Increase quantity" onClick={() => updateQuantity(item, Number(item.quantity) + 1)}><Plus size={13} /></Button>
                      </div>
                      <span className="row-price">${(f.price * item.quantity).toFixed(2)}</span>
                      <Button size="icon" variant="ghost" className="remove" title={`Remove ${f.name}`} onClick={e => { e.stopPropagation(); removeItem(item); }}><Trash2 size={15} /></Button>
                    </div>
                  );
                })}
              </div>
            ) : <div className="empty-state">Your list is ready for its first item. Search above or try a suggestion below.</div>}
            <div className="list-total"><span>Estimated total</span><strong>${spend.toFixed(2)}</strong></div>
          </section>
          <section className="section-block suggestions-block">
            <div className="section-title"><div><span className="section-kicker">02 / SMART ADDITIONS</span><h2>Good things to add</h2></div></div>
            <p className="section-note">Simple whole foods that help fill your biggest gaps.</p>
            <div className="suggestion-grid">
              {suggestions.length
                ? suggestions.map(f => (
                  <div className="suggestion" key={f.id}>
                    <span className="suggestion-emoji">{f.emoji}</span>
                    <div className="suggestion-copy">
                      <strong>{f.name}</strong>
                      <small>{f.note}</small>
                      <span className="suggestion-price">${f.price.toFixed(2)} · adds {biggestGaps.find(k => f.nutrition[k] > 0) ? nutrientLabels[biggestGaps.find(k => f.nutrition[k] > 0) as keyof Nutrients].toLowerCase() : 'variety'}</span>
                    </div>
                    <Button size="icon" title={`Add ${f.name}`} onClick={() => addFood(f.id)}><Plus size={16} /></Button>
                  </div>
                ))
                : <p className="empty-inline">No suggestions fit the remaining budget. Try adjusting your budget.</p>}
            </div>
          </section>
          <section className="section-block pairing-block">
            <div className="section-title"><div><span className="section-kicker">03 / BETTER TOGETHER</span><h2>Pairs well with {foodById(selected)?.name || 'your list'}</h2></div></div>
            <div className="pair-list">
              {(foodById(selected)?.pairs || []).map(id => {
                const f = foodById(id);
                if (!f) return null;
                return (
                  <div className="pair" key={id}>
                    <span className="food-emoji">{f.emoji}</span>
                    <div><strong>{f.name}</strong><small>{f.note}</small></div>
                    <Button variant="outline" size="sm" onClick={() => addFood(id)}><Plus size={15} /> Add</Button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <div className="right-column">
          <section className="nutrition-panel">
            <div className="section-kicker">YOUR NUTRITION SNAPSHOT</div>
            <h2>How’s your list looking?</h2>
            <p>Estimated daily average across {days} days, including your pantry.</p>
            <div className="coverage-number"><span>{coverage}%</span><small>of core targets<br />in a good range</small></div>
            <div className="nutrient-list">
              {nutrientKeys.map(k => <NutrientBar key={k} name={nutrientLabels[k]} value={combined[k] / days} target={daily[k]} unit={nutrientUnits[k]} />)}
            </div>
            <div className="nutrition-foot">Based on approximate package nutrition. Your needs and actual portions may vary.</div>
          </section>
          <div className="tip-band"><span>✳</span><p><strong>Small swaps, big difference.</strong><br />Canned, frozen, and ready-to-eat still count.</p></div>
        </div>
      </div>
    </>
  );
}
