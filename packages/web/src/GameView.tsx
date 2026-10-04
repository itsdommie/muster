import { useMemo, useState } from 'react';
import {
  canRedo, canUndo, dispatch, finishGame, forceStatus, isDown, opponentStatus, redo, replay, startGame, undo, warbandModels,
  type ArmyList, type Game, type GameEvent, type GameModel, type GameRecord, type PackIndex, type Side, type Stat,
} from '@muster/shared';
import { useWakeLock } from './useWakeLock';

interface Props {
  index: PackIndex;
  lists: ArmyList[];
  games: GameRecord[];
  onGames: (fn: (games: GameRecord[]) => GameRecord[]) => void;
  onInspect: (unitId: string) => void;
}

const listModels = (l: ArmyList): number => l.warbands.reduce((n, w) => n + warbandModels(w), 0);
const date = (t: number): string => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function GameView({ index, lists, games, onGames, onInspect }: Props) {
  const active = games.find((g) => !g.finishedAt);
  const finished = games.filter((g) => g.finishedAt).sort((a, b) => b.finishedAt! - a.finishedAt!);

  return (
    <div className="game-view">
      {active ? (
        <Tracker key={active.id} record={active} onGames={onGames} onInspect={onInspect} />
      ) : (
        <StartCard index={index} lists={lists} onStart={(r) => onGames((all) => [...all, r])} />
      )}
      {finished.length > 0 && <PastGames games={finished} onDelete={(id) => onGames((all) => all.filter((g) => g.id !== id))} />}
    </div>
  );
}

function StartCard({ index, lists, onStart }: { index: PackIndex; lists: ArmyList[]; onStart: (r: GameRecord) => void }) {
  const playable = lists.filter((l) => listModels(l) > 0);
  const [listId, setListId] = useState(playable[0]?.id ?? '');
  const [opponent, setOpponent] = useState('');
  const [opponentModels, setOpponentModels] = useState('');
  const list = playable.find((l) => l.id === listId) ?? playable[0];

  return (
    <section className="panel start-card">
      <div className="panel-head">
        <h2>Start a game</h2>
        <p className="muted small">Pick a list to track. Wounds, Might/Will/Fate, the break point and scoring are tracked for you, and everything is saved so you can pick the game up again.</p>
      </div>
      {playable.length === 0 ? (
        <p className="pad muted">Build a list first (with at least one model) on the Builder tab.</p>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (list) onStart(startGame(index, list, { opponent, opponentStart: Number(opponentModels) || 0 }));
          }}
        >
          <label>
            Your list
            <select value={list?.id ?? ''} onChange={(e) => setListId(e.target.value)}>
              {playable.map((l) => <option key={l.id} value={l.id}>{l.name} ({listModels(l)} models)</option>)}
            </select>
          </label>
          <label>
            Opponent <span className="muted">(optional)</span>
            <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Name" />
          </label>
          <label>
            Their starting models <span className="muted">(optional, sets their break point)</span>
            <input type="number" min={0} inputMode="numeric" value={opponentModels} onChange={(e) => setOpponentModels(e.target.value)} />
          </label>
          <div className="actions flush"><button className="primary" type="submit">Start game</button></div>
        </form>
      )}
    </section>
  );
}

function Stepper({ label, value, onDec, onInc, decLabel, incLabel }: { label: string; value: string | number; onDec: () => void; onInc: () => void; decLabel?: string; incLabel?: string }) {
  return (
    <div className="stepper big" role="group" aria-label={label}>
      <button onClick={onDec} aria-label={decLabel ?? `${label} down`}>−</button>
      <span className="value">{value}</span>
      <button onClick={onInc} aria-label={incLabel ?? `${label} up`}>+</button>
    </div>
  );
}

