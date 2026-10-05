import type { Updates } from './useUpdates';

const REPO = 'https://github.com/itsdommie/muster';

function reason(r: 'development' | 'package-manager' | 'platform'): string {
  return r === 'development' ? 'This is a development build, so there is nothing to update.'
    : r === 'package-manager' ? 'This copy was installed from a .deb package, so updates come from your package manager or from the Releases page.'
      : 'Updating itself is not available on this platform.';
}

export function AboutDialog({ updates, onClose }: { updates: Updates; onClose: () => void }) {
  const { info } = updates;
  const state = info?.state;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="About Muster" onClick={(e) => e.stopPropagation()}>
        <header>
          <div><h2>Muster</h2><div className="muted">Version {info?.version ?? __APP_VERSION__}</div></div>
          <button className="icon" onClick={onClose} aria-label="Close">×</button>
        </header>
        <p>A local-first army list builder and table companion. Everything you make stays on your device.</p>
        <p className="muted small">An unofficial, non-commercial fan project. It contains no game data and is not affiliated with or endorsed by any publisher. Released under the MIT licence.</p>
        <p className="small">
          <a href={REPO} target="_blank" rel="noreferrer">Source code</a> · <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">Releases</a> · <a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">What changed</a>
        </p>

        <section className="about-updates" aria-label="Updates">
          <h3>Updates</h3>
          {!info || !state ? (
            <p className="small">
              This version does not update itself. To get a newer one, download it from the <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">Releases page</a>.
              Save a backup first (Backup, top right) if you want to be extra careful.
            </p>
          ) : state.phase === 'unsupported' ? (
            <p className="small">{reason(state.reason)} <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">Releases page</a></p>
          ) : (
            <>
              <p className="small" role="status">
                {state.phase === 'checking' ? 'Looking for updates…'
                  : state.phase === 'none' ? `You are up to date (${info.version}).`
                    : state.phase === 'available' ? `Muster ${state.version} is available.`
                      : state.phase === 'downloading' ? `Downloading Muster ${state.version}… ${state.percent}%`
                        : state.phase === 'ready' ? `Muster ${state.version} is ready to install.`
                          : state.phase === 'error' ? state.message
                            : 'Muster has not looked for updates in this session.'}
              </p>
              <div className="actions flush">
                {state.phase === 'available' && <button className="primary" onClick={updates.download}>Download Muster {state.version}</button>}
                {state.phase === 'ready' && <button className="primary" onClick={updates.install}>Restart and install</button>}
                {(state.phase === 'idle' || state.phase === 'none' || state.phase === 'error') && <button onClick={updates.check}>Check for updates</button>}
              </div>
              <label className="toggle">
                <input type="checkbox" checked={info.auto === true} onChange={(e) => updates.setAuto(e.target.checked)} /> Check for updates automatically
              </label>
              <p className="muted small">
                {info.auto === true ? 'Muster asks GitHub for the newest release now and then (at most every six hours). Nothing about you or your data is sent.'
                  : 'While this is off, Muster makes no network requests at all.'}
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
