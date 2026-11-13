import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Database, LoaderCircle, Plus, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { addFoodToCatalog } from '@/lib/foods';
import {
  finderAdd, finderCancel, finderCapability, finderRequestMore, finderSearch, finderStatus, finderSubmitToAdmin, type Result,
} from '@/lib/food-import/functions';
import { GROUP_RULES } from '@/lib/food-import/rules';
import { HOW_BOUGHT, type AddResult, type FinderOption, type FinderStatus, type HowBought, type SearchResult } from '@/lib/food-import/shared';
import { useWorkspace } from './context';

type Step = 'form' | 'options' | 'done' | 'sent' | 'limit';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  // Admin queue: work on someone's "no good match" request.
  adminRequest?: { requestId: number; query: string; howBought?: string | null; notes?: string | null } | null;
  onFinished?: () => void;
  // Where the found food goes: the grocery list (default) or the pantry.
  target?: 'list' | 'pantry';
};

const DATASET_LABEL: Record<string, string> = { 'Survey (FNDDS)': 'FNDDS survey', 'SR Legacy': 'SR Legacy', Foundation: 'Foundation', Branded: 'Branded' };
const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2).replace(/\.?0+$/, '') || '0');

async function call<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export function FoodFinder({ open, onOpenChange, initialQuery = '', adminRequest = null, onFinished, target = 'list' }: Props) {
  const { addFood, listItems, addPantry, pantry } = useWorkspace();
  const toPantry = target === 'pantry';
  const addTo = (id: string) => (toPantry ? addPantry(id) : addFood(id).then(() => undefined));
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<FinderStatus | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(import.meta.env['VITE_KIWI_SELF_HOSTED'] === 'true' ? null : true);

  const [query, setQuery] = useState(initialQuery);
  const [howBought, setHowBought] = useState<HowBought>('not_sure');
  const [notes, setNotes] = useState('');
  const [answer, setAnswer] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [moreNote, setMoreNote] = useState('');

  const [result, setResult] = useState<SearchResult | null>(null);
  const [added, setAdded] = useState<(AddResult & { id: string }) | null>(null);
  const requestId = useRef<number | null>(null);
  const finished = useRef(false);

  // Reset each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let active = true;
    finished.current = false;
    requestId.current = adminRequest?.requestId ?? null;
    setStep('form');
    setError('');
    setBusy('');
    setPending(null);
    setQuery(adminRequest?.query ?? initialQuery);
    setHowBought((HOW_BOUGHT.find(h => h.id === adminRequest?.howBought)?.id ?? 'not_sure') as HowBought);
    setNotes(adminRequest?.notes ?? '');
    setAnswer('');
    setAdminNote('');
    setResult(null);
    setAdded(null);
    if (import.meta.env['VITE_KIWI_SELF_HOSTED'] === 'true') {
      setEnabled(null);
      void finderCapability().then(r => { if (active) setEnabled(r.ok && r.data.enabled); }).catch(() => { if (active) setEnabled(false); });
    }
    void finderStatus().then(r => {
      if (!r.ok) return;
      setStatus(r.data);
      if (r.data.remaining === 0) setStep('limit');
    });
    return () => { active = false; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function close(next: boolean) {
    if (!next && requestId.current && !finished.current && !adminRequest) void finderCancel({ data: { requestId: requestId.current } });
    onOpenChange(next);
  }

  async function guard(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy('');
      setPending(null);
    }
  }

  const search = (withAnswer?: string) => guard('Searching USDA and asking the AI assistant…', async () => {
    const data = await call(finderSearch({
      data: { query, howBought, notes, ...(requestId.current ? { requestId: requestId.current } : {}), ...(withAnswer ? { answer: withAnswer } : {}) },
    }));
    requestId.current = data.requestId;
    setStatus(data.status);
    setResult(data);
    setAnswer('');
    setStep('options');
  });

  function submitForm(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) {
      setError('Type the food you’d like to add.');
      return;
    }
    void search();
  }

  // Picking an option is the last thing the user does: serving, nutrients, flavor profile and pairings are automatic.
  const choose = (option: FinderOption) => {
    if (!result) return;
    setPending(option.fdcId);
    return guard(`Adding ${option.label}…`, async () => {
      const data = await call(finderAdd({ data: { requestId: result.requestId, fdcId: option.fdcId, group: result.group, serving: option.serving } }));
      finished.current = true;
      const food = addFoodToCatalog(data.food);
      setStatus(data.status);
      setAdded({ ...data, id: food.id });
      setStep('done');
      onFinished?.();
    });
  };

  const sendToAdmin = () => guard('Sending to an admin…', async () => {
    await call(finderSubmitToAdmin({ data: { requestId: requestId.current!, note: adminNote } }));
    finished.current = true;
    setStep('sent');
  });

  const askForMore = () => guard('Sending your request…', async () => {
    setStatus(await call(finderRequestMore({ data: { note: moreNote } })));
  });

  const alreadyThere = added ? (toPantry ? pantry : listItems).some(i => i.food_id === added.id) : false;
  const remaining = status?.remaining;
  const summary = added?.summary;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="finder-dialog">
        <DialogHeader>
          <DialogTitle className="finder-title"><Sparkles size={18} aria-hidden="true" /> Add a food to Kiwi</DialogTitle>
          <DialogDescription>
            {adminRequest ? 'Admin: find the USDA record for this request.' : 'Kiwi’s AI assistant searches USDA FoodData Central and you pick the match.'}
            {status && status.limit !== null && <span className="finder-quota"> {status.added} of {status.limit} foods added.</span>}
          </DialogDescription>
        </DialogHeader>

        {error && <div className="form-error" role="alert">{error}</div>}
        {busy && <div className="content-loading finder-busy" role="status"><LoaderCircle size={16} className="spin" aria-hidden="true" /> {busy}</div>}

        {enabled === null && <p role="status">Checking food finder availability…</p>}
        {enabled === false && <p role="status">The food finder is not configured on this server.</p>}
        {enabled && step === 'limit' && status && (
          <div className="finder-section">
            <p>You’ve added <strong>{status.added}</strong> foods, your current limit. An admin can approve 10 more.</p>
            {status.quotaPending ? (
              <p className="form-success" role="status"><CheckCircle2 size={16} aria-hidden="true" /> Request sent. You’ll be able to add more once an admin approves it.</p>
            ) : (
              <>
                <label className="control-label" htmlFor="finder-more-note">Note for the admin (optional)</label>
                <textarea id="finder-more-note" className="finder-input" rows={2} maxLength={300} value={moreNote} onChange={e => setMoreNote(e.target.value)} placeholder="What are you trying to add?" />
                <Button onClick={askForMore} disabled={!!busy}><Send size={16} /> Request 10 more foods</Button>
              </>
            )}
          </div>
        )}

        {enabled && step === 'form' && (
          <form className="finder-section" onSubmit={submitForm}>
            <label className="control-label" htmlFor="finder-query">Food</label>
            <input id="finder-query" className="finder-input" maxLength={80} autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. black lentils, gala apple, frozen edamame" />
            <span className="control-label" id="finder-how">How do you buy it?</span>
            <div className="finder-choices" role="group" aria-labelledby="finder-how">
              {HOW_BOUGHT.map(h => (
                <Button key={h.id} type="button" variant="outline" size="sm" className={howBought === h.id ? 'pantry-chip chosen' : 'pantry-chip'} aria-pressed={howBought === h.id} onClick={() => setHowBought(h.id)}>{h.label}</Button>
              ))}
            </div>
            <label className="control-label" htmlFor="finder-notes">Anything else? (optional)</label>
            <textarea id="finder-notes" className="finder-input" rows={2} maxLength={300} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Brand, variety, how you cook it…" />
            <div className="finder-actions">
              <Button type="submit" disabled={!!busy}><Sparkles size={16} /> Find it</Button>
              {remaining != null && <small className="section-note">{remaining} {remaining === 1 ? 'add' : 'adds'} left</small>}
            </div>
          </form>
        )}

        {enabled && step === 'options' && result && (
          <div className="finder-section">
            {result.existing.length > 0 && (
              <div className="finder-existing">
                <strong>Already in Kiwi:</strong>
                {result.existing.map(f => (
                  <Button key={f.id} variant="outline" size="sm" onClick={() => { void addTo(f.id); close(false); }}>
                    <Plus size={14} /> {f.name}
                  </Button>
                ))}
              </div>
            )}

            {result.options.length > 0 && (
              <>
                <p className="section-note">Pick the closest match and Kiwi adds it, sized to what you buy ({GROUP_RULES[result.group].label.toLowerCase()}).</p>
                <ul className="finder-options">
                  {result.options.map(o => (
                    <li key={o.fdcId}>
                      <button type="button" className="finder-option" disabled={!!busy} aria-busy={pending === o.fdcId} onClick={() => void choose(o)}>
                        <span className="finder-option-head">
                          <strong>{o.label}</strong>
                          {pending === o.fdcId ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <span className="count-pill"><Plus size={12} aria-hidden="true" /> Add</span>}
                        </span>
                        <span className="finder-option-desc">{o.description}{o.brand ? ` · ${o.brand}` : ''}</span>
                        <span className="finder-option-meta"><Database size={12} aria-hidden="true" /> {DATASET_LABEL[o.dataType] ?? o.dataType} · {o.coverage}/27 nutrients</span>
                        {o.reason && <span className="finder-option-reason">{o.reason}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {result.followUpQuestion && (
              <form className="finder-followup" onSubmit={e => { e.preventDefault(); if (answer.trim()) void search(answer.trim()); }}>
                <label className="control-label" htmlFor="finder-answer">{result.followUpQuestion}</label>
                <div className="finder-inline">
                  <input id="finder-answer" className="finder-input" maxLength={200} value={answer} onChange={e => setAnswer(e.target.value)} />
                  <Button type="submit" variant="outline" disabled={!!busy || !answer.trim()}>Answer</Button>
                </div>
              </form>
            )}

            {result.noGoodMatch && <p className="empty-inline">USDA doesn’t have a good match for “{query}”.</p>}

            <details className="finder-nomatch" open={result.noGoodMatch}>
              <summary>None of these?</summary>
              <form className="finder-inline" onSubmit={e => { e.preventDefault(); void search(); }}>
                <input aria-label="Search again" className="finder-input" maxLength={80} value={query} onChange={e => setQuery(e.target.value)} />
                <Button type="submit" variant="outline" disabled={!!busy}>Search again</Button>
              </form>
              {!adminRequest && (
                <>
                  <label className="control-label" htmlFor="finder-admin-note">Or send it to an admin to add</label>
                  <textarea id="finder-admin-note" className="finder-input" rows={2} maxLength={300} value={adminNote} onChange={e => setAdminNote(e.target.value)} placeholder="What should they look for?" />
                  <div className="finder-actions">
                    <Button variant="outline" onClick={sendToAdmin} disabled={!!busy}><Send size={16} /> Send to an admin</Button>
                    <Button variant="ghost" onClick={() => close(false)}><X size={16} /> Cancel request</Button>
                  </div>
                </>
              )}
            </details>
          </div>
        )}

        {step === 'done' && added && (
          <div className="finder-section finder-done">
            <p className="form-success" role="status">
              <CheckCircle2 size={18} aria-hidden="true" /> {added.food.emoji} <strong>{added.food.food_name}</strong>
              {added.alreadyExisted ? ' was already in Kiwi.' : ' is now in Kiwi for everyone.'}
            </p>
            {summary && (
              <>
                <div className="finder-nutrients" aria-label={`Nutrients per ${summary.serving}`}>
                  <div className="finder-nutrients-head"><strong>Per {summary.serving}</strong><small>{fmt(summary.servingGrams)} g</small></div>
                  <dl>
                    {summary.nutrients.map(n => <div key={n.key}><dt>{n.label}</dt><dd>{fmt(n.value)} {n.unit}</dd></div>)}
                  </dl>
                </div>
                {(summary.flavorTags.length > 0 || summary.pairs.length > 0) && (
                  <p className="section-note finder-done-meta">
                    {summary.flavorTags.length > 0 && <>Flavor: {summary.flavorTags.join(', ')}. </>}
                    {summary.pairs.length > 0 && <>Pairs well with {summary.pairs.join(', ')}.</>}
                  </p>
                )}
                <p className="section-note finder-done-meta">
                  {summary.price
                    ? <>About <strong>${summary.price.perServing.toFixed(2)}</strong> per {summary.serving} at {summary.price.store} ({summary.price.product}).</>
                    : <>{summary.priceNote ?? 'No store price yet.'} It’ll show as unpriced for now.</>}
                </p>
                <p className="section-note finder-done-meta">{summary.source}{summary.needsReview ? ' · An admin will double-check its numbers.' : ''}</p>
              </>
            )}
            <div className="finder-actions">
              {!adminRequest && (alreadyThere
                ? <Button variant="outline" disabled><Check size={16} /> {toPantry ? 'In your pantry' : 'On your list'}</Button>
                : <Button onClick={() => void addTo(added.id)}><Plus size={16} /> {toPantry ? 'Add to my pantry' : 'Add to my list'}</Button>)}
              <Button variant="ghost" onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        )}

        {step === 'sent' && (
          <div className="finder-section">
            <p className="form-success" role="status"><CheckCircle2 size={18} aria-hidden="true" /> Sent. An admin will look for “{query}” and add it.</p>
            <div className="finder-actions"><Button variant="ghost" onClick={() => close(false)}>Done</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
