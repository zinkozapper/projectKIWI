import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import { filterUsers, formatPct, normalizeDashboard, toCsv, type AdminUser } from './admin';

const user = (over: Partial<AdminUser>): AdminUser => ({
  user_id: 'u', email: 'a@x.com', first_name: '', last_name: '', signed_up_at: '2026-10-01T00:00:00Z',
  last_sign_in_at: null, last_active_date: null, days_inactive: null, status: 'active', logon_days: 0,
  tier: 'inactive', is_admin: false, has_profile: true, trips_completed: 0, recs_added: 0, ...over,
});

describe('admin dashboard helpers', () => {
  it('normalises numeric strings and empty sections', () => {
    const d = normalizeDashboard({
      as_of: '2026-11-05', window_days: 30,
      okr1: { shown: 4, added: 1, add_rate_pct: '25.0' },
      okr3: { eligible_users: '13', frequent_users: 4, frequent_pct: '30.8', avg_logon_days: null },
      okr2: { tracked_users: 3, goal_met_users: '1', goal_met_pct: '33.3' },
      okr2_by_nutrient: [{ nutrient: 'fiber', users: 3, met_users: 0, met_pct: '0.0' }],
      okr4: null,
      users: { total: 13 },
    });
    expect(d.okr1.add_rate_pct).toBe(25);
    expect(d.okr3?.eligible_users).toBe(13);
    expect(d.okr3?.frequent_pct).toBe(30.8);
    expect(d.okr3?.avg_logon_days).toBeNull();
    expect(d.okr2?.goal_met_pct).toBe(33.3);
    expect(d.okr2?.goal_met_users).toBe(1);
    expect(d.okr2_by_nutrient[0]?.met_pct).toBe(0);
    expect(d.okr2_history).toEqual([]);
    expect(d.okr4).toBeNull();
    expect(d.okr1_by_source).toEqual([]);
    expect(d.users).toEqual({ total: 13, active: 0, inactive: 0, new_in_window: 0 });
  });

  it('formats missing percentages as a dash', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatPct(30.8)).toBe('30.8%');
    expect(formatPct(0)).toBe('0.0%');
  });

  it('filters by status, admin and search text', () => {
    const users = [
      user({ user_id: '1', email: 'ada@x.com', first_name: 'Ada', last_name: 'Lovelace', is_admin: true }),
      user({ user_id: '2', email: 'bob@x.com', status: 'inactive' }),
    ];
    expect(filterUsers(users, '', 'admins').map(u => u.user_id)).toEqual(['1']);
    expect(filterUsers(users, '', 'inactive').map(u => u.user_id)).toEqual(['2']);
    expect(filterUsers(users, 'lovelace', 'all').map(u => u.user_id)).toEqual(['1']);
    expect(filterUsers(users, 'BOB', 'all').map(u => u.user_id)).toEqual(['2']);
  });

  it('quotes CSV cells that need it', () => {
    const csv = toCsv([user({ first_name: 'Ann, "Jr"' })]);
    expect(csv.split('\n')[1]).toContain('"Ann, ""Jr"""');
  });
});
