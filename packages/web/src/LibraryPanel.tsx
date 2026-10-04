import { useMemo, useState } from 'react';
import type { PackIndex, Unit } from '@muster/shared';

interface Props {
  index: PackIndex;
  armyId: string;
  canAdd: boolean;
  onAdd: (unit: Unit) => void;
  onInspect: (unit: Unit) => void;
}

export function LibraryPanel({ index, armyId, canAdd, onAdd, onInspect }: Props) {
  const [query, setQuery] = useState('');
  const army = index.armies.get(armyId);

  const units = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (army?.units ?? [])
      .map((e) => ({ unit: index.units.get(e.unit), max: e.max }))
      .filter((e): e is { unit: Unit; max: number | undefined } => !!e.unit)
      .filter(({ unit }) => !q || unit.name.toLowerCase().includes(q) || unit.keywords.some((k) => k.toLowerCase().includes(q)));
  }, [index, army, query]);

  const section = (kind: 'hero' | 'warrior', title: string) => {
    const rows = units.filter((e) => e.unit.kind === kind);
    if (rows.length === 0) return null;
    return (
      <section>
        <h3>{title}</h3>
        <ul className="rows">
          {rows.map(({ unit, max }) => (
            <li key={unit.id}>
              <button className="link" onClick={() => onInspect(unit)} title="View profile">
                <span className="name">{unit.name}</span>
                <span className="muted small">
                  {kind === 'hero' ? (unit.tier ?? 'Hero') : unit.keywords.join(', ')}
                  {max ? ` · max ${max}` : ''}
                </span>
              </button>
              <span className="cost">{unit.cost}</span>
              <button className="add" disabled={!canAdd} onClick={() => onAdd(unit)} aria-label={`Add ${unit.name}`}>+</button>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="panel library">
      <div className="panel-head">
        <h2>{army?.name ?? 'Units'}</h2>
        {army?.description && <p className="muted small">{army.description}</p>}
        {army?.bonus && (
          <details>
            <summary>Army bonus: {army.bonus.name}</summary>
            <p className="small">{army.bonus.text}</p>
          </details>
        )}
        <input type="search" placeholder="Search units or keywords" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search units" />
        {!canAdd && <p className="muted small">Add a warband first.</p>}
      </div>
      {section('hero', 'Heroes')}
      {section('warrior', 'Warriors')}
      {units.length === 0 && <p className="muted pad">No units match.</p>}
    </div>
  );
}
