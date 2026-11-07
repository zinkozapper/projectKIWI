import { useEffect, useState } from 'react';

// Matches the 800px breakpoint in styles.css where the sidebar becomes the bottom tab bar
// and the Plan page stacks into one column.
export const PHONE_LAYOUT_QUERY = '(max-width: 800px)';

export function usePhoneLayout() {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(PHONE_LAYOUT_QUERY);
    const onChange = () => setIsPhone(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isPhone;
}
