import { describe, expect, it } from 'vitest';
import { emailError, nameError, numericText, passwordError, profileFieldErrors } from './validation';

const valid = { display_name: 'Alex', age: '23', height_ft: '5', height_in: '7', weight_lb: '150', gender: 'female', budget: '75', zip_code: '84601' };

describe('validation', () => {
  it('names: letters only, required, length-capped', () => {
    expect(nameError('Mary-Jane O’Neil')).toBeNull();
    expect(nameError('José')).toBeNull();
    expect(nameError('Alex2')).toMatch(/numbers/);
    expect(nameError('  ')).toMatch(/required/);
    expect(nameError('a'.repeat(51))).toMatch(/at most/);
    expect(nameError('<script>')).toMatch(/letters/);
  });

  it('emails and passwords', () => {
    expect(emailError('luke@byu.edu')).toBeNull();
    expect(emailError('luke@byu')).toMatch(/valid/);
    expect(emailError('')).toMatch(/Enter/);
    expect(passwordError('12345')).toMatch(/at least/);
    expect(passwordError('x'.repeat(73))).toMatch(/at most/);
    expect(passwordError('secret1')).toBeNull();
  });

  it('strips "e", signs and extra dots from number text', () => {
    expect(numericText('1e5')).toBe('15');
    expect(numericText('-12.5.3')).toBe('12.53');
    expect(numericText('5.9', { integer: true })).toBe('59');
    expect(numericText('123456', { integer: true, maxLength: 5 })).toBe('12345');
  });

  it('flags each profile field with its own message', () => {
    expect(profileFieldErrors(valid)).toEqual({});
    const errors = profileFieldErrors({ ...valid, display_name: 'R2D2', age: '12', height_ft: '', weight_lb: '9000', gender: '', zip_code: '846' });
    expect(Object.keys(errors).sort()).toEqual(['age', 'display_name', 'gender', 'height_ft', 'weight_lb', 'zip_code']);
    expect(errors.age).toMatch(/between 18 and 100/);
    expect(profileFieldErrors({ ...valid, height_in: '12' }).height_in).toMatch(/between 0 and 11/);
    expect(profileFieldErrors({ ...valid, age: '23.5' }).age).toMatch(/whole number/);
  });
});
