import { entryCost, warbandCost, warbandEntries, type ArmyList, type PackIndex, type Validation } from '@muster/shared';
import { StatLine } from './UnitCard';

/** Hidden on screen; shown by the print stylesheet so "Print / PDF" gives a clean table-side sheet. */
export function PrintSheet({ index, list, validation }: { index: PackIndex; list: ArmyList; validation: Validation }) {
  const s = validation.summary;
  return (
    <div id="print-sheet">
      <h1>{list.name}</h1>
      <p>
        {index.armies.get(list.army)?.name} · {s.points}/{s.limit} points · {s.models} models · broken at {s.breakAt} lost
      </p>
      {list.warbands.map((w, i) => (
        <section key={w.id}>
          <h2>
            Warband {i + 1} ({warbandCost(index, w)} pts)
            {w.army !== list.army && ` · ${index.armies.get(w.army)?.name}`}
          </h2>
          {warbandEntries(w).map((e, j) => {
            const unit = index.units.get(e.unit);
            if (!unit) return null;
            const opts = e.options.map((o) => unit.options.find((x) => x.id === o)?.name).filter(Boolean);
            return (
              <div key={j} className="print-entry">
                <div className="print-title">
                  <strong>{e.count > 1 ? `${e.count}× ` : ''}{unit.name}</strong>
                  {opts.length > 0 && ` (${opts.join(', ')})`} <span>{entryCost(index, e)} pts</span>
                </div>
                <StatLine unit={unit} />
                {unit.rules.length > 0 && (
                  <p className="small">{unit.rules.map((r) => index.rules.get(r)?.name ?? r).join(', ')}</p>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
