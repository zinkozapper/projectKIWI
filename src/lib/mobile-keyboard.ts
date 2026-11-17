// Keeps the field you're typing in (and its results) above the on-screen keyboard on phones.
//
// Three parts work together:
// 1. The viewport meta tag has interactive-widget=resizes-content (src/routes/__root.tsx), so
//    Android Chrome shrinks the page when the keyboard opens instead of drawing over it.
// 2. iOS Safari ignores that, so this file copies the visible area (window.visualViewport) into
//    CSS variables --vv-height and --vv-top. Dialogs and result lists use them on phones.
// 3. While a text field has focus on a touch screen, <html> gets the class "keyboard-open"
//    (hides the bottom nav bar and other fixed bars) and the field is scrolled into view once the
//    keyboard has finished opening. A field inside [data-keyboard-anchor="top"] is scrolled to the
//    top instead, so the results under it get the rest of the screen.

const NON_TEXT_INPUTS = new Set([
  'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit',
]);

/** True for elements that bring up the on-screen keyboard. */
export function isTextEntry(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type) && !el.readOnly && !el.disabled;
  return el instanceof HTMLElement && el.isContentEditable === true;
}

export type ScrollBlock = 'start' | 'center';

/** Search boxes with results under them go to the top; everything else to the middle. */
export function revealBlock(el: Element): ScrollBlock {
  return el.closest('[data-keyboard-anchor="top"]') ? 'start' : 'center';
}

export interface VisibleArea {
  top: number;
  height: number;
}

/**
 * Whether the element needs scrolling. Rects are in layout-viewport coordinates, and on iOS the
 * visible area can sit lower in the layout viewport (offsetTop), so compare against that.
 */
export function needsReveal(rect: { top: number; bottom: number }, area: VisibleArea, block: ScrollBlock, margin = 12): boolean {
  const visibleTop = area.top + margin;
  const visibleBottom = area.top + area.height - margin;
  if (block === 'start') return Math.abs(rect.top - visibleTop) > 24;
  return rect.top < visibleTop || rect.bottom > visibleBottom;
}

const KEYBOARD_SETTLE_MS = 320;

export function installMobileKeyboard(win: Window = window): () => void {
  const doc = win.document;
  const root = doc.documentElement;
  const touch = win.matchMedia?.('(pointer: coarse)');
  const vv = win.visualViewport;

  const area = (): VisibleArea => ({
    top: vv ? vv.offsetTop : 0,
    height: vv ? vv.height : win.innerHeight,
  });

  const syncVars = () => {
    const { top, height } = area();
    root.style.setProperty('--vv-height', `${Math.round(height)}px`);
    root.style.setProperty('--vv-top', `${Math.round(top)}px`);
  };

  const syncClass = () => {
    const open = Boolean(touch?.matches) && isTextEntry(doc.activeElement);
    root.classList.toggle('keyboard-open', open);
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const reveal = () => {
    const el = doc.activeElement;
    if (!touch?.matches || !isTextEntry(el)) return;
    const block = revealBlock(el);
    if (needsReveal(el.getBoundingClientRect(), area(), block)) {
      el.scrollIntoView({ block, inline: 'nearest', behavior: 'smooth' });
    }
  };
  const revealSoon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(reveal, KEYBOARD_SETTLE_MS);
  };

  const onFocusIn = (e: FocusEvent) => {
    syncClass();
    if (touch?.matches && isTextEntry(e.target as Element)) revealSoon();
  };
  // focusout fires before the next field gets focus, so check on the next tick.
  const onFocusOut = () => { setTimeout(syncClass, 0); };
  const onViewport = () => {
    syncVars();
    // The keyboard finished opening (or the address bar moved): make sure the field is still visible.
    if (root.classList.contains('keyboard-open')) revealSoon();
  };

  syncVars();
  syncClass();
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', onFocusOut);
  vv?.addEventListener('resize', onViewport);
  vv?.addEventListener('scroll', syncVars);
  win.addEventListener('resize', onViewport);

  return () => {
    if (timer) clearTimeout(timer);
    doc.removeEventListener('focusin', onFocusIn);
    doc.removeEventListener('focusout', onFocusOut);
    vv?.removeEventListener('resize', onViewport);
    vv?.removeEventListener('scroll', syncVars);
    win.removeEventListener('resize', onViewport);
    root.classList.remove('keyboard-open');
  };
}
