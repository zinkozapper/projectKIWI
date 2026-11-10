import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, LoaderCircle, Pencil, RefreshCw, Search, ShieldCheck, ShieldOff, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  filterUsers, formatPct, fullName, loadAdminDashboard, loadAdminUsers, refreshSnapshots, setAdmin, toCsv,
  type AdminDashboard, type AdminUser, type UserFilter,
} from '@/lib/admin';
import { nutrientLabels } from '@/lib/foods';
import { adminDeleteAccount } from '@/lib/admin-accounts/functions';
import { AccountDialog } from '../account-dialog';
import { useWorkspace } from '../context';
import { FoodQueue } from '../food-queue';

const filters: { id: UserFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'admins', label: 'Admins' },
];

const sourceLabels: Record<string, string> = { nutrient_gap: 'Suggestions card', pairing: 'Pairs well with' };

const shortDate = (v: string | null) => (v ? new Date(v.length === 10 ? `${v}T00:00:00Z` : v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');

const errorText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong');

export function AdminPage() {
  const { isAdmin, userId } = useWorkspace();
  const [dash, setDash] = useState<AdminDashboard | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<UserFilter>('all');
  const [busyUser, setBusyUser] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; account: AdminUser | null }>({ open: false, account: null });

  const load = useCallback(async (recompute = false) => {
    setLoading(true);
    setError('');
    try {
      if (recompute) await refreshSnapshots();
      const [d, u] = await Promise.all([loadAdminDashboard(), loadAdminUsers()]);
      setDash(d);
      setUsers(u);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const shown = useMemo(() => filterUsers(users, query, filter), [users, query, filter]);

  // One row per snapshot day with both retention numbers side by side.
  const history = useMemo(() => {
    if (!dash) return [];
    type Day = { as_of: string; nutrients: number | null; frequent: number | null; churn: number | null };
    const days = new Map<string, Day>();
    const day = (as_of: string): Day => days.get(as_of) || { as_of, nutrients: null, frequent: null, churn: null };
    for (const h of dash.okr2_history) days.set(h.as_of, { ...day(h.as_of), nutrients: h.goal_met_pct });
    for (const h of dash.okr3_history) days.set(h.as_of, { ...day(h.as_of), frequent: h.frequent_pct });
    for (const h of dash.okr4_history) days.set(h.as_of, { ...day(h.as_of), churn: h.churn_pct });
    return [...days.values()].sort((a, b) => b.as_of.localeCompare(a.as_of)).slice(0, 14);
  }, [dash]);

  async function toggleAdmin(u: AdminUser) {
    const label = fullName(u) || u.email;
    const ok = window.confirm(u.is_admin ? `Remove admin access for ${label}?` : `Make ${label} an admin? They'll see every account and the OKR numbers.`);
    if (!ok) return;
    setBusyUser(u.user_id);
    setError('');
    try {
      await setAdmin(u.user_id, !u.is_admin);
      setUsers(list => list.map(x => (x.user_id === u.user_id ? { ...x, is_admin: !u.is_admin } : x)));
      setNotice(u.is_admin ? `${label} is no longer an admin.` : `${label} is now an admin.`);
      setDash(d => (d ? { ...d, admins: d.admins + (u.is_admin ? -1 : 1) } : d));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyUser('');
    }
  }

  async function deleteAccount(u: AdminUser) {
    const label = fullName(u) || u.email;
    const ok = window.confirm(`Delete the account for ${label} (${u.email})?\n\nThis permanently removes their sign-in, profile, pantry, lists and history. It can't be undone.`);
    if (!ok) return;
    setBusyUser(u.user_id);
    setError('');
    setNotice('');
    try {
      const result = await adminDeleteAccount({ data: { userId: u.user_id } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`Deleted ${u.email}.`);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyUser('');
    }
  }

  async function accountSaved(message: string) {
    setDialog({ open: false, account: null });
    setError('');
    setNotice(message);
    await load();
  }

  function exportCsv() {
    const blob = new Blob([toCsv(shown)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kiwi-users-${dash?.as_of || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isAdmin === null) {
    return <div className="content-loading" role="status"><LoaderCircle size={16} aria-hidden="true" /> Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="empty-state tall">
        <ShieldOff size={30} />
        <h2>Admins only</h2>
        <p>This page is for Kiwi admins. Ask an admin to give your account access.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">ADMIN</span>
          <h1>Kiwi dashboard<span className="brand-dot">.</span></h1>
          <p>{dash ? `OKR numbers for the last ${dash.window_days} days, as of ${shortDate(dash.as_of)} (UTC).` : 'OKR numbers and accounts.'}</p>
        </div>
        <Button variant="outline" onClick={() => load(true)} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </Button>
      </div>

      {error && <div className="form-error admin-error" role="alert">{error}</div>}
      {notice && !error && <div className="form-success admin-error" role="status">{notice}</div>}

      {!dash && loading && <div className="content-loading" role="status"><LoaderCircle size={16} aria-hidden="true" /> Loading dashboard…</div>}

      {dash && (
        <>
          <div className="admin-kpis">
            <section className="kpi-tile">
              <span className="section-kicker">OKR 1 · RECOMMENDATIONS</span>
              <strong className="kpi-value">{formatPct(dash.okr1.add_rate_pct)}</strong>
              <p>{dash.okr1.added} of {dash.okr1.shown} shown recommendations were added to a list.</p>
              {dash.okr1_by_source.length > 0 && (
                <ul className="kpi-breakdown">
                  {dash.okr1_by_source.map(s => (
                    <li key={s.source}><span>{sourceLabels[s.source] || s.source}</span><span>{formatPct(s.add_rate_pct)} <small>({s.added}/{s.shown})</small></span></li>
                  ))}
                </ul>
              )}
            </section>

            <section className="kpi-tile">
              <span className="section-kicker">OKR 2 · NUTRIENT GOALS</span>
              <strong className="kpi-value">{formatPct(dash.okr2?.goal_met_pct ?? null)}</strong>
              <p>{dash.okr2?.goal_met_users ?? 0} of {dash.okr2?.tracked_users ?? 0} pantries cover every daily nutrient target.</p>
              {dash.okr2 && (
                <ul className="kpi-breakdown">
                  <li><span>Avg nutrients met</span><span>{formatPct(dash.okr2.avg_achievement_pct)}</span></li>
                  <li><span>With a recommended food</span><span>{formatPct(dash.okr2.goal_met_pct_with_recs)} <small>({dash.okr2.users_with_recs})</small></span></li>
                  <li><span>Without</span><span>{formatPct(dash.okr2.goal_met_pct_without_recs)}</span></li>
                  {dash.okr2_by_nutrient.slice(0, 2).map(n => (
                    <li key={n.nutrient}><span>Most missed: {nutrientLabels[n.nutrient as keyof typeof nutrientLabels] || n.nutrient}</span><span>{formatPct(n.met_pct)} met</span></li>
                  ))}
                </ul>
              )}
            </section>

            <section className="kpi-tile">
              <span className="section-kicker">OKR 3 · LOGIN FREQUENCY</span>
              <strong className="kpi-value">{formatPct(dash.okr3?.frequent_pct ?? null)}</strong>
              <p>{dash.okr3?.frequent_users ?? 0} of {dash.okr3?.eligible_users ?? 0} users logged on 2 or more days.</p>
              {dash.okr3 && (
                <ul className="kpi-breakdown">
                  <li><span>Light (1 day)</span><span>{dash.okr3.light_users}</span></li>
                  <li><span>Inactive (0 days)</span><span>{dash.okr3.inactive_users}</span></li>
                  <li><span>Avg logon days</span><span>{dash.okr3.avg_logon_days ?? '—'}</span></li>
                  {dash.okr3.too_new_users > 0 && <li><span>Too new to count</span><span>{dash.okr3.too_new_users}</span></li>}
                </ul>
              )}
            </section>

            <section className="kpi-tile">
              <span className="section-kicker">OKR 4 · CHURN</span>
              <strong className="kpi-value">{formatPct(dash.okr4?.churn_pct ?? null)}</strong>
              <p>{dash.okr4?.churned_users ?? 0} of {dash.okr4?.base_users ?? 0} users active the {dash.window_days} days before haven't come back.</p>
              {dash.okr4 && (
                <ul className="kpi-breakdown">
                  <li><span>Retained</span><span>{dash.okr4.retained_users}</span></li>
                  <li><span>New sign-ups</span><span>{dash.okr4.new_users}</span></li>
                </ul>
              )}
            </section>

            <section className="kpi-tile">
              <span className="section-kicker">ACCOUNTS</span>
              <strong className="kpi-value">{dash.users.total}</strong>
              <p>{dash.users.active} active and {dash.users.inactive} inactive (no activity in {dash.window_days} days).</p>
              <ul className="kpi-breakdown">
                <li><span>New this period</span><span>{dash.users.new_in_window}</span></li>
                <li><span>Admins</span><span>{dash.admins}</span></li>
              </ul>
            </section>
          </div>

          <div className="admin-trends">
            <section className="admin-card">
              <div className="section-title"><h2>Daily history</h2></div>
              <p className="section-note">Saved each night by the scheduled jobs. Refresh recomputes today.</p>
              {history.length ? (
                <table className="admin-table compact">
                  <thead><tr><th>Day</th><th>Goals met (OKR 2)</th><th>Frequent (OKR 3)</th><th>Churn (OKR 4)</th></tr></thead>
                  <tbody>{history.map(h => <tr key={h.as_of}><td>{shortDate(h.as_of)}</td><td>{formatPct(h.nutrients)}</td><td>{formatPct(h.frequent)}</td><td>{formatPct(h.churn)}</td></tr>)}</tbody>
                </table>
              ) : <div className="empty-state">No snapshots yet.</div>}
            </section>

            <section className="admin-card">
              <div className="section-title"><h2>Weekly add rate</h2></div>
              <p className="section-note">OKR 1 by week the recommendation was shown, last 12 weeks.</p>
              {dash.okr1_weekly.length ? (
                <table className="admin-table compact">
                  <thead><tr><th>Week of</th><th>Shown</th><th>Added</th><th>Rate</th></tr></thead>
                  <tbody>{dash.okr1_weekly.map(w => <tr key={w.week}><td>{shortDate(w.week)}</td><td>{w.shown}</td><td>{w.added}</td><td>{formatPct(w.add_rate_pct)}</td></tr>)}</tbody>
                </table>
              ) : <div className="empty-state">No recommendations shown yet.</div>}
            </section>
          </div>
        </>
      )}

      <FoodQueue />

      <section className="admin-card admin-users">
        <div className="section-title">
          <h2>Users</h2>
          <span className="count-pill">{shown.length} of {users.length}</span>
        </div>
        <div className="admin-toolbar">
          <div className="searchbox">
            <Search size={19} />
            <input aria-label="Search users" placeholder="Search by name or email" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <div className="segmented" role="group" aria-label="Filter users">
            {filters.map(f => (
              <Button key={f.id} type="button" variant="ghost" className={filter === f.id ? 'selected' : ''} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Button>
            ))}
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!shown.length}><Download size={16} /> CSV</Button>
          <Button onClick={() => { setNotice(''); setDialog({ open: true, account: null }); }}><UserPlus size={16} /> Add account</Button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Logon days (30d)</th>
                <th>Last active</th>
                <th>Signed up</th>
                <th>Trips</th>
                <th>Recs added</th>
                <th aria-label="Account actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map(u => (
                <tr key={u.user_id}>
                  <td>
                    <div className="admin-user-name">{fullName(u) || '—'}{u.is_admin && <span className="admin-badge">Admin</span>}</div>
                    <div className="admin-user-email">{u.email}{!u.has_profile && ' · no profile yet'}</div>
                  </td>
                  <td><span className={`status-pill ${u.status}`}>{u.status}</span></td>
                  <td>{u.logon_days} <small className="tier">{u.tier}</small></td>
                  <td>{shortDate(u.last_active_date)}{u.days_inactive !== null && u.days_inactive > 0 && <small> · {u.days_inactive}d ago</small>}</td>
                  <td>{shortDate(u.signed_up_at)}</td>
                  <td>{u.trips_completed}</td>
                  <td>{u.recs_added}</td>
                  <td>
                    <div className="admin-row-actions">
                      {u.user_id !== userId && (
                        <Button variant="ghost" size="sm" onClick={() => toggleAdmin(u)} disabled={busyUser === u.user_id}>
                          {u.is_admin ? <><ShieldOff size={14} /> Remove admin</> : <><ShieldCheck size={14} /> Make admin</>}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => { setNotice(''); setDialog({ open: true, account: u }); }} disabled={busyUser === u.user_id} aria-label={`Edit ${u.email}`}>
                        <Pencil size={14} /> Edit
                      </Button>
                      {u.user_id !== userId && (
                        <Button variant="ghost" size="sm" className="admin-delete" onClick={() => deleteAccount(u)} disabled={busyUser === u.user_id} aria-label={`Delete ${u.email}`}>
                          <Trash2 size={14} /> Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && !loading && <div className="empty-state">No users match.</div>}
        </div>
      </section>

      <AccountDialog
        open={dialog.open}
        account={dialog.account}
        onClose={() => setDialog({ open: false, account: null })}
        onSaved={accountSaved}
      />
    </>
  );
}
