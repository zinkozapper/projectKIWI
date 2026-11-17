import { supabase } from '@/integrations/supabase/client';
import {
  getSavedScheme,
  getStoredTheme,
  isColorSchemeValue,
  isTheme,
  setColorScheme,
  setTheme,
  type ColorScheme,
  type Theme,
} from './theme';

// The theme lives on the account (profiles.theme / profiles.color_scheme) so it follows the user to any
// device. localStorage stays as a fast local copy: the boot script paints from it before React loads,
// then the account value is loaded after sign-in and wins if it differs.

export const THEME_SYNCED_EVENT = 'kiwi:theme-synced';

export type AccountTheme = { theme: string | null; color_scheme: string | null };
export type LocalTheme = { theme: Theme | null; scheme: ColorScheme | null };
export type ThemeSyncPlan = {
  apply: { theme?: Theme; scheme?: ColorScheme };
  upload: { theme?: Theme; color_scheme?: ColorScheme };
};

// Account choice wins. If the account has nothing yet, the choice saved in this browser is uploaded,
// so people who picked dark mode before this change keep it everywhere.
export function planThemeSync(account: AccountTheme, local: LocalTheme): ThemeSyncPlan {
  const plan: ThemeSyncPlan = { apply: {}, upload: {} };
  if (isTheme(account.theme)) {
    if (account.theme !== local.theme) plan.apply.theme = account.theme;
  } else if (local.theme) {
    plan.upload.theme = local.theme;
  }
  if (isColorSchemeValue(account.color_scheme)) {
    if (account.color_scheme !== local.scheme) plan.apply.scheme = account.color_scheme;
  } else if (local.scheme) {
    plan.upload.color_scheme = local.scheme;
  }
  return plan;
}

export async function syncThemeFromAccount(userId: string): Promise<void> {
  if (!userId) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('theme, color_scheme')
    .eq('user_id', userId)
    .maybeSingle();
  // No profile row yet, or the columns aren't there (migration not run): keep the local choice.
  if (error || !data) return;
  const plan = planThemeSync(data, { theme: getStoredTheme(), scheme: getSavedScheme() });
  if (plan.apply.theme) setTheme(plan.apply.theme);
  if (plan.apply.scheme) setColorScheme(plan.apply.scheme);
  if (plan.apply.theme || plan.apply.scheme) window.dispatchEvent(new Event(THEME_SYNCED_EVENT));
  if (plan.upload.theme || plan.upload.color_scheme) {
    await supabase.from('profiles').update(plan.upload).eq('user_id', userId);
  }
}

export async function saveThemeToAccount(
  userId: string | undefined,
  patch: { theme?: Theme; color_scheme?: ColorScheme },
): Promise<boolean> {
  if (!userId) return false;
  const { error } = await supabase.from('profiles').update(patch).eq('user_id', userId);
  return !error;
}
