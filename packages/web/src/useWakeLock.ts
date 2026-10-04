import { useEffect } from 'react';

/** Keeps the screen on while `active` (a tracker is no use if the phone sleeps mid-turn). Silently does nothing where unsupported. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      navigator.wakeLock.request('screen').then(
        (l) => (cancelled ? void l.release() : (lock = l)),
        () => { /* denied (low battery, background tab): not worth surfacing */ },
      );
    };
    acquire();
    // The browser drops the lock when the page is hidden; take it again on return.
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [active]);
}
