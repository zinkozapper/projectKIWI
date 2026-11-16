import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PrepSelect } from './prep-select';
import type { FoodOption } from '@/lib/food-options';

const opt = (id: string, label: string, price: number): FoodOption => ({ id, foodId: '1', form: id, label, price, sort: 0 });
const options = [opt('1', 'Raw', 0.65), opt('2', 'Rotisserie', 0.94), opt('3', 'Canned', 0)];

describe('PrepSelect', () => {
  it('lists each prep style by name only: the package size sets the price', () => {
    const onChange = vi.fn();
    render(<PrepSelect foodName="Chicken breast" options={options} value={null} average={0.8} priceOf={o => (o.price > 0 ? o.price : null)} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: /how you'll buy chicken breast/i });
    expect([...select.querySelectorAll('option')].map(o => o.textContent)).toEqual(['Raw', 'Rotisserie', 'Canned']);
    expect((select as HTMLSelectElement).value).toBe('1'); // no pick shows the default style, never "Any"
    fireEvent.change(select, { target: { value: '2' } });
    expect(onChange).toHaveBeenLastCalledWith('2');
  });

  it('shows nothing for a food sold one way', () => {
    const { container } = render(<PrepSelect foodName="Honey" options={[opt('1', 'Jar', 0.23)]} value={null} average={0.23} priceOf={() => 0.23} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
