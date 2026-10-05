import { useEffect, useMemo, useState } from 'react';
import {
  emptyTally, fightOdds, mergeTallies, simulateSquads,
  type Combat, type Combatant, type Group, type PackIndex, type SquadTally, type Unit,
} from '@muster/shared';

type Mode = 'single' | 'squad';
type StatKey = 'fight' | 'attacks' | 'strength' | 'defence' | 'wounds' | 'fate' | 'might' | 'duelModifier';

interface GroupState {
  key: number;
  /** Pack unit the stats were copied from, or '' for a custom model. */
  unit: string;
  stats: Required<Pick<Combatant, StatKey>> & { name: string };
  count: number;
}

const FIELDS: { key: StatKey; label: string; title: string }[] = [
  { key: 'fight', label: 'F', title: 'Fight' },
  { key: 'attacks', label: 'A', title: 'Attacks' },
  { key: 'strength', label: 'S', title: 'Strength' },
  { key: 'defence', label: 'D', title: 'Defence' },
  { key: 'wounds', label: 'W', title: 'Wounds' },
  { key: 'fate', label: 'Fate', title: 'Fate points' },
  { key: 'might', label: 'Might', title: 'Might points' },
  { key: 'duelModifier', label: '±Duel', title: 'Bonus or penalty added to this model\'s duel roll every round' },
];

const RUNS = 6000;
const BATCH = 500;

let nextKey = 1;
const fromUnit = (u: Unit): GroupState => ({
  key: nextKey++,
  unit: u.id,
  stats: {
    name: u.name, fight: u.stats.fight, attacks: u.stats.attacks, strength: u.stats.strength, defence: u.stats.defence,
    wounds: u.stats.wounds, fate: u.stats.fate, might: u.stats.might, duelModifier: 0,
  },
  count: 1,
});

const combatant = (g: GroupState): Combatant => ({ ...g.stats });
const pct = (x: number): string => (x > 0 && x < 0.0005 ? '<0.1%' : `${(x * 100).toFixed(1)}%`);

export function FightView({ index }: { index: PackIndex }) {
  const combat = index.pack.ruleset.combat;
  if (!combat) {
    return (
      <section className="panel pad">
        <h2>Fight calculator</h2>
        <p className="muted">This data pack does not define combat rules, so there is nothing to calculate with. Add a <code>ruleset.combat</code> section (see <code>docs/pack-format.md</code>) to enable it.</p>
      </section>
    );
  }
  return <Calculator index={index} combat={combat} />;
}

function Calculator({ index, combat }: { index: PackIndex; combat: Combat }) {
  const units = useMemo(() => [...index.pack.units].sort((a, b) => a.name.localeCompare(b.name)), [index]);
  const [mode, setMode] = useState<Mode>('single');
  const [a, setA] = useState<GroupState[]>(() => [fromUnit(units[0]!)]);
  const [b, setB] = useState<GroupState[]>(() => [fromUnit(units[Math.min(1, units.length - 1)]!)]);
  const [supportA, setSupportA] = useState(0);
  const [supportB, setSupportB] = useState(0);
  const [mightA, setMightA] = useState(0);
  const [mightB, setMightB] = useState(0);
  const [stopAtBreak, setStopAtBreak] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));

  const groupsA: Group[] = useMemo(() => a.map((g) => ({ combatant: combatant(g), count: g.count })), [a]);
  const groupsB: Group[] = useMemo(() => b.map((g) => ({ combatant: combatant(g), count: g.count })), [b]);
  const singleA = useMemo(() => combatant(a[0]!), [a]);
  const singleB = useMemo(() => combatant(b[0]!), [b]);
  const modelsA = a.reduce((n, g) => n + g.count, 0);
  const modelsB = b.reduce((n, g) => n + g.count, 0);

  return (
    <div className="fight-view">
      <section className="panel">
        <div className="panel-head">
          <h2>Fight calculator</h2>
          <div className="segmented" role="tablist" aria-label="Calculator mode">
            <button role="tab" aria-selected={mode === 'single'} className={mode === 'single' ? 'on' : ''} onClick={() => setMode('single')}>One on one (exact)</button>
            <button role="tab" aria-selected={mode === 'squad'} className={mode === 'squad' ? 'on' : ''} onClick={() => setMode('squad')}>Squad vs squad (simulated)</button>
          </div>
          <p className="muted small">
            {mode === 'single'
              ? 'Follows the fight round by round and gives exact odds.'
              : `Fights ${RUNS.toLocaleString()} battles dice by dice. Models are paired off each round and spare models support their side's pairs.`}
          </p>
        </div>
      </section>

      <div className="sides">
        <SideEditor
          title="Side A" units={units} groups={a} onGroups={setA} squad={mode === 'squad'}
          might={mightA} onMight={setMightA} support={supportA} onSupport={setSupportA} hasMight={!!combat.might} supportBonus={combat.supportBonus}
        />
        <SideEditor
          title="Side B" units={units} groups={b} onGroups={setB} squad={mode === 'squad'}
          might={mightB} onMight={setMightB} support={supportB} onSupport={setSupportB} hasMight={!!combat.might} supportBonus={combat.supportBonus}
        />
      </div>

      {mode === 'single' ? (
        <SingleResult combat={combat} a={singleA} b={singleB} supportA={supportA} supportB={supportB} mightA={mightA} mightB={mightB} />
      ) : (
        <SquadResult
          combat={combat} groupsA={groupsA} groupsB={groupsB} modelsA={modelsA} modelsB={modelsB} mightA={mightA} mightB={mightB}
          breakFraction={stopAtBreak ? index.pack.ruleset.break : undefined} stopAtBreak={stopAtBreak} onStopAtBreak={setStopAtBreak}
          seed={seed} onReroll={() => setSeed(Math.floor(Math.random() * 2 ** 31))}
        />
      )}

      <p className="muted small fight-note">
        The calculator follows this pack's combat rules in a simplified round: a duel, then strikes, wound rolls and Fate saves. Positioning, Heroic actions
        and in-the-moment choices are not modelled, so treat the numbers as a guide.
      </p>
    </div>
  );
}

