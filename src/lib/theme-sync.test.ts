import { describe, expect, it } from 'vitest';
import { planThemeSync } from './theme-sync';

describe('planThemeSync', () => {
  it('applies the account choice when this browser differs', () => {
    expect(planThemeSync({ theme: 'dark', color_scheme: 'ocean' }, { theme: 'light', scheme: null })).toEqual({
      apply: { theme: 'dark', scheme: 'ocean' },
      upload: {},
    });
  });

  it('does nothing when browser and account already match', () => {
    expect(planThemeSync({ theme: 'dark', color_scheme: 'green' }, { theme: 'dark', scheme: 'green' })).toEqual({
      apply: {},
      upload: {},
    });
  });

  it('uploads the browser choice when the account has none yet', () => {
    expect(planThemeSync({ theme: null, color_scheme: null }, { theme: 'dark', scheme: 'sunset' })).toEqual({
      apply: {},
      upload: { theme: 'dark', color_scheme: 'sunset' },
    });
  });

  it('leaves both alone when nothing is chosen anywhere', () => {
    expect(planThemeSync({ theme: null, color_scheme: null }, { theme: null, scheme: null })).toEqual({
      apply: {},
      upload: {},
    });
  });

  it('ignores bad values in the account and keeps the browser choice', () => {
    expect(planThemeSync({ theme: 'purple', color_scheme: 'x' }, { theme: 'light', scheme: null })).toEqual({
      apply: {},
      upload: { theme: 'light' },
    });
  });
});
