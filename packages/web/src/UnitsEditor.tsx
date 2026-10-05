import { useMemo, useState } from 'react';
import { packEdit, type PackDraft } from '@muster/shared';
import { Check, Chips, CsvField, Group, Num, Text } from './editorKit';

interface Props {
  draft: PackDraft;
  onChange: (d: PackDraft) => void;
}

const STAT_FIELDS = [
  ['move', 'Move'], ['fight', 'Fight'], ['strength', 'Strength'], ['defence', 'Defence'], ['attacks', 'Attacks'], ['wounds', 'Wounds'], ['courage', 'Courage'],
] as const;

export function UnitsEditor({ draft, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(draft.units[0]?.id ?? null);
  const [newName, setNewName] = useState('');
  const unit = draft.units.find((u) => u.id === selected) ?? null;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return draft.units.filter((u) => !q || u.name.toLowerCase().includes(q));
  }, [draft.units, query]);

  const add = () => {
    const r = packEdit.addUnit(draft, newName);
    onChange(r.draft);
    setSelected(r.id);
    setNewName('');
  };

  return (
    <div className="editor-split">
      <section className="panel editor-list" aria-label="Units">
        <div className="panel-head">
          <h3>Units ({draft.units.length})</h3>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search units" aria-label="Search units to edit" />
          <form className="row-controls" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New unit name" aria-label="New unit name" />
            <button type="submit">Add unit</button>
          </form>
        </div>
        <ul className="rows">
          {shown.map((u) => (
            <li key={u.id} className={u.id === selected ? 'on' : ''}>
              <button className="link" onClick={() => setSelected(u.id)} aria-current={u.id === selected}>
                <span className="name">{u.name}</span>
                <span className="muted small">{u.kind === 'hero' ? (u.tier ?? 'Hero') : 'Warrior'}</span>
              </button>
              <span className="cost">{u.cost}</span>
            </li>
          ))}
          {shown.length === 0 && <li className="muted pad">{draft.units.length === 0 ? 'No units yet. Add one, or import a table on the Import tab.' : 'No units match.'}</li>}
        </ul>
      </section>

      {unit ? <UnitForm key={unit.id} draft={draft} unitId={unit.id} onChange={onChange} onGone={() => setSelected(null)} onSelect={setSelected} /> : (
        <section className="panel pad muted">Choose a unit to edit, or add one.</section>
      )}
    </div>
  );
}

