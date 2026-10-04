import { useState } from 'react';
import { backupFileName, countData, countSkipped, createBackup, parseBackup, type AppData, type Backup, type RestoreMode, type Skipped } from '@muster/shared';
import { saveTextFile } from './file';

interface Props {
  /** What is on this device right now. */
  data: AppData;
  lastBackup: number | null;
  onBackedUp: (at: number) => void;
  onRestore: (backup: Backup, mode: RestoreMode) => string;
  onClose: () => void;
}

const MAX_BYTES = 50 * 1024 * 1024; // a real backup is well under a megabyte; refuse anything absurd rather than hang the page
const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Summary({ data }: { data: AppData }) {
  const c = countData(data);
  return (
    <p>
      {plural(c.lists, 'list')}, {plural(c.games, 'game')}, {plural(c.tournaments, 'tournament')}, {plural(c.models, 'model')} in your collection
      {data.customPack !== null && ', and your data pack'}.
    </p>
  );
}

const skippedText = (s: Skipped): string => {
  const parts = [s.lists && plural(s.lists, 'list'), s.games && plural(s.games, 'game'), s.tournaments && plural(s.tournaments, 'tournament'), s.collections && plural(s.collections, 'collection'), s.customPack && 'the data pack'].filter(Boolean);
  return parts.join(', ');
};

export function BackupDialog({ data, lastBackup, onBackedUp, onRestore, onClose }: Props) {
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ backup: Backup; skipped: Skipped; file: string } | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [done, setDone] = useState<string | null>(null);

  const save = async () => {
    const now = Date.now();
    const ok = await saveTextFile(backupFileName(now), 'application/json', JSON.stringify(createBackup(data, now), null, 1));
    if (ok) {
      onBackedUp(now);
      setSaved('Backup saved. Keep the file somewhere safe: it is the only copy outside this device.');
    } else setSaved('The backup was not saved.');
  };

  const choose = async (file: File | undefined) => {
    setError(null);
    setDone(null);
    setPending(null);
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('That file is too large to be a Muster backup.'); return; }
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) { setError(parsed.error); return; }
    setPending({ backup: parsed.backup, skipped: parsed.skipped, file: file.name });
    setMode('merge');
  };

  const restore = () => {
    if (!pending) return;
    if (mode === 'replace' && !window.confirm('Replace everything on this device with the backup? What is here now will be gone unless you have saved a backup of it.')) return;
    setDone(onRestore(pending.backup, mode));
    setPending(null);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal backup" role="dialog" aria-label="Backup and restore" onClick={(e) => e.stopPropagation()}>
        <header><h2>Backup and restore</h2><button className="icon" onClick={onClose} aria-label="Close">×</button></header>
        <p className="muted small">Everything you make is kept on this device only. A backup file lets you move it to another device, or get it back if this one is lost or cleared.</p>

        <section>
          <h3>Back up</h3>
          <Summary data={data} />
          <p className="muted small">{lastBackup ? `Last backup: ${when(lastBackup)}.` : 'You have not saved a backup yet.'}</p>
          <div className="actions flush"><button className="primary" onClick={() => void save()}>{window.muster?.shareText ? 'Share backup file…' : 'Save backup file'}</button></div>
          {saved && <p role="status" className="small">{saved}</p>}
        </section>

        <section>
          <h3>Restore</h3>
          <label className="button">
            Choose backup file…
            <input type="file" accept="application/json,.json" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {error && <p className="issue error" role="alert">{error}</p>}
          {pending && (
            <div className="restore-preview" aria-label="Backup contents">
              <p><strong>{pending.file}</strong>{pending.backup.exportedAt > 0 && <span className="muted"> · saved {when(pending.backup.exportedAt)}</span>}</p>
              <Summary data={pending.backup.data} />
              {countSkipped(pending.skipped) > 0 && <p className="issue warning" role="status">Some parts of the file were damaged and will be left out: {skippedText(pending.skipped)}.</p>}
              <fieldset className="choices">
                <legend className="small muted">How should it be restored?</legend>
                <label><input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /> <strong>Add to what is here</strong> <span className="muted small">Nothing on this device is lost. If both have the same list or game, the newer one is kept.</span></label>
                <label><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> <strong>Replace everything</strong> <span className="muted small">This device ends up exactly as the backup was.</span></label>
              </fieldset>
              <div className="actions flush">
                <button className={mode === 'replace' ? 'danger' : 'primary'} onClick={restore}>{mode === 'replace' ? 'Replace everything' : 'Restore'}</button>
                <button onClick={() => setPending(null)}>Cancel</button>
              </div>
            </div>
          )}
          {done && <p role="status" className="status ok">{done}</p>}
        </section>
      </div>
    </div>
  );
}
