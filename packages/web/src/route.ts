import { useCallback, useEffect, useState } from 'react';

export type View = 'builder' | 'units' | 'rules' | 'fight' | 'game';
const VIEWS: View[] = ['builder', 'units', 'rules', 'fight', 'game'];

const read = (): View => {
  const v = window.location.hash.replace(/^#\/?/, '') as View;
  return VIEWS.includes(v) ? v : 'builder';
};

/**
 * The current view lives in the URL hash so reloads keep it and the Android back button steps between views
 * (the hash works under file://, app:// and the Capacitor origin alike).
 */
export function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(read);
  useEffect(() => {
    const on = () => setView(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((v: View) => {
    if (v !== read()) window.location.hash = `/${v}`;
  }, []);
  return [view, go];
}
