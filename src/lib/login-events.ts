import { supabase } from '@/integrations/supabase/client';

// Logs app activity to public.user_login_events (migration 0004) for the OKR 4 churn metric.
// Sign-ups and sign-ins are logged by a database trigger on auth.users, for every sign-in method.
// This covers the rest: users with a saved session open the app without signing in again, so
// without an 'app_open' row a loyal "Remember me" user would look inactive.

// Churn counts active days, so one row per user per day is enough. Remember the last logged day
// per user so reloads and tab switches on the same day don't add rows.
const loggedDays = new Map<string, string>();
const storageKey = (userId: string) => `kiwi:last-app-open:${userId}`;
const utcDay = (now: Date) => now.toISOString().slice(0, 10);

function lastLoggedDay(userId: string) {
  const cached = loggedDays.get(userId);
  if (cached) return cached;
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

function rememberDay(userId: string, day: string) {
  loggedDays.set(userId, day);
  try {
    localStorage.setItem(storageKey(userId), day);
  } catch {
    // Storage can be blocked (private mode); the in-memory copy still prevents repeats this page load.
  }
}

// Tracking must never break the app, so failures only go to the console.
export async function logAppOpen(userId: string, now = new Date()) {
  const day = utcDay(now);
  if (lastLoggedDay(userId) === day) return;
  rememberDay(userId, day);
  const { error } = await supabase.from('user_login_events').insert({ user_id: userId, event_type: 'app_open' });
  if (error) {
    loggedDays.delete(userId);
    try { localStorage.removeItem(storageKey(userId)); } catch { /* ignore */ }
    console.error('Failed to log app open:', error);
  }
}

// For tests.
export function resetLoginEventCache() {
  loggedDays.clear();
}
