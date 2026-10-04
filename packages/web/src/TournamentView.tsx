import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_CONFIG, addPlayer, currentRound, finish, isBye, isDecided, newTournament, playerName, recommendedRounds, removeLastRound,
  removePlayer, roundComplete, setDropped, setResult, clearResult, standings, standingsText, startRound,
  type Pairing, type Round, type Tournament,
} from '@muster/shared';

interface Props {
  tournaments: Tournament[];
  onTournaments: (fn: (all: Tournament[]) => Tournament[]) => void;
}

export function TournamentView({ tournaments, onTournaments }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const active = tournaments.find((t) => t.id === selectedId) ?? tournaments.at(-1);

  if (!active || creating) {
    return (
      <div className="tournament">
        <NewTournament
          canCancel={!!active}
          onCancel={() => setCreating(false)}
          onCreate={(t) => { onTournaments((all) => [...all, t]); setSelectedId(t.id); setCreating(false); }}
        />
      </div>
    );
  }

  const update = (fn: (t: Tournament) => Tournament) => onTournaments((all) => all.map((t) => (t.id === active.id ? fn(t) : t)));

  return (
    <div className="tournament">
      <div className="panel">
        <div className="panel-head row-controls">
          <label className="inline">
            Event
            <select value={active.id} onChange={(e) => setSelectedId(e.target.value)} aria-label="Tournament">
              {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button onClick={() => setCreating(true)}>New tournament</button>
          <button onClick={() => { if (window.confirm(`Delete "${active.name}" and all its results?`)) { onTournaments((all) => all.filter((t) => t.id !== active.id)); setSelectedId(null); } }}>Delete</button>
        </div>
      </div>
      <Event key={active.id} t={active} update={update} />
    </div>
  );
}

function NewTournament({ canCancel, onCancel, onCreate }: { canCancel: boolean; onCancel: () => void; onCreate: (t: Tournament) => void }) {
  const [name, setName] = useState('');
  const [players, setPlayers] = useState('');
  const names = useMemo(() => players.split('\n').map((s) => s.trim()).filter(Boolean), [players]);
  const [rounds, setRounds] = useState<string>('');
  const [win, setWin] = useState(String(DEFAULT_CONFIG.win));
  const [draw, setDraw] = useState(String(DEFAULT_CONFIG.draw));
  const [loss, setLoss] = useState(String(DEFAULT_CONFIG.loss));
  const [byeVp, setByeVp] = useState(String(DEFAULT_CONFIG.byeVp));
  const num = (s: string, fallback: number) => (s.trim() === '' || Number.isNaN(Number(s)) ? fallback : Math.max(0, Math.floor(Number(s))));
  const recommended = recommendedRounds(names.length);
  const dupes = names.length !== new Set(names.map((n) => n.toLowerCase())).size;

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (names.length < 2) return;
        onCreate(newTournament(name, names, { rounds: Math.max(1, num(rounds, recommended)), win: num(win, 3), draw: num(draw, 1), loss: num(loss, 0), byeVp: num(byeVp, 0) }));
      }}
    >
      <div className="panel-head"><h2>New tournament</h2><p className="muted small">Swiss pairings: each round you play someone on a similar record, and nobody is knocked out.</p></div>
      <div className="form">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday night" /></label>
        <label>
          Players, one per line
          <textarea rows={8} value={players} onChange={(e) => setPlayers(e.target.value)} placeholder={'Ann\nBob\nCat\nDan'} />
        </label>
        <p className="muted small" role="status">
          {names.length} player{names.length === 1 ? '' : 's'}{names.length >= 2 ? ` · ${recommended} round${recommended === 1 ? '' : 's'} recommended` : ' · add at least two'}
          {names.length % 2 === 1 && names.length > 2 ? ' · odd number, so one player gets a bye each round' : ''}
        </p>
        {dupes && <p className="issue warning">Two players share a name. That works, but standings will be hard to read.</p>}
        <div className="stat-grid">
          <label>Rounds<input type="number" min={1} inputMode="numeric" value={rounds} placeholder={String(recommended)} onChange={(e) => setRounds(e.target.value)} aria-label="Rounds" /></label>
          <label>Win pts<input type="number" min={0} inputMode="numeric" value={win} onChange={(e) => setWin(e.target.value)} aria-label="Points for a win" /></label>
          <label>Draw pts<input type="number" min={0} inputMode="numeric" value={draw} onChange={(e) => setDraw(e.target.value)} aria-label="Points for a draw" /></label>
          <label>Loss pts<input type="number" min={0} inputMode="numeric" value={loss} onChange={(e) => setLoss(e.target.value)} aria-label="Points for a loss" /></label>
          <label>Bye VP<input type="number" min={0} inputMode="numeric" value={byeVp} onChange={(e) => setByeVp(e.target.value)} aria-label="Victory points for a bye" /></label>
        </div>
        <div className="actions flush">
          <button className="primary" type="submit" disabled={names.length < 2}>Create tournament</button>
          {canCancel && <button type="button" onClick={onCancel}>Cancel</button>}
        </div>
      </div>
    </form>
  );
}

