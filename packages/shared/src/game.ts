import { entryWargear, newId, warbandEntries, type ArmyList } from './list.js';
import type { PackIndex } from './pack.js';
import type { Scenario } from './schema.js';

// A game in progress is a frozen starting state plus a list of events. The current state is the replay of the events, so undo and redo
// are just moving an event between two stacks, a saved game is small, and the log reads straight off the events.
// Nothing here looks at the data pack after the game starts (a pack update must not change a game under way).

export type Stat = 'might' | 'will' | 'fate';
export type Side = 'me' | 'opponent';

export interface Counter {
  cur: number;
  max: number;
}

export interface GameModel {
  id: string;
  /** Index of the warband in the list, for grouping. */
  warband: number;
  unit: string;
  /** "Vale Spearman 3": numbered when a warband has several of one unit. */
  label: string;
  /** Option names chosen for this model, e.g. ["Shield"]. */
  detail: string[];
  leader: boolean;
  /** Carries a bow or throwing weapon. */
  ranged: boolean;
  /** The campaign roster member this model is, when the game was played from a campaign company. */
  member?: string;
  wounds: Counter;
  /** Heroes only. */
  might?: Counter;
  will?: Counter;
  fate?: Counter;
}

export interface GameStart {
  models: GameModel[];
  /** Fraction of starting models that must be lost to break a force (copied from the pack's ruleset). */
  breakFraction: number;
  opponentStart: number;
}

export type GameEvent =
  /** n > 0 wounds the model (at 0 it is a casualty); n < 0 heals it, and brings back a casualty. */
  | { t: 'wound'; model: string; n: number }
  | { t: 'spend'; model: string; stat: Stat; n: number }
  | { t: 'turn'; turn: number }
  | { t: 'priority'; side: Side | null }
  | { t: 'vp'; side: Side; n: number }
  | { t: 'opp-lost'; n: number }
  | { t: 'opp-start'; n: number };

/** The scenario a game is being played, copied at the start so a pack update cannot change a game under way. */
export interface ScenarioSnapshot {
  id: string;
  name: string;
  setup: string;
  objectives: string;
  victory: string;
  special?: string;
}

export const snapshotScenario = (s: Scenario): ScenarioSnapshot => ({
  id: s.id, name: s.name, setup: s.setup, objectives: s.objectives, victory: s.victory, ...(s.special ? { special: s.special } : {}),
});

export interface GameRecord {
  id: string;
  name: string;
  pack: string;
  listName: string;
  opponent: string;
  /** Absent in games saved before scenarios existed. */
  scenario?: ScenarioSnapshot;
  /** The campaign this game was played for (from a company list), and whether its result has been written into that campaign. */
  campaign?: string;
  campaignRecorded?: boolean;
  startedAt: number;
  finishedAt: number | null;
  notes: string;
  start: GameStart;
  events: GameEvent[];
  /** Undone events, most recently undone last. Cleared by any new event. */
  undone: GameEvent[];
}

export interface LogLine {
  turn: number;
  text: string;
}