function Tracker({ record, onGames, onInspect }: { record: GameRecord; onGames: Props['onGames']; onInspect: Props['onInspect'] }) {
  const [showDown, setShowDown] = useState(false);
  const [ending, setEnding] = useState(false);
  useWakeLock(true);

  const game = useMemo(() => replay(record), [record.start, record.events]);
  const me = forceStatus(game);
  const opp = opponentStatus(game);

  const update = (fn: (r: GameRecord) => GameRecord) => onGames((all) => all.map((g) => (g.id === record.id ? fn(g) : g)));
  const send = (e: GameEvent) => update((r) => dispatch(r, e));

  const warbands = useMemo(() => {
    const out = new Map<number, GameModel[]>();
    for (const m of game.models) out.set(m.warband, [...(out.get(m.warband) ?? []), m]);
    return [...out.entries()];
  }, [game.models]);

  return (
    <>
      <div className="game-bar panel" role="toolbar" aria-label="Game controls">
        <div className="bar-item">
          <span className="bar-label">Turn</span>
          <Stepper label="Turn" value={game.turn} onDec={() => send({ t: 'turn', turn: game.turn - 1 })} onInc={() => send({ t: 'turn', turn: game.turn + 1 })} decLabel="Previous turn" incLabel="Next turn" />
        </div>
        <div className="bar-item">
          <span className="bar-label">Priority</span>
          <div className="segmented" role="group" aria-label="Priority">
            {([['me', 'You'], ['opponent', 'Them'], [null, 'None']] as const).map(([side, label]) => (
              <button key={String(side)} className={game.priority === side ? 'on' : ''} aria-pressed={game.priority === side} onClick={() => send({ t: 'priority', side })}>{label}</button>
            ))}
          </div>
        </div>
        {(['me', 'opponent'] as Side[]).map((side) => (
          <div className="bar-item" key={side}>
            <span className="bar-label">{side === 'me' ? 'Your VP' : 'Their VP'}</span>
            <Stepper label={side === 'me' ? 'Your victory points' : 'Opponent victory points'} value={game.vp[side]} onDec={() => send({ t: 'vp', side, n: -1 })} onInc={() => send({ t: 'vp', side, n: 1 })} />
          </div>
        ))}
        <div className="bar-item bar-actions">
          <button onClick={() => update(undo)} disabled={!canUndo(record)}>Undo</button>
          <button onClick={() => update(redo)} disabled={!canRedo(record)}>Redo</button>
          <button onClick={() => setEnding(true)}>End game</button>
        </div>
      </div>

      <div className="game-layout">
        <aside className="game-side">
          <ForceCard title={record.listName} me={me} game={game} />
          <OpponentCard name={record.opponent} opp={opp} onLost={(n) => send({ t: 'opp-lost', n })} onStart={(n) => send({ t: 'opp-start', n })} />
          <details className="panel log">
            <summary>Game log ({game.log.length})</summary>
            {game.log.length === 0 ? <p className="muted small pad">Nothing yet.</p> : (
              <ol reversed>{[...game.log].reverse().map((l, i) => <li key={i}><span className="badge">T{l.turn}</span> {l.text}</li>)}</ol>
            )}
          </details>
          <label className="panel notes">
            <span className="bar-label">Notes</span>
            <textarea rows={4} value={record.notes} onChange={(e) => update((r) => ({ ...r, notes: e.target.value }))} placeholder="Scenario, objectives, things to remember…" />
          </label>
        </aside>

        <div className="game-main">
          <label className="toggle">
            <input type="checkbox" checked={showDown} onChange={(e) => setShowDown(e.target.checked)} /> Show casualties
          </label>
          {warbands.map(([wi, models]) => {
            const live = models.filter((m) => !isDown(m)).length;
            return (
              <section key={wi} className="panel warband-game">
                <header>
                  <h3>Warband {wi + 1}</h3>
                  <span className="muted small">{live}/{models.length} standing</span>
                </header>
                <ul className="models">
                  {models.filter((m) => showDown || !isDown(m)).map((m) => (
                    <ModelRow key={m.id} model={m} onSend={send} onInspect={onInspect} />
                  ))}
                  {live === 0 && !showDown && <li className="muted small pad">The whole warband is down.</li>}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {ending && (
        <div className="modal-backdrop" onClick={() => setEnding(false)}>
          <div className="modal" role="dialog" aria-label="End game" onClick={(e) => e.stopPropagation()}>
            <header><h2>End this game?</h2><button className="icon" onClick={() => setEnding(false)} aria-label="Close">×</button></header>
            <p>Final score: <strong>{game.vp.me}</strong> – <strong>{game.vp.opponent}</strong> victory points. {me.broken ? 'Your force is broken. ' : ''}{opp.broken ? 'Their force is broken.' : ''}</p>
            <div className="actions flush">
              <button className="primary" onClick={() => update((r) => finishGame(r))}>Finish and save</button>
              <button onClick={() => onGames((all) => all.filter((g) => g.id !== record.id))}>Discard</button>
              <button onClick={() => setEnding(false)}>Keep playing</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ForceCard({ title, me, game }: { title: string; me: ReturnType<typeof forceStatus>; game: Game }) {
  const pct = me.start ? (me.lost / me.start) * 100 : 0;
  const breakPct = me.start ? (me.breakAt / me.start) * 100 : 0;
  return (
    <section className={`panel force${me.broken ? ' broken' : ''}`} aria-label="Your force">
      <div className="panel-head">
        <h2>{title}</h2>
        <p className="points"><strong>{me.remaining}</strong> / {me.start} <span className="muted small">models standing</span></p>
        <div className="meter break" role="img" aria-label={`${me.lost} of ${me.breakAt} models lost to break`}>
          <div style={{ width: `${Math.min(100, pct)}%` }} />
          <i style={{ left: `${breakPct}%` }} />
        </div>
        <p className={`status ${me.broken ? 'bad' : 'ok'}`} role="status">
          {me.start === 0 ? 'No models' : me.broken ? 'Your force is BROKEN' : `${me.untilBroken} more ${me.untilBroken === 1 ? 'loss' : 'losses'} until broken`}
        </p>
      </div>
      <dl className="facts">
        <div><dt>Lost</dt><dd>{me.lost} / {me.breakAt} to break</dd></div>
        <div><dt>Heroes</dt><dd>{me.heroesRemaining} / {me.heroesStart}</dd></div>
        <div><dt>Bows / throwing</dt><dd>{me.rangedRemaining} / {me.rangedStart}</dd></div>
        <div><dt>Turn</dt><dd>{game.turn}</dd></div>
      </dl>
    </section>
  );
}

function OpponentCard({ name, opp, onLost, onStart }: { name: string; opp: ReturnType<typeof opponentStatus>; onLost: (n: number) => void; onStart: (n: number) => void }) {
  return (
    <section className={`panel force${opp.broken ? ' broken' : ''}`} aria-label="Opponent force">
      <div className="panel-head">
        <h2>{name || 'Opponent'}</h2>
        <div className="opp-row">
          <span>Models lost</span>
          <Stepper label="Opponent models lost" value={opp.lost} onDec={() => onLost(-1)} onInc={() => onLost(1)} />
        </div>
        <div className="opp-row">
          <span>Starting models</span>
          <Stepper label="Opponent starting models" value={opp.start || '?'} onDec={() => onStart(opp.start - 1)} onInc={() => onStart(opp.start + 1)} />
        </div>
        <p className={`status ${opp.broken ? 'bad' : 'muted'}`} role="status">
          {opp.start === 0 ? 'Set their starting models to track their break point' : opp.broken ? 'Their force is BROKEN' : `Breaks at ${opp.breakAt} lost (${Math.max(0, opp.breakAt - opp.lost)} to go)`}
        </p>
      </div>
    </section>
  );
}

function ModelRow({ model: m, onSend, onInspect }: { model: GameModel; onSend: (e: GameEvent) => void; onInspect: (unitId: string) => void }) {
  const down = isDown(m);
  const single = m.wounds.max === 1;
  return (
    <li className={`model${down ? ' down' : ''}`}>
      <div className="model-main">
        <button className="link name" onClick={() => onInspect(m.unit)}>
          {m.label}
          {m.leader && <span className="badge">Leader</span>}
        </button>
        {m.detail.length > 0 && <span className="muted small">{m.detail.join(', ')}</span>}
        <div className="model-wounds">
          {!single && (
            <span className="pips" role="img" aria-label={`${m.wounds.cur} of ${m.wounds.max} wounds`}>
              {Array.from({ length: m.wounds.max }, (_, i) => <span key={i} className={i < m.wounds.cur ? 'pip on' : 'pip'} />)}
            </span>
          )}
          {single ? (
            down
              ? <button onClick={() => onSend({ t: 'wound', model: m.id, n: -1 })} aria-label={`Restore ${m.label}`}>Restore</button>
              : <button className="danger" onClick={() => onSend({ t: 'wound', model: m.id, n: 1 })} aria-label={`Casualty: ${m.label}`}>Casualty</button>
          ) : (
            <>
              <button className="danger" onClick={() => onSend({ t: 'wound', model: m.id, n: 1 })} disabled={down} aria-label={`Wound ${m.label}`}>Wound</button>
              <button onClick={() => onSend({ t: 'wound', model: m.id, n: -1 })} disabled={m.wounds.cur >= m.wounds.max} aria-label={`Heal ${m.label}`}>Heal</button>
              <button onClick={() => onSend({ t: 'wound', model: m.id, n: m.wounds.cur })} disabled={down} aria-label={`Casualty: ${m.label}`} title="Remove as a casualty">✕</button>
            </>
          )}
        </div>
      </div>
      {!down && m.might && (
        <div className="resources">
          {(['might', 'will', 'fate'] as Stat[]).map((s) => {
            const c = m[s]!;
            if (c.max === 0) return null;
            const name = s[0]!.toUpperCase() + s.slice(1);
            return (
              <div key={s} className="resource">
                <span className="small muted">{name}</span>
                <Stepper label={`${m.label} ${name}`} value={`${c.cur}/${c.max}`} onDec={() => onSend({ t: 'spend', model: m.id, stat: s, n: 1 })} onInc={() => onSend({ t: 'spend', model: m.id, stat: s, n: -1 })} decLabel={`Spend ${name}`} incLabel={`Regain ${name}`} />
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}

function PastGames({ games, onDelete }: { games: GameRecord[]; onDelete: (id: string) => void }) {
  return (
    <section className="panel past">
      <div className="panel-head"><h2>Past games</h2></div>
      <ul className="rows">
        {games.map((r) => {
          const g = replay(r);
          const me = forceStatus(g);
          const opp = opponentStatus(g);
          const result = g.vp.me === g.vp.opponent ? 'Drawn' : g.vp.me > g.vp.opponent ? 'Won' : 'Lost';
          return (
            <li key={r.id}>
              <span className="grow">
                <strong>{r.name}</strong>{r.opponent && <> vs {r.opponent}</>}
                <span className="muted small block">
                  {date(r.finishedAt!)} · {g.vp.me}–{g.vp.opponent} VP · {result}
                  {me.broken && ' · you broke'}{opp.broken && ' · they broke'} · {r.events.length} events
                </span>
              </span>
              <button className="icon" onClick={() => { if (window.confirm(`Delete the record of "${r.name}"?`)) onDelete(r.id); }} aria-label={`Delete ${r.name}`}>🗑</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
