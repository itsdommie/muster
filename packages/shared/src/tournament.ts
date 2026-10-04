import { newId } from './list.js';
import { rng } from './combat.js';

// Swiss tournaments for a club night. Everything is plain data, so a tournament can be saved, edited between rounds and replayed.
// A game's result is its two victory-point totals: more wins, equal draws. Standings rank by tournament points, then strength of
// schedule (the average points of opponents played), then victory-point difference, then victory points scored.

export interface TournamentConfig {
  rounds: number;
  win: number;
  draw: number;
  loss: number;
  /** Victory points a player is credited with for a bye (the win itself is automatic). */
  byeVp: number;
}

export interface TPlayer {
  id: string;
  name: string;
  dropped: boolean;
}

export interface Pairing {
  table: number;
  a: string;
  /** null is a bye. */
  b: string | null;
  vpA: number | null;
  vpB: number | null;
}

export interface Round {
  number: number;
  pairings: Pairing[];
}

export interface Tournament {
  id: string;
  name: string;
  created: number;
  /** Makes the first round's draw repeatable. */
  seed: number;
  config: TournamentConfig;
  players: TPlayer[];
  rounds: Round[];
  finished: boolean;
}

export const DEFAULT_CONFIG: TournamentConfig = { rounds: 3, win: 3, draw: 1, loss: 0, byeVp: 0 };

/** The usual number of Swiss rounds to find a clear winner: ceil(log2(players)), at least 1. */
export const recommendedRounds = (players: number): number => Math.max(1, Math.ceil(Math.log2(Math.max(1, players))));

export function newTournament(name: string, playerNames: string[], config: Partial<TournamentConfig> = {}, seed = Math.floor(Math.random() * 2 ** 31)): Tournament {
  const names = playerNames.map((n) => n.trim()).filter(Boolean);
  return {
    id: newId(),
    name: name.trim() || 'Tournament',
    created: Date.now(),
    seed,
    config: { ...DEFAULT_CONFIG, rounds: recommendedRounds(names.length), ...config },
    players: names.map((n) => ({ id: newId(), name: n, dropped: false })),
    rounds: [],
    finished: false,
  };
}

export const playerName = (t: Tournament, id: string | null): string => (id === null ? 'Bye' : (t.players.find((p) => p.id === id)?.name ?? '?'));

// --- Players ---

export function addPlayer(t: Tournament, name: string): Tournament {
  const n = name.trim();
  if (!n) return t;
  return { ...t, players: [...t.players, { id: newId(), name: n, dropped: false }] };
}

export const renamePlayer = (t: Tournament, id: string, name: string): Tournament =>
  name.trim() ? { ...t, players: t.players.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)) } : t;

/** A dropped player is left out of future rounds; results already played stand. */
export const setDropped = (t: Tournament, id: string, dropped: boolean): Tournament => ({ ...t, players: t.players.map((p) => (p.id === id ? { ...p, dropped } : p)) });

/** Removing is only for a player who has not played: otherwise drop them instead, so past results keep their opponents. */
export function removePlayer(t: Tournament, id: string): Tournament {
  const played = t.rounds.some((r) => r.pairings.some((p) => p.a === id || p.b === id));
  return played ? t : { ...t, players: t.players.filter((p) => p.id !== id) };
}

// --- Results ---

export const isDecided = (p: Pairing): boolean => p.vpA !== null && p.vpB !== null;
export const isBye = (p: Pairing): boolean => p.b === null;
export const roundComplete = (r: Round): boolean => r.pairings.every(isDecided);
export const currentRound = (t: Tournament): Round | undefined => t.rounds.at(-1);

export function setResult(t: Tournament, roundNumber: number, table: number, vpA: number, vpB: number): Tournament {
  if (![vpA, vpB].every((v) => Number.isFinite(v) && v >= 0)) return t;
  return mapPairing(t, roundNumber, table, (p) => (isBye(p) ? p : { ...p, vpA: Math.floor(vpA), vpB: Math.floor(vpB) }));
}

export const clearResult = (t: Tournament, roundNumber: number, table: number): Tournament =>
  mapPairing(t, roundNumber, table, (p) => (isBye(p) ? p : { ...p, vpA: null, vpB: null }));

function mapPairing(t: Tournament, roundNumber: number, table: number, fn: (p: Pairing) => Pairing): Tournament {
  return { ...t, rounds: t.rounds.map((r) => (r.number === roundNumber ? { ...r, pairings: r.pairings.map((p) => (p.table === table ? fn(p) : p)) } : r)) };
}

/** Throw away the latest round (a wrong draw, or a player who turned up late). */
export const removeLastRound = (t: Tournament): Tournament => ({ ...t, rounds: t.rounds.slice(0, -1), finished: false });

// --- Standings ---

export interface StandingRow {
  rank: number;
  player: TPlayer;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  vpFor: number;
  vpAgainst: number;
  vpDiff: number;
  /** Average tournament points of the opponents played (byes do not count). */
  sos: number;
  byes: number;
}

