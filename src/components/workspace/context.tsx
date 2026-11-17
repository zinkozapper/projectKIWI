
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { profileSaveErrors, type ProfileSaveResult } from '@/lib/profile-autosave';
import { rankSuggestions, type FoodSuggestion } from '@/lib/nutrient-suggestions';
import { foods, foodById, searchFoods, totals, addNutrients, targets, nutrientKeys, type NutrientKey, type Profile } from '@/lib/foods';
import { loadCatalog } from '@/lib/foods';
import { resetRecommendationImpressions } from '@/lib/recommendation-events';
import { logAppOpen } from '@/lib/login-events';
import { recordNutrientSnapshot, resetNutrientSnapshots } from '@/lib/nutrient-goals';
import { useIsAdmin } from '@/lib/admin';
import { needsPantryCheck, shouldAskPantryCheck, splitPantryCheck, stillHaveFoodIds } from '@/lib/pantry-check';
import { BUDGET_WEEK_OPTIONS, currentBudgetPeriod, isInBudgetPeriod, normalizeBudgetWeeks, parseDateKey, toDateKey, type BudgetPeriod } from '@/lib/budget-period';
import { localizedPricingEnabled } from '@/lib/pricing-functions';
import { priceFreshness, resolvedPrice } from '@/lib/resolved-prices';
import { averageOptionPrice, itemOptionPrice, loadFoodOptions, loadLocalOptionPrices, optionPrice, resolveOptionId, type FoodOption, type OptionCatalog } from '@/lib/food-options';
import { isFirstAccountSession } from '@/lib/first-session';
import { createQuantitySync, type QuantitySync } from '@/lib/quantity-sync';
import { PANTRY_SERVINGS_WITHOUT_SIZE, customAmount, defaultPackage, isCustomUnit, type CustomAmount, type CustomUnit, loadFoodPackages, packagePrice, packagesFor as sizesFor, servingsOf, type FoodPackage, type PackageCatalog } from '@/lib/food-packages';

// option_id: the purchase option (prep style) picked for this item; null = average of the food's options.
// package_id: the package size bought (migration 0019). Set: quantity = packages. null: quantity = servings.
// price_estimate: the shopper's own price when Kiwi has none (per package, or per serving without a package).
// custom_amount/custom_unit: the shopper's own amount ("3 lb"); package_id then points at the store size it scales from.
export type Item = { id: string; food_id: string; quantity: number; purchased: boolean; trip_id: string; option_id: string | null; package_id: string | null; price_estimate: number | null; custom_amount: number | null; custom_unit: CustomUnit | null };
// package_id set: quantity = packages at home. null: quantity = weeks of servings (PANTRY_SERVINGS_WITHOUT_SIZE).
export type PantryItem = { id: string; food_id: string; quantity: number; package_id: string | null };
export type Trip = { id: string; days: number; budget: number; status: string; created_at: string; completed_at: string | null; name?: string | null; is_favorite: boolean };
export type ProfileDraft = { display_name: string; age: string; height_ft: string; height_in: string; weight_lb: string; gender: string; activity: string; goal: string; budget: string; budget_weeks: string; budget_start: string; zip_code: string };
// addCost = price of one add (1 serving a day for the whole plan). fitsBudget = that add fits what's left.
export type { FoodSuggestion };
export type FoodPreferences = Record<string, boolean>;

const toItem = (r: any): Item => ({ id: String(r.shopping_list_item_id), food_id: String(r.food_id), quantity: Number(r.quantity), purchased: r.is_purchased, trip_id: String(r.shopping_list_id), option_id: r.food_option_id == null ? null : String(r.food_option_id) , package_id: r.food_package_id == null ? null : String(r.food_package_id), price_estimate: r.price_estimate == null ? null : Number(r.price_estimate), custom_amount: r.custom_amount == null ? null : Number(r.custom_amount), custom_unit: isCustomUnit(r.custom_unit) ? r.custom_unit : null });
const toPantry = (r: any): PantryItem => ({ id: String(r.pantry_item_id), food_id: String(r.food_id), quantity: Number(r.quantity), package_id: r.food_package_id == null ? null : String(r.food_package_id) });
const toTrip = (r: any): Trip => ({ id: String(r.shopping_list_id), days: r.days, budget: Number(r.budget), status: r.status, created_at: r.created_at, completed_at: r.completed_at, name: r.name, is_favorite: r.is_favorite ?? false });

export const CM_PER_INCH = 2.54;
export const LB_PER_KG = 2.20462;
// Before migration 0006 the budget period was only kept in the browser. Read it once as a fallback.
const LEGACY_BUDGET_WEEKS_KEY = 'kiwi:budget-weeks';

function legacyBudgetWeeks() {
  try {
    return normalizeBudgetWeeks(window.localStorage.getItem(LEGACY_BUDGET_WEEKS_KEY));
  } catch {
    return 1;
  }
}

const toFeetInches = (cm: number | null) => {
  if (!cm) return { height_ft: '', height_in: '' };
  const total = Math.round(Number(cm) / CM_PER_INCH);
  return { height_ft: String(Math.floor(total / 12)), height_in: String(total % 12) };
};

