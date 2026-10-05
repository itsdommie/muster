import { useMemo, useState } from 'react';
import { packEdit, type ArmyList, type PackDraft, type PackIndex } from '@muster/shared';
import { AdvancedEditor } from './AdvancedEditor';
import { PackSettings } from './PackSettings';
import { ArmiesEditor, RulesEditor, ScenariosEditor, WargearEditor } from './SimpleEditors';
import { UnitsEditor } from './UnitsEditor';
import { saveTextFile } from './file';

const TABS = [['pack', 'Pack'], ['units', 'Units'], ['wargear', 'Wargear'], ['rules', 'Rules'], ['armies', 'Armies'], ['scenarios', 'Scenarios'], ['import', 'Import & JSON']] as const;
type Tab = (typeof TABS)[number][0];

interface Props {
  /** The pack in use. */
  index: PackIndex;
  customInUse: boolean;
  draft: PackDraft | null;
  onDraft: (d: PackDraft | null) => void;
  /** Every saved list, to warn about the ones a change would break. */
  lists: ArmyList[];
  /** Use the draft as the pack. Returns the problems if it cannot be used. */
  onApply: (d: PackDraft) => string[] | null;
}

export function PackEditor({ index, customInUse, draft, onDraft, lists, onApply }: Props) {
  const [tab, setTab] = useState<Tab>('units');
  const [message, setMessage] = useState<string | null>(null);

  if (!draft) return <Start index={index} customInUse={customInUse} onStart={(d, to) => { onDraft(d); setTab(to); setMessage(null); }} />;

  return <Editor key={draft.id} draft={draft} index={index} lists={lists} tab={tab} onTab={setTab} message={message} onMessage={setMessage} onDraft={onDraft} onApply={onApply} />;
}

function Start({ index, customInUse, onStart }: { index: PackIndex; customInUse: boolean; onStart: (d: PackDraft, tab: Tab) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="editor-stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Data pack editor</h2>
          <p className="muted small">
            Muster ships with no game data. A data pack holds your armies, units, wargear and rules, and this is where you write or change one. {customInUse ? '' : 'The pack in use now is the invented sample, so start your own below.'}
          </p>
        </div>
        <div className="start-options">
          <div className="card">
            <h3>Start a new pack</h3>
            <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="My pack" aria-label="Name for the new pack" /></label>
            <div className="actions flush">
              <button className="primary" onClick={() => onStart(packEdit.blankPack(name.trim() || 'My pack'), 'import')}>Start with a table of units</button>
              <button onClick={() => onStart(packEdit.blankPack(name.trim() || 'My pack'), 'armies')}>Start from scratch</button>
            </div>
            <p className="muted small">A table is the quickest way in: paste units from a spreadsheet and the rules, wargear and armies they name are created for you.</p>
          </div>
          <div className="card">
            <h3>Change the pack in use</h3>
            <p className="muted small"><strong>{index.pack.name}</strong> · {index.pack.units.length} units · {index.pack.armies.length} armies. You edit a copy, and nothing changes until you choose “Use this pack”.</p>
            <div className="actions flush"><button onClick={() => onStart(packEdit.cloneDraft(index.pack), 'units')}>Edit this pack</button></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Editor({ draft, index, lists, tab, onTab, message, onMessage, onDraft, onApply }: {
  draft: PackDraft; index: PackIndex; lists: ArmyList[]; tab: Tab; onTab: (t: Tab) => void; message: string | null; onMessage: (m: string | null) => void;
  onDraft: (d: PackDraft | null) => void; onApply: (d: PackDraft) => string[] | null;
}) {
  const problems = useMemo(() => packEdit.problems(draft), [draft]);
  const broken = useMemo(() => packEdit.brokenLists(draft, lists), [draft, lists]);
  // Compared in the shape a loaded pack has, not as typed: the same pack can have its keys in a different order.
  const normalized = useMemo(() => packEdit.normalized(draft), [draft]);
  const inUse = normalized !== null && JSON.stringify(normalized) === JSON.stringify(index.pack);
  const change = (d: PackDraft) => { onMessage(null); onDraft(d); };

  const apply = () => {
    if (problems.length > 0) return;
    if (broken.length > 0 && !window.confirm(`${broken.length} of your saved lists use units or armies this pack no longer has. They will show errors until you fix them. Use the pack anyway?`)) return;
    const errors = onApply(draft);
    onMessage(errors ? `Could not use it: ${errors[0]}` : `Now using “${draft.name}”.`);
  };

  return (
    <div className="editor">
      <section className="panel editor-bar" aria-label="Pack draft">
        <div className="panel-head">
          <h2>{draft.name}</h2>
          <p className="muted small" role="status">
            {draft.units.length} units · {draft.armies.length} armies · {draft.wargear.length} wargear · {draft.rules.length} rules
            {' · '}{problems.length > 0 ? <strong className="bad">{problems.length} to fix</strong> : inUse ? <strong className="ok">in use</strong> : <strong className="ok">ready to use</strong>}
          </p>
          <div className="actions flush">
            <button className="primary" onClick={apply} disabled={problems.length > 0 || inUse}>{inUse ? 'In use' : 'Use this pack'}</button>
            <button onClick={() => void saveTextFile(`${draft.id}.json`, 'application/json', JSON.stringify(draft, null, 2))} disabled={problems.length > 0}>Save as a file</button>
            <button onClick={() => { if (window.confirm('Throw away this draft? Anything not yet used or saved is lost.')) onDraft(null); }}>Close the draft</button>
          </div>
          {message && <p role="status" className="status ok">{message}</p>}
          {broken.length > 0 && problems.length === 0 && !inUse && <p className="issue warning">{broken.length} saved list{broken.length === 1 ? '' : 's'} would break: {broken.slice(0, 3).map((l) => l.name).join(', ')}{broken.length > 3 ? '…' : ''}.</p>}
          {problems.length > 0 && (
            <details className="problems" open={problems.length <= 3}>
              <summary>{problems.length} thing{problems.length === 1 ? '' : 's'} to fix before this pack can be used</summary>
              <ul className="issues">{problems.slice(0, 20).map((p, i) => <li key={i} className="issue error">{p}</li>)}{problems.length > 20 && <li className="muted small">…and {problems.length - 20} more.</li>}</ul>
            </details>
          )}
        </div>
      </section>

      <nav className="subnav segmented editor-tabs" aria-label="Pack sections">
        {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => onTab(id)}>{label}</button>)}
      </nav>

      {tab === 'pack' && <PackSettings draft={draft} onChange={change} />}
      {tab === 'units' && <UnitsEditor draft={draft} onChange={change} />}
      {tab === 'wargear' && <WargearEditor draft={draft} onChange={change} />}
      {tab === 'rules' && <RulesEditor draft={draft} onChange={change} />}
      {tab === 'armies' && <ArmiesEditor draft={draft} onChange={change} />}
      {tab === 'scenarios' && <ScenariosEditor draft={draft} onChange={change} />}
      {tab === 'import' && <AdvancedEditor draft={draft} onChange={change} />}
    </div>
  );
}