type Outcome = 'win' | 'draw' | 'loss';
const outcome = (mine: number, theirs: number): Outcome => (mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw');

export function standings(t: Tournament): StandingRow[] {
  const { win, draw, loss, byeVp } = t.config;
  const rows = new Map<string, StandingRow & { opponents: string[] }>();
  for (const player of t.players) {
    rows.set(player.id, { rank: 0, player, points: 0, played: 0, wins: 0, draws: 0, losses: 0, vpFor: 0, vpAgainst: 0, vpDiff: 0, sos: 0, byes: 0, opponents: [] });
  }
  const score = (id: string, mine: number, theirs: number, opponent: string | null) => {
    const row = rows.get(id);
    if (!row) return;
    const o = outcome(mine, theirs);
    row.played++;
    row.vpFor += mine;
    row.vpAgainst += theirs;
    if (o === 'win') { row.wins++; row.points += win; } else if (o === 'draw') { row.draws++; row.points += draw; } else { row.losses++; row.points += loss; }
    if (opponent) row.opponents.push(opponent);
  };

  for (const r of t.rounds) {
    for (const p of r.pairings) {
      if (isBye(p)) {
        const row = rows.get(p.a);
        if (row) {
          row.played++; row.wins++; row.byes++; row.points += win; row.vpFor += byeVp;
        }
      } else if (isDecided(p)) {
        score(p.a, p.vpA!, p.vpB!, p.b);
        score(p.b!, p.vpB!, p.vpA!, p.a);
      }
    }
  }
  for (const row of rows.values()) {
    row.vpDiff = row.vpFor - row.vpAgainst;
    row.sos = row.opponents.length === 0 ? 0 : row.opponents.reduce((s, o) => s + (rows.get(o)?.points ?? 0), 0) / row.opponents.length;
  }
  const out = [...rows.values()].map(({ opponents: _o, ...row }) => row);
  out.sort((x, y) => y.points - x.points || y.sos - x.sos || y.vpDiff - x.vpDiff || y.vpFor - x.vpFor || x.player.name.localeCompare(y.player.name));
  out.forEach((row, i) => { row.rank = i + 1; });
  return out;
}

// --- Pairing ---

export type StartRound = { ok: true; tournament: Tournament; rematches: number } | { ok: false; reason: string };

/** Who each player has already faced. */
function history(t: Tournament): { played: Map<string, Set<string>>; byes: Set<string> } {
  const played = new Map<string, Set<string>>();
  const byes = new Set<string>();
  for (const r of t.rounds) {
    for (const p of r.pairings) {
      if (p.b === null) { byes.add(p.a); continue; }
      (played.get(p.a) ?? played.set(p.a, new Set()).get(p.a)!).add(p.b);
      (played.get(p.b) ?? played.set(p.b, new Set()).get(p.b)!).add(p.a);
    }
  }
  return { played, byes };
}

/**
 * Pair `order` (best first) into twos: the top player takes the nearest-ranked opponent they have not met, backtracking when that leaves
 * someone unpairable. Gives up after a step budget, so a huge field cannot stall the app, and then reports it could not avoid rematches.
 */
function pairAvoiding(order: string[], met: (a: string, b: string) => boolean): [string, string][] | null {
  let budget = 50_000;
  const go = (pool: string[]): [string, string][] | null => {
    if (pool.length === 0) return [];
    if (--budget < 0) return null;
    const [first, ...rest] = pool;
    for (let i = 0; i < rest.length; i++) {
      if (met(first!, rest[i]!)) continue;
      const tail = go([...rest.slice(0, i), ...rest.slice(i + 1)]);
      if (tail) return [[first!, rest[i]!], ...tail];
    }
    return null;
  };
  return go(order);
}

export function startRound(t: Tournament): StartRound {
  const last = currentRound(t);
  if (last && !roundComplete(last)) return { ok: false, reason: `Round ${last.number} still has games without a result.` };
  if (t.rounds.length >= t.config.rounds) return { ok: false, reason: `All ${t.config.rounds} rounds have been played. Raise the round count to play on.` };
  const active = t.players.filter((p) => !p.dropped);
  if (active.length < 2) return { ok: false, reason: 'Need at least two players still in.' };

  const number = t.rounds.length + 1;
  // First round: a seeded shuffle. Later rounds: best standing first.
  let order: string[];
  if (t.rounds.length === 0) {
    order = active.map((p) => p.id);
    const random = rng(t.seed);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
  } else {
    const ids = new Set(active.map((p) => p.id));
    order = standings(t).filter((r) => ids.has(r.player.id)).map((r) => r.player.id);
  }

  const { played, byes } = history(t);
  // With an odd field the lowest-ranked player who has not yet had a bye sits out.
  let bye: string | null = null;
  if (order.length % 2 === 1) {
    bye = [...order].reverse().find((id) => !byes.has(id)) ?? order.at(-1)!;
    order = order.filter((id) => id !== bye);
  }

  const met = (a: string, b: string) => played.get(a)?.has(b) ?? false;
  let pairs = pairAvoiding(order, met);
  let rematches = 0;
  if (!pairs) {
    pairs = pairAvoiding(order, () => false)!; // nobody can be kept apart: pair by rank and say so
    rematches = pairs.filter(([a, b]) => met(a, b)).length;
  }

  const pairings: Pairing[] = pairs.map(([a, b], i) => ({ table: i + 1, a, b, vpA: null, vpB: null }));
  if (bye) pairings.push({ table: pairings.length + 1, a: bye, b: null, vpA: t.config.byeVp, vpB: 0 });
  return { ok: true, rematches, tournament: { ...t, rounds: [...t.rounds, { number, pairings }] } };
}

export const finish = (t: Tournament): Tournament => ({ ...t, finished: true });

export function standingsText(t: Tournament): string {
  const rows = standings(t);
  const out = [`${t.name}`, `After ${t.rounds.filter(roundComplete).length} of ${t.config.rounds} rounds`, ''];
  for (const r of rows) {
    out.push(`${String(r.rank).padStart(2)}. ${r.player.name}${r.player.dropped ? ' (dropped)' : ''}: ${r.points} pts, ${r.wins}-${r.draws}-${r.losses}, VP ${r.vpFor}-${r.vpAgainst} (${r.vpDiff >= 0 ? '+' : ''}${r.vpDiff}), SoS ${r.sos.toFixed(2)}`);
  }
  return out.join('\n') + '\n';
}
