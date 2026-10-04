import { useEffect, useRef, useState } from 'react';
import { importText, type ArmyList, type PackIndex } from '@muster/shared';

export function ImportDialog({ index, onImport, onClose }: { index: PackIndex; onImport: (l: ArmyList) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [problems, setProblems] = useState<string[] | null>(null);

  const run = () => {
    const r = importText(index, text);
    if (r.list.warbands.length === 0) {
      setProblems(['Nothing to import. Paste a list first.', ...r.problems]);
      return;
    }
    onImport(r.list);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Import list" onClick={(e) => e.stopPropagation()}>
        <header><h2>Import a list</h2><button className="icon" onClick={onClose} aria-label="Close">×</button></header>
        <p className="muted small">Paste a list in the same plain-text format Muster exports. Unit and option names must match the loaded pack. Bullets, "3x" and missing costs are fine.</p>
        <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Army: Realm of the Vale\nPoints: 500\n\nAldric the Bold (Warhorse)\n6 Vale Spearman (Shield)'} aria-label="List text" />
        {problems && <ul className="issues">{problems.map((p, i) => <li key={i} className="issue error">{p}</li>)}</ul>}
        <div className="actions"><button className="primary" onClick={run} disabled={!text.trim()}>Import</button></div>
      </div>
    </div>
  );
}

export function PackDialog({ index, custom, onLoad, onReset, onClose }: {
  index: PackIndex; custom: boolean; onLoad: (json: unknown) => string[] | null; onReset: () => void; onClose: () => void;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const json: unknown = JSON.parse(await file.text());
      const errs = onLoad(json);
      if (errs) setErrors(errs);
      else onClose();
    } catch (e) {
      setErrors([`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setBusy(false);
    }
  };

  const p = index.pack;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Data pack" onClick={(e) => e.stopPropagation()}>
        <header><h2>Data pack</h2><button className="icon" onClick={onClose} aria-label="Close">×</button></header>
        <p><strong>{p.name}</strong> <span className="muted">v{p.version}{p.author ? ` · ${p.author}` : ''}</span></p>
        {p.description && <p className="muted small">{p.description}</p>}
        <p className="small">{p.armies.length} armies · {p.units.length} units · {p.rules.length} rules{p.license ? ` · ${p.license}` : ''}</p>
        <p className="muted small">Muster contains no game data of its own. A pack is a JSON file with your armies, units and rules; it is checked on load and stored only on this device.</p>
        <div className="actions">
          <label className="button">
            {busy ? 'Reading…' : 'Load pack file…'}
            <input type="file" accept="application/json,.json" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {custom && <button onClick={() => { onReset(); onClose(); }}>Back to sample pack</button>}
        </div>
        {errors.length > 0 && (
          <ul className="issues">
            {errors.slice(0, 12).map((x, i) => <li key={i} className="issue error">{x}</li>)}
            {errors.length > 12 && <li className="muted small">…and {errors.length - 12} more.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ExportDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => box.current?.select(), []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Copy list" onClick={(e) => e.stopPropagation()}>
        <header><h2>Copy your list</h2><button className="icon" onClick={onClose} aria-label="Close">×</button></header>
        <p className="muted small">Automatic copying isn't available here. Select the text below and copy it.</p>
        <textarea ref={box} rows={14} readOnly value={text} aria-label="List text" />
      </div>
    </div>
  );
}
