// Kiwi Nutrition brand mark: a kiwi bird whose body is a kiwi slice.
// Source SVG: kiwi-logo-bird.svg. The favicon (public/favicon.svg) uses the plain slice,
// because the bird is too detailed at 16px.
export function BrandMark() {
  return (
    <span className="brand-icon brand-bird">
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M44 26 C 52 27, 58 33, 62 42" fill="none" stroke="#c9a15a" strokeWidth="3.2" strokeLinecap="round"/>
        <g stroke="#c9a15a" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M22 50 L20 60 M20 60 L15 61 M20 60 L23 62"/>
          <path d="M34 50 L35 60 M35 60 L30 61 M35 60 L39 62"/>
        </g>
        <circle cx="28" cy="32" r="22" fill="#7b5530"/>
        <circle cx="28" cy="32" r="19" fill="#6fb52c"/>
        <circle cx="28" cy="32" r="12.5" fill="#9ed054"/>
        <circle cx="28" cy="32" r="5" fill="#f4f1cf"/>
        <ellipse cx="28" cy="23.4" rx="1" ry="1.9" fill="#1d1a12" transform="rotate(18.0 28 32)"/>
        <ellipse cx="28" cy="23.4" rx="1" ry="1.9" fill="#1d1a12" transform="rotate(54.0 28 32)"/>
        <ellipse cx="28" cy="23.4" rx="1" ry="1.9" fill="#1d1a12" transform="rotate(90.0 28 32)"/>
        <ellipse cx="28" cy="23.4" rx="1" ry="1.9" fill="#1d1a12" transform="rotate(126.0 28 32)"/>
        <ellipse cx="28" cy="23.4" rx="1" ry="1.9" fill="#1d1a12" transform="rotate(162.0 28 32)"/>
        <ellipse cx="28" cy="23.4" rx="1" ry="1.9" fill="#1d1a12" transform="rotate(198.0 28 32)"/>
        <ellipse cx="28" cy="23.4" rx="1" ry="1.9" fill="#1d1a12" transform="rotate(234.0 28 32)"/>
        <ellipse cx="28" cy="23.4" rx="1" ry="1.9" fill="#1d1a12" transform="rotate(270.0 28 32)"/>
        <ellipse cx="28" cy="23.4" rx="1" ry="1.9" fill="#1d1a12" transform="rotate(306.0 28 32)"/>
        <ellipse cx="28" cy="23.4" rx="1" ry="1.9" fill="#1d1a12" transform="rotate(342.0 28 32)"/>
        <circle cx="41" cy="22.5" r="2.3" fill="#1d1a12"/>
        <circle cx="41.7" cy="21.8" r=".7" fill="#fff"/>
      </svg>
    </span>
  );
}
