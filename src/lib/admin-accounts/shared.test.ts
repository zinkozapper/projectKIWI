import { describe, expect, it } from 'vitest';
import { checkAccountInput } from './shared';

const good = { email: 'sam@example.com', firstName: 'Sam', lastName: 'Lee', password: 'longenough' };

describe('checkAccountInput', () => {
  it('accepts a complete new account', () => {
    expect(checkAccountInput(good, { passwordRequired: true })).toBeNull();
  });

  it('needs a valid email and a first name', () => {
    expect(checkAccountInput({ ...good, email: 'sam@' }, { passwordRequired: true })).toMatch(/email/);
    expect(checkAccountInput({ ...good, firstName: '  ' }, { passwordRequired: true })).toMatch(/first name/);
  });

  it('requires a password only when creating', () => {
    expect(checkAccountInput({ ...good, password: '' }, { passwordRequired: true })).toMatch(/password/);
    expect(checkAccountInput({ ...good, password: '' }, { passwordRequired: false })).toBeNull();
  });

  it('rejects short passwords even when editing', () => {
    expect(checkAccountInput({ ...good, password: 'short' }, { passwordRequired: false })).toMatch(/8 characters/);
  });

  it('handles missing input', () => {
    expect(checkAccountInput(null, { passwordRequired: false })).toMatch(/email/);
  });
});
