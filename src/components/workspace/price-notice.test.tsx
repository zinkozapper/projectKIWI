import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriceNotice } from './price-notice';

describe('PriceNotice', () => {
  it('warns about stale and unknown local prices', () => {
    const { rerender } = render(<PriceNotice status="stale" />);
    expect(screen.getByRole('status')).toHaveTextContent('over 30 days old');
    rerender(<PriceNotice status="unknown" />);
    expect(screen.getByRole('status')).toHaveTextContent('unavailable');
    rerender(<PriceNotice status="fresh" />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<PriceNotice status="fresh" refreshUnavailable />);
    expect(screen.getByRole('status')).toHaveTextContent('updates are unavailable');
  });
});
