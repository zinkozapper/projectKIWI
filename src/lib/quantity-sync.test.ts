import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuantitySync } from './quantity-sync';

describe('createQuantitySync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('turns a burst of taps into one write with the last value', async () => {
    const save = vi.fn(async () => true);
    const sync = createQuantitySync({ delayMs: 400, save, onRevert: vi.fn() });
    sync.set('a', 2, 1);
    sync.set('a', 3, 2);
    sync.set('a', 4, 3);
    await vi.advanceTimersByTimeAsync(400);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('a', 4);
  });

  it('never sends a newer value before the older write finishes', async () => {
    const order: number[] = [];
    let release!: () => void;
    const save = vi.fn((_id: string, q: number) => {
      order.push(q);
      return q === 2 ? new Promise<boolean>(r => { release = () => r(true); }) : Promise.resolve(true);
    });
    const sync = createQuantitySync({ delayMs: 400, save, onRevert: vi.fn() });
    sync.set('a', 2, 1);
    await vi.advanceTimersByTimeAsync(400);
    sync.set('a', 3, 2);
    await vi.advanceTimersByTimeAsync(400);
    expect(order).toEqual([2]);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual([2, 3]);
  });

  it('rolls back to the last saved value when a write fails', async () => {
    const onRevert = vi.fn();
    const sync = createQuantitySync({ delayMs: 400, save: async () => false, onRevert });
    sync.set('a', 2, 1);
    sync.set('a', 3, 2);
    await vi.advanceTimersByTimeAsync(400);
    expect(onRevert).toHaveBeenCalledWith('a', 1);
    expect(sync.isPending('a')).toBe(false);
  });

  it('flush sends right away and cancel drops a waiting value', async () => {
    const save = vi.fn(async () => true);
    const sync = createQuantitySync({ delayMs: 400, save, onRevert: vi.fn() });
    sync.set('a', 5, 1);
    await sync.flush('a');
    expect(save).toHaveBeenCalledWith('a', 5);
    sync.set('b', 2, 1);
    sync.cancel('b');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
