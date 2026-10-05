import { useEffect, useRef, useState } from 'react';
import type { UpdateInfo } from '@muster/shared';

export interface Updates {
  /** Null where the app cannot update itself (the browser and Android). */
  info: UpdateInfo | null;
  /** A download that was started and failed, so the banner can offer another try. */
  downloadFailed: boolean;
  check(): void;
  download(): void;
  install(): void;
  setAuto(on: boolean): void;
}

/** Follows the desktop app's update state. Everywhere else it reports nothing. */
export function useUpdates(): Updates {
  const api = window.muster?.updates;
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!api) return;
    let live = true;
    const apply = (next: UpdateInfo) => {
      if (!live) return;
      const was = last.current;
      last.current = next.state.phase;
      if (was === 'downloading' && next.state.phase === 'error') setDownloadFailed(true);
      if (next.state.phase === 'downloading' || next.state.phase === 'ready') setDownloadFailed(false);
      setInfo(next);
    };
    void api.info().then(apply);
    const off = api.onChange(apply);
    return () => { live = false; off(); };
  }, [api]);

  return {
    info,
    downloadFailed,
    check: () => void api?.check(),
    download: () => void api?.download(),
    install: () => void api?.install(),
    // Shown at once, then confirmed by the desktop app: a tick that waited for a round trip would look broken.
    setAuto: (on) => { setInfo((i) => (i ? { ...i, auto: on, ask: false } : i)); void api?.setAuto(on); },
  };
}
