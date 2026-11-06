import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Admin dashboard data (migration 0007). Every call goes through a SECURITY DEFINER function that
// checks public.app_admin first, so a non-admin gets an error and no data even if they open /admin.

export type Pct = number | null;

export interface RecRate {
  shown: number;
  added: number;
  add_rate_pct: Pct;
}

export interface AdminDashboard {
  as_of: string;
  window_days: number;
  okr1: RecRate;
  okr1_by_source: (RecRate & { source: string })[];
  okr1_weekly: (RecRate & { week: string })[];
  okr2: {
    tracked_users: number;
    goal_met_users: number;
    goal_met_pct: Pct;
    avg_achievement_pct: Pct;
    users_with_recs: number;
    goal_met_pct_with_recs: Pct;
    goal_met_pct_without_recs: Pct;
  } | null;
  okr2_by_nutrient: { nutrient: string; users: number; met_users: number; met_pct: Pct }[];
  okr2_history: { as_of: string; goal_met_pct: Pct; goal_met_users: number; tracked_users: number }[];
  okr3: {
    eligible_users: number;
    frequent_users: number;
    light_users: number;
    inactive_users: number;
    frequent_pct: Pct;
    avg_logon_days: number | null;
    too_new_users: number;
  } | null;
  okr3_history: { as_of: string; frequent_pct: Pct; frequent_users: number; eligible_users: number }[];
  okr4: {
    base_users: number;
    retained_users: number;
    churned_users: number;
    churn_pct: Pct;
    new_users: number;
  } | null;
  okr4_history: { as_of: string; churn_pct: Pct; churned_users: number; base_users: number }[];
  users: { total: number; active: number; inactive: number; new_in_window: number };
  admins: number;
}

export interface AdminUser {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  signed_up_at: string;
  last_sign_in_at: string | null;
  last_active_date: string | null;
  days_inactive: number | null;
  status: string;
  logon_days: number;
  tier: string;
  is_admin: boolean;
  has_profile: boolean;
  trips_completed: number;
  recs_added: number;
}

export type UserFilter = 'all' | 'active' | 'inactive' | 'admins';

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const pct = (v: unknown): Pct => (v === null || v === undefined || v === '' ? null : Number(v));