function Event({ t, update }: { t: Tournament; update: (fn: (t: Tournament) => Tournament) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newName, setNewName] = useState('');
  const rows = useMemo(() => standings(t), [t]);
  const round = currentRound(t);
  const done = t.rounds.filter(roundComplete).length;
  const canStart = !t.finished && t.rounds.length < t.config.rounds && (!round || roundComplete(round));

  const next = () => {
    const r = startRound(t);
    if (!r.ok) { setMessage(r.reason); return; }
    setMessage(r.rematches > 0 ? `Not everyone could be kept away from someone they've played: ${r.rematches} rematch${r.rematches === 1 ? '' : 'es'} in this round.` : null);
    update(() => r.tournament);
  };

  return (
    <>
      <section className="panel" aria-label="Progress">
        <div className="panel-head">
          <h2>{t.name}</h2>
          <p className="muted small" role="status">
            {t.finished ? 'Finished' : `${done} of ${t.config.rounds} rounds played`} · {t.players.filter((p) => !p.dropped).length} players in
          </p>
          <div className="actions flush">
            {canStart && <button className="primary" onClick={next}>{t.rounds.length === 0 ? 'Start round 1' : `Start round ${t.rounds.length + 1}`}</button>}
            {!t.finished && t.rounds.length >= t.config.rounds && round && roundComplete(round) && (
              <button className="primary" onClick={() => update(finish)}>Finish tournament</button>
            )}
            {!t.finished && round && <button onClick={() => { if (window.confirm(`Throw away round ${round.number}, including its results?`)) update(removeLastRound); }}>Undo round {round.number}</button>}
            {!t.finished && t.rounds.length >= t.config.rounds && (
              <button onClick={() => update((x) => ({ ...x, config: { ...x.config, rounds: x.config.rounds + 1 } }))}>Add a round</button>
            )}
            {t.finished && <button onClick={() => update((x) => ({ ...x, finished: false }))}>Reopen</button>}
            <button onClick={() => { void navigator.clipboard?.writeText(standingsText(t)).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined); }}>{copied ? 'Copied' : 'Copy standings'}</button>
          </div>
          {message && <p className="issue warning" role="alert">{message}</p>}
        </div>
      </section>

      {[...t.rounds].reverse().map((r) => (
        <RoundCard key={r.number} t={t} round={r} open={r.number === round?.number} update={update} />
      ))}

      <section className="panel" aria-label="Standings">
        <div className="panel-head"><h3>Standings</h3></div>
        <div className="table-wrap">
          <table className="results-table standings">
            <thead><tr><th>#</th><th className="name-col">Player</th><th>Pts</th><th>W-D-L</th><th>VP</th><th>±</th><th title="Strength of schedule: the average points of opponents played">SoS</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.player.id} className={r.player.dropped ? 'dropped' : ''}>
                  <td>{r.rank}</td>
                  <td className="name-col">{r.player.name}{r.player.dropped && <span className="badge">dropped</span>}</td>
                  <td><strong>{r.points}</strong></td><td>{r.wins}-{r.draws}-{r.losses}</td><td>{r.vpFor}</td>
                  <td>{r.vpDiff > 0 ? `+${r.vpDiff}` : r.vpDiff}</td><td>{r.sos.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-label="Players">
        <div className="panel-head">
          <h3>Players</h3>
          <form className="row-controls" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) { update((x) => addPlayer(x, newName)); setNewName(''); } }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a player" aria-label="New player name" />
            <button type="submit" disabled={!newName.trim()}>Add</button>
          </form>
          <p className="muted small">New players join from the next round. If someone leaves, drop them: their results stay and they won't be paired again.</p>
        </div>
        <ul className="rows">
          {t.players.map((p) => {
            const played = t.rounds.some((r) => r.pairings.some((x) => x.a === p.id || x.b === p.id));
            return (
              <li key={p.id}>
                <span className="grow">{p.name}{p.dropped && <span className="badge">dropped</span>}</span>
                <button onClick={() => update((x) => setDropped(x, p.id, !p.dropped))}>{p.dropped ? 'Back in' : 'Drop'}</button>
                {!played && <button className="icon" aria-label={`Remove ${p.name}`} onClick={() => update((x) => removePlayer(x, p.id))}>×</button>}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function RoundCard({ t, round, open, update }: { t: Tournament; round: Round; open: boolean; update: (fn: (t: Tournament) => Tournament) => void }) {
  const complete = roundComplete(round);
  return (
    <details className="panel round" open={open} aria-label={`Round ${round.number}`}>
      <summary><h3>Round {round.number}</h3> <span className="muted small">{complete ? 'complete' : `${round.pairings.filter((p) => !isDecided(p)).length} to play`}</span></summary>
      <ul className="pairings">
        {round.pairings.map((p) => <PairingRow key={`${round.number}-${p.table}`} t={t} round={round} pairing={p} update={update} />)}
      </ul>
    </details>
  );
}

function PairingRow({ t, round, pairing: p, update }: { t: Tournament; round: Round; pairing: Pairing; update: (fn: (t: Tournament) => Tournament) => void }) {
  const [a, setA] = useState(p.vpA === null ? '' : String(p.vpA));
  const [b, setB] = useState(p.vpB === null ? '' : String(p.vpB));
  // Follow a result that is set from elsewhere. A result being cleared does not reset the boxes: the person is mid-edit.
  useEffect(() => {
    if (p.vpA !== null && p.vpB !== null) { setA(String(p.vpA)); setB(String(p.vpB)); }
  }, [p.vpA, p.vpB]);
  const nameA = playerName(t, p.a);
  const nameB = playerName(t, p.b);

  if (isBye(p)) {
    return <li className="pairing bye"><span className="table-no">Bye</span><span className="grow">{nameA} has a bye (counts as a win)</span></li>;
  }
  // A result needs both scores. Typing one score waits for the other; clearing either takes the result back.
  const commit = (x: string, y: string) => {
    if (x.trim() !== '' && y.trim() !== '' && !Number.isNaN(Number(x)) && !Number.isNaN(Number(y)) && Number(x) >= 0 && Number(y) >= 0) update((z) => setResult(z, round.number, p.table, Number(x), Number(y)));
    else if (isDecided(p)) update((z) => clearResult(z, round.number, p.table));
  };
  const winner = isDecided(p) ? (p.vpA! > p.vpB! ? nameA : p.vpA! < p.vpB! ? nameB : null) : undefined;

  return (
    <li className="pairing">
      <span className="table-no">Table {p.table}</span>
      <span className="side"><span className="pname">{nameA}</span>
        <input type="number" min={0} inputMode="numeric" value={a} aria-label={`${nameA} victory points, round ${round.number}`} onChange={(e) => { setA(e.target.value); commit(e.target.value, b); }} />
      </span>
      <span className="muted">vs</span>
      <span className="side">
        <input type="number" min={0} inputMode="numeric" value={b} aria-label={`${nameB} victory points, round ${round.number}`} onChange={(e) => { setB(e.target.value); commit(a, e.target.value); }} />
        <span className="pname">{nameB}</span>
      </span>
      <span className="result small muted">{winner === undefined ? '' : winner === null ? 'Draw' : `${winner} wins`}</span>
    </li>
  );
}
