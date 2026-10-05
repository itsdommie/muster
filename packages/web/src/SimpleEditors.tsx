import { useState } from 'react';
import { packEdit, type PackDraft } from '@muster/shared';
import { Chips, CsvField, Num, Text } from './editorKit';

interface Props {
  draft: PackDraft;
  onChange: (d: PackDraft) => void;
}

/** A list on the left with an add box, and the selected item's form on the right. */
function ListEditor<T extends { id: string; name: string }>({ title, items, noun, subtitle, onAdd, children, onRemove, empty }: {
  title: string; items: T[]; noun: string; subtitle?: (item: T) => string; onAdd: (name: string) => string; onRemove: (id: string) => void;
  children: (item: T) => React.ReactNode; empty: string;
}) {
  const [selected, setSelected] = useState<string | null>(items[0]?.id ?? null);
  const [name, setName] = useState('');
  const item = items.find((i) => i.id === selected) ?? null;
  return (
    <div className="editor-split">
      <section className="panel editor-list" aria-label={title}>
        <div className="panel-head">
          <h3>{title} ({items.length})</h3>
          <form className="row-controls" onSubmit={(e) => { e.preventDefault(); setSelected(onAdd(name)); setName(''); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${noun} name`} aria-label={`New ${noun} name`} />
            <button type="submit">Add {noun}</button>
          </form>
        </div>
        <ul className="rows">
          {items.map((i) => (
            <li key={i.id} className={i.id === selected ? 'on' : ''}>
              <button className="link" onClick={() => setSelected(i.id)} aria-current={i.id === selected}>
                <span className="name">{i.name}</span>
                {subtitle && <span className="muted small">{subtitle(i)}</span>}
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="muted pad">{empty}</li>}
        </ul>
      </section>
      {item ? (
        <article className="panel editor-form" aria-label={`Edit ${item.name}`} key={item.id}>
          <div className="panel-head">
            <h3>{item.name}</h3>
            <div className="actions flush"><button className="danger" onClick={() => { if (window.confirm(`Delete ${item.name}?`)) { onRemove(item.id); setSelected(null); } }}>Delete</button></div>
          </div>
          <div className="form-grid">{children(item)}</div>
        </article>
      ) : <section className="panel pad muted">Choose a {noun} to edit, or add one.</section>}
    </div>
  );
}

export function WargearEditor({ draft, onChange }: Props) {
  const usedBy = (id: string) => draft.units.filter((u) => u.wargear.includes(id) || u.options.some((o) => o.wargear === id)).length;
  return (
    <ListEditor
      title="Wargear" noun="item" items={draft.wargear} empty="No wargear yet."
      subtitle={(w) => [w.tags.join(', '), `${usedBy(w.id)} unit${usedBy(w.id) === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
      onAdd={(name) => { const r = packEdit.addWargear(draft, name); onChange(r.draft); return r.id; }}
      onRemove={(id) => onChange(packEdit.removeWargear(draft, id))}
    >
      {(w) => (
        <>
          <Text label="Name" value={w.name} onChange={(v) => onChange(packEdit.updateWargear(draft, w.id, { name: v }))} />
          <Chips
            label="Counts toward the bow limit as" options={[{ id: 'bow', label: 'Bow' }, { id: 'throwing', label: 'Throwing weapon' }]} selected={w.tags}
            onToggle={(id) => onChange(packEdit.updateWargear(draft, w.id, { tags: w.tags.includes(id) ? w.tags.filter((t) => t !== id) : [...w.tags, id] }))}
          />
          <CsvField label="Other tags" values={w.tags.filter((t) => t !== 'bow' && t !== 'throwing')} hint="Free labels, separated by commas."
            onChange={(v) => onChange(packEdit.updateWargear(draft, w.id, { tags: [...w.tags.filter((t) => t === 'bow' || t === 'throwing'), ...v] }))} />
          <Text label="Description" multiline value={w.description ?? ''} onChange={(v) => onChange(packEdit.updateWargear(draft, w.id, { description: v === '' ? undefined : v }))} />
        </>
      )}
    </ListEditor>
  );
}

export function RulesEditor({ draft, onChange }: Props) {
  const usedBy = (id: string) => draft.units.filter((u) => u.rules.includes(id)).length;
  return (
    <ListEditor
      title="Special rules" noun="rule" items={draft.rules} empty="No rules yet."
      subtitle={(r) => [r.category, `${usedBy(r.id)} unit${usedBy(r.id) === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
      onAdd={(name) => { const r = packEdit.addRule(draft, name); onChange(r.draft); return r.id; }}
      onRemove={(id) => onChange(packEdit.removeRule(draft, id))}
    >
      {(r) => (
        <>
          <Text label="Name" value={r.name} onChange={(v) => onChange(packEdit.updateRule(draft, r.id, { name: v }))} />
          <Text label="Category" value={r.category ?? ''} placeholder="e.g. Passive, Magic" onChange={(v) => onChange(packEdit.updateRule(draft, r.id, { category: v.trim() === '' ? undefined : v }))} />
          <Text label="What it does" multiline value={r.text} onChange={(v) => onChange(packEdit.updateRule(draft, r.id, { text: v }))} />
        </>
      )}
    </ListEditor>
  );
}

export function ScenariosEditor({ draft, onChange }: Props) {
  return (
    <ListEditor
      title="Scenarios" noun="scenario" items={draft.scenarios} empty="No scenarios yet."
      subtitle={(s) => s.summary ?? ''}
      onAdd={(name) => { const r = packEdit.addScenario(draft, name); onChange(r.draft); return r.id; }}
      onRemove={(id) => onChange(packEdit.removeScenario(draft, id))}
    >
      {(s) => {
        const set = (patch: Partial<typeof s>) => onChange(packEdit.updateScenario(draft, s.id, patch));
        return (
          <>
            <Text label="Name" value={s.name} onChange={(v) => set({ name: v })} />
            <Text label="One-line summary" value={s.summary ?? ''} onChange={(v) => set({ summary: v === '' ? undefined : v })} />
            <Text label="Players" value={s.players ?? ''} placeholder="2" onChange={(v) => set({ players: v === '' ? undefined : v })} />
            <div className="stat-grid">
              <Num label="Smallest army (pts)" value={s.points?.min ?? null} empty onChange={(v) => set({ points: pointsRange(s.points, { min: v }) })} />
              <Num label="Largest army (pts)" value={s.points?.max ?? null} empty onChange={(v) => set({ points: pointsRange(s.points, { max: v }) })} />
            </div>
            <CsvField label="Tags" values={s.tags} onChange={(v) => set({ tags: v })} hint="Separated by commas." />
            <Text label="Set-up" multiline value={s.setup} onChange={(v) => set({ setup: v })} />
            <Text label="Objectives" multiline value={s.objectives} onChange={(v) => set({ objectives: v })} />
            <Text label="Winning" multiline value={s.victory} onChange={(v) => set({ victory: v })} />
            <Text label="Special rules" multiline value={s.special ?? ''} onChange={(v) => set({ special: v === '' ? undefined : v })} />
          </>
        );
      }}
    </ListEditor>
  );
}

function pointsRange(current: { min?: number | undefined; max?: number | undefined } | undefined, patch: { min?: number | null; max?: number | null }) {
  const min = 'min' in patch ? (patch.min ?? undefined) : current?.min;
  const max = 'max' in patch ? (patch.max ?? undefined) : current?.max;
  const out: { min?: number; max?: number } = {};
  if (min !== undefined) out.min = min;
  if (max !== undefined) out.max = max;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function ArmiesEditor({ draft, onChange }: Props) {
  const levels = Object.keys(draft.ruleset.allyLimits);
  return (
    <ListEditor
      title="Armies" noun="army" items={draft.armies} empty="No armies yet. A pack needs at least one, with a hero."
      subtitle={(a) => `${a.side} · ${a.units.length} unit${a.units.length === 1 ? '' : 's'}`}
      onAdd={(name) => { const r = packEdit.addArmy(draft, name); onChange(r.draft); return r.id; }}
      onRemove={(id) => onChange(packEdit.removeArmy(draft, id))}
    >
      {(a) => {
        const set = (patch: Partial<typeof a>) => onChange(packEdit.updateArmy(draft, a.id, patch));
        const others = draft.armies.filter((x) => x.id !== a.id);
        const heroes = a.units.filter((e) => draft.units.find((u) => u.id === e.unit)?.kind === 'hero').length;
        return (
          <>
            <Text label="Name" value={a.name} onChange={(v) => set({ name: v })} />
            <Text label="Side" value={a.side} onChange={(v) => set({ side: v })} hint="Any label, e.g. Good, Evil, Neutral." />
            <Text label="Description" multiline value={a.description ?? ''} onChange={(v) => set({ description: v === '' ? undefined : v })} />
            <Text label="Army bonus: name" value={a.bonus?.name ?? ''} onChange={(v) => set({ bonus: v === '' && !a.bonus?.text ? undefined : { name: v, text: a.bonus?.text ?? '' } })} />
            <Text label="Army bonus: what it does" multiline value={a.bonus?.text ?? ''} onChange={(v) => set({ bonus: v === '' && !a.bonus?.name ? undefined : { name: a.bonus?.name ?? '', text: v } })} />
            <Chips
              label={`Units in this army (${heroes} hero${heroes === 1 ? '' : 'es'})`} options={draft.units.map((u) => ({ id: u.id, label: `${u.name}${u.kind === 'hero' ? ' ★' : ''}` }))}
              selected={a.units.map((e) => e.unit)} onToggle={(id) => onChange(packEdit.setArmyUnit(draft, a.id, id, !a.units.some((e) => e.unit === id), a.units.find((e) => e.unit === id)?.max))}
              empty="No units written yet."
            />
            {heroes === 0 && <p className="issue warning">An army needs at least one hero (★) to lead a warband.</p>}
            <div className="field">
              <span>Allies</span>
              {a.allies.map((al, i) => (
                <div className="option-row" key={al.army}>
                  <label className="field">
                    <span>Army</span>
                    <select value={al.army} aria-label={`Ally ${i + 1} army`} onChange={(e) => set({ allies: a.allies.map((x) => (x.army === al.army ? { ...x, army: e.target.value } : x)) })}>
                      {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Level</span>
                    <select value={al.level} aria-label={`Ally ${i + 1} level`} onChange={(e) => set({ allies: a.allies.map((x) => (x.army === al.army ? { ...x, level: e.target.value } : x)) })}>
                      {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </label>
                  <button className="icon" aria-label={`Remove ally ${i + 1}`} onClick={() => set({ allies: a.allies.filter((x) => x.army !== al.army) })}>×</button>
                </div>
              ))}
              {levels.length === 0 ? <small className="muted">Add ally levels on the Pack tab first (e.g. “historical”).</small> : (
                <button
                  disabled={others.filter((o) => !a.allies.some((al) => al.army === o.id)).length === 0}
                  onClick={() => { const free = others.find((o) => !a.allies.some((al) => al.army === o.id)); if (free) set({ allies: [...a.allies, { army: free.id, level: levels[0]! }] }); }}
                >Add an ally</button>
              )}
            </div>
          </>
        );
      }}
    </ListEditor>
  );
}
