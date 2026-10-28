import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { foods,foodById,totals,targets,nutrientKeys,type Profile } from '@/lib/foods';
import { loadCatalog } from '@/lib/foods';

export type Item = { id: string; food_id: string; quantity: number; purchased: boolean; trip_id: string };
export type PantryItem = { id: string; food_id: string; quantity: number };
export type Trip = { id: string; days: number; budget: number; status: string; created_at: string; completed_at: string | null };
export type ProfileDraft = { display_name: string; age: string; height_ft: string; height_in: string; weight_lb: string; gender: string; activity: string; goal: string; budget: string };

const toItem = (r: any): Item => ({ id: String(r.shopping_list_item_id), food_id: String(r.food_id), quantity: Number(r.quantity), purchased: r.is_purchased, trip_id: String(r.shopping_list_id) });
const toPantry = (r: any): PantryItem => ({ id: String(r.pantry_item_id), food_id: String(r.food_id), quantity: Number(r.quantity) });
const toTrip = (r: any): Trip => ({ id: String(r.shopping_list_id), days: r.days, budget: Number(r.budget), status: r.status, created_at: r.created_at, completed_at: r.completed_at });

// Profiles are stored in cm and kg; the form shows feet, inches and pounds.
export const CM_PER_INCH = 2.54;
export const LB_PER_KG = 2.20462;
const toFeetInches = (cm: number | null) => {
  if (!cm) return { height_ft: '', height_in: '' };
  const total = Math.round(Number(cm) / CM_PER_INCH);
  return { height_ft: String(Math.floor(total / 12)), height_in: String(total % 12) };
};

