import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Check, KeyRound, Loader2, LogOut, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { BUDGET_WEEK_OPTIONS, budgetWeeksLabel, toDateKey } from '@/lib/budget-period';
import { passkeysEnabled } from '@/lib/auth-options';
import {
  applyScheme,
  applyTheme,
  COLOR_SCHEMES,
  getStoredScheme,
  resolveTheme,
  setColorScheme,
  setTheme,
  type ColorScheme,
} from '@/lib/theme';
import { LIMITS, numberKeyGuard, numericText, PROFILE_RANGES } from '@/lib/validation';
import { PROFILE_AUTOSAVE_DELAY_MS, profileDraftKey, profileSaveErrors, type ProfileErrorKey } from '@/lib/profile-autosave';
import { useWorkspace, type ProfileDraft } from '../context';

type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };
type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'invalid' | 'error';

export function ProfilePage() {
  const { profileDraft, setProfileDraft, saveProfile, signOut } = useWorkspace();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeyError, setPasskeyError] = useState('');
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [scheme, setScheme] = useState<ColorScheme>('green');

  // Auto-save: every edit marks its field as touched; once the user pauses (or leaves a field) a valid
  // draft is saved. Errors only show on fields the user has touched, so a new profile doesn't start red.
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState('');
  const lastSavedKey = useRef(profileDraftKey(profileDraft));
  const pending = useRef<{ draft: ProfileDraft; key: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The workspace hands us a new saveProfile on every render; keep the latest in a ref so the
  // debounce timer isn't restarted each time something else on the page changes.
  const saveRef = useRef(saveProfile);
  useEffect(() => { saveRef.current = saveProfile; }, [saveProfile]);

  const fieldErrors = profileSaveErrors(profileDraft);
  const errorFor = (key: ProfileErrorKey) => (touched.has(key) ? fieldErrors[key] : undefined);
  const fieldError = (field: ProfileErrorKey) => {
    const message = errorFor(field);
    return message ? <span className="field-error" role="alert">{message}</span> : null;
  };

  function update(patch: Partial<ProfileDraft>) {
    setProfileDraft({ ...profileDraft, ...patch });
    setTouched(prev => new Set([...prev, ...Object.keys(patch)]));
  }

  // Saves run one at a time, in order, so an older save can never land after a newer one.
  const runPendingSave = useCallback(() => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    queue.current = queue.current.then(async () => {
      if (next.key === lastSavedKey.current) {
        if (!pending.current) setSaveStatus('saved');
        return;
      }
      setSaveStatus('saving');
      const result = await saveRef.current(next.draft);
      if (result.ok) {
        lastSavedKey.current = next.key;
        if (!pending.current) setSaveStatus('saved');
      } else {
        // lastSavedKey is unchanged, so "Try again" or the next edit retries this draft.
        setSaveError(result.message);
        setSaveStatus('error');
      }
    });
  }, []);

  useEffect(() => {
    if (!touched.size) return;
    const key = profileDraftKey(profileDraft);
    window.clearTimeout(timer.current);
    if (Object.keys(profileSaveErrors(profileDraft)).length) {
      pending.current = null;
      setSaveStatus('invalid');
      return;
    }
    if (key === lastSavedKey.current) {
      pending.current = null;
      setSaveStatus('saved');
      return;
    }
    pending.current = { draft: profileDraft, key };
    setSaveStatus('pending');
    timer.current = window.setTimeout(runPendingSave, PROFILE_AUTOSAVE_DELAY_MS);
  }, [profileDraft, touched, runPendingSave]);

  // Leaving the page doesn't lose the last edit: save it right away.
  useEffect(() => runPendingSave, [runPendingSave]);

  function retrySave() {
    pending.current = { draft: profileDraft, key: profileDraftKey(profileDraft) };
    runPendingSave();
  }

  useEffect(() => {
    const theme = resolveTheme();
    applyTheme(theme);
    setDarkMode(theme === 'dark');
    const storedScheme = getStoredScheme();
    applyScheme(storedScheme);
    setScheme(storedScheme);
  }, []);

  useEffect(() => {
    if (!passkeysEnabled) return;
    supabase.auth.passkey.list().then(({ data, error }) => {
      if (error) setPasskeyError(error.message);
      else setPasskeys(data ?? []);
    });
  }, []);

  function changeTheme(next: boolean) {
    setDarkMode(next);
    setTheme(next ? 'dark' : 'light');
  }

  function changeScheme(next: ColorScheme) {
    setScheme(next);
    setColorScheme(next);
  }

  async function addPasskey() {
    setPasskeyError('');
    setPasskeyBusy(true);
    const { data, error } = await supabase.auth.registerPasskey();
    setPasskeyBusy(false);
    if (error) setPasskeyError(error.message);
    else if (data) setPasskeys(prev => [...prev, data]);
  }

  async function removePasskey(id: string) {
    setPasskeyError('');
    const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
    if (error) setPasskeyError(error.message);
    else setPasskeys(prev => prev.filter(p => p.id !== id));
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Your profile</h1>
          <p>A few details help us make your grocery plan more useful.</p>
        </div>
      </div>
      <div className="profile-layout">
        <form className="profile-form" onSubmit={e => { e.preventDefault(); runPendingSave(); }} onBlur={runPendingSave} onKeyDown={e => {
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
        }}>
          <div className="section-title"><div><h2>Tell us about you</h2></div></div>
          <div className="form-grid">
            <label className={errorFor('display_name') ? 'invalid' : ''}>
              Your name
              <input required maxLength={LIMITS.name} autoComplete="given-name" aria-invalid={!!errorFor('display_name')} value={profileDraft.display_name} onChange={e => update({ display_name: e.target.value.replace(/\d/g, '') })} placeholder="e.g. Alex" />
              {fieldError('display_name')}
            </label>
            <label className={errorFor('age') ? 'invalid' : ''}>
              Age <small>Used for daily nutrition estimates</small>
              <input required type="number" inputMode="numeric" min={PROFILE_RANGES.age[0]} max={PROFILE_RANGES.age[1]} step="1" aria-invalid={!!errorFor('age')} onKeyDown={numberKeyGuard(true)} value={profileDraft.age} onChange={e => update({ age: numericText(e.target.value, { integer: true, maxLength: 3 }) })} placeholder="e.g. 23" />
              {fieldError('age')}
            </label>
            <label className={errorFor('height_ft') || errorFor('height_in') ? 'invalid' : ''}>
              Height <small>Helps estimate maintenance energy</small>
              <div className="height-inputs">
                <input required type="number" inputMode="numeric" min={PROFILE_RANGES.height_ft[0]} max={PROFILE_RANGES.height_ft[1]} step="1" aria-label="Feet" aria-invalid={!!errorFor('height_ft')} onKeyDown={numberKeyGuard(true)} value={profileDraft.height_ft} onChange={e => update({ height_ft: numericText(e.target.value, { integer: true, maxLength: 1 }) })} placeholder="ft, e.g. 5" />
                <input type="number" inputMode="numeric" min={PROFILE_RANGES.height_in[0]} max={PROFILE_RANGES.height_in[1]} step="1" aria-label="Inches" aria-invalid={!!errorFor('height_in')} onKeyDown={numberKeyGuard(true)} value={profileDraft.height_in} onChange={e => update({ height_in: numericText(e.target.value, { integer: true, maxLength: 2 }) })} placeholder="in, e.g. 7" />
              </div>
              {fieldError('height_ft')}
              {fieldError('height_in')}
            </label>
            <label className={errorFor('weight_lb') ? 'invalid' : ''}>
              Weight (lb) <small>Helps estimate energy and protein</small>
              <input required type="number" inputMode="decimal" min={PROFILE_RANGES.weight_lb[0]} max={PROFILE_RANGES.weight_lb[1]} step="0.1" aria-invalid={!!errorFor('weight_lb')} onKeyDown={numberKeyGuard()} value={profileDraft.weight_lb} onChange={e => update({ weight_lb: numericText(e.target.value, { maxLength: 5 }) })} placeholder="e.g. 150" />
              {fieldError('weight_lb')}
            </label>
            <label className={errorFor('gender') ? 'invalid' : ''}>
              Sex used for estimates <small>Some nutrient guidance differs</small>
              <select required aria-invalid={!!errorFor('gender')} value={profileDraft.gender} onChange={e => update({ gender: e.target.value })}>
                <option value="">Select one</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other / prefer another estimate</option>
              </select>
              {fieldError('gender')}
            </label>
            <label>
              Activity level <small>Adjusts estimated daily energy</small>
              <select value={profileDraft.activity} onChange={e => update({ activity: e.target.value })}>
                <option value="low">Mostly sitting</option>
                <option value="moderate">Somewhat active</option>
                <option value="high">Very active</option>
              </select>
            </label>
            <label>
              Food goal <small>You can change this anytime</small>
              <select value={profileDraft.goal} onChange={e => update({ goal: e.target.value })}>
                <option value="maintain">Eat balanced at maintenance</option>
                <option value="weight_loss">Weight loss</option>
                <option value="variety">More variety</option>
                <option value="convenience">More convenient meals</option>
              </select>
            </label>
            <label className={errorFor('zip_code') ? 'invalid' : ''}>
              Shopping ZIP code <small>Used for local prices when available</small>
              <input required inputMode="numeric" autoComplete="postal-code" maxLength={LIMITS.zip} aria-invalid={!!errorFor('zip_code')} value={profileDraft.zip_code} onChange={e => update({ zip_code: numericText(e.target.value, { integer: true, maxLength: LIMITS.zip }) })} />
              {fieldError('zip_code')}
            </label>
            <div className={`budget-field${errorFor('budget') ? ' invalid' : ''}`}>
              <span className="budget-field-label">Budget:</span>
              <div className="budget-control">
                <div className="budget-amount-group">
                  <label className="budget-amount" htmlFor="profile-budget">
                    <span>$</span>
                    <input id="profile-budget" required type="number" inputMode="decimal" min={PROFILE_RANGES.budget[0]} max={PROFILE_RANGES.budget[1]} step="0.01" aria-invalid={!!errorFor('budget')} onKeyDown={numberKeyGuard()} value={profileDraft.budget} onChange={e => update({ budget: numericText(e.target.value, { maxLength: 8 }) })} />
                  </label>
                  <span className="budget-slash">/</span>
                </div>
                <div className="segmented" role="group" aria-label="Budget period">
                  {BUDGET_WEEK_OPTIONS.map(weeks => (
                    <Button
                      key={weeks}
                      type="button"
                      variant="ghost"
                      className={profileDraft.budget_weeks === String(weeks) ? 'selected' : ''}
                      aria-pressed={profileDraft.budget_weeks === String(weeks)}
                      onClick={() => update({ budget_weeks: String(weeks) })}
                    >
                      {budgetWeeksLabel(weeks)}
                    </Button>
                  ))}
                </div>
                <label className={`budget-start${errorFor('budget_start') ? ' invalid' : ''}`} htmlFor="profile-budget-start">
                  <span>starting</span>
                  <input id="profile-budget-start" type="date" max={toDateKey(new Date())} value={profileDraft.budget_start} onChange={e => update({ budget_start: e.target.value })} />
                </label>
              </div>
              {fieldError('budget')}
              {fieldError('budget_start')}
            </div>
          </div>
          <div className="profile-save-row">
            <p className={`autosave-status autosave-${saveStatus}`} role="status" aria-live="polite">
              {saveStatus === 'idle' && 'Changes save automatically.'}
              {(saveStatus === 'pending' || saveStatus === 'saving') && <><Loader2 size={14} className="autosave-spin" aria-hidden /> Saving…</>}
              {saveStatus === 'saved' && <><Check size={14} aria-hidden /> All changes saved</>}
              {saveStatus === 'invalid' && (Object.keys(fieldErrors).some(key => !touched.has(key))
                ? 'Your profile saves once every required field is filled in.'
                : 'Fix the highlighted fields and your changes will save.')}
              {saveStatus === 'error' && <>Couldn't save: {saveError} <Button type="button" variant="link" className="autosave-retry" onClick={retrySave}>Try again</Button></>}
            </p>
            <Button asChild variant="outline" className="save-profile">
              <Link to="/plan/pantry">Go to my pantry <ArrowRight size={16} /></Link>
            </Button>
          </div>
        </form>
      </div>
      <section className="section-block passkey-block">
        <div className="section-title" style={{ alignItems: 'center' }}>
          <div>
            <h2>Food preferences</h2>
            <p className="section-note">
              Manage the foods KIWI recommends based on what you like.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/food-preferences">
              Manage foods <ArrowRight size={16} />
            </Link>
          </Button>
        </div> 
      </section>

      <section className="section-block passkey-block">
        <div className="section-title">
          <div>
            <h2>Security</h2>
            <p className="section-note">
              Manage how you sign in, your password, and this device.
            </p>
          </div>
        </div>
        {passkeysEnabled && <div className="security-row">
          <div className="security-row-header">
            <div><h3>Passkeys</h3><p className="section-note">Sign in with Face ID, Touch ID, Windows Hello, or a security key.</p></div>
            <Button onClick={addPasskey} disabled={passkeyBusy}><KeyRound size={16} /> {passkeyBusy ? 'Waiting…' : 'Add a passkey'}</Button>
          </div>
          {passkeyError && <p className="form-error" role="alert">{passkeyError}</p>}
          {passkeys.length ? passkeys.map(p => (
            <div className="history-row passkey-row" key={p.id}>
              <div>
                <h2>{p.friendly_name || 'Passkey'}</h2>
                <p>Added {new Date(p.created_at).toLocaleDateString()}{p.last_used_at ? ` · Last used ${new Date(p.last_used_at).toLocaleDateString()}` : ''}</p>
              </div>
              <Button variant="outline" onClick={() => removePasskey(p.id)}>Remove</Button>
            </div>
          )) : <p className="empty-inline">No passkeys yet. Add one to sign in without your password.</p>}
        </div>}
        <div className="security-row">
          <div className="security-row-header">
            <div><h3>Password</h3><p className="section-note">Pick a new password whenever you like. You'll stay signed in on this device.</p></div>
            <Button asChild variant="outline"><Link to="/reset-password">Change password <ArrowRight size={16} /></Link></Button>
          </div>
        </div>
        <div className="security-row">
          <div className="security-row-header">
            <div><h3>Sign out</h3><p className="section-note">Sign out of Kiwi on this device. Your saved plan stays safe.</p></div>
            <Button variant="outline" onClick={signOut}><LogOut size={16} /> Sign out</Button>
          </div>
        </div>
      </section>
      <section className="section-block passkey-block">
        <div className="section-title">
          <div><h2>Theme</h2></div>
          <div className="theme-toggle">
            <Sun size={16} aria-hidden />
            <Switch id="dark-mode" checked={darkMode} onCheckedChange={changeTheme} aria-label="Dark mode" />
            <Moon size={16} aria-hidden />
            <label htmlFor="dark-mode">Dark mode</label>
          </div>
        </div>
        <p className="section-note">Turn on dark mode and pick a color scheme. Your choices are saved on this device.</p>
        <div className="scheme-picker" role="group" aria-label="Color scheme">
          {COLOR_SCHEMES.map(option => (
            <button
              key={option.id}
              type="button"
              className={scheme === option.id ? 'scheme-option chosen' : 'scheme-option'}
              onClick={() => changeScheme(option.id)}
              aria-pressed={scheme === option.id}
            >
              <span className={`scheme-swatch scheme-swatch-${option.id}`} aria-hidden />
              {option.label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
