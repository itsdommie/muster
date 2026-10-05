import { useState } from 'react';
import type { Updates } from './useUpdates';

const RELEASES = 'https://github.com/itsdommie/muster/releases';

/** The one place the app talks about updates unprompted: asking permission once, and announcing a new version the person chose to look for. */
export function UpdateBanner({ updates }: { updates: Updates }) {
  const { info } = updates;
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!info) return null;
  const { state } = info;

  if (info.ask) {
    return (
      <div className="update-banner" role="region" aria-label="Updates">
        <p>
          Muster can look for new versions on GitHub. That is the only time it uses the internet, and it only does so if you say yes. You can change your mind in About.
        </p>
        <div className="actions flush">
          <button className="primary" onClick={() => updates.setAuto(true)}>Check automatically</button>
          <button onClick={() => updates.setAuto(false)}>No thanks</button>
        </div>
      </div>
    );
  }

  if (state.phase === 'available' && dismissed !== state.version) {
    return (
      <div className="update-banner" role="region" aria-label="Updates">
        <p><strong>Muster {state.version}</strong> is available. <a href={RELEASES} target="_blank" rel="noreferrer">What is new</a></p>
        <div className="actions flush">
          <button className="primary" onClick={updates.download}>Download</button>
          <button onClick={() => setDismissed(state.version)}>Not now</button>
        </div>
      </div>
    );
  }

  if (state.phase === 'downloading') {
    return (
      <div className="update-banner" role="region" aria-label="Updates">
        <p>Downloading Muster {state.version}… <span role="status">{state.percent}%</span></p>
        <div className="meter" role="img" aria-label={`${state.percent}% downloaded`}><div style={{ width: `${state.percent}%` }} /></div>
      </div>
    );
  }

  if (state.phase === 'ready' && dismissed !== `ready-${state.version}`) {
    return (
      <div className="update-banner" role="region" aria-label="Updates">
        <p><strong>Muster {state.version}</strong> is ready. It installs when you close Muster, or you can restart now. Your lists, games and everything else are kept.</p>
        <div className="actions flush">
          <button className="primary" onClick={updates.install}>Restart and install</button>
          <button onClick={() => setDismissed(`ready-${state.version}`)}>Later</button>
        </div>
      </div>
    );
  }

  if (updates.downloadFailed && state.phase === 'error' && dismissed !== 'failed') {
    return (
      <div className="update-banner" role="region" aria-label="Updates">
        <p>{state.message}</p>
        <div className="actions flush">
          <button className="primary" onClick={updates.check}>Try again</button>
          <button onClick={() => setDismissed('failed')}>Dismiss</button>
        </div>
      </div>
    );
  }

  return null;
}
