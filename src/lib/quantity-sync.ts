// Saves list quantities in the background so the +/- buttons update right away.
// Taps on the same item within `delayMs` become one write with the latest value. Only one write per
// item is in flight at a time, so an older value can never land after a newer one.
// If a write fails and nothing newer is waiting, onRevert gets the last value the server accepted.

export type QuantitySync = {
  // The UI already shows `next`; `current` is what it showed before (used to roll back on failure).
  set: (id: string, next: number, current: number) => void;
  // Sends a waiting value now and resolves once this item has nothing waiting or in flight.
  flush: (id: string) => Promise<void>;
  flushAll: () => Promise<void>;
  // Drops a waiting value (the item is being deleted).
  cancel: (id: string) => void;
  isPending: (id: string) => boolean;
};

export function createQuantitySync(opts: {
  delayMs: number;
  save: (id: string, quantity: number) => Promise<boolean>;
  onRevert: (id: string, quantity: number) => void;
}): QuantitySync {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const waiting = new Map<string, number>();
  const inFlight = new Map<string, Promise<void>>();
  const confirmed = new Map<string, number>();

  const clearTimer = (id: string) => {
    const t = timers.get(id);
    if (t !== undefined) clearTimeout(t);
    timers.delete(id);
  };

  async function flush(id: string): Promise<void> {
    clearTimer(id);
    while (inFlight.has(id)) await inFlight.get(id);
    if (!waiting.has(id)) return;
    const q = waiting.get(id)!;
    waiting.delete(id);
    const write = (async () => {
      let ok = false;
      try { ok = await opts.save(id, q); } catch { ok = false; }
      if (ok) confirmed.set(id, q);
      else if (!waiting.has(id) && confirmed.has(id)) opts.onRevert(id, confirmed.get(id)!);
      if (!waiting.has(id) && !timers.has(id)) confirmed.delete(id);
    })().finally(() => inFlight.delete(id));
    inFlight.set(id, write);
    await write;
    // A tap that came in while this write was out is sent by its own timer (or by the next flush).
  }

  return {
    set(id, next, current) {
      if (!confirmed.has(id)) confirmed.set(id, current);
      waiting.set(id, next);
      clearTimer(id);
      timers.set(id, setTimeout(() => void flush(id), opts.delayMs));
    },
    flush,
    async flushAll() {
      await Promise.all([...new Set([...waiting.keys(), ...inFlight.keys()])].map(flush));
    },
    cancel(id) {
      clearTimer(id);
      waiting.delete(id);
    },
    isPending: id => waiting.has(id) || inFlight.has(id),
  };
}
