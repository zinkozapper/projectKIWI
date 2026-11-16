import type { KeyboardEvent } from 'react';

// Shared input rules so every form agrees on what "reasonable" means.

export const LIMITS = {
  name: 50,
  email: 254,
  password: 72, // bcrypt (Supabase Auth) ignores anything past 72 bytes
  search: 60,
  zip: 5,
} as const;

export const MIN_PASSWORD = 6; // Supabase Auth's minimum

// Letters (any language), spaces, apostrophes, hyphens and periods: "Mary-Jane", "O'Neil", "J.R.". No digits.
const NAME_PATTERN = /^\p{L}[\p{L}\p{M}\s'’.-]*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function nameError(value: string, label = 'Name'): string | null {
  const v = value.trim();
  if (!v) return `${label} is required.`;
  if (v.length > LIMITS.name) return `${label} can be at most ${LIMITS.name} characters.`;
  if (/\d/.test(v)) return `${label} can’t contain numbers.`;
  if (!NAME_PATTERN.test(v)) return `${label} can only use letters, spaces, hyphens and apostrophes.`;
  return null;
}

export function emailError(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Enter your email address.';
  if (v.length > LIMITS.email) return 'That email address is too long.';
  if (!EMAIL_PATTERN.test(v)) return 'Enter a valid email address, like name@example.com.';
  return null;
}

export function passwordError(value: string): string | null {
  if (!value) return 'Enter a password.';
  if (value.length < MIN_PASSWORD) return `Passwords need at least ${MIN_PASSWORD} characters.`;
  if (value.length > LIMITS.password) return `Passwords can be at most ${LIMITS.password} characters.`;
  return null;
}

// <input type="number"> accepts "e", "+" and "-" (scientific notation). Block them as they're typed.
// Pass integer = true to also block the decimal point.
export function numberKeyGuard(integer = false) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (['e', 'E', '+', '-'].includes(e.key) || (integer && (e.key === '.' || e.key === ','))) e.preventDefault();
  };
}

// Clean pasted values: digits only (integer) or digits with one decimal point, capped in length.
export function numericText(value: string, { integer = false, maxLength = 7 } = {}) {
  const cleaned = integer ? value.replace(/\D/g, '') : value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
  return cleaned.slice(0, maxLength);
}

// Profile ranges. Kiwi's nutrient targets are adult reference values, so the profile is for adults.
export const PROFILE_RANGES = {
  age: [18, 100],
  height_ft: [3, 8],
  height_in: [0, 11],
  weight_lb: [60, 700],
  budget: [0, 10000],
} as const;

export type ProfileFields = {
  display_name: string;
  age: string;
  height_ft: string;
  height_in: string;
  weight_lb: string;
  gender: string;
  budget: string;
  zip_code: string;
};

// One message per problem field, so the form can flag each field and say what's wrong with it.
export function profileFieldErrors(d: ProfileFields): Partial<Record<keyof ProfileFields, string>> {
  const errors: Partial<Record<keyof ProfileFields, string>> = {};
  const name = nameError(d.display_name, 'Your name');
  if (name) errors.display_name = name;

  const range = (key: 'age' | 'height_ft' | 'height_in' | 'weight_lb' | 'budget', label: string, required: boolean, integer: boolean) => {
    const raw = String(d[key] ?? '').trim();
    if (!raw) {
      if (required) errors[key] = `${label} is required.`;
      return;
    }
    const n = Number(raw);
    const [min, max] = PROFILE_RANGES[key];
    if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) errors[key] = `${label} must be a ${integer ? 'whole ' : ''}number.`;
    else if (n < min || n > max) errors[key] = `${label} must be between ${min} and ${max.toLocaleString()}.`;
  };
  range('age', 'Age', true, true);
  range('height_ft', 'Feet', true, true);
  range('height_in', 'Inches', false, true);
  range('weight_lb', 'Weight', true, false);
  range('budget', 'Budget', true, false);

  if (!d.gender) errors.gender = 'Pick the sex used for estimates.';
  if (!/^\d{5}$/.test(d.zip_code)) errors.zip_code = 'Enter a 5-digit ZIP code.';
  return errors;
}
