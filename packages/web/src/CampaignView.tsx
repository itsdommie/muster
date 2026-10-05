import { useEffect, useMemo, useState } from 'react';
import {
  addMember, adjustXp, availableAdvancements, companyCost, isDown, levelOf, memberCost, newCampaign, outcomeOf,
  recordGame, recordSummary, removeMember, renameCampaign, renameMember, replay, revertLastGame, setCampaignNotes, setMemberNotes, setMemberOptions,
  setMemberStatus, setPointsLimit, toggleAdvancement, toggleInjury, toggleOption, xpFor,
  type Campaign, type GameInput, type GameRecord, type Member, type MemberStatus, type PackIndex,
} from '@muster/shared';

interface Props {
  index: PackIndex;
  /** The campaigns made with the active pack. */
  campaigns: Campaign[];
  onCampaigns: (fn: (all: Campaign[]) => Campaign[]) => void;
  /** Finished games played from a company list whose result has not been written into the campaign yet. */
  waiting: GameRecord[];
  onGameRecorded: (gameId: string) => void;
  /** Make (or refresh) the company's list and say what happened. */
  onMakeList: (campaign: Campaign, includeInjured: boolean) => { name: string; models: number; points: number; notes: string[] };
  onOpenBuilder: () => void;
  /** A finished game to record straight away, e.g. from the game history. */
  recordGameId: string | null;
  onRecordHandled: () => void;
}

const STATUS_LABEL: Record<MemberStatus, string> = { active: 'Fit', injured: 'Injured', dead: 'Dead' };
const when = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const num = (s: string): number => (s.trim() === '' || Number.isNaN(Number(s)) ? 0 : Math.max(0, Math.floor(Number(s))));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function CampaignView(props: Props) {
  const { index, campaigns, onCampaigns } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const active = campaigns.find((c) => c.id === selectedId) ?? campaigns.at(-1);

  // Asked to record a game that belongs to a campaign other than the one on show: show that one.
  useEffect(() => {
    const g = props.recordGameId ? props.waiting.find((x) => x.id === props.recordGameId) : undefined;
    if (g?.campaign && campaigns.some((c) => c.id === g.campaign)) setSelectedId(g.campaign);
  }, [props.recordGameId, props.waiting, campaigns]);

  if (!active || creating) {
    return (
      <div className="campaign">
        <NewCampaign
          index={index} canCancel={!!active} onCancel={() => setCreating(false)}
          onCreate={(c) => { onCampaigns((all) => [...all, c]); setSelectedId(c.id); setCreating(false); }}
        />
      </div>
    );
  }

  const update = (fn: (c: Campaign) => Campaign) => onCampaigns((all) => all.map((c) => (c.id === active.id ? fn(c) : c)));

  return (
    <div className="campaign">
      <section className="panel">
        <div className="panel-head row-controls">
          <label className="inline">
            Campaign
            <select value={active.id} onChange={(e) => setSelectedId(e.target.value)} aria-label="Campaign">
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button onClick={() => setCreating(true)}>New campaign</button>
          <button onClick={() => { if (window.confirm(`Delete "${active.name}", its roster and its game log?`)) { onCampaigns((all) => all.filter((c) => c.id !== active.id)); setSelectedId(null); } }}>Delete</button>
        </div>
      </section>
      <Company key={active.id} c={active} update={update} {...props} />
    </div>
  );
}

