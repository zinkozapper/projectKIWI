import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Banner } from './banner';

describe('Banner', () => {
  it('announces errors as alerts and successes as status', () => {
    const { rerender } = render(<Banner tone="error" title="Could not save" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    rerender(<Banner tone="success" title="Saved" />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps info banners quiet unless a role is passed', () => {
    const { rerender } = render(<Banner title="Tip">Body</Banner>);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Body')).toBeInTheDocument();
    rerender(<Banner title="Tip" role="status" />);
    expect(screen.getByRole('status')).toHaveTextContent('Tip');
  });

  it('shows a dismiss button only when it can be dismissed', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Banner tone="error" title="Oops" />);
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
    rerender(<Banner tone="error" title="Oops" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
