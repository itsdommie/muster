import { useMemo, useState } from 'react';
import {
  STAGES, STAGE_LABELS, adjust, advance, armiesOfUnit, bought, coverage, entryOf, ownedOf, shoppingText, totals, wishlistText,
  type ArmyList, type Collection, type PackIndex, type Stage, type Unit,
} from '@muster/shared';

interface Props {
  index: PackIndex;
  collection: Collection;
  onCollection: (fn: (c: Collection) => Collection) => void;
  lists: ArmyList[];
  currentListId: string;
}

type Filter = 'all' | 'owned' | 'unpainted' | 'wanted';

function Counter({ label, value, onDec, onInc, onNext, nextLabel }: { label: string; value: number; onDec: () => void; onInc: () => void; onNext?: () => void; nextLabel?: string }) {
  return (
    <div className="counter" role="group" aria-label={label}>
      <button onClick={onDec} disabled={value === 0} aria-label={`${label} down`}>−</button>
      <span className="value">{value}</span>
      <button onClick={onInc} aria-label={`${label} up`}>+</button>
      {onNext && <button className="next" onClick={onNext} disabled={value === 0} aria-label={nextLabel} title={nextLabel}>→</button>}
    </div>
  );
}

export function CollectionView({ index, collection, onCollection, lists, currentListId }: Props) {
  const [query, setQuery] = useState('');
  const [army, setArmy] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const t = useMemo(() => totals(collection), [collection]);

  const units = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inArmy = army ? new Set(index.armies.get(army)?.units.map((u) => u.unit)) : null;
    return index.pack.units
      .filter((u) => !inArmy || inArmy.has(u.id))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.keywords.some((k) => k.toLowerCase().includes(q)))
      .filter((u) => {
        const e = entryOf(collection, u.id);
        if (filter === 'owned') return ownedOf(e) > 0;
        if (filter === 'unpainted') return ownedOf(e) - e.painted > 0;
        if (filter === 'wanted') return e.wanted > 0;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [index, collection, query, army, filter]);

  return (
    <div className="collection">
      <section className="panel" aria-label="Collection summary">
        <div className="panel-head">
          <h2>Your collection</h2>
          <p className="points"><strong>{t.owned}</strong> <span className="muted small">models owned · {Math.round(t.paintedShare * 100)}% painted · {t.wanted} on the wishlist</span></p>
          <div className="stagebar" role="img" aria-label={STAGES.map((s) => `${t.byStage[s]} ${STAGE_LABELS[s].toLowerCase()}`).join(', ')}>
            {STAGES.map((s) => <div key={s} className={`seg ${s}`} style={{ width: `${t.owned ? (t.byStage[s] / t.owned) * 100 : 0}%` }} />)}
          </div>
          <div className="stagelegend">
            {STAGES.map((s) => <span key={s}><i className={`dot ${s}`} /> {STAGE_LABELS[s]} <strong>{t.byStage[s]}</strong></span>)}
          </div>
        </div>
      </section>

      <ListCheck index={index} collection={collection} lists={lists} currentListId={currentListId} />

      <section className="panel">
        <div className="panel-head">
          <h3>Models</h3>
          <div className="filters">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search units" aria-label="Search your models" />
            <select value={army} onChange={(e) => setArmy(e.target.value)} aria-label="Army">
              <option value="">All armies</option>
              {[...index.armies.values()].map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div className="segmented" role="group" aria-label="Show">
              {([['all', 'All'], ['owned', 'Owned'], ['unpainted', 'To paint'], ['wanted', 'Wishlist']] as const).map(([f, label]) => (
                <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
              ))}
            </div>
          </div>
          <p className="muted small">Move models along with → as you build, prime and paint them.</p>
        </div>
        <ul className="unit-cards">
          {units.map((u) => <UnitRow key={u.id} index={index} unit={u} collection={collection} onCollection={onCollection} />)}
          {units.length === 0 && <li className="muted pad">No units match.</li>}
        </ul>
        {t.wanted > 0 && <WishlistActions index={index} collection={collection} />}
      </section>
    </div>
  );
}

function UnitRow({ index, unit, collection, onCollection }: { index: PackIndex; unit: Unit; collection: Collection; onCollection: Props['onCollection'] }) {
  const e = entryOf(collection, unit.id);
  const owned = ownedOf(e);
  return (
    <li className="unit-card">
      <div className="unit-card-head">
        <strong>{unit.name}</strong>
        <span className="muted small">{armiesOfUnit(index, unit.id).map((a) => a.name).join(', ')}</span>
        {owned > 0 && <span className="badge">{owned} owned</span>}
      </div>
      <div className="counters">
        {STAGES.map((s, i) => (
          <div key={s} className="counter-cell">
            <span className="small muted">{STAGE_LABELS[s]}</span>
            <Counter
              label={`${unit.name} ${STAGE_LABELS[s].toLowerCase()}`} value={e[s]}
              onDec={() => onCollection((c) => adjust(c, unit.id, s, -1))} onInc={() => onCollection((c) => adjust(c, unit.id, s, 1))}
              {...(i < STAGES.length - 1 ? { onNext: () => onCollection((c) => advance(c, unit.id, s)), nextLabel: `Move one ${unit.name} to ${STAGE_LABELS[STAGES[i + 1] as Stage].toLowerCase()}` } : {})}
            />
          </div>
        ))}
        <div className="counter-cell">
          <span className="small muted">Wishlist</span>
          <Counter
            label={`${unit.name} wishlist`} value={e.wanted}
            onDec={() => onCollection((c) => adjust(c, unit.id, 'wanted', -1))} onInc={() => onCollection((c) => adjust(c, unit.id, 'wanted', 1))}
            onNext={() => onCollection((c) => bought(c, unit.id))} nextLabel={`Bought one ${unit.name}`}
          />
        </div>
      </div>
    </li>
  );
}

function ListCheck({ index, collection, lists, currentListId }: { index: PackIndex; collection: Collection; lists: ArmyList[]; currentListId: string }) {
  const [listId, setListId] = useState(currentListId);
  const [copied, setCopied] = useState(false);
  const list = lists.find((l) => l.id === listId) ?? lists.find((l) => l.id === currentListId) ?? lists[0];
  const cov = useMemo(() => (list ? coverage(collection, list) : null), [collection, list]);
  if (!list || !cov) return null;
  const name = (id: string) => index.units.get(id)?.name ?? id;
  const verdict = cov.needModels === 0 ? 'This list is empty.' : cov.tableReady ? 'Table-ready: you own every model and all are painted.'
    : cov.fieldable ? `You can field this list. ${cov.toPaintModels} model${cov.toPaintModels === 1 ? '' : 's'} still to paint.`
      : `Not yet: ${cov.missingModels} model${cov.missingModels === 1 ? '' : 's'} to buy${cov.toPaintModels ? `, ${cov.toPaintModels} to paint` : ''}.`;

  return (
    <section className="panel" aria-label="List check">
      <div className="panel-head">
        <h3>Can I field this list?</h3>
        <label className="inline">
          List
          <select value={list.id} onChange={(e) => setListId(e.target.value)} aria-label="List to check">
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <p className={`status ${cov.tableReady ? 'ok' : cov.fieldable ? 'warn' : 'bad'}`} role="status">{verdict}</p>
      </div>
      {cov.lines.length > 0 && (
        <div className="table-wrap">
          <table className="results-table coverage">
            <thead><tr><th className="name-col">Unit</th><th>Need</th><th>Own</th><th>Painted</th><th>Buy</th><th>Paint</th></tr></thead>
            <tbody>
              {cov.lines.map((l) => (
                <tr key={l.unit} className={l.missing ? 'short' : ''}>
                  <td className="name-col">{name(l.unit)}</td><td>{l.need}</td><td>{l.owned}</td><td>{l.painted}</td>
                  <td className={l.missing ? 'bad' : ''}>{l.missing || '–'}</td><td>{l.toPaint || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(cov.missingModels > 0 || cov.toPaintModels > 0) && (
        <div className="actions">
          <button onClick={() => { void navigator.clipboard?.writeText(shoppingText(index, cov, list.name)).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined); }}>
            {copied ? 'Copied' : 'Copy shopping list'}
          </button>
        </div>
      )}
    </section>
  );
}

function WishlistActions({ index, collection }: { index: PackIndex; collection: Collection }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="actions">
      <button onClick={() => { void navigator.clipboard?.writeText(wishlistText(index, collection)).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined); }}>
        {copied ? 'Copied' : 'Copy wishlist'}
      </button>
    </div>
  );
}