function NewCampaign({ index, canCancel, onCancel, onCreate }: { index: PackIndex; canCancel: boolean; onCancel: () => void; onCreate: (c: Campaign) => void }) {
  const [name, setName] = useState('');
  const [army, setArmy] = useState(index.pack.armies[0]!.id);
  const [limit, setLimit] = useState('');
  return (
    <form
      className="panel"
      onSubmit={(e) => { e.preventDefault(); onCreate(newCampaign(index, name, army, limit.trim() === '' ? null : num(limit))); }}
    >
      <div className="panel-head">
        <h2>New campaign</h2>
        <p className="muted small">A campaign is a company of named models that carries over from game to game: their experience, injuries and losses.</p>
      </div>
      <div className="form">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Vale Watch" /></label>
        <label>
          Army
          <select value={army} onChange={(e) => setArmy(e.target.value)} aria-label="Army">
            {[...index.armies.values()].map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label>Company size limit, in points <span className="muted">(optional)</span><input type="number" min={0} inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Points limit" /></label>
        <div className="actions flush">
          <button className="primary" type="submit">Create campaign</button>
          {canCancel && <button type="button" onClick={onCancel}>Cancel</button>}
        </div>
      </div>
    </form>
  );
}

function Company({ index, c, update, waiting, onGameRecorded, onMakeList, onOpenBuilder, recordGameId, onRecordHandled }: Props & { c: Campaign; update: (fn: (c: Campaign) => Campaign) => void }) {
  const [includeInjured, setIncludeInjured] = useState(false);
  const [made, setMade] = useState<{ name: string; models: number; points: number; notes: string[] } | null>(null);
  const [recording, setRecording] = useState<{ prefill: GameRecord | null } | null>(null);
  const mine = waiting.filter((g) => g.campaign === c.id);
  // Asked to record a particular game (from the game history): open the form for it once.
  useEffect(() => {
    const g = recordGameId ? waiting.find((x) => x.id === recordGameId && x.campaign === c.id) : undefined;
    if (g) setRecording({ prefill: g });
  }, [recordGameId, waiting, c.id]);

  const record = recordSummary(c);
  const cost = companyCost(index, c);
  const army = index.armies.get(c.army);
  const candidates = (army?.units ?? []).map((e) => index.units.get(e.unit)).filter((u): u is NonNullable<typeof u> => !!u);
  const [unit, setUnit] = useState(candidates[0]?.id ?? '');
  const [newName, setNewName] = useState('');
  const active = c.members.filter((m) => m.status !== 'dead');
  const dead = c.members.filter((m) => m.status === 'dead');

  const close = () => { setRecording(null); onRecordHandled(); };

  return (
    <>
      <section className="panel" aria-label="Company">
        <div className="panel-head">
          <input className="title-input" value={c.name} onChange={(e) => update((x) => renameCampaign(x, e.target.value || x.name))} aria-label="Campaign name" />
          <p className="muted small">
            {army?.name} · {plural(active.length, 'model')} · {record.games === 0 ? 'no games yet' : `${record.wins}W ${record.draws}D ${record.losses}L`}
          </p>
          <div className="row-controls">
            <span><strong>{cost}</strong> pts{c.pointsLimit !== null && <span className={cost > c.pointsLimit ? 'bad' : 'muted'}> / {c.pointsLimit}</span>}</span>
            <label className="inline">Limit
              <input type="number" min={0} inputMode="numeric" value={c.pointsLimit ?? ''} placeholder="none" aria-label="Company points limit" onChange={(e) => update((x) => setPointsLimit(x, e.target.value.trim() === '' ? null : num(e.target.value)))} />
            </label>
          </div>
          {c.pointsLimit !== null && cost > c.pointsLimit && <p className="issue error">The company is {cost - c.pointsLimit} points over its limit.</p>}
          <div className="actions flush">
            <button className="primary" onClick={() => setMade(onMakeList(c, includeInjured))} disabled={active.length === 0}>Make a list from this company</button>
            <label className="toggle"><input type="checkbox" checked={includeInjured} onChange={(e) => setIncludeInjured(e.target.checked)} /> Include injured models</label>
            <button onClick={() => setRecording({ prefill: null })} disabled={active.length === 0}>Record a game</button>
          </div>
          {made && (
            <div className="made" role="status">
              <p>
                <strong>{made.name}</strong> is ready: {plural(made.models, 'model')}, {made.points} points. {made.notes.map((n, i) => <span key={i} className="issue warning block">{n}</span>)}
              </p>
              <button onClick={onOpenBuilder}>Open it in the Builder</button>
            </div>
          )}
        </div>
      </section>

      {mine.length > 0 && (
        <section className="panel" aria-label="Games to record">
          <div className="panel-head"><h3>Games waiting to be recorded</h3></div>
          <ul className="rows">
            {mine.map((g) => (
              <li key={g.id}>
                <span className="grow">{g.name}{g.opponent && <> vs {g.opponent}</>}<span className="muted small block">{when(g.finishedAt ?? g.startedAt)}</span></span>
                <button onClick={() => setRecording({ prefill: g })}>Record this game</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel" aria-label="Roster">
        <div className="panel-head">
          <h3>Roster</h3>
          <form className="row-controls" onSubmit={(e) => { e.preventDefault(); if (unit) { update((x) => addMember(index, x, unit, newName)); setNewName(''); } }}>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit to add">
              {candidates.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.cost} pts)</option>)}
            </select>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name (optional)" aria-label="Name for the new model" />
            <button type="submit">Add to the company</button>
          </form>
        </div>
        {c.members.length === 0 && <p className="muted pad">Add the models your company starts with.</p>}
        <ul className="members">
          {active.map((m) => <MemberCard key={m.id} index={index} m={m} update={update} />)}
        </ul>
        {dead.length > 0 && (
          <details className="fallen">
            <summary>Fallen ({dead.length})</summary>
            <ul className="members">{dead.map((m) => <MemberCard key={m.id} index={index} m={m} update={update} />)}</ul>
          </details>
        )}
      </section>

      <section className="panel" aria-label="Game log">
        <div className="panel-head">
          <h3>Game log</h3>
          {c.log.length > 0 && (
            <button onClick={() => { if (window.confirm('Take back the latest recorded game? Experience and injuries it gave are undone.')) update(revertLastGame); }}>Undo the last game</button>
          )}
        </div>
        {c.log.length === 0 && <p className="muted pad">No games recorded yet.</p>}
        <ol className="gamelog" reversed>
          {[...c.log].reverse().map((g) => (
            <li key={g.id}>
              <div><strong>{g.vpMe}–{g.vpOpp}</strong> <span className={`badge outcome ${g.outcome}`}>{g.outcome}</span> {g.opponent && <>vs {g.opponent}</>} {g.scenario && <span className="muted">· {g.scenario}</span>} <span className="muted small">· {when(g.at)}</span></div>
              {g.changes.length > 0 && (
                <p className="small muted">
                  {g.changes.map((ch) => {
                    const bits = [ch.after.xp > ch.before.xp && `+${ch.after.xp - ch.before.xp} XP`, ch.after.status !== ch.before.status && STATUS_LABEL[ch.after.status].toLowerCase()].filter(Boolean);
                    return bits.length ? `${ch.name} (${bits.join(', ')})` : ch.name;
                  }).join(' · ')}
                </p>
              )}
              {g.notes && <p className="small">{g.notes}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section className="panel notes">
        <label>
          <span className="bar-label">Campaign notes</span>
          <textarea rows={3} value={c.notes} onChange={(e) => update((x) => setCampaignNotes(x, e.target.value))} placeholder="Story, house rules, what happens next…" />
        </label>
      </section>

      {recording && (
        <RecordGame
          index={index} c={c} prefill={recording.prefill} onClose={close}
          onSave={(input) => {
            update((x) => recordGame(x, input));
            if (recording.prefill) onGameRecorded(recording.prefill.id);
            close();
          }}
        />
      )}
    </>
  );
}

function MemberCard({ index, m, update }: { index: PackIndex; m: Member; update: (fn: (c: Campaign) => Campaign) => void }) {
  const rules = index.pack.ruleset.campaign;
  const unit = index.units.get(m.unit);
  const lvl = levelOf(rules, m.xp);
  const available = availableAdvancements(rules, m);
  const taken = (rules?.advancements ?? []).filter((a) => m.advancements.includes(a.id));

  return (
    <li className={`member status-${m.status}`}>
      <div className="member-head">
        <input className="member-name" value={m.name} onChange={(e) => update((c) => renameMember(c, m.id, e.target.value || m.name))} aria-label={`Name of ${m.name}`} />
        <span className="muted small">{unit?.name ?? m.unit} · {memberCost(index, m)} pts</span>
        <div className="segmented" role="group" aria-label={`Condition of ${m.name}`}>
          {(['active', 'injured', 'dead'] as const).map((s) => (
            <button key={s} className={m.status === s ? 'on' : ''} aria-pressed={m.status === s} onClick={() => update((c) => setMemberStatus(c, m.id, s))}>{STATUS_LABEL[s]}</button>
          ))}
        </div>
      </div>
      <div className="member-xp">
        <div className="counter" role="group" aria-label={`Experience of ${m.name}`}>
          <button onClick={() => update((c) => adjustXp(c, m.id, -1))} disabled={m.xp === 0} aria-label={`Experience of ${m.name} down`}>−</button>
          <span className="value">{m.xp}</span>
          <button onClick={() => update((c) => adjustXp(c, m.id, 1))} aria-label={`Experience of ${m.name} up`}>+</button>
        </div>
        <span className="small">XP{lvl.name && <> · <strong>{lvl.name}</strong></>}{lvl.toNext !== null && <span className="muted"> · {lvl.toNext} to {lvl.next!.name}</span>}</span>
        <span className="muted small">{plural(m.games, 'game')}</span>
      </div>
      <details className="member-more">
        <summary>Details{taken.length + m.injuries.length > 0 && ` (${taken.length + m.injuries.length})`}</summary>
        {unit && unit.options.length > 0 && (
          <div className="chips" role="group" aria-label={`Equipment of ${m.name}`}>
            {unit.options.map((o) => (
              <button key={o.id} className={m.options.includes(o.id) ? 'chip on' : 'chip'} aria-pressed={m.options.includes(o.id)} onClick={() => update((c) => setMemberOptions(c, m.id, toggleOption(unit, m.options, o.id)))}>
                {o.name} <span className="muted">+{o.cost}</span>
              </button>
            ))}
          </div>
        )}
        {rules && rules.advancements.length > 0 && (
          <div>
            <p className="small muted">Advancements</p>
            <div className="chips" role="group" aria-label={`Advancements of ${m.name}`}>
              {taken.map((a) => <button key={a.id} className="chip on" aria-pressed title={a.text} onClick={() => update((c) => toggleAdvancement(c, m.id, a.id))}>{a.name}</button>)}
              {available.map((a) => <button key={a.id} className="chip" aria-pressed={false} title={a.text} onClick={() => update((c) => toggleAdvancement(c, m.id, a.id))}>+ {a.name}</button>)}
              {taken.length + available.length === 0 && <span className="muted small">None available yet.</span>}
            </div>
          </div>
        )}
        {rules && rules.injuries.length > 0 && (
          <div>
            <p className="small muted">Injuries</p>
            <div className="chips" role="group" aria-label={`Injuries of ${m.name}`}>
              {rules.injuries.map((i) => <button key={i.id} className={m.injuries.includes(i.id) ? 'chip on bad' : 'chip'} aria-pressed={m.injuries.includes(i.id)} title={i.text} onClick={() => update((c) => toggleInjury(c, m.id, i.id))}>{i.name}</button>)}
            </div>
          </div>
        )}
        <label className="notes-field">
          <span className="small muted">Notes</span>
          <textarea rows={2} value={m.notes} onChange={(e) => update((c) => setMemberNotes(c, m.id, e.target.value))} aria-label={`Notes on ${m.name}`} />
        </label>
        <button className="link remove" onClick={() => { if (window.confirm(`Remove ${m.name} from the company? Their past games stay in the log.`)) update((c) => removeMember(c, m.id)); }}>Remove from the company</button>
      </details>
    </li>
  );
}

function RecordGame({ index, c, prefill, onSave, onClose }: { index: PackIndex; c: Campaign; prefill: GameRecord | null; onSave: (input: GameInput) => void; onClose: () => void }) {
  const rules = index.pack.ruleset.campaign;
  // What the tracked game says: who was in it, the score, and who ended the game down.
  const played = useMemo(() => {
    if (!prefill) return null;
    const g = replay(prefill);
    const byMember = new Map(g.models.filter((m) => m.member).map((m) => [m.member!, isDown(m)]));
    return { byMember, vp: g.vp };
  }, [prefill]);

  const roster = c.members.filter((m) => m.status !== 'dead');
  const [opponent, setOpponent] = useState(prefill?.opponent ?? '');
  const [scenario, setScenario] = useState(prefill?.scenario?.name ?? '');
  const [vpMe, setVpMe] = useState(String(played?.vp.me ?? 0));
  const [vpOpp, setVpOpp] = useState(String(played?.vp.opponent ?? 0));
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState(() =>
    Object.fromEntries(roster.map((m) => [m.id, {
      played: played ? played.byMember.has(m.id) : m.status === 'active',
      // Someone who ended the game down is injured until told otherwise; everyone else keeps the condition they had.
      status: (played?.byMember.get(m.id) ? 'injured' : m.status) as MemberStatus,
      xp: null as number | null,
    }])),
  );
  const outcome = outcomeOf(num(vpMe), num(vpOpp));
  const autoXp = xpFor(rules, outcome);
  const set = (id: string, patch: Partial<(typeof rows)[string]>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));
  const taking = roster.filter((m) => rows[m.id]?.played);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal record" role="dialog" aria-label="Record a game" onClick={(e) => e.stopPropagation()}>
        <header><h2>Record a game</h2><button className="icon" onClick={onClose} aria-label="Close">×</button></header>
        {prefill && <p className="muted small">Filled in from the game you tracked. Models that ended the game down are marked injured: change any to dead, or back to fit.</p>}
        <div className="form">
          <div className="stat-grid">
            <label>Your VP<input type="number" min={0} inputMode="numeric" value={vpMe} onChange={(e) => setVpMe(e.target.value)} aria-label="Your victory points" /></label>
            <label>Their VP<input type="number" min={0} inputMode="numeric" value={vpOpp} onChange={(e) => setVpOpp(e.target.value)} aria-label="Their victory points" /></label>
          </div>
          <p className="small" role="status">{outcome === 'win' ? 'A win' : outcome === 'draw' ? 'A draw' : 'A loss'}{autoXp > 0 ? `: ${autoXp} experience each for taking part by default.` : '.'}</p>
          <label>Opponent<input value={opponent} onChange={(e) => setOpponent(e.target.value)} /></label>
          <label>Scenario<input value={scenario} onChange={(e) => setScenario(e.target.value)} /></label>
        </div>
        <table className="results-table record-table">
          <thead><tr><th>Played</th><th className="name-col">Model</th><th>Condition</th><th>XP</th></tr></thead>
          <tbody>
            {roster.map((m) => {
              const r = rows[m.id]!;
              return (
                <tr key={m.id} className={r.played ? '' : 'sat-out'}>
                  <td><input type="checkbox" checked={r.played} onChange={(e) => set(m.id, { played: e.target.checked })} aria-label={`${m.name} played`} /></td>
                  <td className="name-col">{m.name}</td>
                  <td>
                    <select value={r.status} disabled={!r.played} onChange={(e) => set(m.id, { status: e.target.value as MemberStatus })} aria-label={`${m.name} condition`}>
                      {(['active', 'injured', 'dead'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td><input type="number" min={0} inputMode="numeric" disabled={!r.played} value={r.xp ?? autoXp} onChange={(e) => set(m.id, { xp: num(e.target.value) })} aria-label={`${m.name} experience`} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <label className="notes-field"><span className="small muted">Notes</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Game notes" /></label>
        <div className="actions flush">
          <button
            className="primary"
            onClick={() => onSave({
              opponent, scenario, vpMe: num(vpMe), vpOpp: num(vpOpp), notes,
              results: roster.map((m) => ({ member: m.id, played: rows[m.id]!.played, status: rows[m.id]!.status, xp: rows[m.id]!.xp ?? autoXp })),
            })}
          >Record the game ({plural(taking.length, 'model')})</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
