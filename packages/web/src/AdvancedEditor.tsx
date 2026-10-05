import { useEffect, useState } from 'react';
import { loadPack, packEdit, type PackDraft } from '@muster/shared';
import { saveTextFile } from './file';

export function AdvancedEditor({ draft, onChange }: { draft: PackDraft; onChange: (d: PackDraft) => void }) {
  return (
    <div className="editor-stack">
      <ImportTable draft={draft} onChange={onChange} />
      <JsonEditor draft={draft} onChange={onChange} />
    </div>
  );
}

function ImportTable({ draft, onChange }: { draft: PackDraft; onChange: (d: PackDraft) => void }) {
  const [text, setText] = useState('');
  const [armyId, setArmyId] = useState('');
  const [result, setResult] = useState<ReturnType<typeof packEdit.importUnitsCsv> | null>(null);

  const run = () => {
    const r = packEdit.importUnitsCsv(draft, text, armyId ? { armyId } : {});
    setResult(r);
    if (r.added + r.updated > 0) { onChange(r.draft); setText(''); }
  };

  return (
    <section className="panel editor-form" aria-label="Import units from a table">
      <div className="panel-head">
        <h3>Import units from a table</h3>
        <p className="muted small">Paste rows copied from a spreadsheet or a CSV file. The first row names the columns.</p>
      </div>
      <details className="syntax">
        <summary>Which columns can I use?</summary>
        <p className="small">
          <code>name</code> (required), <code>kind</code> (hero or warrior), <code>tier</code>, <code>cost</code>, <code>unique</code>, <code>move</code>, <code>fight</code>, <code>shoot</code>,
          <code>strength</code>, <code>defence</code>, <code>attacks</code>, <code>wounds</code>, <code>courage</code>, <code>might</code>, <code>will</code>, <code>fate</code>,
          <code>rules</code>, <code>wargear</code>, <code>keywords</code> and <code>army</code>. Short names work too: M F Sh S D A W C. Several rules or wargear in one cell are separated by
          semicolons. A unit whose name is already in the pack is updated. Rules, wargear and armies that do not exist yet are created.
        </p>
      </details>
      <label className="field">
        <span>Table</span>
        <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} aria-label="Table to import" spellCheck={false}
          placeholder={'Name,Kind,Cost,M,F,Sh,S,D,A,W,C,Army\nCaptain,hero,60,6,5,4+,4,5,2,2,5,The Order\nGuard,warrior,8,6,3,,3,5,1,1,3,The Order'} />
      </label>
      <div className="row-controls">
        <label className="inline">
          If a row names no army, add its unit to
          <select value={armyId} onChange={(e) => setArmyId(e.target.value)} aria-label="Army for imported units">
            <option value="">no army</option>
            {draft.armies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="button">
          Choose a file…
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(setText); e.target.value = ''; }} />
        </label>
        <button className="primary" onClick={run} disabled={!text.trim()}>Import</button>
        <button onClick={() => void saveTextFile(`${draft.id}-units.csv`, 'text/csv', packEdit.unitsToCsv(draft))} disabled={draft.units.length === 0}>Save the units as a table</button>
      </div>
      {result && (
        <div role="status" className="import-result">
          <p>
            {result.added + result.updated === 0 ? 'Nothing was imported.' : `Imported: ${result.added} added, ${result.updated} updated.`}
            {result.created.rules + result.created.wargear + result.created.armies > 0 && ` Created ${[result.created.rules && `${result.created.rules} rule${result.created.rules === 1 ? '' : 's'}`, result.created.wargear && `${result.created.wargear} wargear`, result.created.armies && `${result.created.armies} arm${result.created.armies === 1 ? 'y' : 'ies'}`].filter(Boolean).join(', ')} to fill in.`}
          </p>
          {result.problems.length > 0 && <ul className="issues">{result.problems.map((p, i) => <li key={i} className="issue warning">{p}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

function JsonEditor({ draft, onChange }: { draft: PackDraft; onChange: (d: PackDraft) => void }) {
  const current = JSON.stringify(draft, null, 2);
  const [text, setText] = useState(current);
  const [baseline, setBaseline] = useState(current); // the draft as it was when the box was last in step with it
  const [errors, setErrors] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);
  const dirty = text !== baseline;
  const stale = dirty && current !== baseline; // the draft changed (e.g. a table was imported) while there were unsaved edits here

  // Follow the draft while there is nothing typed here to lose.
  useEffect(() => {
    if (!dirty && current !== baseline) { setText(current); setBaseline(current); }
  }, [current, baseline, dirty]);

  const reload = () => { setText(current); setBaseline(current); setErrors([]); setApplied(false); };

  const apply = () => {
    setApplied(false);
    let json: unknown;
    try { json = JSON.parse(text); } catch (e) { setErrors([`Not valid JSON: ${e instanceof Error ? e.message : String(e)}`]); return; }
    const r = loadPack(json);
    if (!r.ok) { setErrors(r.errors); return; }
    setErrors([]);
    onChange(r.index.pack);
    const next = JSON.stringify(r.index.pack, null, 2);
    setText(next);
    setBaseline(next);
    setApplied(true);
  };

  return (
    <section className="panel editor-form" aria-label="Edit as JSON">
      <div className="panel-head">
        <h3>Edit as JSON</h3>
        <p className="muted small">The whole pack as text, for anything the forms do not cover (such as a table of wound rolls). It is checked before it replaces the draft.</p>
      </div>
      <label className="field">
        <span>Pack JSON</span>
        <textarea rows={14} value={text} onChange={(e) => { setText(e.target.value); setApplied(false); }} spellCheck={false} aria-label="Pack JSON" className="json" />
      </label>
      {stale && <p className="issue warning" role="alert">The draft has changed since you started editing this text. Using it would replace those changes: reload it first, then make your edit again.</p>}
      <div className="actions flush">
        <button className="primary" onClick={apply}>Check and use this JSON</button>
        <button onClick={reload}>Reload from the draft</button>
      </div>
      {applied && <p role="status" className="status ok">The draft now matches the JSON.</p>}
      {errors.length > 0 && <ul className="issues" role="alert">{errors.slice(0, 12).map((e, i) => <li key={i} className="issue error">{e}</li>)}{errors.length > 12 && <li className="muted small">…and {errors.length - 12} more.</li>}</ul>}
    </section>
  );
}