type WorkspaceValue = {
  userId: string;
  isFirstSession: boolean;
  firstSessionResolved: boolean;
  // null while checking. Admins see the Admin button (migration 0007).
  isAdmin: boolean | null;
  profile: Profile | null;
  trips: Trip[];
  items: Item[];
  pantry: PantryItem[];
  active: Trip | undefined;
  listItems: Item[];
  purchased: Item[];
  days: number;
  budget: number;
  budgetPeriod: BudgetPeriod;
  periodSpent: number;
  budgetRemaining: number;
  profileDraft: ProfileDraft;
  loading: boolean;
  error: string;
  search: string;
  results: typeof foods;
  selected: string;
  pantryTotals: ReturnType<typeof totals>;
  combined: ReturnType<typeof totals>;
  daily: ReturnType<typeof targets>;
  spend: number;
  priceOf: (id: string) => number | null;
  // Purchase options ("prep style"). itemPrice = the item's option price, else the options' average, else priceOf.
  optionsFor: (foodId: string) => FoodOption[];
  optionPriceOf: (option: FoodOption) => number | null;
  itemPrice: (item: Item) => number | null;
  setItemOption: (item: Item, optionId: string | null) => Promise<void>;
  // Package sizes (one add = one package, spread across the trip). See src/lib/food-packages.ts.
  packagesFor: (foodId: string, optionId?: string | null) => FoodPackage[];
  packageOf: (row: { package_id: string | null; food_id: string }) => FoodPackage | undefined;
  packagePriceOf: (pkg: FoodPackage, optionId?: string | null) => number | null;
  itemServings: (item: Item) => number;
  /** What the row costs: store price, else the shopper's estimate, else null (unpriced). */
  lineCost: (item: Item) => number | null;
  setItemPackage: (item: Item, packageId: string) => Promise<void>;
  setItemCustom: (item: Item, amount: number, unit: CustomUnit) => Promise<void>;
  customOf: (item: Item) => CustomAmount | null;
  setItemEstimate: (item: Item, price: number | null) => Promise<void>;
  pantryServings: (item: PantryItem) => number;
  setPantryQuantity: (item: PantryItem, quantity: number) => Promise<void>;
  setPantryPackage: (item: PantryItem, packageId: string) => Promise<void>;
  hasUnpricedBudgetItems: boolean;
  priceStatus: 'none' | 'fresh' | 'stale' | 'unknown';
  priceRefreshUnavailable: boolean;
  biggestGaps: typeof nutrientKeys;
  suggestions: FoodSuggestion[];
  foodGapScores: FoodSuggestion[];
  // The nutrient the current suggestions are for, and whether the user picked it.
  suggestionNutrient: NutrientKey | null;
  suggestionNutrientChosen: boolean;
  setSuggestionFocus: (nutrient: NutrientKey | null) => void;
  foodPreferences: FoodPreferences;
  likedFoods: typeof foods;
  setFoodPreference: (foodId: string, liked: boolean) => Promise<boolean>;
  removeFoodPreference: (foodId: string) => Promise<boolean>;
  setProfileDraft: (draft: ProfileDraft) => void;
  setSearch: (search: string) => void;
  setSelected: (id: string) => void;
  clearError: () => void;
  fail: (message: string) => void;
  addFood: (id: string, q?: number, optionId?: string | null) => Promise<Item | null>;
  // Adds several foods at once (recipe ingredients). quantity = total servings. Returns how many were saved.
  addFoods: (entries: { id: string; quantity: number }[]) => Promise<number>;
  updateQuantity: (item: Item, q: number) => Promise<void>;
  removeItem: (item: Item, shop?: boolean) => Promise<void>;
  undoPurchase: (item: Item) => Promise<void>;
  saveTripSettings: (nextDays: number, nextBudget: number) => Promise<void>;
  addPantry: (id: string, packageId?: string | null) => Promise<void>;
  removePantry: (id: string) => Promise<void>;
  // Pantry check: before a new trip starts, the user confirms what's still at home.
  pantryCheckDue: boolean;
  pantryCheckOpen: boolean;
  finishPantryCheck: (goneIds: string[] | null) => Promise<void>;
  startPlan: () => Promise<void>;
  // Validates and saves a profile draft; the profile page calls it automatically as the user edits.
  saveProfile: (draft: ProfileDraft) => Promise<ProfileSaveResult>;
  finishTrip: () => Promise<void>;
  addTripToPlan: (trip: Trip) => Promise<void>;
  deleteTrip: (trip: Trip) => () => void;
  renameTrip: (trip: Trip, name: string) => Promise<void>;
  toggleTripFavorite: (trip: Trip) => Promise<void>;
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
  // List +/- taps show at once; the save runs in the background (src/lib/quantity-sync.ts).
  const quantitySync = useRef<QuantitySync | null>(null);
  if (!quantitySync.current) {
    quantitySync.current = createQuantitySync({
      delayMs: 400,
      save: async (id, quantity) => {
        const { error } = await supabase.from('shopping_list_item').update({ quantity }).eq('shopping_list_item_id', Number(id));
        if (error) fail('Could not save the amount: ' + error.message);
        return !error;
      },
      onRevert: (id, quantity) => setItems(prev => prev.map(i => i.id === id ? { ...i, quantity } : i)),
    });
  }
  const qtySync = quantitySync.current;
  // Send any waiting amounts before the tab is hidden or closed.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') void qtySync.flushAll(); };
    const flushNow = () => void qtySync.flushAll();
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flushNow);
      void qtySync.flushAll();
    };
  }, [qtySync]);
  const [foodPreferences, setFoodPreferences] = useState<FoodPreferences>({});
  const [userId, setUserId] = useState('');
  const [isFirstSession, setIsFirstSession] = useState(false);
  const [firstSessionResolved, setFirstSessionResolved] = useState(false);
  const isAdmin = useIsAdmin(userId);
  const [pantryId, setPantryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('1');
  // Nutrient the user asked suggestions for; null = follow NUTRIENT_PRIORITY.
  const [suggestionFocus, setSuggestionFocus] = useState<NutrientKey | null>(null);
  const [days, setDays] = useState(7);
  const [budget, setBudget] = useState(75);
  const [budgetWeeks, setBudgetWeeks] = useState(1);
  const [budgetStart, setBudgetStart] = useState(() => toDateKey(new Date()));
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({ display_name: '', age: '', height_ft: '', height_in: '', weight_lb: '', gender: '', activity: 'moderate', goal: 'maintain', budget: '75', budget_weeks: '1', budget_start: toDateKey(new Date()), zip_code: '84601' });
  const [localizedPrices, setLocalizedPrices] = useState<Record<string, number> | null>(null);
  const [pricingMode, setPricingMode] = useState<'loading' | 'generic' | 'local'>('loading');
  const [priceStatus, setPriceStatus] = useState<'none' | 'fresh' | 'stale' | 'unknown'>('none');
  const [priceRefreshUnavailable, setPriceRefreshUnavailable] = useState(false);
  const priceSnapshotAt = useRef<string | null>(null);
  const [foodOptions, setFoodOptions] = useState<OptionCatalog>({});
  const [localOptionPrices, setLocalOptionPrices] = useState<Record<string, number> | null>(null);
  const [packageCatalog, setPackageCatalog] = useState<PackageCatalog>({});

  // Package sizes for the whole catalog; reloaded when the AI food finder adds a food (it brings its sizes).
  useEffect(() => {
    let cancelled = false;
    const load = () => loadFoodPackages().then(p => { if (!cancelled) setPackageCatalog(p); }).catch(e => console.error('Could not load package sizes:', e));
    void load();
    window.addEventListener('kiwi:catalog-food-added', load);
    return () => { cancelled = true; window.removeEventListener('kiwi:catalog-food-added', load); };
  }, []);

  // Purchase options for the whole catalog; reloaded when the AI food finder adds a food (it may bring options).
  useEffect(() => {
    let cancelled = false;
    const load = () => loadFoodOptions().then(o => { if (!cancelled) setFoodOptions(o); }).catch(e => console.error('Could not load purchase options:', e));
    void load();
    window.addEventListener('kiwi:catalog-food-added', load);
    return () => { cancelled = true; window.removeEventListener('kiwi:catalog-food-added', load); };
  }, []);
  const active = trips.find(t => t.status === 'active');
  // Pantry check dialog: confirmPantry() opens it and resolves with the food ids still at home
  // (or null if saving failed). creatingTrip stops two adds from starting two trips.
  // pantryChecked: the check was answered or closed for the trip being planned, so it isn't asked again
  // until that trip is finished.
  const [pantryCheckOpen, setPantryCheckOpen] = useState(false);
  const pantryCheckWaiters = useRef<((stillHave: Set<string> | null) => void)[]>([]);
  const creatingTrip = useRef<Promise<string | null> | null>(null);
  const pantryChecked = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setIsFirstSession(false);
        navigate({ to: '/', replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

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
      void logAppOpen(id);

      const [, pantryResult, pr, tr, fp, firstSession] = await Promise.all([
        supabase.from('users').upsert({ user_id: id, email: user.email || '' }, { onConflict: 'user_id', ignoreDuplicates: true }),
        supabase.from('pantry').select('pantry_id').eq('user_id', id).maybeSingle(),
        supabase.from('profiles').select('*').eq('user_id', id).maybeSingle(),
        supabase.from('shopping_list').select('*').eq('user_id', id).order('created_at', { ascending: false }),
        supabase.from('food_preferences').select('food_id, liked').eq('user_id', id),
        isFirstAccountSession(),
      ]);

      if (fp.error) {
        console.error('Could not load food preferences:', fp.error.message);
      }

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
      setIsFirstSession(firstSession);
      setFirstSessionResolved(true);
      setPantryId(pRow?.pantry_id ?? null);

      setFoodPreferences(
        Object.fromEntries(
          (fp.data || []).map(row => [String(row.food_id), row.liked])
        )
      );

      if (pr.data) {
        const p = pr.data as Profile;
        setProfile(p);
        const weeks = p.budget_period_weeks ? normalizeBudgetWeeks(p.budget_period_weeks) : legacyBudgetWeeks();
        const start = parseDateKey(p.budget_period_start) ? String(p.budget_period_start) : toDateKey(new Date());
        setBudget(Number(p.budget));
        setBudgetWeeks(weeks);
        setBudgetStart(start);
        setProfileDraft({ display_name: p.display_name || '', age: String(p.age || ''), ...toFeetInches(p.height_cm), weight_lb: p.weight_kg ? String(Math.round(Number(p.weight_kg) * LB_PER_KG)) : '', gender: p.gender || '', activity: p.activity || 'moderate', goal: p.goal || 'maintain', budget: String(p.budget ?? 75), budget_weeks: String(weeks), budget_start: start, zip_code: p.zip_code || '84601' });
      } else {
        setProfile(null);
        setBudget(75);
        setBudgetWeeks(1);
        setBudgetStart(toDateKey(new Date()));
        setProfileDraft({
          display_name: '',
          age: '',
          height_ft: '',
          height_in: '',
          weight_lb: '',
          gender: '',
          activity: 'moderate',
          goal: 'maintain',
          budget: '75',
          budget_weeks: '1',
          budget_start: toDateKey(new Date()),
          zip_code: '84601',
      });
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
    if (!userId) return;
    let cancelled = false;
    setPricingMode('loading');
    setLocalizedPrices(null);
    setLocalOptionPrices(null);
    setPriceStatus('none');
    setPriceRefreshUnavailable(false);
    priceSnapshotAt.current = null;
    const refresh = async () => {
      try {
        const enabled = await localizedPricingEnabled();
        if (cancelled) return;
        if (!enabled) { setPricingMode('generic'); setPriceStatus('none'); return; }
        setPricingMode('local');
        // The RPC uses auth.uid() and queues only the saved profile ZIP.
        const { error: queueError } = await (supabase.rpc as any)('request_price_refresh');
        if (queueError) console.error('Could not queue localized pricing:', queueError.message);
        if (!cancelled) setPriceRefreshUnavailable(!!queueError);
        const zip = profile?.zip_code || '84601';
        const { data: mapping, error: mappingError } = await supabase.from('zip_store').select('location_id').eq('zip_code', zip).maybeSingle();
        if (mappingError) throw mappingError;
        if (!mapping) return;
        const before = await (supabase.rpc as any)('my_price_snapshot_at');
        const rows: { food_id: number; price_per_serving: number }[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await supabase.from('food_price').select('food_id, price_per_serving').eq('location_id', mapping.location_id).order('food_id').range(offset, offset + 999);
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        const { data: snapshotAt, error: statusError } = await (supabase.rpc as any)('my_price_snapshot_at');
        if (statusError) console.error('Could not check price freshness:', statusError.message);
        // A refresh committed during pagination; keep the previous snapshot until the next poll.
        if (!before.error && !statusError && before.data !== snapshotAt) return;
        if (!cancelled) {
          setLocalizedPrices(Object.fromEntries(rows.map(row => [String(row.food_id), Number(row.price_per_serving)])));
          void loadLocalOptionPrices(mapping.location_id)
            .then(p => { if (!cancelled) setLocalOptionPrices(p); })
            .catch(e => console.error('Could not load option prices:', e));
          priceSnapshotAt.current = statusError ? null : snapshotAt;
          setPriceStatus(priceFreshness(priceSnapshotAt.current));
        }
      } catch (error) {
        console.error('Could not load localized prices:', error);
        if (!cancelled) setPriceRefreshUnavailable(true);
        if (!cancelled && priceSnapshotAt.current) setPriceStatus(priceFreshness(priceSnapshotAt.current));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    window.addEventListener('kiwi:catalog-food-added', refresh);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('kiwi:catalog-food-added', refresh); };
  }, [userId, profile?.zip_code]);

  useEffect(() => {
    setDays(budgetWeeks * 7);
    if (active) setBudget(Number(profile?.budget ?? active.budget));
  }, [active?.id, profile?.budget, budgetWeeks]);

  const listItems = items.filter(i => i.trip_id === active?.id && !i.purchased);
  const purchased = items.filter(i => i.trip_id === active?.id && i.purchased);
  // Bought as packages: a list item's or pantry food's servings are spread across the plan's days
  // (a 4-serving pack on a 7-day plan = 4/7 of a serving a day). Older rows without a size count servings.
  const packageById = useMemo(() => new Map(Object.values(packageCatalog).flat().map(p => [p.id, p])), [packageCatalog]);
  const packageOf = (row: { package_id: string | null; food_id: string }) => (row.package_id ? packageById.get(row.package_id) : undefined);
  // Sizes of the item's style: its pick, else the food's default (most whole) style.
  const packagesFor = (foodId: string, optionId?: string | null) => sizesFor(packageCatalog, foodId, resolveOptionId(optionId, foodOptions[foodId]), foodOptions[foodId] ?? []);
  // A custom amount, priced and counted from the store size it scales from (food-packages.ts).
  const customOf = (item: Item): CustomAmount | null => {
    if (item.custom_amount == null || !item.custom_unit || !packageOf(item)) return null;
    const c = customAmount(packagesFor(item.food_id, item.option_id), item.custom_amount, item.custom_unit);
    return 'error' in c ? null : c;
  };
  const itemServings = (item: Item) => {
    const custom = customOf(item);
    return custom ? Number(item.quantity) * custom.servings : servingsOf(Number(item.quantity), packageOf(item));
  };
  const pantryServings = (item: PantryItem) => {
    const pkg = packageOf(item);
    return pkg ? Number(item.quantity) * pkg.servings : Number(item.quantity) * PANTRY_SERVINGS_WITHOUT_SIZE;
  };
  const pantryTotals = useMemo(() => totals(pantry.map(p => ({ food_id: p.food_id, quantity: pantryServings(p) }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pantry, packageById]);
  const combined = useMemo(() => addNutrients(totals(listItems.map(i => ({ food_id: i.food_id, quantity: itemServings(i) }))), pantryTotals),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listItems, pantryTotals, packageById]);
  const daily = targets(profile);
  // OKR 2: save a nutrient goal snapshot when the pantry, plan length or targets change (migration 0007).
  // Waits a moment so adding several pantry foods in a row saves one snapshot, not one per click.
  useEffect(() => {
    if (loading || !userId || !pantryId || !profile) return;
    const t = window.setTimeout(() => {
      void recordNutrientSnapshot({ userId, pantryId, pantry, pantryTotals, daily, days });
    }, 1500);
    return () => window.clearTimeout(t);
    // daily is rebuilt every render from profile, so profile stands in for it here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId, pantryId, profile, pantry, pantryTotals, days]);
  const basePrice = (id: string) => resolvedPrice(foodById(id)?.price, localizedPrices?.[id], pricingMode);
  // A food sold several ways (purchase options) costs the average of its priced options unless an option is picked.
  // A food's price before any pick: its default style's price (as added), else the average of its styles, else its own.
  const priceOf = (id: string) => itemOptionPrice(null, foodOptions[id], localOptionPrices, pricingMode, basePrice(id)) ?? averageOptionPrice(foodOptions[id], localOptionPrices, pricingMode);
  const optionsFor = (foodId: string) => foodOptions[foodId] ?? [];
  const optionPriceOf = (option: FoodOption) => optionPrice(option, localOptionPrices, pricingMode);
  const itemPrice = (item: Item) => itemOptionPrice(item.option_id, foodOptions[item.food_id], localOptionPrices, pricingMode, basePrice(item.food_id));
  const packagePriceOf = (pkg: FoodPackage, optionId?: string | null) => {
    const id = optionId ?? pkg.optionId;
    const defaultPerServing = (id ? foodOptions[pkg.foodId]?.find(o => o.id === id)?.price : undefined) || foodById(pkg.foodId)?.price || null;
    return packagePrice(pkg, itemOptionPrice(id, foodOptions[pkg.foodId], localOptionPrices, pricingMode, basePrice(pkg.foodId)), Number(defaultPerServing) || null);
  };
  // A package's shelf price first, then the store price per serving; with neither, the shopper's estimate
  // (per package, or per serving without a package).
  const lineCost = (item: Item): number | null => {
    const itemPkg = packageOf(item);
    const custom = customOf(item);
    const refPrice = custom ? packagePriceOf(custom.reference, item.option_id) : itemPkg ? packagePriceOf(itemPkg, item.option_id) : null;
    const pkgPrice = refPrice == null ? null : refPrice * (custom ? custom.scale : 1);
    if (pkgPrice != null) return pkgPrice * Number(item.quantity);
    const per = itemPrice(item);
    if (per != null) return per * itemServings(item);
    const pkg = packageOf(item);
    if (pkg && pkg.price > 0) return pkg.price * Number(item.quantity);
    return item.price_estimate != null ? item.price_estimate * Number(item.quantity) : null;
  };
  const cost = (list: Item[]) => list.reduce((sum, i) => sum + (lineCost(i) ?? 0), 0);
  // spend = what is still on the current list (planned, not bought yet).
  const spend = cost(listItems);

  // Budget period: the budget repeats every N weeks from the start date. Money counts as spent in
  // the period when it was bought in it: items checked off on trips finished during the period,
  // plus items already in the cart on the current trip. Planned items are added on top so the bar
  // shows where the period will end up if the list is bought.
  const budgetPeriod = currentBudgetPeriod(budgetStart, budgetWeeks);
  const periodTripIds = new Set(trips.filter(t => t.status === 'active' || (t.status === 'completed' && isInBudgetPeriod(t.completed_at, budgetPeriod))).map(t => t.id));
  const periodSpent = cost(items.filter(i => i.purchased && periodTripIds.has(i.trip_id)));
  const hasUnpricedBudgetItems = [...listItems, ...items.filter(i => i.purchased && periodTripIds.has(i.trip_id))].some(i => lineCost(i) === null);
  const budgetRemaining = budget - periodSpent - spend;

  const available = foods.filter(f => !listItems.some(i => i.food_id === f.id) && !pantry.some(i => i.food_id === f.id));
  // Suggestions: one nutrient at a time in priority order (src/lib/nutrient-suggestions.ts), or the
  // nutrient the user picked from a nutrient's info popup or the nutrient search.
  // One add = one package of the food's default size (or a serving a day for the trip when it has no sizes).
  const addCostOf = (food: typeof foods[number]) => {
    const pkg = defaultPackage(packagesFor(food.id));
    const price = pkg ? Number(packagePriceOf(pkg)) : Number(priceOf(food.id)) * days;
    return Number.isFinite(price) && price > 0 ? price : 0;
  };
  const ranked = rankSuggestions({ available, daily, combined, days, preferences: foodPreferences, chosen: suggestionFocus, addCostOf, budgetRemaining });
  const biggestGaps = ranked.openGaps;
  const foodGapScores = ranked.gapScores;
  const suggestions = ranked.suggestions;
  const suggestionNutrient = ranked.nutrient;
  const suggestionNutrientChosen = ranked.chosen;
  const likedFoods = foods.filter(food => foodPreferences[food.id] === true);

  const results = searchFoods(foods, search);

  function fail(message: string) {
    setError(message);
    window.setTimeout(() => setError(''), 5000);
  }

  function clearError() {
    setError('');
  }

  async function setFoodPreference(foodId: string, liked: boolean): Promise<boolean> {
  if (!userId) {
    fail('Please sign in before rating foods.');
    return false;
  }

  const { error } = await supabase.from('food_preferences').upsert(
    {
      user_id: userId,
      food_id: Number(foodId),
      liked,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,food_id' }
  );

  if (error) {
    fail('Could not save your food rating: ' + error.message);
    return false;
  }

  setFoodPreferences(prev => ({
    ...prev,
    [foodId]: liked,
  }));

  return true;
}

async function removeFoodPreference(foodId: string): Promise<boolean> {
  if (!userId) {
    fail('Please sign in before removing food preferences.');
    return false;
  }

  const { error } = await supabase
    .from('food_preferences')
    .delete()
    .eq('user_id', userId)
    .eq('food_id', Number(foodId));

  if (error) {
    fail('Could not remove food preference: ' + error.message);
    return false;
  }

  setFoodPreferences(prev => {
    const updated = { ...prev };
    delete updated[foodId];
    return updated;
  });

  return true;
}

  async function ensureTrip() {
    if (active) return active.id;
    if (creatingTrip.current) return creatingTrip.current;
    creatingTrip.current = (async () => {
      const { data, error } = await supabase.from('shopping_list').insert({ user_id: userId, days, budget, status: 'active' }).select().single();
      if (error || !data) {
        fail(error?.message || 'Could not start a trip');
        return null;
      }
      const t = toTrip(data);
      setTrips(prev => [t, ...prev]);
      return t.id;
    })();
    try {
      return await creatingTrip.current;
    } finally {
      creatingTrip.current = null;
    }
  }

  // Asks the user what's still in the pantry before a new trip starts. Resolves with the food ids
  // still at home, or null if saving their answer failed. It asks once per trip: with an empty pantry,
  // an active trip, or a check already answered or closed, it resolves right away.
  function confirmPantry(): Promise<Set<string> | null> {
    if (!shouldAskPantryCheck({ hasActiveTrip: !!active || !!creatingTrip.current, alreadyChecked: pantryChecked.current, firstSession: isFirstSession, pantryCount: pantry.length })) {
      return Promise.resolve(stillHaveFoodIds(pantry));
    }
    return new Promise(resolve => {
      pantryCheckWaiters.current.push(resolve);
      setPantryCheckOpen(true);
    });
  }

  // Called by the dialog. goneIds = pantry_item ids marked gone; null = closed without answering.
  // Closing it skips the check (everything counts as still at home) and the add goes ahead: the user is
  // already planning, so the dialog shouldn't block them or come back on the next add.
  async function finishPantryCheck(goneIds: string[] | null) {
    const waiters = pantryCheckWaiters.current;
    pantryCheckWaiters.current = [];
    setPantryCheckOpen(false);
    if (goneIds === null) {
      pantryChecked.current = true;
      const stillHave = stillHaveFoodIds(pantry);
      waiters.forEach(w => w(stillHave));
      return;
    }
    const { keep, remove } = splitPantryCheck(pantry, goneIds);
    if (remove.length) {
      const { error } = await supabase.from('pantry_item').delete().in('pantry_item_id', remove.map(p => Number(p.id)));
      if (error) {
        fail('Could not update your pantry: ' + error.message);
        waiters.forEach(w => w(null));
        return;
      }
      // Changing the pantry also saves a new OKR 2 nutrient snapshot (effect above).
      setPantry(keep);
    }
    pantryChecked.current = true;
    const stillHave = stillHaveFoodIds(keep);
    waiters.forEach(w => w(stillHave));
  }

  // "Update pantry" on My Plan: confirm the pantry, then start the trip so the check isn't asked again.
  async function startPlan() {
    if (active) return;
    const stillHave = await confirmPantry();
    if (stillHave) await ensureTrip();
  }

  // q = servings per day. One add puts 1 serving a day on the list for the whole plan (7 servings on a
  // 7-day plan, 14 on a 14-day plan). shopping_list_item.quantity stores the total servings to buy.
  // Returns the saved list row (or null on failure) so callers like recommendation tracking can link to it.
  // optionId: the prep style picked when adding (undefined = keep the item's current pick; null = the default style).
  // One add = `count` packages of the food's default size for the picked option, as it's sold. A food with no
  // sizes (or an older list row without one) falls back to `count` servings a day for the whole trip.
  async function addFood(id: string, count = 1, optionId?: string | null): Promise<Item | null> {
    if (!Number.isFinite(count) || count <= 0) {
      fail('Enter a quantity greater than zero.');
      return null;
    }
    // Starting a new trip: confirm the pantry first. Closing the check cancels the add.
    if (!active && !(await confirmPantry())) return null;
    const tripId = await ensureTrip();
    if (!tripId) return null;
    const food = foodById(id);
    const existing = items.find(i => i.trip_id === tripId && i.food_id === id && !i.purchased);
    if (existing) await qtySync.flush(existing.id);
    const pkg = defaultPackage(packagesFor(id, optionId !== undefined ? optionId : existing?.option_id));
    const inPackages = existing ? !!existing.package_id : !!pkg;
    const q = inPackages ? count : count * days;
    let saved: Item | null = null;
    if (existing) {
      const { data, error } = await supabase.from('shopping_list_item').update({ quantity: Number(existing.quantity) + q, ...(optionId !== undefined ? { food_option_id: optionId == null ? null : Number(optionId) } : {}) }).eq('shopping_list_item_id', Number(existing.id)).select().single();
      if (error) fail(error.message);
      else {
        const row = toItem(data);
        saved = row;
        setItems(prev => prev.map(i => i.id === existing.id ? row : i));
      }
    } else {
      const { data, error } = await supabase.from('shopping_list_item').insert({ shopping_list_id: Number(tripId), food_id: Number(id), quantity: q, unit: food?.unit ?? null, food_option_id: (() => { const o = resolveOptionId(optionId, foodOptions[id]); return o ? Number(o) : null; })(), ...(pkg ? { food_package_id: Number(pkg.id) } : {}) } as any).select().single();
      if (error) fail(error.message);
      else {
        const row = toItem(data);
        saved = row;
        setItems(prev => [...prev, row]);
      }
    }
    setSelected(id);
    return saved;
  }

  // Change an item's prep style (purchase option). null = no preference (priced at the options' average).
  async function setItemOption(item: Item, optionId: string | null) {
    await qtySync.flush(item.id);
    const before = item;
    // Sizes belong to an option, so switching option switches to its default size (same number of packages).
    // If the new option has no sizes, the packages turn into the same number of servings.
    const oldPkg = packageOf(item);
    const nextPkg = defaultPackage(packagesFor(item.food_id, optionId));
    const patch: Partial<Item> = { option_id: optionId, custom_amount: null, custom_unit: null };
    if (oldPkg && nextPkg && nextPkg.id !== oldPkg.id) patch.package_id = nextPkg.id;
    if (oldPkg && !nextPkg) { patch.package_id = null; patch.quantity = Number(item.quantity) * oldPkg.servings; }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i));
    const { error } = await supabase.from('shopping_list_item').update({
      food_option_id: optionId == null ? null : Number(optionId), custom_amount: null, custom_unit: null,
      ...('package_id' in patch ? { food_package_id: patch.package_id == null ? null : Number(patch.package_id) } : {}),
      ...('quantity' in patch ? { quantity: patch.quantity } : {}),
    } as any).eq('shopping_list_item_id', Number(item.id));
    if (error) {
      setItems(prev => prev.map(i => i.id === item.id ? before : i));
      fail(error.message);
    }
  }

  // Change a list item's package size; the number of packages stays the same.
  async function setItemPackage(item: Item, packageId: string) {
    await qtySync.flush(item.id);
    const before = item;
    const patch: Partial<Item> = { package_id: packageId, custom_amount: null, custom_unit: null };
    // An older row counted in servings becomes one package.
    if (!item.package_id) patch.quantity = 1;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i));
    const { error } = await supabase.from('shopping_list_item').update({ food_package_id: Number(packageId), custom_amount: null, custom_unit: null, ...(patch.quantity != null ? { quantity: patch.quantity } : {}) } as any).eq('shopping_list_item_id', Number(item.id));
    if (error) {
      setItems(prev => prev.map(i => i.id === item.id ? before : i));
      fail(error.message);
    }
  }

  // The shopper's own amount ("3 lb"): saved with the store size it scales from; quantity stays the multiplier.
  async function setItemCustom(item: Item, amount: number, unit: CustomUnit) {
    const c = customAmount(packagesFor(item.food_id, item.option_id), amount, unit);
    if ('error' in c) { fail(c.error); return; }
    await qtySync.flush(item.id);
    const before = item;
    const value = Math.round(amount * 100) / 100;
    const patch: Partial<Item> = { package_id: c.reference.id, custom_amount: value, custom_unit: unit, ...(item.package_id ? {} : { quantity: 1 }) };
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i));
    const { error } = await supabase.from('shopping_list_item').update({ food_package_id: Number(c.reference.id), custom_amount: value, custom_unit: unit, ...('quantity' in patch ? { quantity: patch.quantity } : {}) } as any).eq('shopping_list_item_id', Number(item.id));
    if (error) {
      setItems(prev => prev.map(i => i.id === item.id ? before : i));
      fail(error.message);
    }
  }

  // The shopper's own price for an item Kiwi can't price (null clears it).
  async function setItemEstimate(item: Item, price: number | null) {
    if (price != null && (!Number.isFinite(price) || price <= 0 || price > 1000)) {
      fail('Enter a price between $0.01 and $1,000.');
      return;
    }
    const before = item;
    const value = price == null ? null : Math.round(price * 100) / 100;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, price_estimate: value } : i));
    const { error } = await supabase.from('shopping_list_item').update({ price_estimate: value } as any).eq('shopping_list_item_id', Number(item.id));
    if (error) {
      setItems(prev => prev.map(i => i.id === item.id ? before : i));
      fail(error.message);
    }
  }

  // One pantry check and one trip for the whole batch; addFood in a loop would ask again for each food,
  // because `active` doesn't update until the next render.
  async function addFoods(entries: { id: string; quantity: number }[]): Promise<number> {
    const valid = entries.filter(e => Number.isFinite(e.quantity) && e.quantity > 0);
    if (!valid.length) return 0;
    if (!active && !(await confirmPantry())) return 0;
    const tripId = await ensureTrip();
    if (!tripId) return 0;
    await qtySync.flushAll();
    let saved = 0;
    const updated: Item[] = [];
    const fresh: { id: string; quantity: number }[] = [];
    for (const e of valid) {
      const existing = items.find(i => i.trip_id === tripId && i.food_id === e.id && !i.purchased);
      if (!existing) {
        fresh.push(e);
        continue;
      }
      const { data, error } = await supabase.from('shopping_list_item').update({ quantity: Number(existing.quantity) + e.quantity }).eq('shopping_list_item_id', Number(existing.id)).select().single();
      if (error) fail(error.message);
      else { updated.push(toItem(data)); saved++; }
    }
    let inserted: Item[] = [];
    if (fresh.length) {
      const { data, error } = await supabase.from('shopping_list_item')
        .insert(fresh.map(e => ({ shopping_list_id: Number(tripId), food_id: Number(e.id), quantity: e.quantity, unit: foodById(e.id)?.unit ?? null })))
        .select();
      if (error) fail(error.message);
      else { inserted = (data || []).map(toItem); saved += inserted.length; }
    }
    setItems(prev => [...prev.map(i => updated.find(u => u.id === i.id) ?? i), ...inserted]);
    return saved;
  }

  async function updateQuantity(item: Item, q: number) {
    if (!Number.isFinite(q) || q <= 0) {
      fail('Quantity must be a positive number.');
      return;
    }
    // Show it now; the save follows a moment later (one write for a burst of taps).
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: q } : i));
    qtySync.set(item.id, q, Number(item.quantity));
  }

  async function removeItem(item: Item, shop = false) {
    if (shop) {
      await qtySync.flush(item.id);
      const { data, error } = await supabase.from('shopping_list_item').update({ is_purchased: true }).eq('shopping_list_item_id', Number(item.id)).select().single();
      if (error) fail(error.message);
      else setItems(prev => prev.map(i => i.id === item.id ? toItem(data) : i));
    } else {
      // Gone from the list right away; put back if the delete fails.
      qtySync.cancel(item.id);
      await qtySync.flush(item.id);
      const index = items.findIndex(i => i.id === item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
      const { error } = await supabase.from('shopping_list_item').delete().eq('shopping_list_item_id', Number(item.id));
      if (error) {
        fail(error.message);
        setItems(prev => prev.some(i => i.id === item.id) ? prev : [...prev.slice(0, Math.max(0, index)), item, ...prev.slice(Math.max(0, index))]);
      }
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

  // Adds one package (default size) to the pantry; adding a food that's already there adds another package.
  async function addPantry(id: string, packageId?: string | null) {
    if (!pantryId) return;
    const pkgId = packageId === undefined ? defaultPackage(packagesFor(id))?.id ?? null : packageId;
    const existing = pantry.find(i => i.food_id === id && i.package_id === pkgId);
    if (existing) return setPantryQuantity(existing, Number(existing.quantity) + 1);
    if (pkgId == null && pantry.some(i => i.food_id === id)) return;
    const { data, error } = await supabase.from('pantry_item').insert({ pantry_id: pantryId, food_id: Number(id), quantity: 1, unit: foodById(id)?.unit ?? null, food_package_id: pkgId == null ? null : Number(pkgId) } as any).select().single();
    if (error) fail(error.message);
    else setPantry(prev => [...prev, toPantry(data)]);
  }

  // How many packages (or weeks' worth, without a size) are at home. 0 or less removes the food.
  async function setPantryQuantity(item: PantryItem, quantity: number) {
    if (!Number.isFinite(quantity)) return;
    if (quantity <= 0) return removePantry(item.id);
    const q = Math.min(99, Math.round(quantity * 100) / 100);
    setPantry(prev => prev.map(p => p.id === item.id ? { ...p, quantity: q } : p));
    const { error } = await supabase.from('pantry_item').update({ quantity: q }).eq('pantry_item_id', Number(item.id));
    if (error) {
      setPantry(prev => prev.map(p => p.id === item.id ? item : p));
      fail(error.message);
    }
  }

  async function setPantryPackage(item: PantryItem, packageId: string) {
    setPantry(prev => prev.map(p => p.id === item.id ? { ...p, package_id: packageId } : p));
    const { error } = await supabase.from('pantry_item').update({ food_package_id: Number(packageId) } as any).eq('pantry_item_id', Number(item.id));
    if (error) {
      setPantry(prev => prev.map(p => p.id === item.id ? item : p));
      fail(error.message);
    }
  }

  async function removePantry(id: string) {
    const { error } = await supabase.from('pantry_item').delete().eq('pantry_item_id', Number(id));
    if (error) fail(error.message);
    else setPantry(prev => prev.filter(i => i.id !== id));
  }

  async function saveProfile(draft: ProfileDraft): Promise<ProfileSaveResult> {
    const fieldErrors = profileSaveErrors(draft);
    const invalid = Object.keys(fieldErrors);
    if (invalid.length) return { ok: false, fields: invalid, message: invalid.length === 1 ? Object.values(fieldErrors)[0]! : 'Please fix the highlighted fields.' };
    const age = Number(draft.age), inchPart = Number(draft.height_in || 0), height = Math.round((Number(draft.height_ft) * 12 + inchPart) * CM_PER_INCH * 10) / 10, weight = Math.round(Number(draft.weight_lb) / LB_PER_KG * 10) / 10, cash = Number(draft.budget), weeks = Number(draft.budget_weeks), start = draft.budget_start;
    // The database only takes heights of 90-250 cm and weights of 25-350 kg.
    if (height < 90 || height > 250) return { ok: false, fields: ['height_ft'], message: 'Height must be between 3 ft and 8 ft 2 in.' };
    if (weight < 25 || weight > 350) return { ok: false, fields: ['weight_lb'], message: 'Check your weight.' };
    const payload = { user_id: userId, display_name: draft.display_name.trim(), age, height_cm: height, weight_kg: weight, gender: draft.gender, activity: draft.activity, goal: draft.goal, budget: cash, budget_period_weeks: weeks, budget_period_start: start, zip_code: draft.zip_code };
    const { data, error } = await supabase.from('profiles').upsert(payload).select().single();
    if (error) {
      fail('Could not save your profile: ' + error.message);
      return { ok: false, fields: [], message: error.message };
    }
    setProfile(data as Profile);
    setBudgetWeeks(weeks);
    setBudgetStart(start);
    await saveTripSettings(weeks * 7, cash);
    return { ok: true };
  }

  async function finishTrip() {
    if (!active) return;
    await qtySync.flushAll();
    const { data, error } = await supabase.from('shopping_list').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('shopping_list_id', Number(active.id)).select().single();
    if (error) {
      fail(error.message);
      return;
    }
    // The next trip gets its own pantry check.
    pantryChecked.current = false;
    setTrips(prev => prev.map(t => t.id === active.id ? toTrip(data) : t));
    // Everything bought goes into the pantry as it was bought (packages of a size) and stays until the user
    // uses it up. Same food and size already at home: the packages add up. Older rows bought in servings
    // become weeks' worth (PANTRY_SERVINGS_WITHOUT_SIZE servings each).
    if (purchased.length && pantryId) {
      const bump = new Map<string, number>();
      const fresh = new Map<string, { food_id: string; package_id: string | null; quantity: number }>();
      for (const i of purchased) {
        const qty = i.package_id ? Number(i.quantity) : Math.max(1, Math.round(Number(i.quantity) / PANTRY_SERVINGS_WITHOUT_SIZE * 10) / 10);
        const home = pantry.find(p => p.food_id === i.food_id && p.package_id === i.package_id);
        if (home) { bump.set(home.id, (bump.get(home.id) ?? Number(home.quantity)) + qty); continue; }
        if (!i.package_id && pantry.some(p => p.food_id === i.food_id)) continue;
        const key = `${i.food_id}:${i.package_id ?? ''}`;
        const row = fresh.get(key);
        fresh.set(key, { food_id: i.food_id, package_id: i.package_id, quantity: (row?.quantity ?? 0) + qty });
      }
      const failed: string[] = [];
      for (const [id, quantity] of bump) {
        const { error: e } = await supabase.from('pantry_item').update({ quantity }).eq('pantry_item_id', Number(id));
        if (e) failed.push(e.message);
        else setPantry(prev => prev.map(p => p.id === id ? { ...p, quantity } : p));
      }
      if (fresh.size) {
        const { data: added, error: pantryError } = await supabase.from('pantry_item')
          .insert([...fresh.values()].map(r => ({ pantry_id: pantryId, food_id: Number(r.food_id), quantity: r.quantity, unit: foodById(r.food_id)?.unit ?? null, food_package_id: r.package_id == null ? null : Number(r.package_id) })) as any)
          .select();
        if (pantryError) failed.push(pantryError.message);
        else setPantry(prev => [...prev, ...(added || []).map(toPantry)]);
      }
      if (failed.length) fail('Trip saved, but your pantry could not be updated: ' + failed[0]);
    }
    navigate({ to: '/plan/history' });
  }

  async function renameTrip(trip: Trip, name: string) {
    const value = name.trim() || null;
    const { data, error } = await supabase.from('shopping_list').update({ name: value } as never).eq('shopping_list_id', Number(trip.id)).eq('status', 'completed').select().maybeSingle();
    if (error || !data) fail(error?.message || 'Could not rename trip');
    else setTrips(prev => prev.map(t => t.id === trip.id ? toTrip(data) : t));
  }

  async function toggleTripFavorite(trip: Trip) {
    if (trip.status !== 'completed') return;

    const { data, error } = await supabase
      .from('shopping_list')
      .update({ is_favorite: !trip.is_favorite } as never)
      .eq('shopping_list_id', Number(trip.id))
      .eq('status', 'completed')
      .select()
      .maybeSingle();

    if (error || !data) {
      fail(error?.message || 'Could not update favorite');
      return;
    }

    setTrips(prev =>
      prev.map(t => t.id === trip.id ? toTrip(data) : t)
    );
  }

  function deleteTrip(trip: Trip) {
    if (trip.status !== 'completed') return () => {};
    const tripItems = items.filter(i => i.trip_id === trip.id);
    setTrips(prev => prev.filter(t => t.id !== trip.id));
    setItems(prev => prev.filter(i => i.trip_id !== trip.id));
    const restore = () => {
      setTrips(prev => [...prev, trip].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setItems(prev => [...prev, ...tripItems]);
    };
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.from('shopping_list').delete().eq('shopping_list_id', Number(trip.id)).eq('status', 'completed').select('shopping_list_id').maybeSingle();
      if (error || !data) {
        restore();
        fail(error?.message || 'Could not delete trip');
      }
    }, 6000);
    return () => { window.clearTimeout(timer); restore(); };
  }

  async function addTripToPlan(trip: Trip) {
    if (!active && !(await confirmPantry())) return;
    const tripId = await ensureTrip();
    if (!tripId) return;
    await qtySync.flushAll();
    const current = items.filter(i => i.trip_id === tripId && !i.purchased).map(i => ({ ...i }));
    for (const item of items.filter(i => i.trip_id === trip.id)) {
      // Rows only merge when they count the same way (same package size, or both in servings).
      const existing = current.find(i => i.food_id === item.food_id && i.package_id === item.package_id && i.custom_amount === item.custom_amount && i.custom_unit === item.custom_unit);
      const query = existing
        ? supabase.from('shopping_list_item').update({ quantity: existing.quantity + item.quantity }).eq('shopping_list_item_id', Number(existing.id))
        : supabase.from('shopping_list_item').insert({ shopping_list_id: Number(tripId), food_id: Number(item.food_id), quantity: item.quantity, unit: foodById(item.food_id)?.unit ?? null, food_option_id: item.option_id == null ? null : Number(item.option_id), food_package_id: item.package_id == null ? null : Number(item.package_id), custom_amount: item.custom_amount, custom_unit: item.custom_unit } as any);
      const { data, error } = await query.select().single();
      if (error || !data) {
        fail('Some items could not be added to your plan: ' + (error?.message || 'Please try again.'));
        return;
      }
      const saved = toItem(data);
      if (existing) {
        existing.quantity = saved.quantity;
        setItems(prev => prev.map(i => i.id === saved.id ? saved : i));
      } else {
        current.push(saved);
        setItems(prev => [...prev, saved]);
      }
    }
    navigate({ to: '/plan' });
  }

  async function signOut() {
    await supabase.auth.signOut();
    resetRecommendationImpressions();
    resetNutrientSnapshots();
    setFoodPreferences({});
    setUserId('');
    setIsFirstSession(false);
    // Keep the saved theme and color scheme: they belong to this device, not the account.
    navigate({ to: '/', replace: true });
  }

  const value: WorkspaceValue = {
    userId, isFirstSession, firstSessionResolved, isAdmin, profile, trips, items, pantry, active, listItems, purchased, days, budget,
    budgetPeriod, periodSpent, budgetRemaining,
    profileDraft, loading, error, search, results, selected,
    pantryTotals, combined, daily, spend, priceOf, optionsFor, optionPriceOf, itemPrice, setItemOption, packagesFor, packageOf, packagePriceOf, itemServings, lineCost, setItemPackage, setItemCustom, customOf, setItemEstimate, pantryServings, setPantryQuantity, setPantryPackage, hasUnpricedBudgetItems, priceStatus, priceRefreshUnavailable, biggestGaps, suggestions, foodGapScores, suggestionNutrient, suggestionNutrientChosen, setSuggestionFocus,
    foodPreferences, likedFoods, setFoodPreference, removeFoodPreference,
    setProfileDraft, setSearch, setSelected, clearError, fail,
    addFood, addFoods, updateQuantity, removeItem, undoPurchase, saveTripSettings,
    addPantry, removePantry,
    pantryCheckDue: needsPantryCheck(!!active, pantry.length), pantryCheckOpen, finishPantryCheck, startPlan,
    saveProfile, finishTrip, addTripToPlan, deleteTrip, renameTrip, toggleTripFavorite, signOut,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
