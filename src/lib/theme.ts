export type Theme = 'light' | 'dark';
export type ColorScheme = 'green' | 'neutral' | 'ocean' | 'sunset';

export const THEME_STORAGE_KEY = 'kiwi:theme';
export const SCHEME_STORAGE_KEY = 'kiwi:scheme';
export const DEFAULT_SCHEME: ColorScheme = 'green';

export const COLOR_SCHEMES: { id: ColorScheme; label: string }[] = [
  { id: 'green', label: 'Kiwi' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'sunset', label: 'Sunset' },
];

const isColorScheme = (value: string | null): value is ColorScheme =>
  value === 'green' || value === 'neutral' || value === 'ocean' || value === 'sunset';

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export const DEFAULT_THEME: Theme = 'light';

// The saved choice wins; with nothing saved the app is light (it no longer follows the OS,
// which is what made it flip back to dark on PCs set to dark mode).
export function resolveTheme(): Theme {
  return getStoredTheme() ?? DEFAULT_THEME;
}

// Runs inline in <head> before the page paints, so the saved theme shows with no flash.
export const themeBootScript = `(function(){var r=document.documentElement,t='light',s='green';try{var a=localStorage.getItem('kiwi:theme');if(a==='light'||a==='dark')t=a;var b=localStorage.getItem('kiwi:scheme');if(b==='green'||b==='neutral'||b==='ocean'||b==='sunset')s=b}catch(e){}r.dataset.scheme=s;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t})();`;

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function setTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the theme still applies for this session.
  }
  applyTheme(theme);
}

export function getStoredScheme(): ColorScheme {
  if (typeof window === 'undefined') return DEFAULT_SCHEME;
  try {
    const value = window.localStorage.getItem(SCHEME_STORAGE_KEY);
    return isColorScheme(value) ? value : DEFAULT_SCHEME;
  } catch {
    return DEFAULT_SCHEME;
  }
}

export function applyScheme(scheme: ColorScheme) {
  document.documentElement.dataset['scheme'] = scheme;
}

export function setColorScheme(scheme: ColorScheme) {
  try {
    window.localStorage.setItem(SCHEME_STORAGE_KEY, scheme);
  } catch {
    // Private mode or blocked storage: the scheme still applies for this session.
  }
  applyScheme(scheme);
}
