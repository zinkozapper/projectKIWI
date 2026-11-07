import { beforeEach, describe, expect, it } from 'vitest';
import { resolveTheme, setTheme, themeBootScript, THEME_STORAGE_KEY, SCHEME_STORAGE_KEY } from './theme';

describe('theme persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    delete document.documentElement.dataset['scheme'];
  });

  it('defaults to light when nothing is saved', () => {
    expect(resolveTheme()).toBe('light');
  });

  it('remembers the chosen theme', () => {
    setTheme('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(resolveTheme()).toBe('dark');
    setTheme('light');
    expect(resolveTheme()).toBe('light');
  });

  it('boot script applies the saved theme and scheme before React loads', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    localStorage.setItem(SCHEME_STORAGE_KEY, 'ocean');
    new Function(themeBootScript)();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset['scheme']).toBe('ocean');
  });

  it('boot script falls back to light green for bad values', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    new Function(themeBootScript)();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset['scheme']).toBe('green');
  });
});
