// Types shared by the food finder UI and its server functions (safe to import in the browser).
import type { FoodGroup } from './rules';
import type { Json } from '@/integrations/supabase/types';

export const FOOD_LIMIT_STEP = 10;

export const HOW_BOUGHT = [
  { id: 'not_sure', label: 'Not sure' },
  { id: 'raw', label: 'Fresh / raw' },
  { id: 'dry', label: 'Dry, cooked at home' },
  { id: 'as_sold', label: 'Ready to eat' },
  { id: 'packaged', label: 'Packaged brand' },
] as const;
export type HowBought = (typeof HOW_BOUGHT)[number]['id'];

export type FinderStatus = {
  isAdmin: boolean;
  added: number;
  limit: number | null; // null = no limit (admins)
  remaining: number | null;
  quotaPending: boolean;
};

export type FinderOption = {
  fdcId: number;
  label: string;
  reason: string;
  serving: string;
  description: string;
  dataType: string;
  brand?: string | undefined;
  coverage: number;
};

export type SearchResult = {
  requestId: number;
  group: FoodGroup;
  groupLabel: string;
  options: FinderOption[];
  followUpQuestion: string | null;
  noGoodMatch: boolean;
  existing: { id: string; name: string }[];
  status: FinderStatus;
};

export type SummaryNutrient = { key: string; label: string; unit: string; value: number };

export type AddedFoodRow = {
  food_id: number;
  food_name: string;
  emoji: string;
  unit: string;
  price: number;
  serving_size: number;
  nutrition: Json;
  food_description: string;
  pairs: number[];
  flavor_profile?: string[] | null;
  needs_review: boolean;
  food_category: { category_description: string } | null;
};

export type AddResult = {
  food: AddedFoodRow;
  status: FinderStatus;
  alreadyExisted: boolean;
  summary: {
    serving: string;
    servingGrams: number;
    nutrients: SummaryNutrient[];
    flavorTags: string[];
    pairs: string[];
    needsReview: boolean;
    source: string;
    /** The shopper's store price per serving (Kroger), or null with priceNote saying why. */
    price: { zip: string; store: string; product: string; perServing: number; flags: string[] } | null;
    priceNote: string | null;
  } | null;
};
