import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '../context';

type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

export function ProfilePage() {
  const { profileDraft, profileErrors, setProfileDraft, saveProfile } = useWorkspace();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeyError, setPasskeyError] = useState('');
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  useEffect(() => {
    supabase.auth.passkey.list().then(({ data, error }) => {
      if (error) setPasskeyError(error.message);
      else setPasskeys(data ?? []);
    });
  }, []);

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
          <div className="eyebrow">MADE FOR YOU</div>
          <h1>Your profile<span className="brand-dot">.</span></h1>
          <p>A few details help us make your grocery plan more useful.</p>
        </div>
      </div>
      <div className="profile-layout">
        <form className="profile-form" onSubmit={saveProfile}>
          <div className="section-title"><div><span className="section-kicker">THE BASICS</span><h2>Tell us about you</h2></div></div>
          <div className="form-grid">
            <label className={profileErrors.includes('display_name') ? 'invalid' : ''}>
              Your name
              <input value={profileDraft.display_name} onChange={e => setProfileDraft({ ...profileDraft, display_name: e.target.value })} placeholder="e.g. Alex" />
            </label>
            <label className={profileErrors.includes('age') ? 'invalid' : ''}>
              Age <small>Used for daily nutrition estimates</small>
              <input type="number" min="18" max="100" value={profileDraft.age} onChange={e => setProfileDraft({ ...profileDraft, age: e.target.value })} placeholder="e.g. 23" />
            </label>
            <label className={profileErrors.includes('height_ft') ? 'invalid' : ''}>
              Height <small>Helps estimate maintenance energy</small>
              <div className="height-inputs">
                <input type="number" min="3" max="8" aria-label="Feet" value={profileDraft.height_ft} onChange={e => setProfileDraft({ ...profileDraft, height_ft: e.target.value })} placeholder="ft, e.g. 5" />
                <input type="number" min="0" max="11" aria-label="Inches" value={profileDraft.height_in} onChange={e => setProfileDraft({ ...profileDraft, height_in: e.target.value })} placeholder="in, e.g. 7" />
              </div>
            </label>
            <label className={profileErrors.includes('weight_lb') ? 'invalid' : ''}>
              Weight (lb) <small>Helps estimate energy and protein</small>
              <input type="number" min="55" max="770" value={profileDraft.weight_lb} onChange={e => setProfileDraft({ ...profileDraft, weight_lb: e.target.value })} placeholder="e.g. 150" />
            </label>
            <label className={profileErrors.includes('gender') ? 'invalid' : ''}>
              Sex used for estimates <small>Some nutrient guidance differs</small>
              <select value={profileDraft.gender} onChange={e => setProfileDraft({ ...profileDraft, gender: e.target.value })}>
                <option value="">Select one</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other / prefer another estimate</option>
              </select>
            </label>
            <label>
              Activity level <small>Adjusts estimated daily energy</small>
              <select value={profileDraft.activity} onChange={e => setProfileDraft({ ...profileDraft, activity: e.target.value })}>
                <option value="low">Mostly sitting</option>
                <option value="moderate">Somewhat active</option>
                <option value="high">Very active</option>
              </select>
            </label>
            <label>
              Food goal <small>You can change this anytime</small>
              <select value={profileDraft.goal} onChange={e => setProfileDraft({ ...profileDraft, goal: e.target.value })}>
                <option value="maintain">Eat balanced at maintenance</option>
                <option value="variety">More variety</option>
                <option value="convenience">More convenient meals</option>
              </select>
            </label>
            <label className={profileErrors.includes('budget') ? 'invalid' : ''}>
              Usual grocery budget ($) <small>Keeps suggestions practical</small>
              <input type="number" min="0" value={profileDraft.budget} onChange={e => setProfileDraft({ ...profileDraft, budget: e.target.value })} />
            </label>
          </div>
          <Button className="save-profile" type="submit">Save profile <ArrowRight size={16} /></Button>
        </form>
        <aside className="profile-aside">
          <span>✳</span>
          <h2>Not a diet.<br />Just a better starting point.</h2>
          <p>Kiwi uses general estimates to help you spot gaps before you shop. It’s not medical advice, and food labels and portions can vary.</p>
        </aside>
      </div>
      <section className="section-block passkey-block">
        <div className="section-title">
          <div><span className="section-kicker">SIGN-IN SECURITY</span><h2>Passkeys</h2></div>
          <Button onClick={addPasskey} disabled={passkeyBusy}><KeyRound size={16} /> {passkeyBusy ? 'Waiting…' : 'Add a passkey'}</Button>
        </div>
        <p className="section-note">Sign in with Face ID, Touch ID, Windows Hello, or a security key.</p>
        {passkeyError && <p className="form-error" role="alert">{passkeyError}</p>}
        {passkeys.length ? passkeys.map(p => (
          <div className="history-row passkey-row" key={p.id}>
            <div>
              <span className="section-kicker">PASSKEY</span>
              <h2>{p.friendly_name || 'Passkey'}</h2>
              <p>Added {new Date(p.created_at).toLocaleDateString()}{p.last_used_at ? ` · Last used ${new Date(p.last_used_at).toLocaleDateString()}` : ''}</p>
            </div>
            <Button variant="outline" onClick={() => removePasskey(p.id)}>Remove</Button>
          </div>
        )) : <p className="empty-inline">No passkeys yet. Add one to sign in without your password.</p>}
      </section>
      <section className="section-block passkey-block">
        <div className="section-title">
          <div><span className="section-kicker">PASSWORD</span><h2>Password</h2></div>
          <Button asChild variant="outline"><Link to="/reset-password">Change password <ArrowRight size={16} /></Link></Button>
        </div>
        <p className="section-note">Pick a new password whenever you like. You'll stay signed in on this device.</p>
      </section>
    </>
  );
}
