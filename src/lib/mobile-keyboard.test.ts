import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMobileKeyboard, isTextEntry, needsReveal, revealBlock } from './mobile-keyboard';

function el(html: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  return wrap.firstElementChild as HTMLElement;
}

function setTouch(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches, addEventListener() {}, removeEventListener() {} });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('isTextEntry', () => {
  it('counts fields that open the keyboard', () => {
    expect(isTextEntry(el('<input type="text">'))).toBe(true);
    expect(isTextEntry(el('<input type="search">'))).toBe(true);
    expect(isTextEntry(el('<input type="number">'))).toBe(true);
    expect(isTextEntry(el('<textarea></textarea>'))).toBe(true);
  });
  it('skips checkboxes, buttons, read-only and disabled fields', () => {
    expect(isTextEntry(el('<input type="checkbox">'))).toBe(false);
    expect(isTextEntry(el('<button>Go</button>'))).toBe(false);
    expect(isTextEntry(el('<input readonly>'))).toBe(false);
    expect(isTextEntry(el('<input disabled>'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe('revealBlock', () => {
  it('sends search boxes with results to the top', () => {
    const box = el('<div data-keyboard-anchor="top"><input></div>');
    expect(revealBlock(box.querySelector('input')!)).toBe('start');
    expect(revealBlock(el('<input>'))).toBe('center');
  });
});

describe('needsReveal', () => {
  const area = { top: 0, height: 400 };
  it('scrolls a field hidden behind the keyboard', () => {
    expect(needsReveal({ top: 500, bottom: 540 }, area, 'center')).toBe(true);
  });
  it('leaves a visible field alone', () => {
    expect(needsReveal({ top: 100, bottom: 140 }, area, 'center')).toBe(false);
  });
  it('uses the visible area offset (iOS)', () => {
    expect(needsReveal({ top: 100, bottom: 140 }, { top: 300, height: 400 }, 'center')).toBe(true);
  });
  it('moves an anchored search box to the top unless it is already there', () => {
    expect(needsReveal({ top: 300, bottom: 348 }, area, 'start')).toBe(true);
    expect(needsReveal({ top: 14, bottom: 62 }, area, 'start')).toBe(false);
  });
});

describe('installMobileKeyboard', () => {
  it('marks the page while typing on a touch screen and scrolls the field into view', () => {
    vi.useFakeTimers();
    setTouch(true);
    const input = el('<input type="text">') as HTMLInputElement;
    const scroll = vi.fn();
    input.scrollIntoView = scroll;
    input.getBoundingClientRect = () => ({ top: 2000, bottom: 2040 }) as DOMRect;
    const stop = installMobileKeyboard();

    expect(document.documentElement.style.getPropertyValue('--vv-height')).toMatch(/px$/);
    input.focus();
    expect(document.documentElement.classList.contains('keyboard-open')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));

    input.blur();
    vi.advanceTimersByTime(1);
    expect(document.documentElement.classList.contains('keyboard-open')).toBe(false);
    stop();
  });

  it('does nothing on a mouse screen', () => {
    vi.useFakeTimers();
    setTouch(false);
    const input = el('<input type="text">') as HTMLInputElement;
    const scroll = vi.fn();
    input.scrollIntoView = scroll;
    const stop = installMobileKeyboard();
    input.focus();
    vi.advanceTimersByTime(400);
    expect(document.documentElement.classList.contains('keyboard-open')).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
    stop();
  });
});
