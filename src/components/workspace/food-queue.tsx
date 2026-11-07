import { useCallback, useEffect, useState } from 'react';
import { Check, LoaderCircle, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { FoodFinder } from './food-finder';

// Admin queue for the AI food finder (migration 0009): requests for more adds, "no good match" requests,
// and new foods the workflow flagged for review.

type Pending = {
  request_id: number;
  kind: 'food' | 'quota';
  query: string;
  how_bought: string | null;
  notes: string | null;
  created_at: string;
  email: string;
  name: string;
  foods_added: number;
  food_limit: number;
};
type Flagged = { food_id: number; food_name: string; food_group: string | null; review_notes: string | null; fdc_id: number | null; raw_fdc_id: number | null; created_at: string; added_by_email: string | null };
type Recent = { request_id: number; kind: string; status: string; query: string; food_name: string | null; updated_at: string; email: string };
type Queue = { pending: Pending[]; flagged_foods: Flagged[]; recent: Recent[] };

const when = (v: string) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const message = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong');

export function FoodQueue() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string>('');
  const [working, setWorking] = useState<Pending | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: e } = await supabase.rpc('admin_food_queue');
    if (e) setError(e.message);
    else setQueue(data as unknown as Queue);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(key: string, fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(key);
    setError('');
    const { error: e } = await fn();
    if (e) setError(message(e));
    setBusy('');
    await load();
  }

  const resolve = (r: Pending, approve: boolean) => {
    const note = approve ? null : window.prompt('Reason for the user (optional)') ?? null;
    return act(`r${r.request_id}`, () => supabase.rpc('admin_resolve_food_request', { p_request_id: r.request_id, p_approve: approve, ...(note ? { p_note: note } : {}) }));
  };

  return (
    <section className="admin-card admin-food-queue">
      <div className="section-title">
        <h2>Food requests</h2>
        <span className="count-pill">{queue?.pending.length ?? 0} waiting</span>
      </div>
      <p className="section-note">From the AI food finder: requests for 10 more foods, foods the workflow couldn’t match, and new foods flagged for a check.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading && !queue && <div className="content-loading" role="status"><LoaderCircle size={16} aria-hidden="true" /> Loading requests…</div>}

      {queue && (
        <>
          {queue.pending.length ? (
            <ul className="queue-list">
              {queue.pending.map(r => (
                <li key={r.request_id} className="queue-row">
                  <div>
                    <strong>{r.kind === 'quota' ? 'Wants 10 more foods' : `Add “${r.query}”`}</strong>
                    <small>{r.name || r.email} · {r.foods_added}/{r.food_limit} foods added · {when(r.created_at)}</small>
                    {r.notes && <p>“{r.notes}”</p>}
                  </div>
                  <div className="queue-actions">
                    {r.kind === 'quota' ? (
                      <Button size="sm" onClick={() => void resolve(r, true)} disabled={!!busy}><Check size={14} /> Approve +10</Button>
                    ) : (
                      <Button size="sm" onClick={() => setWorking(r)} disabled={!!busy}><Search size={14} /> Find it</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => void resolve(r, false)} disabled={!!busy}><X size={14} /> Decline</Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="empty-state">No requests waiting.</div>}

          {queue.flagged_foods.length > 0 && (
            <>
              <h3 className="queue-subhead">New foods to double-check</h3>
              <ul className="queue-list">
                {queue.flagged_foods.map(f => (
                  <li key={f.food_id} className="queue-row">
                    <div>
                      <strong>{f.food_name}</strong>
                      <small>{f.food_group ?? 'food'} · USDA {f.fdc_id ?? '—'}{f.raw_fdc_id ? ` / raw ${f.raw_fdc_id}` : ''} · {f.added_by_email ?? 'unknown'} · {when(f.created_at)}</small>
                      {f.review_notes && <p>{f.review_notes}</p>}
                    </div>
                    <div className="queue-actions">
                      <Button size="sm" variant="outline" onClick={() => void act(`f${f.food_id}`, () => supabase.rpc('admin_mark_food_reviewed', { p_food_id: f.food_id }))} disabled={!!busy}><Check size={14} /> Looks right</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {queue.recent.length > 0 && (
            <details className="queue-recent">
              <summary>Recent ({queue.recent.length})</summary>
              <table className="admin-table compact">
                <thead><tr><th>Request</th><th>User</th><th>Result</th><th>Date</th></tr></thead>
                <tbody>
                  {queue.recent.map(r => (
                    <tr key={r.request_id}>
                      <td>{r.kind === 'quota' ? '10 more foods' : r.query}</td>
                      <td>{r.email}</td>
                      <td><span className={`status-pill ${r.status === 'rejected' ? 'inactive' : 'active'}`}>{r.status === 'added' ? `added ${r.food_name ?? ''}` : r.status}</span></td>
                      <td>{when(r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}

      <FoodFinder
        open={!!working}
        onOpenChange={o => { if (!o) { setWorking(null); void load(); } }}
        adminRequest={working ? { requestId: working.request_id, query: working.query, howBought: working.how_bought, notes: working.notes } : null}
      />
    </section>
  );
}
