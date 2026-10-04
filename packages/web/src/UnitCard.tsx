import type { PackIndex, Unit } from '@muster/shared';
import { armiesOfUnit } from '@muster/shared';

export function StatLine({ unit }: { unit: Unit }) {
  const s = unit.stats;
  const cells: [string, string | number][] = [
    ['M', `${s.move}"`],
    ['F', s.fight],
    ['Sh', s.shoot ? `${s.shoot}+` : '-'],
    ['S', s.strength],
    ['D', s.defence],
    ['A', s.attacks],
    ['W', s.wounds],
    ['C', s.courage],
  ];
  if (unit.kind === 'hero') cells.push(['Mi', s.might], ['Wi', s.will], ['Fa', s.fate]);
  return (
    <table className="stats">
      <thead>
        <tr>{cells.map(([k]) => <th key={k}>{k}</th>)}</tr>
      </thead>
      <tbody>
        <tr>{cells.map(([k, v]) => <td key={k}>{v}</td>)}</tr>
      </tbody>
    </table>
  );
}

interface DetailProps {
  index: PackIndex;
  unit: Unit;
  /** Jump to a rule in the reference. */
  onRule?: (ruleId: string) => void;
}

/** A full unit profile: stats, kit, options, and every rule it has, spelled out. */
export function UnitDetail({ index, unit, onRule }: DetailProps) {
  const armies = armiesOfUnit(index, unit.id);
  return (
    <div className="unit-detail">
      <h2>{unit.name}</h2>
      <div className="muted">
        {unit.kind === 'hero' ? (unit.tier ?? 'Hero') : 'Warrior'} · {unit.cost} pts
        {unit.unique && ' · Unique'}
      </div>
      <StatLine unit={unit} />
      {unit.keywords.length > 0 && <p className="tags">{unit.keywords.map((k) => <span key={k}>{k}</span>)}</p>}
      {armies.length > 0 && (
        <p>
          <strong>Armies:</strong> {armies.map((a) => (a.max ? `${a.name} (max ${a.max})` : a.name)).join(', ')}
        </p>
      )}
      {unit.wargear.length > 0 && (
        <p><strong>Wargear:</strong> {unit.wargear.map((w) => index.wargear.get(w)?.name ?? w).join(', ')}</p>
      )}
      {unit.options.length > 0 && (
        <p><strong>Options:</strong> {unit.options.map((o) => `${o.name} (+${o.cost})`).join(', ')}</p>
      )}
      {unit.rules.map((r) => {
        const rule = index.rules.get(r);
        if (!rule) return null;
        return (
          <p key={r}>
            {onRule ? <button className="link rule-link" onClick={() => onRule(r)}>{rule.name}</button> : <strong>{rule.name}</strong>}
            {'. '}{rule.text}
          </p>
        );
      })}
      {unit.warband && (
        <p className="muted">
          Leads up to {unit.warband.size ?? index.pack.ruleset.warbandSize} warriors
          {unit.warband.allowed && <>: {unit.warband.allowed.map((a) => index.units.get(a)?.name ?? a).join(', ')} only</>}.
        </p>
      )}
      {unit.notes && <p className="muted">{unit.notes}</p>}
    </div>
  );
}

export function UnitCard({ index, unit, onClose, onRule }: DetailProps & { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={unit.name} onClick={(e) => e.stopPropagation()}>
        <button className="icon modal-close" onClick={onClose} aria-label="Close">×</button>
        <UnitDetail index={index} unit={unit} onRule={onRule} />
      </div>
    </div>
  );
}
