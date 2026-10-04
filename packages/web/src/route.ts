import { useCallback, useEffect, useState } from 'react';

export type View = 'builder' | 'units' | 'rules' | 'fight' | 'game' | 'more';
const VIEWS: View[] = ['builder', 'units', 'rules', 'fight', 'game', 'more'];

export interface Route {
  view: View;
  /** The part after the view, e.g. "collection" in "#/more/collection". */
  sub: string | null;
}

const read = (): Route => {
  const [v, sub] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { view: VIEWS.includes(v as View) ? (v as View) : 'builder', sub: sub || null };
};

const sameRoute = (a: Route, b: Route) => a.view === b.view && a.sub === b.sub;

/**
 * The current view lives in the URL hash so reloads keep it and the Android back button steps between views
 * (the hash works under file://, app:// and the Capacitor origin alike).
 */
export function useRoute(): [Route, (view: View, sub?: string | null) => void] {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((view: View, sub: string | null = null) => {
    if (!sameRoute({ view, sub }, read())) window.location.hash = `/${view}${sub ? `/${sub}` : ''}`;
  }, []);
  return [route, go];
}