type WorkspaceValue = {
  profile: Profile | null;
  trips: Trip[];
  items: Item[];
  pantry: PantryItem[];
  active: Trip | undefined;
  listItems: Item[];
  purchased: Item[];
  days: number;
  budget: number;
  profileDraft: ProfileDraft;
  profileErrors: string[];
  loading: boolean;
  error: string;
  search: string;
  results: typeof foods;
  selected: string;
  pantryTotals: ReturnType<typeof totals>;
  combined: ReturnType<typeof totals>;
  daily: ReturnType<typeof targets>;
  spend: number;
  coverage: number;
  biggestGaps: typeof nutrientKeys;
  suggestions: typeof foods;
  setDays: (days: number) => void;
  setBudget: (budget: number) => void;
  setProfileDraft: (draft: ProfileDraft) => void;
  setSearch: (search: string) => void;
  setSelected: (id: string) => void;
  clearError: () => void;
  fail: (message: string) => void;
  addFood: (id: string, q?: number) => Promise<void>;
  updateQuantity: (item: Item, q: number) => Promise<void>;
  removeItem: (item: Item, shop?: boolean) => Promise<void>;
  undoPurchase: (item: Item) => Promise<void>;
  saveTripSettings: (nextDays: number, nextBudget: number) => Promise<void>;
  addPantry: (id: string) => Promise<void>;
  removePantry: (id: string) => Promise<void>;
  saveProfile: (e: FormEvent) => Promise<void>;
  finishTrip: () => Promise<void>;
  repeatTrip: (trip: Trip) => Promise<void>;
  signOut: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [userId, setUserId] = useState('');
  const [pantryId, setPantryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('1');
  const [days, setDays] = useState(7);
  const [budget, setBudget] = useState(75);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({ display_name: '', age: '', height_ft: '', height_in: '', weight_lb: '', gender: '', activity: 'moderate', goal: 'maintain', budget: '75' });
  const [profileErrors, setProfileErrors] = useState<string[]>([]);
  const active = trips.find(t => t.status === 'active');

  useEffect(() => {
    let mounted = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      if (mounted) {
        setError('Could not load content');
        setLoading(false);
      }
    }, 15_000);
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        if (mounted) setLoading(false);
        return;
      }
      const user = data.session.user;
      const id = user.id;
      const [, pantryResult, pr, tr] = await Promise.all([
        supabase.from('users').upsert({ user_id: id, email: user.email || '' }, { onConflict: 'user_id', ignoreDuplicates: true }),
        supabase.from('pantry').select('pantry_id').eq('user_id', id).maybeSingle(),
        supabase.from('profiles').select('*').eq('user_id', id).maybeSingle(),
        supabase.from('shopping_list').select('*').eq('user_id', id).order('created_at', { ascending: false }),
      ]);
      let pRow = pantryResult.data;
      if (!pRow) pRow = (await supabase.from('pantry').insert({ user_id: id }).select('pantry_id').single()).data;
      const tripIds = (tr.data || []).map(t => t.shopping_list_id);
      const [catalog, ti, pa] = await Promise.all([
        loadCatalog(),
        tripIds.length
          ? supabase.from('shopping_list_item').select('*').in('shopping_list_id', tripIds)
          : Promise.resolve({ data: [], error: null }),
        pRow
          ? supabase.from('pantry_item').select('*').eq('pantry_id', pRow.pantry_id)
          : Promise.resolve({ data: [], error: null }),
      ]);
      void catalog;
      if (!mounted || timedOut) return;
      setUserId(id);
      setPantryId(pRow?.pantry_id ?? null);
      if (pr.data) {
        const p = pr.data as Profile;
        setProfile(p);
        setBudget(Number(p.budget));
        setProfileDraft({ display_name: p.display_name || '', age: String(p.age || ''), ...toFeetInches(p.height_cm), weight_lb: p.weight_kg ? String(Math.round(Number(p.weight_kg) * LB_PER_KG)) : '', gender: p.gender || '', activity: p.activity || 'moderate', goal: p.goal || 'maintain', budget: String(p.budget || 75) });
      } else {
        navigate({ to: '/profile', replace: true });
      }
      setTrips((tr.data || []).map(toTrip));
      setItems((ti.data || []).map(toItem));
      setPantry((pa.data || []).map(toPantry));
      setLoading(false);
    })().catch(e => {
      if (!mounted || timedOut) return;
      setError(String(e?.message || e));
      setLoading(false);
    }).finally(() => window.clearTimeout(timeout));
    return () => { mounted = false; window.clearTimeout(timeout); };
  }, [navigate]);

  useEffect(() => {
    if (active) {
      setDays(active.days);
      setBudget(Number(active.budget));
    }
  }, [active?.id]);

  const listItems = items.filter(i => i.trip_id === active?.id && !i.purchased);
  const purchased = items.filter(i => i.trip_id === active?.id && i.purchased);
  const pantryTotals = useMemo(() => totals(pantry), [pantry]);
  const combined = useMemo(() => totals([...listItems, ...pantry]), [listItems, pantry]);
  const daily = targets(profile);
  const spend = listItems.reduce((sum, i) => sum + (foodById(i.food_id)?.price || 0) * Number(i.quantity), 0);
  const coverage = Math.round(nutrientKeys.filter(k => k !== 'calories' && combined[k] / days >= daily[k] * .7).length / 8 * 100);
  const available = foods.filter(f => !listItems.some(i => i.food_id === f.id) && !pantry.some(i => i.food_id === f.id));
  const biggestGaps = [...nutrientKeys].filter(k => k !== 'calories').sort((a, b) => combined[a] / days / daily[a] - combined[b] / days / daily[b]);
  const suggestions = available.map(f => ({ food: f, score: biggestGaps.slice(0, 4).reduce((s, k) => s + Math.min(f.nutrition[k] / days / Math.max(1, daily[k] - combined[k] / days), 1), 0) })).filter(x => spend + x.food.price <= budget).sort((a, b) => b.score - a.score).slice(0, 2).map(x => x.food);
  const results = foods.filter(f => (f.name + ' ' + f.category).toLowerCase().includes(search.toLowerCase())).slice(0, 6);

  function fail(message: string) {
    setError(message);
    window.setTimeout(() => setError(''), 5000);
  }

  function clearError() {
    setError('');
  }

  async function ensureTrip() {
    if (active) return active.id;
    const { data, error } = await supabase.from('shopping_list').insert({ user_id: userId, days, budget, status: 'active' }).select().single();
    if (error || !data) {
      fail(error?.message || 'Could not start a trip');
      return null;
    }
    const t = toTrip(data);
    setTrips(prev => [t, ...prev]);
    return t.id;
  }

  async function addFood(id: string, q = 1) {
    if (!Number.isFinite(q) || q <= 0) {
      fail('Enter a quantity greater than zero.');
      return;
    }
    const tripId = await ensureTrip();
    if (!tripId) return;
    const food = foodById(id);
    const existing = items.find(i => i.trip_id === tripId && i.food_id === id && !i.purchased);
    if (existing) {
      const { data, error } = await supabase.from('shopping_list_item').update({ quantity: Number(existing.quantity) + q }).eq('shopping_list_item_id', Number(existing.id)).select().single();
      if (error) fail(error.message);
      else setItems(prev => prev.map(i => i.id === existing.id ? toItem(data) : i));
    } else {
      const { data, error } = await supabase.from('shopping_list_item').insert({ shopping_list_id: Number(tripId), food_id: Number(id), quantity: q, unit: food?.unit ?? null }).select().single();
      if (error) fail(error.message);
      else setItems(prev => [...prev, toItem(data)]);
    }
    setSearch('');
    setSelected(id);
  }

  async function updateQuantity(item: Item, q: number) {
    if (!Number.isFinite(q) || q <= 0) {
      fail('Quantity must be a positive number.');
      return;
    }
    const { data, error } = await supabase.from('shopping_list_item').update({ quantity: q }).eq('shopping_list_item_id', Number(item.id)).select().single();
    if (error) fail(error.message);
    else setItems(prev => prev.map(i => i.id === item.id ? toItem(data) : i));
  }

  async function removeItem(item: Item, shop = false) {
    if (shop) {
      const { data, error } = await supabase.from('shopping_list_item').update({ is_purchased: true }).eq('shopping_list_item_id', Number(item.id)).select().single();
      if (error) fail(error.message);
      else setItems(prev => prev.map(i => i.id === item.id ? toItem(data) : i));
    } else {
      const { error } = await supabase.from('shopping_list_item').delete().eq('shopping_list_item_id', Number(item.id));
      if (error) fail(error.message);
      else setItems(prev => prev.filter(i => i.id !== item.id));
    }
  }

  async function undoPurchase(item: Item) {
    const { data, error } = await supabase.from('shopping_list_item').update({ is_purchased: false }).eq('shopping_list_item_id', Number(item.id)).select().single();
    if (error) fail(error.message);
    else if (data) setItems(prev => prev.map(x => x.id === item.id ? toItem(data) : x));
  }

  async function saveTripSettings(nextDays: number, nextBudget: number) {
    setDays(nextDays);
    setBudget(nextBudget);
    if (active) {
      const { error } = await supabase.from('shopping_list').update({ days: nextDays, budget: nextBudget }).eq('shopping_list_id', Number(active.id));
      if (error) fail(error.message);
      else setTrips(prev => prev.map(t => t.id === active.id ? { ...t, days: nextDays, budget: nextBudget } : t));
    }
  }

  async function addPantry(id: string) {
    if (pantry.some(i => i.food_id === id) || !pantryId) return;
    const { data, error } = await supabase.from('pantry_item').insert({ pantry_id: pantryId, food_id: Number(id), quantity: 1, unit: foodById(id)?.unit ?? null }).select().single();
    if (error) fail(error.message);
    else setPantry(prev => [...prev, toPantry(data)]);
  }

  async function removePantry(id: string) {
    const { error } = await supabase.from('pantry_item').delete().eq('pantry_item_id', Number(id));
    if (error) fail(error.message);
    else setPantry(prev => prev.filter(i => i.id !== id));
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    const missing = ['display_name', 'age', 'height_ft', 'weight_lb', 'gender', 'budget'].filter(key => !profileDraft[key as keyof typeof profileDraft]);
    setProfileErrors(missing);
    if (missing.length) {
      fail('Please fill in the highlighted fields.');
      return;
    }
    const age = Number(profileDraft.age), inchPart = Number(profileDraft.height_in || 0), height = Math.round((Number(profileDraft.height_ft) * 12 + inchPart) * CM_PER_INCH * 10) / 10, weight = Math.round(Number(profileDraft.weight_lb) / LB_PER_KG * 10) / 10, cash = Number(profileDraft.budget);
    if (age < 18 || age > 100 || inchPart < 0 || inchPart >= 12 || height < 90 || height > 250 || weight < 25 || weight > 350 || cash < 0) {
      fail('Check your age, height, weight and budget for valid values.');
      return;
    }
    const payload = { user_id: userId, display_name: profileDraft.display_name.trim(), age, height_cm: height, weight_kg: weight, gender: profileDraft.gender, activity: profileDraft.activity, goal: profileDraft.goal, budget: cash };
    const { data, error } = await supabase.from('profiles').upsert(payload).select().single();
    if (error) fail(error.message);
    else {
      setProfile(data as Profile);
      setProfileErrors([]);
      setBudget(cash);
      navigate({ to: '/plan/pantry' });
    }
  }

  async function finishTrip() {
    if (!active) return;
    const { data, error } = await supabase.from('shopping_list').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('shopping_list_id', Number(active.id)).select().single();
    if (error) fail(error.message);
    else {
      setTrips(prev => prev.map(t => t.id === active.id ? toTrip(data) : t));
      navigate({ to: '/plan/history' });
    }
  }

  async function repeatTrip(trip: Trip) {
    if (active) {
      navigate({ to: '/plan' });
      fail('Finish your current trip before repeating a past one.');
      return;
    }
    const { data, error } = await supabase.from('shopping_list').insert({ user_id: userId, days: trip.days, budget: trip.budget, status: 'active' }).select().single();
    if (error || !data) {
      fail(error?.message || 'Could not repeat trip');
      return;
    }
    const old = items.filter(i => i.trip_id === trip.id);
    if (old.length) {
      const { data: copied, error: copyError } = await supabase.from('shopping_list_item').insert(old.map(i => ({ shopping_list_id: data.shopping_list_id, food_id: Number(i.food_id), quantity: i.quantity, unit: foodById(i.food_id)?.unit ?? null }))).select();
      if (copyError) fail(copyError.message);
      else setItems(prev => [...prev, ...(copied || []).map(toItem)]);
    }
    setTrips(prev => [toTrip(data), ...prev]);
    navigate({ to: '/plan' });
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: '/', replace: true });
  }

  const value: WorkspaceValue = {
    profile, trips, items, pantry, active, listItems, purchased, days, budget,
    profileDraft, profileErrors, loading, error, search, results, selected,
    pantryTotals, combined, daily, spend, coverage, biggestGaps, suggestions,
    setDays, setBudget, setProfileDraft, setSearch, setSelected, clearError, fail,
    addFood, updateQuantity, removeItem, undoPurchase, saveTripSettings,
    addPantry, removePantry, saveProfile, finishTrip, repeatTrip, signOut,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
