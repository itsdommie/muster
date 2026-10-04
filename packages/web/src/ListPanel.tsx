import {
  entryCost, removeEntry, removeWarband, setCount, setOptions, toggleOption, warbandCost, warbandEntries,
  type ArmyList, type Issue, type ListEntry, type PackIndex, type Slot, type Unit, type Warband,
} from '@muster/shared';

interface Props {
  index: PackIndex;
  list: ArmyList;
  issues: Issue[];
  selected: string | null;
  onSelect: (wid: string) => void;
  onChange: (fn: (l: ArmyList) => ArmyList) => void;
  onInspect: (unit: Unit) => void;
  onAddWarband: (army: string) => void;
}

export function ListPanel({ index, list, issues, selected, onSelect, onChange, onInspect, onAddWarband }: Props) {
  const mainArmy = index.armies.get(list.army);
  const allies = (mainArmy?.allies ?? []).map((a) => index.armies.get(a.army)).filter((a) => !!a);

  return (
    <div className="panel list-panel">
      <div className="panel-head list-head">
        <input
          className="title-input"
          value={list.name}
          onChange={(e) => onChange((l) => ({ ...l, name: e.target.value }))}
          aria-label="List name"
        />
        <div className="row-controls">
          <label>
            Army
            <select value={list.army} onChange={(e) => onChange((l) => ({ ...l, army: e.target.value }))}>
              {[...index.armies.values()].map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              {!mainArmy && <option value={list.army}>{list.army} (missing)</option>}
            </select>
          </label>
          <label>
            Points
            <input
              type="number" min={0} step={25} value={list.limit}
              onChange={(e) => onChange((l) => ({ ...l, limit: Math.max(0, Number(e.target.value) || 0) }))}
            />
          </label>
        </div>
      </div>

      {list.warbands.map((w, i) => (
        <WarbandCard
          key={w.id} index={index} list={list} warband={w} number={i + 1}
          issues={issues.filter((x) => x.warband === w.id)}
          selected={selected === w.id}
          onSelect={() => onSelect(w.id)} onChange={onChange} onInspect={onInspect}
        />
      ))}

      <div className="add-warband">
        <button onClick={() => onAddWarband(list.army)}>+ Warband</button>
        {allies.length > 0 && (
          <select
            value="" aria-label="Add allied warband"
            onChange={(e) => e.target.value && onAddWarband(e.target.value)}
          >
            <option value="">+ Allied warband…</option>
            {allies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

interface CardProps {
  index: PackIndex;
  list: ArmyList;
  warband: Warband;
  number: number;
  issues: Issue[];
  selected: boolean;
  onSelect: () => void;
  onChange: Props['onChange'];
  onInspect: Props['onInspect'];
}

function WarbandCard({ index, list, warband, number, issues, selected, onSelect, onChange, onInspect }: CardProps) {
  const army = index.armies.get(warband.army);
  const allied = warband.army !== list.army;
  const entries = warbandEntries(warband);
  const followers = warband.members.reduce((n, m) => n + m.count, 0);
  const leaderUnit = warband.leader ? index.units.get(warband.leader.unit) : undefined;
  const max = leaderUnit?.warband?.size ?? index.pack.ruleset.warbandSize;

  const row = (entry: ListEntry, slot: Slot) => {
    const unit = index.units.get(entry.unit);
    if (!unit) return <li key={String(slot)} className="entry bad">Unknown unit {entry.unit}</li>;
    return (
      <li key={slot === 'leader' ? 'leader' : `m${slot}`} className="entry">
        <div className="entry-main">
          {slot !== 'leader' && (
            <div className="stepper">
              <button onClick={() => onChange((l) => setCount(l, warband.id, slot, entry.count - 1))} aria-label={`Fewer ${unit.name}`}>−</button>
              <span aria-label={`${entry.count} ${unit.name}`}>{entry.count}</span>
              <button onClick={() => onChange((l) => setCount(l, warband.id, slot, entry.count + 1))} aria-label={`More ${unit.name}`}>+</button>
            </div>
          )}
          <button className="link name" onClick={() => onInspect(unit)}>
            {unit.name}
            {slot === 'leader' && <span className="badge">{unit.tier ?? 'Hero'}</span>}
          </button>
          <span className="cost">{entryCost(index, entry)}</span>
          <button className="icon" onClick={() => onChange((l) => removeEntry(l, warband.id, slot))} aria-label={`Remove ${unit.name}`}>×</button>
        </div>
        {unit.options.length > 0 && (
          <div className="chips">
            {unit.options.map((o) => (
              <button
                key={o.id} className={entry.options.includes(o.id) ? 'chip on' : 'chip'} aria-pressed={entry.options.includes(o.id)}
                onClick={() => onChange((l) => setOptions(l, warband.id, slot, toggleOption(unit, entry.options, o.id)))}
              >
                {o.name} <span className="muted">+{o.cost}</span>
              </button>
            ))}
          </div>
        )}
      </li>
    );
  };

  return (
    <section className={`warband${selected ? ' selected' : ''}${allied ? ' allied' : ''}`} onClick={onSelect}>
      <header>
        <h3>
          Warband {number}
          {allied && <span className="badge ally">{army?.name ?? warband.army}</span>}
        </h3>
        <span className="muted small">
          {followers}/{max} warriors · <strong>{warbandCost(index, warband)}</strong> pts
        </span>
        <button className="icon" onClick={(e) => { e.stopPropagation(); onChange((l) => removeWarband(l, warband.id)); }} aria-label={`Remove warband ${number}`}>🗑</button>
      </header>
      <ul className="entries">
        {warband.leader ? row(warband.leader, 'leader') : <li className="entry empty">Choose a hero to lead this warband.</li>}
        {warband.members.map((m, i) => row(m, i))}
        {entries.length === 0 && <li className="muted small pad">Select this warband, then add units from the left.</li>}
      </ul>
      {issues.map((x, i) => <p key={i} className={`issue ${x.severity}`}>{x.message}</p>)}
    </section>
  );
}