export interface Game {
  models: GameModel[];
  turn: number;
  priority: Side | null;
  vp: Record<Side, number>;
  opponent: { start: number; lost: number };
  breakFraction: number;
  log: LogLine[];
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const counter = (max: number): Counter => ({ cur: max, max });

export const isDown = (m: GameModel): boolean => m.wounds.cur <= 0;

/** Models that must be lost for a force of `models` to be broken. */
export const breakPoint = (models: number, fraction: number): number => Math.ceil(models * fraction - 1e-9);

// --- Starting a game ---

export function startGame(index: PackIndex, list: ArmyList, opts: { opponent?: string; opponentStart?: number; name?: string; scenario?: Scenario } = {}): GameRecord {
  const models: GameModel[] = [];
  list.warbands.forEach((w, wi) => {
    // Number models per unit within the warband, so "Vale Spearman" x5 becomes 1..5.
    const perUnit = new Map<string, number>();
    const total = new Map<string, number>();
    for (const e of warbandEntries(w)) total.set(e.unit, (total.get(e.unit) ?? 0) + e.count);

    warbandEntries(w).forEach((e, ei) => {
      const unit = index.units.get(e.unit);
      if (!unit) return;
      const detail = e.options.map((o) => unit.options.find((x) => x.id === o)?.name).filter((x): x is string => !!x);
      const ranged = entryWargear(unit, e.options).some((g) => index.wargear.get(g)?.tags.some((t) => t === 'bow' || t === 'throwing'));
      for (let i = 0; i < e.count; i++) {
        const n = (perUnit.get(e.unit) ?? 0) + 1;
        perUnit.set(e.unit, n);
        const leader = w.leader !== null && ei === 0;
        const model: GameModel = {
          id: `w${wi}-e${ei}-${i}`,
          warband: wi,
          unit: unit.id,
          label: (total.get(e.unit) ?? 1) > 1 ? `${unit.name} ${n}` : unit.name,
          detail,
          leader,
          ranged,
          ...(e.members?.[i] ? { member: e.members[i] } : {}),
          wounds: counter(unit.stats.wounds),
        };
        if (unit.kind === 'hero') {
          model.might = counter(unit.stats.might);
          model.will = counter(unit.stats.will);
          model.fate = counter(unit.stats.fate);
        }
        models.push(model);
      }
    });
  });

  return {
    id: newId(),
    name: opts.name?.trim() || list.name,
    pack: index.pack.id,
    listName: list.name,
    opponent: opts.opponent?.trim() ?? '',
    ...(opts.scenario ? { scenario: snapshotScenario(opts.scenario) } : {}),
    ...(list.campaign ? { campaign: list.campaign } : {}),
    startedAt: Date.now(),
    finishedAt: null,
    notes: '',
    start: { models, breakFraction: index.pack.ruleset.break, opponentStart: Math.max(0, opts.opponentStart ?? 0) },
    events: [],
    undone: [],
  };
}

// --- Replay ---

const STAT_NAMES: Record<Stat, string> = { might: 'Might', will: 'Will', fate: 'Fate' };

function cloneModels(models: GameModel[]): GameModel[] {
  return models.map((m) => ({
    ...m,
    detail: [...m.detail],
    wounds: { ...m.wounds },
    ...(m.might ? { might: { ...m.might } } : {}),
    ...(m.will ? { will: { ...m.will } } : {}),
    ...(m.fate ? { fate: { ...m.fate } } : {}),
  }));
}

export function initialGame(start: GameStart): Game {
  return {
    models: cloneModels(start.models),
    turn: 1,
    priority: null,
    vp: { me: 0, opponent: 0 },
    opponent: { start: start.opponentStart, lost: 0 },
    breakFraction: start.breakFraction,
    log: [],
  };
}

/** Apply one event to a game, in place. Events that name a model that does not exist are ignored. */
function apply(g: Game, e: GameEvent): void {
  const say = (text: string) => g.log.push({ turn: g.turn, text });
  const model = 'model' in e ? g.models.find((m) => m.id === e.model) : undefined;
  if ('model' in e && !model) return;

  switch (e.t) {
    case 'wound': {
      const m = model!;
      const was = m.wounds.cur;
      m.wounds.cur = clamp(was - e.n, 0, m.wounds.max);
      if (m.wounds.cur === was) return;
      if (m.wounds.cur === 0) say(`${m.label} is a casualty.`);
      else if (was === 0) say(`${m.label} is back in the fight with ${m.wounds.cur} wound${m.wounds.cur === 1 ? '' : 's'}.`);
      else if (m.wounds.cur < was) say(`${m.label} takes ${was - m.wounds.cur} wound${was - m.wounds.cur === 1 ? '' : 's'} (${m.wounds.cur}/${m.wounds.max}).`);
      else say(`${m.label} recovers ${m.wounds.cur - was} (${m.wounds.cur}/${m.wounds.max}).`);
      return;
    }
    case 'spend': {
      const c = model![e.stat];
      if (!c) return;
      const was = c.cur;
      c.cur = clamp(was - e.n, 0, c.max);
      if (c.cur === was) return;
      say(`${model!.label} ${c.cur < was ? 'spends' : 'regains'} ${STAT_NAMES[e.stat]} (${c.cur}/${c.max}).`);
      return;
    }
    case 'turn':
      g.turn = Math.max(1, Math.floor(e.turn));
      say(`Turn ${g.turn} begins.`);
      return;
    case 'priority':
      g.priority = e.side;
      say(e.side === null ? 'Priority cleared.' : `${e.side === 'me' ? 'You have' : 'Your opponent has'} priority.`);
      return;
    case 'vp': {
      const was = g.vp[e.side];
      g.vp[e.side] = Math.max(0, was + e.n);
      if (g.vp[e.side] !== was) say(`${e.side === 'me' ? 'You' : 'Opponent'} ${e.n > 0 ? 'score' : 'lose'} ${Math.abs(g.vp[e.side] - was)} VP (${g.vp[e.side]}).`);
      return;
    }
    case 'opp-lost': {
      const was = g.opponent.lost;
      // With an unknown force size (0) the count is free-running; with a known one it cannot pass the force.
      g.opponent.lost = clamp(was + e.n, 0, g.opponent.start > 0 ? g.opponent.start : Infinity);
      if (g.opponent.lost !== was) say(`Opponent models lost: ${g.opponent.lost}.`);
      return;
    }
    case 'opp-start':
      g.opponent.start = Math.max(0, e.n);
      g.opponent.lost = Math.min(g.opponent.lost, g.opponent.start);
      say(`Opponent force set to ${g.opponent.start} models.`);
      return;
  }
}

export function replay(record: Pick<GameRecord, 'start' | 'events'>): Game {
  const g = initialGame(record.start);
  for (const e of record.events) apply(g, e);
  return g;
}

// --- Record operations (immutable) ---

export function dispatch(record: GameRecord, event: GameEvent): GameRecord {
  return { ...record, events: [...record.events, event], undone: [] };
}

export const canUndo = (r: GameRecord): boolean => r.events.length > 0;
export const canRedo = (r: GameRecord): boolean => r.undone.length > 0;

export function undo(record: GameRecord): GameRecord {
  const last = record.events.at(-1);
  if (!last) return record;
  return { ...record, events: record.events.slice(0, -1), undone: [...record.undone, last] };
}

export function redo(record: GameRecord): GameRecord {
  const next = record.undone.at(-1);
  if (!next) return record;
  return { ...record, events: [...record.events, next], undone: record.undone.slice(0, -1) };
}

/** Note that a finished game's result has been written into its campaign, so it is not offered again. */
export const markRecorded = (record: GameRecord): GameRecord => ({ ...record, campaignRecorded: true });

export const finishGame = (record: GameRecord, at = Date.now()): GameRecord => ({ ...record, finishedAt: at });

// --- Derived status ---

export interface ForceStatus {
  start: number;
  remaining: number;
  lost: number;
  breakAt: number;
  /** Models still to lose before the force breaks (0 once broken). */
  untilBroken: number;
  broken: boolean;
  rangedRemaining: number;
  rangedStart: number;
  heroesRemaining: number;
  heroesStart: number;
}

export function forceStatus(g: Game): ForceStatus {
  const start = g.models.length;
  const alive = g.models.filter((m) => !isDown(m));
  const lost = start - alive.length;
  const breakAt = breakPoint(start, g.breakFraction);
  const heroes = g.models.filter((m) => m.might !== undefined);
  return {
    start,
    remaining: alive.length,
    lost,
    breakAt,
    untilBroken: Math.max(0, breakAt - lost),
    broken: start > 0 && lost >= breakAt,
    rangedRemaining: alive.filter((m) => m.ranged).length,
    rangedStart: g.models.filter((m) => m.ranged).length,
    heroesRemaining: heroes.filter((m) => !isDown(m)).length,
    heroesStart: heroes.length,
  };
}

export interface OpponentStatus {
  start: number;
  lost: number;
  remaining: number;
  breakAt: number;
  broken: boolean;
}

export function opponentStatus(g: Game): OpponentStatus {
  const { start, lost } = g.opponent;
  const breakAt = breakPoint(start, g.breakFraction);
  return { start, lost, remaining: Math.max(0, start - lost), breakAt, broken: start > 0 && lost >= breakAt };
}