function SideEditor(props: {
  title: string; units: Unit[]; groups: GroupState[]; onGroups: (g: GroupState[]) => void; squad: boolean;
  might: number; onMight: (n: number) => void; support: number; onSupport: (n: number) => void; hasMight: boolean; supportBonus: number;
}) {
  const { title, units, groups, onGroups, squad } = props;
  const shown = squad ? groups : groups.slice(0, 1);
  const update = (key: number, fn: (g: GroupState) => GroupState) => onGroups(groups.map((g) => (g.key === key ? fn(g) : g)));

  return (
    <section className="panel side" aria-label={title}>
      <div className="panel-head"><h3>{title}</h3></div>
      {shown.map((g, i) => (
        <div className="group" key={g.key}>
          <div className="group-top">
            <select
              aria-label={`${title} model ${i + 1}`} value={g.unit}
              onChange={(e) => {
                const u = units.find((x) => x.id === e.target.value);
                if (u) update(g.key, (old) => ({ ...fromUnit(u), key: old.key, count: old.count }));
                else update(g.key, (old) => ({ ...old, unit: '', stats: { ...old.stats, name: 'Custom model' } }));
              }}
            >
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              <option value="">Custom model</option>
            </select>
            {squad && (
              <label className="count">
                ×
                <input
                  type="number" min={0} max={100} inputMode="numeric" aria-label={`${title} model ${i + 1} count`} value={g.count}
                  onChange={(e) => update(g.key, (old) => ({ ...old, count: Math.min(100, Math.max(0, Math.floor(Number(e.target.value) || 0))) }))}
                />
              </label>
            )}
            {squad && groups.length > 1 && <button className="icon" aria-label={`Remove ${title} model ${i + 1}`} onClick={() => onGroups(groups.filter((x) => x.key !== g.key))}>×</button>}
          </div>
          <div className="stat-grid">
            {FIELDS.filter((f) => props.hasMight || (f.key !== 'might')).map((f) => (
              <label key={f.key} title={f.title}>
                <span>{f.label}</span>
                <input
                  type="number" inputMode="numeric" aria-label={`${title} model ${i + 1} ${f.title}`}
                  min={f.key === 'duelModifier' ? -10 : 0} max={20} value={g.stats[f.key]}
                  onChange={(e) => {
                    const raw = Math.floor(Number(e.target.value) || 0);
                    const min = f.key === 'duelModifier' ? -10 : f.key === 'wounds' ? 1 : 0;
                    update(g.key, (old) => ({ ...old, unit: old.unit, stats: { ...old.stats, [f.key]: Math.min(20, Math.max(min, raw)) } }));
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      {squad && <div className="actions"><button onClick={() => onGroups([...groups, fromUnit(units[0]!)])}>+ Add model type</button></div>}
      <div className="side-opts">
        {props.hasMight && (
          <label>
            Might spent per round
            <input type="number" min={0} max={9} inputMode="numeric" aria-label={`${title} Might per round`} value={props.might} onChange={(e) => props.onMight(Math.min(9, Math.max(0, Math.floor(Number(e.target.value) || 0))))} />
          </label>
        )}
        {!squad && props.supportBonus > 0 && (
          <label>
            Supporting models
            <input type="number" min={0} max={20} inputMode="numeric" aria-label={`${title} supporting models`} value={props.support} onChange={(e) => props.onSupport(Math.min(20, Math.max(0, Math.floor(Number(e.target.value) || 0))))} />
          </label>
        )}
      </div>
    </section>
  );
}

function OutcomeBar({ aLabel, bLabel, a, b, rest }: { aLabel: string; bLabel: string; a: number; b: number; rest: number }) {
  return (
    <div>
      <div className="outcome" role="img" aria-label={`${aLabel} wins ${pct(a)}, ${bLabel} wins ${pct(b)}${rest > 0.0005 ? `, neither ${pct(rest)}` : ''}`}>
        <div className="seg a" style={{ width: `${a * 100}%` }} />
        <div className="seg rest" style={{ width: `${rest * 100}%` }} />
        <div className="seg b" style={{ width: `${b * 100}%` }} />
      </div>
      <div className="outcome-legend">
        <span><i className="dot a" /> <strong>{pct(a)}</strong> {aLabel} wins</span>
        {rest > 0.0005 && <span><i className="dot rest" /> <strong>{pct(rest)}</strong> neither</span>}
        <span><i className="dot b" /> <strong>{pct(b)}</strong> {bLabel} wins</span>
      </div>
    </div>
  );
}

function Histogram({ title, counts, total }: { title: string; counts: number[]; total: number }) {
  const max = Math.max(1, ...counts);
  return (
    <figure className="histo">
      <figcaption>{title}</figcaption>
      <div className="bars" role="list">
        {counts.map((c, n) => (
          <div key={n} role="listitem" className="bar" title={`${n}: ${pct(c / total)}`} aria-label={`${n} left: ${pct(c / total)}`}>
            <span className="fill" style={{ height: `${(c / max) * 100}%` }} />
            <span className="lab">{n}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function SingleResult({ combat, a, b, supportA, supportB, mightA, mightB }: { combat: Combat; a: Combatant; b: Combatant; supportA: number; supportB: number; mightA: number; mightB: number }) {
  const r = useMemo(
    () => fightOdds(combat, a, b, { supportA, supportB, mightPerRoundA: mightA, mightPerRoundB: mightB }),
    [combat, a, b, supportA, supportB, mightA, mightB],
  );
  const f = r.firstRound;
  const wl = (v: number[]) => v.map((p, n) => ({ n, p })).filter((x) => x.n > 0 && x.p >= 0.0005);

  return (
    <section className="panel results-panel" aria-label="Result">
      <div className="panel-head">
        <h3>Who wins the fight</h3>
        <OutcomeBar aLabel={a.name} bLabel={b.name} a={r.aWins} b={r.bWins} rest={r.unresolved} />
        <p className="muted small" role="status">
          Takes about {r.expectedRounds.toFixed(1)} round{r.expectedRounds >= 1.05 ? 's' : ''} on average{r.unresolved > 0.0005 ? ` (some fights are still going after the cut-off)` : ''}.
        </p>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="First-round odds table">
        <table className="results-table first-round">
          <caption className="small muted">The first round</caption>
          <thead><tr><th className="name-col" /><th>{a.name}</th><th>{b.name}</th></tr></thead>
          <tbody>
            <tr><th scope="row" className="name-col">Wins the duel</th><td>{pct(f.aWinsDuel)}</td><td>{pct(f.bWinsDuel)}</td></tr>
            <tr><th scope="row" className="name-col">Strikes if it wins</th><td>{f.aStrikes}</td><td>{f.bStrikes}</td></tr>
            <tr><th scope="row" className="name-col">Each strike wounds</th><td>{pct(f.aWoundChance)}</td><td>{pct(f.bWoundChance)}</td></tr>
            <tr><th scope="row" className="name-col">Wounds dealt (expected)</th><td>{f.expectedDamageToB.toFixed(2)}</td><td>{f.expectedDamageToA.toFixed(2)}</td></tr>
            <tr><th scope="row" className="name-col">Defeats the other this round</th><td>{pct(f.aKillsB)}</td><td>{pct(f.bKillsA)}</td></tr>
          </tbody>
        </table>
      </div>
      {(a.wounds > 1 || b.wounds > 1) && (
        <div className="histos">
          <Histogram title={`${a.name}: wounds left if it wins`} counts={Array.from({ length: a.wounds + 1 }, (_, n) => r.aWoundsLeftWhenWinning[n] ?? 0)} total={1} />
          <Histogram title={`${b.name}: wounds left if it wins`} counts={Array.from({ length: b.wounds + 1 }, (_, n) => r.bWoundsLeftWhenWinning[n] ?? 0)} total={1} />
        </div>
      )}
      <details className="how pad">
        <summary>Show the working</summary>
        <ul className="small">
          {wl(r.aWoundsLeftWhenWinning).map((x) => <li key={`a${x.n}`}>{a.name} wins with {x.n} wound{x.n === 1 ? '' : 's'} left: {pct(x.p)}</li>)}
          {wl(r.bWoundsLeftWhenWinning).map((x) => <li key={`b${x.n}`}>{b.name} wins with {x.n} wound{x.n === 1 ? '' : 's'} left: {pct(x.p)}</li>)}
        </ul>
      </details>
    </section>
  );
}

function SquadResult(props: {
  combat: Combat; groupsA: Group[]; groupsB: Group[]; modelsA: number; modelsB: number; mightA: number; mightB: number;
  breakFraction: number | undefined; stopAtBreak: boolean; onStopAtBreak: (v: boolean) => void; seed: number; onReroll: () => void;
}) {
  const { combat, groupsA, groupsB, modelsA, modelsB, mightA, mightB, breakFraction, seed } = props;
  const [tally, setTally] = useState<SquadTally | null>(null);
  const empty = modelsA === 0 || modelsB === 0;

  useEffect(() => {
    if (empty) { setTally(null); return; }
    let cancelled = false;
    setTally(null);
    void (async () => {
      await new Promise((r) => setTimeout(r, 200)); // let typing settle before starting
      let t = emptyTally(modelsA, modelsB);
      for (let done = 0; done < RUNS && !cancelled; done += BATCH) {
        t = mergeTallies(t, simulateSquads(combat, groupsA, groupsB, { runs: BATCH, seed: seed + done, mightPerRoundA: mightA, mightPerRoundB: mightB, ...(breakFraction !== undefined ? { breakFraction } : {}) }));
        if (!cancelled) setTally(t);
        await new Promise((r) => setTimeout(r, 0)); // yield so the page stays responsive
      }
    })();
    return () => { cancelled = true; };
  }, [combat, groupsA, groupsB, modelsA, modelsB, mightA, mightB, breakFraction, seed, empty]);

  if (empty) return <section className="panel pad"><p className="muted">Give both sides at least one model.</p></section>;
  if (!tally || tally.runs === 0) return <section className="panel pad" aria-busy="true"><p className="muted" role="status">Fighting…</p></section>;

  const n = tally.runs;
  const mean = (hist: number[]) => hist.reduce((s, v, i) => s + v * i, 0) / n;
  const done = n >= RUNS;
  return (
    <section className="panel results-panel" aria-label="Result">
      <div className="panel-head">
        <h3>Who wins the fight</h3>
        <OutcomeBar aLabel="Side A" bLabel="Side B" a={tally.aWins / n} b={tally.bWins / n} rest={tally.draws / n} />
        <p className="muted small" role="status">
          {done ? `${n.toLocaleString()} battles` : `${n.toLocaleString()} of ${RUNS.toLocaleString()} battles…`} · about {(tally.totalRounds / n).toFixed(1)} rounds each
          {tally.draws > 0 ? ` · ${pct(tally.draws / n)} still undecided after 40 rounds` : ''}
        </p>
      </div>
      <dl className="facts">
        <div><dt>Side A models left (average)</dt><dd>{mean(tally.aSurvivors).toFixed(1)} of {modelsA}</dd></div>
        <div><dt>Side B models left (average)</dt><dd>{mean(tally.bSurvivors).toFixed(1)} of {modelsB}</dd></div>
        {breakFraction !== undefined && <div><dt>Side A broke</dt><dd>{pct(tally.aBroke / n)}</dd></div>}
        {breakFraction !== undefined && <div><dt>Side B broke</dt><dd>{pct(tally.bBroke / n)}</dd></div>}
      </dl>
      <div className="histos">
        <Histogram title="Side A: models left at the end" counts={tally.aSurvivors} total={n} />
        <Histogram title="Side B: models left at the end" counts={tally.bSurvivors} total={n} />
      </div>
      <div className="actions">
        <label className="toggle"><input type="checkbox" checked={props.stopAtBreak} onChange={(e) => props.onStopAtBreak(e.target.checked)} /> Stop when a side breaks</label>
        <button onClick={props.onReroll}>Roll again</button>
      </div>
    </section>
  );
}
