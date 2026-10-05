import { useMemo, useState } from 'react';
import { armiesOfUnit, searchUnits, type PackIndex, type Unit } from '@muster/shared';
import { useNarrow } from './useMedia';
import { UnitCard, UnitDetail } from './UnitCard';
import { usePaging } from './usePaging';

type SortKey = 'name' | 'cost' | 'move' | 'fight' | 'shoot' | 'strength' | 'defence' | 'attacks' | 'wounds' | 'courage';

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: 'cost', label: 'Pts', title: 'Points' },
  { key: 'move', label: 'M', title: 'Move' },
  { key: 'fight', label: 'F', title: 'Fight' },
  { key: 'shoot', label: 'Sh', title: 'Shoot' },
  { key: 'strength', label: 'S', title: 'Strength' },
  { key: 'defence', label: 'D', title: 'Defence' },
  { key: 'attacks', label: 'A', title: 'Attacks' },
  { key: 'wounds', label: 'W', title: 'Wounds' },
  { key: 'courage', label: 'C', title: 'Courage' },
];

const value = (u: Unit, key: SortKey): number | string | null =>
  key === 'name' ? u.name : key === 'cost' ? u.cost : u.stats[key];

const EXAMPLES = ['f>=5', 'r:terror', 'k:cavalry', 'is:hero w>=3', 'army:horde is:warrior', 'g:bow or o:javelins', '-k:infantry'];

interface Props {
  index: PackIndex;
  query: string;
  onQuery: (q: string) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onRule: (ruleId: string) => void;
}

export function UnitsView({ index, query, onQuery, selected, onSelect, onRule }: Props) {
  const narrow = useNarrow();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });

  const { units, errors } = useMemo(() => searchUnits(index, query), [index, query]);
  const rows = useMemo(() => {
    const out = [...units];
    out.sort((a, b) => {
      const x = value(a, sort.key);
      const y = value(b, sort.key);
      // Models that cannot shoot sort last whichever way the column runs.
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      const c = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number);
      return (c || a.name.localeCompare(b.name)) * sort.dir;
    });
    return out;
  }, [units, sort]);

  const paging = usePaging(`${query}|${sort.key}|${sort.dir}`);
  const shown = rows.slice(0, paging.limit);
  const unit = selected ? index.units.get(selected) : undefined;
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 }));
  const arrow = (key: SortKey) => sort.key === key && <span aria-hidden> {sort.dir === 1 ? '▲' : '▼'}</span>;
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');

  return (
    <div className="units-view">
      <div className="panel results">
        <div className="panel-head">
          <input
            type="search" value={query} onChange={(e) => onQuery(e.target.value)} aria-label="Search all units"
            placeholder="Search units: name, f>=5, r:terror, army:vale …" autoComplete="off" spellCheck={false}
          />
          <details className="syntax">
            <summary>Search syntax and examples</summary>
            <div className="examples" aria-label="Example searches">
              {EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => onQuery(e)}>{e}</button>)}
            </div>
            <ul className="small">
              <li><code>m f sh s d a w c mi wi fa cost</code> with <code>= != &gt; &gt;= &lt; &lt;=</code>, e.g. <code>d&gt;=6 cost&lt;=50</code>. <code>sh:none</code> finds models that cannot shoot.</li>
              <li><code>r:</code> rule name, <code>rt:</code> rule text, <code>g:</code> wargear, <code>o:</code> option, <code>k:</code> keyword, <code>army:</code>, <code>tier:</code>, <code>kind:</code>.</li>
              <li><code>is:hero</code> <code>is:warrior</code> <code>is:unique</code> <code>is:ranged</code> <code>is:shooter</code>.</li>
              <li>Quote phrases (<code>"light footed"</code>), negate with <code>-</code>, and put <code>or</code> between alternatives.</li>
            </ul>
          </details>
          {errors.map((e, i) => <p key={i} className="issue warning">{e}</p>)}
          <p className="muted small count-line">
            <span role="status">{rows.length} of {index.pack.units.length} units</span>
            {query && <button className="link" onClick={() => onQuery('')}>Clear search</button>}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="muted pad">No units match.</p>
        ) : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Unit results table">
            <table className="results-table">
              <thead>
                <tr>
                  <th aria-sort={ariaSort('name')} className="name-col"><button onClick={() => toggleSort('name')}>Unit{arrow('name')}</button></th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} aria-sort={ariaSort(c.key)}><button onClick={() => toggleSort(c.key)} title={c.title}>{c.label}{arrow(c.key)}</button></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id} className={u.id === selected ? 'on' : ''}>
                    <td className="name-col">
                      <button className="link" onClick={() => onSelect(u.id)} aria-current={u.id === selected}>
                        <span className="name">{u.name}</span>
                        <span className="muted small">{armiesOfUnit(index, u.id).map((a) => a.name).join(', ')}</span>
                      </button>
                    </td>
                    <td>{u.cost}</td>
                    <td>{u.stats.move}"</td>
                    <td>{u.stats.fight}</td>
                    <td>{u.stats.shoot ? `${u.stats.shoot}+` : '-'}</td>
                    <td>{u.stats.strength}</td>
                    <td>{u.stats.defence}</td>
                    <td>{u.stats.attacks}</td>
                    <td>{u.stats.wounds}</td>
                    <td>{u.stats.courage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {shown.length < rows.length && (
          <p className="actions pad">
            <span className="muted small">Showing {shown.length} of {rows.length}.</span>
            <button onClick={paging.more}>Show more</button>
            <button onClick={paging.all}>Show all</button>
          </p>
        )}
      </div>

      {unit && !narrow && (
        <aside className="panel detail" aria-label="Unit profile">
          <button className="icon detail-close" onClick={() => onSelect(null)} aria-label="Close profile">×</button>
          <UnitDetail index={index} unit={unit} onRule={onRule} />
        </aside>
      )}
      {unit && narrow && <UnitCard index={index} unit={unit} onClose={() => onSelect(null)} onRule={onRule} />}
    </div>
  );
}