/* eslint-disable @typescript-eslint/no-explicit-any -- raw JSON from admin_dashboard() */
// Postgres numerics can arrive as strings and empty tables give nulls, so normalise once here.
export function normalizeDashboard(raw: unknown): AdminDashboard {
  const d: any = raw && typeof raw === 'object' ? raw : {};
  const rate = (r: any): RecRate => ({ shown: num(r?.shown), added: num(r?.added), add_rate_pct: pct(r?.add_rate_pct) });
  return {
    as_of: String(d.as_of ?? ''),
    window_days: num(d.window_days) || 30,
    okr1: rate(d.okr1),
    okr1_by_source: asArray<any>(d.okr1_by_source).map(r => ({ ...rate(r), source: String(r.source) })),
    okr1_weekly: asArray<any>(d.okr1_weekly).map(r => ({ ...rate(r), week: String(r.week) })),
    okr2: d.okr2 ? {
      tracked_users: num(d.okr2.tracked_users),
      goal_met_users: num(d.okr2.goal_met_users),
      goal_met_pct: pct(d.okr2.goal_met_pct),
      avg_achievement_pct: pct(d.okr2.avg_achievement_pct),
      users_with_recs: num(d.okr2.users_with_recs),
      goal_met_pct_with_recs: pct(d.okr2.goal_met_pct_with_recs),
      goal_met_pct_without_recs: pct(d.okr2.goal_met_pct_without_recs),
    } : null,
    okr2_by_nutrient: asArray<any>(d.okr2_by_nutrient).map(n => ({ nutrient: String(n.nutrient), users: num(n.users), met_users: num(n.met_users), met_pct: pct(n.met_pct) })),
    okr2_history: asArray<any>(d.okr2_history).map(h => ({ as_of: String(h.as_of), goal_met_pct: pct(h.goal_met_pct), goal_met_users: num(h.goal_met_users), tracked_users: num(h.tracked_users) })),
    okr3: d.okr3 ? {
      eligible_users: num(d.okr3.eligible_users),
      frequent_users: num(d.okr3.frequent_users),
      light_users: num(d.okr3.light_users),
      inactive_users: num(d.okr3.inactive_users),
      frequent_pct: pct(d.okr3.frequent_pct),
      avg_logon_days: d.okr3.avg_logon_days == null ? null : Number(d.okr3.avg_logon_days),
      too_new_users: num(d.okr3.too_new_users),
    } : null,
    okr3_history: asArray<any>(d.okr3_history).map(h => ({ as_of: String(h.as_of), frequent_pct: pct(h.frequent_pct), frequent_users: num(h.frequent_users), eligible_users: num(h.eligible_users) })),
    okr4: d.okr4 ? {
      base_users: num(d.okr4.base_users),
      retained_users: num(d.okr4.retained_users),
      churned_users: num(d.okr4.churned_users),
      churn_pct: pct(d.okr4.churn_pct),
      new_users: num(d.okr4.new_users),
    } : null,
    okr4_history: asArray<any>(d.okr4_history).map(h => ({ as_of: String(h.as_of), churn_pct: pct(h.churn_pct), churned_users: num(h.churned_users), base_users: num(h.base_users) })),
    users: { total: num(d.users?.total), active: num(d.users?.active), inactive: num(d.users?.inactive), new_in_window: num(d.users?.new_in_window) },
    admins: num(d.admins),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export const formatPct = (v: Pct) => (v === null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(1)}%`);

export const fullName = (u: Pick<AdminUser, 'first_name' | 'last_name'>) => `${u.first_name} ${u.last_name}`.trim();

export function filterUsers(users: AdminUser[], query: string, filter: UserFilter) {
  const q = query.trim().toLowerCase();
  return users.filter(u => {
    if (filter === 'admins' && !u.is_admin) return false;
    if ((filter === 'active' || filter === 'inactive') && u.status !== filter) return false;
    if (!q) return true;
    return u.email.toLowerCase().includes(q) || fullName(u).toLowerCase().includes(q);
  });
}

export function toCsv(users: AdminUser[]) {
  const cols: (keyof AdminUser)[] = ['email', 'first_name', 'last_name', 'signed_up_at', 'last_active_date', 'days_inactive', 'status', 'logon_days', 'tier', 'is_admin', 'has_profile', 'trips_completed', 'recs_added'];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...users.map(u => cols.map(c => cell(u[c])).join(','))].join('\n');
}

export async function checkIsAdmin() {
  const { data, error } = await supabase.rpc('is_kiwi_admin');
  // Before migration 0007 is applied the function doesn't exist; treat that as "not an admin".
  if (error) return false;
  return data === true;
}

export async function loadAdminDashboard() {
  const { data, error } = await supabase.rpc('admin_dashboard', {});
  if (error) throw error;
  return normalizeDashboard(data);
}

export async function loadAdminUsers() {
  const { data, error } = await supabase.rpc('admin_users');
  if (error) throw error;
  return (data || []) as AdminUser[];
}

export async function setAdmin(userId: string, isAdmin: boolean) {
  const { error } = await supabase.rpc('admin_set_admin', { p_user_id: userId, p_is_admin: isAdmin });
  if (error) throw error;
}

export async function refreshSnapshots() {
  const { error } = await supabase.rpc('admin_refresh_snapshots');
  if (error) throw error;
}

// null while checking, then true/false. Used by the shell to show the Admin button.
export function useIsAdmin(userId: string | null | undefined) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    setIsAdmin(null);
    checkIsAdmin().then(v => { if (active) setIsAdmin(v); });
    return () => { active = false; };
  }, [userId]);
  return isAdmin;
}