function UnitForm({ draft, unitId, onChange, onGone, onSelect }: { draft: PackDraft; unitId: string; onChange: (d: PackDraft) => void; onGone: () => void; onSelect: (id: string) => void }) {
  const u = draft.units.find((x) => x.id === unitId)!;
  const set = (patch: Partial<typeof u>) => onChange(packEdit.updateUnit(draft, unitId, patch));
  const stat = (patch: Partial<typeof u.stats>) => onChange(packEdit.updateStats(draft, unitId, patch));
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const warriors = draft.units.filter((x) => x.kind === 'warrior');
  const armyOf = (armyId: string) => draft.armies.find((a) => a.id === armyId)!.units.find((e) => e.unit === unitId);

  return (
    <article className="panel editor-form" aria-label={`Edit ${u.name}`}>
      <div className="panel-head">
        <h3>{u.name}</h3>
        <div className="actions flush">
          <button onClick={() => { const r = packEdit.duplicateUnit(draft, unitId); onChange(r.draft); onSelect(r.id); }}>Duplicate</button>
          <button className="danger" onClick={() => { if (window.confirm(`Delete ${u.name}? It is also removed from every army.`)) { onChange(packEdit.removeUnit(draft, unitId)); onGone(); } }}>Delete</button>
        </div>
      </div>

      <div className="form-grid">
        <Text label="Name" value={u.name} onChange={(v) => set({ name: v })} />
        <label className="field">
          <span>Kind</span>
          <select value={u.kind} onChange={(e) => set({ kind: e.target.value as 'hero' | 'warrior' })} aria-label="Kind">
            <option value="warrior">Warrior</option>
            <option value="hero">Hero (leads a warband)</option>
          </select>
        </label>
        <Text label="Tier or class" value={u.tier ?? ''} placeholder="e.g. Captain" onChange={(v) => set({ tier: v.trim() === '' ? undefined : v })} hint="A label shown beside heroes." />
        <Num label="Points" value={u.cost} onChange={(v) => set({ cost: v ?? 0 })} />
        <Check label="Unique (only one per list)" checked={u.unique} onChange={(v) => set({ unique: v })} />
      </div>

      <div className="form-grid">
      <Group title="Profile">
        <div className="stat-grid">
          {STAT_FIELDS.map(([key, label]) => (
            <Num key={key} label={label} value={u.stats[key]} min={key === 'wounds' ? 1 : 0} onChange={(v) => stat({ [key]: v ?? (key === 'wounds' ? 1 : 0) })} />
          ))}
          <Num label="Shoot (n+)" value={u.stats.shoot} empty min={2} max={6} hint="Blank = cannot shoot" onChange={(v) => stat({ shoot: v })} />
          <Num label="Might" value={u.stats.might} onChange={(v) => stat({ might: v ?? 0 })} />
          <Num label="Will" value={u.stats.will} onChange={(v) => stat({ will: v ?? 0 })} />
          <Num label="Fate" value={u.stats.fate} onChange={(v) => stat({ fate: v ?? 0 })} />
        </div>
      </Group>

      <CsvField label="Keywords" values={u.keywords} onChange={(v) => set({ keywords: v })} hint="Separated by commas, e.g. Infantry, Hero" />
      <Chips label="Wargear" options={draft.wargear.map((w) => ({ id: w.id, label: w.name }))} selected={u.wargear} onToggle={(id) => set({ wargear: toggle(u.wargear, id) })} empty="No wargear written yet: add some on the Wargear tab." />
      <Chips label="Special rules" options={draft.rules.map((r) => ({ id: r.id, label: r.name }))} selected={u.rules} onToggle={(id) => set({ rules: toggle(u.rules, id) })} empty="No rules written yet: add some on the Rules tab." />

      <Group title="Options" hint="Paid extras a model can take. Options in the same group are alternatives (e.g. two kinds of mount).">
        {u.options.map((o, i) => (
          <div className="option-row" key={o.id}>
            <Text label={`Option ${i + 1} name`} value={o.name} onChange={(v) => set({ options: u.options.map((x) => (x.id === o.id ? { ...x, name: v } : x)) })} />
            <Num label="Cost" value={o.cost} onChange={(v) => set({ options: u.options.map((x) => (x.id === o.id ? { ...x, cost: v ?? 0 } : x)) })} />
            <label className="field">
              <span>Gives wargear</span>
              <select value={o.wargear ?? ''} aria-label={`Wargear given by ${o.name}`} onChange={(e) => set({ options: u.options.map((x) => (x.id === o.id ? withWargear(x, e.target.value) : x)) })}>
                <option value="">None</option>
                {draft.wargear.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <Text label="Group" value={o.group ?? ''} placeholder="optional" onChange={(v) => set({ options: u.options.map((x) => (x.id === o.id ? withGroup(x, v) : x)) })} />
            <button className="icon" aria-label={`Remove option ${o.name}`} onClick={() => set({ options: u.options.filter((x) => x.id !== o.id) })}>×</button>
          </div>
        ))}
        <button onClick={() => onChange(packEdit.addOption(draft, unitId, ''))}>Add an option</button>
      </Group>

      {u.kind === 'hero' && (
        <Group title="Warband" hint="How many warriors this hero can lead, and which. Leave both empty to use the pack's usual size and allow any warrior.">
          <Num label="Warband size" value={u.warband?.size ?? null} empty hint={`Blank = ${draft.ruleset.warbandSize}`} onChange={(v) => set({ warband: keepWarband(u.warband, { size: v }) })} />
          <Chips label="May lead only" options={warriors.map((w) => ({ id: w.id, label: w.name }))} selected={u.warband?.allowed ?? []} onToggle={(id) => set({ warband: keepWarband(u.warband, { allowed: toggle(u.warband?.allowed ?? [], id) }) })} empty="No warriors written yet." />
        </Group>
      )}

      <Group title="Available to" hint="The armies that can take this unit, and optionally the most of it one list may have.">
        {draft.armies.length === 0 && <p className="muted small">No armies yet: add one on the Armies tab.</p>}
        {draft.armies.map((a) => {
          const e = armyOf(a.id);
          return (
            <div className="army-row" key={a.id}>
              <Check label={a.name} checked={!!e} onChange={(v) => onChange(packEdit.setArmyUnit(draft, a.id, unitId, v, e?.max))} />
              {e && <Num label={`Most in ${a.name}`} value={e.max ?? null} empty min={1} hint="Blank = no limit" onChange={(v) => onChange(packEdit.setArmyUnit(draft, a.id, unitId, true, v ?? undefined))} />}
            </div>
          );
        })}
      </Group>

      <Text label="Notes" multiline value={u.notes ?? ''} onChange={(v) => set({ notes: v === '' ? undefined : v })} />
      </div>
    </article>
  );
}

function withWargear<T extends { wargear?: string | undefined }>(o: T, id: string): T {
  const { wargear: _old, ...rest } = o;
  return (id === '' ? rest : { ...rest, wargear: id }) as T;
}
function withGroup<T extends { group?: string | undefined }>(o: T, group: string): T {
  const { group: _old, ...rest } = o;
  return (group.trim() === '' ? rest : { ...rest, group }) as T;
}
/** Keep a hero's warband settings only while at least one is set. */
function keepWarband(current: { size?: number | undefined; allowed?: string[] | undefined } | undefined, patch: { size?: number | null; allowed?: string[] }): { size?: number; allowed?: string[] } | undefined {
  const size = 'size' in patch ? (patch.size ?? undefined) : current?.size;
  const allowed = 'allowed' in patch ? patch.allowed : current?.allowed;
  const out: { size?: number; allowed?: string[] } = {};
  if (size !== undefined) out.size = size;
  if (allowed && allowed.length > 0) out.allowed = allowed;
  return Object.keys(out).length > 0 ? out : undefined;
}
