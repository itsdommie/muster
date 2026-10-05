import { newId, newList, newWarband, type ArmyList, type ListEntry, type Warband } from './list.js';
import type { PackIndex } from './pack.js';
import type { CampaignRules, Unit } from './schema.js';

// A campaign is a company of named models that carries over from game to game: who they are, what they carry, how much experience they
// have, who is hurt or lost. The progression rules (levels, awards, advancements, injuries) come from the data pack; without them a
// campaign is still a roster with experience, status and notes.

export type MemberStatus = 'active' | 'injured' | 'dead';

export interface Member {
  id: string;
  unit: string;
  options: string[];
  name: string;
  status: MemberStatus;
  xp: number;
  /** Games this model has taken part in. */
  games: number;
  advancements: string[];
  injuries: string[];
  notes: string;
}

export type Outcome = 'win' | 'draw' | 'loss';

/** What changed for one member in a recorded game, kept so the game can be taken back. */
export interface MemberChange {
  member: string;
  /** The member's name at the time, in case they are removed later. */
  name: string;
  before: { status: MemberStatus; xp: number; games: number };
  after: { status: MemberStatus; xp: number; games: number };
}

export interface GameEntry {
  id: string;
  at: number;
  opponent: string;
  scenario: string;
  vpMe: number;
  vpOpp: number;
  outcome: Outcome;
  notes: string;
  changes: MemberChange[];
}

export interface Campaign {
  id: string;
  name: string;
  pack: string;
  army: string;
  created: number;
  updated: number;
  /** Largest company cost allowed, or null for no limit. */
  pointsLimit: number | null;
  notes: string;
  members: Member[];
  log: GameEntry[];
}

const touch = (c: Campaign, patch: Partial<Campaign>): Campaign => ({ ...c, ...patch, updated: Date.now() });
const mapMember = (c: Campaign, id: string, fn: (m: Member) => Member): Campaign =>
  c.members.some((m) => m.id === id) ? touch(c, { members: c.members.map((m) => (m.id === id ? fn(m) : m)) }) : c;

export function newCampaign(index: PackIndex, name: string, army: string, pointsLimit: number | null = null): Campaign {
  const now = Date.now();
  return { id: newId(), name: name.trim() || 'Campaign', pack: index.pack.id, army, created: now, updated: now, pointsLimit, notes: '', members: [], log: [] };
}

// --- The roster ---

export function addMember(index: PackIndex, c: Campaign, unitId: string, name?: string): Campaign {
  const unit = index.units.get(unitId);
  const army = index.armies.get(c.army);
  if (!unit || !army?.units.some((u) => u.unit === unitId)) return c; // only models the army can field
  if (unit.unique && c.members.some((m) => m.unit === unitId && m.status !== 'dead')) return c; // a unique model cannot be in the company twice
  const member: Member = { id: newId(), unit: unitId, options: [], name: name?.trim() || unit.name, status: 'active', xp: 0, games: 0, advancements: [], injuries: [], notes: '' };
  return touch(c, { members: [...c.members, member] });
}

export const removeMember = (c: Campaign, id: string): Campaign => touch(c, { members: c.members.filter((m) => m.id !== id) });

export const renameMember = (c: Campaign, id: string, name: string): Campaign => (name.trim() ? mapMember(c, id, (m) => ({ ...m, name: name.trim() })) : c);

export const setMemberNotes = (c: Campaign, id: string, notes: string): Campaign => mapMember(c, id, (m) => ({ ...m, notes }));

export const setMemberStatus = (c: Campaign, id: string, status: MemberStatus): Campaign => mapMember(c, id, (m) => ({ ...m, status }));

export const setMemberOptions = (c: Campaign, id: string, options: string[]): Campaign => mapMember(c, id, (m) => ({ ...m, options }));

/** Add (or take away) experience; it never goes below zero. */
export const adjustXp = (c: Campaign, id: string, delta: number): Campaign =>
  mapMember(c, id, (m) => ({ ...m, xp: Math.max(0, Math.floor(m.xp + (Number.isFinite(delta) ? delta : 0))) }));

const toggle = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
export const toggleAdvancement = (c: Campaign, id: string, advancement: string): Campaign => mapMember(c, id, (m) => ({ ...m, advancements: toggle(m.advancements, advancement) }));
export const toggleInjury = (c: Campaign, id: string, injury: string): Campaign => mapMember(c, id, (m) => ({ ...m, injuries: toggle(m.injuries, injury) }));

export const renameCampaign = (c: Campaign, name: string): Campaign => (name.trim() ? touch(c, { name: name.trim() }) : c);
export const setCampaignNotes = (c: Campaign, notes: string): Campaign => touch(c, { notes });
export const setPointsLimit = (c: Campaign, limit: number | null): Campaign => touch(c, { pointsLimit: limit === null ? null : Math.max(0, Math.floor(limit)) });

// --- Cost and levels ---

export function memberCost(index: PackIndex, m: Member): number {
  const unit = index.units.get(m.unit);
  if (!unit) return 0;
  return unit.cost + m.options.reduce((sum, id) => sum + (unit.options.find((o) => o.id === id)?.cost ?? 0), 0);
}

/** Points of the models that could fight (everyone but the dead). */
export const companyCost = (index: PackIndex, c: Campaign): number => c.members.filter((m) => m.status !== 'dead').reduce((sum, m) => sum + memberCost(index, m), 0);

export interface LevelInfo {
  /** Position in the pack's list of levels, 0 for the first. */
  index: number;
  name: string | null;
  next: { at: number; name: string } | null;
  /** Experience still needed for the next level, or null at the top (or with no levels). */
  toNext: number | null;
}

export function levelOf(rules: CampaignRules | undefined, xp: number): LevelInfo {
  const levels = [...(rules?.levels ?? [])].sort((a, b) => a.at - b.at);
  if (levels.length === 0) return { index: 0, name: null, next: null, toNext: null };
  let at = 0;
  levels.forEach((l, i) => { if (xp >= l.at) at = i; });
  const next = levels[at + 1] ?? null;
  return { index: at, name: levels[at]!.name, next: next ? { at: next.at, name: next.name } : null, toNext: next ? next.at - xp : null };
}

/** The advancements this member could take now: not already taken, and their level is high enough. */
export function availableAdvancements(rules: CampaignRules | undefined, m: Member) {
  const level = levelOf(rules, m.xp).index;
  return (rules?.advancements ?? []).filter((a) => !m.advancements.includes(a.id) && a.minLevel <= level);
}

/** Experience the pack awards for taking part in a game with this outcome. */
export function xpFor(rules: CampaignRules | undefined, outcome: Outcome): number {
  const x = rules?.xp;
  if (!x) return 0;
  return x.play + (outcome === 'win' ? x.win : outcome === 'draw' ? x.draw : 0);
}

export const outcomeOf = (vpMe: number, vpOpp: number): Outcome => (vpMe > vpOpp ? 'win' : vpMe < vpOpp ? 'loss' : 'draw');

// --- Recording a game ---

export interface MemberResult {
  member: string;
  /** Did this model take part? Only those that did are changed. */
  played: boolean;
  /** Their condition after the game. */
  status: MemberStatus;
  /** Experience to add. */
  xp: number;
}

export interface GameInput {
  opponent: string;
  scenario: string;
  vpMe: number;
  vpOpp: number;
  notes: string;
  results: MemberResult[];
}

export function recordGame(c: Campaign, input: GameInput, at = Date.now()): Campaign {
  const changes: MemberChange[] = [];
  const members = c.members.map((m) => {
    const r = input.results.find((x) => x.member === m.id);
    if (!r || !r.played) return m;
    const after = { status: r.status, xp: Math.max(0, m.xp + Math.max(0, Math.floor(Number.isFinite(r.xp) ? r.xp : 0))), games: m.games + 1 };
    changes.push({ member: m.id, name: m.name, before: { status: m.status, xp: m.xp, games: m.games }, after });
    return { ...m, ...after };
  });
  const vpMe = Math.max(0, Math.floor(input.vpMe) || 0);
  const vpOpp = Math.max(0, Math.floor(input.vpOpp) || 0);
  const entry: GameEntry = { id: newId(), at, opponent: input.opponent.trim(), scenario: input.scenario.trim(), vpMe, vpOpp, outcome: outcomeOf(vpMe, vpOpp), notes: input.notes, changes };
  return touch(c, { members, log: [...c.log, entry] });
}

/**
 * Take back the latest recorded game: members who took part go back to how they were before it. Anything changed by hand since is
 * left alone, and a member removed since is simply skipped.
 */
export function revertLastGame(c: Campaign): Campaign {
  const last = c.log.at(-1);
  if (!last) return c;
  const members = c.members.map((m) => {
    const ch = last.changes.find((x) => x.member === m.id);
    // Only undo what the game did: a status or experience that has since been edited by hand is no longer ours to rewind.
    if (!ch || m.status !== ch.after.status || m.xp !== ch.after.xp || m.games !== ch.after.games) return m;
    return { ...m, ...ch.before };
  });
  return touch(c, { members, log: c.log.slice(0, -1) });
}

export function recordSummary(c: Campaign): { games: number; wins: number; draws: number; losses: number } {
  const count = (o: Outcome) => c.log.filter((g) => g.outcome === o).length;
  return { games: c.log.length, wins: count('win'), draws: count('draw'), losses: count('loss') };
}

// --- Playing the company ---

export interface CompanyList {
  list: ArmyList;
  /** Eligible members who could not be placed in a warband (no hero with room, or not allowed to lead them). */
  unplaced: Member[];
  /** Plain-language notes for the person, e.g. that there is no hero to lead. */
  notes: string[];
}

const keyOf = (m: Member): string => `${m.unit}|${[...m.options].sort().join(',')}`;

/**
 * Turn the company into a list the builder and game tracker can use. Heroes lead the warbands; warriors fill them in roster order, within
 * each hero's size and who they may lead. The dead are left out; the injured too, unless asked for.
 */
export function companyToList(index: PackIndex, c: Campaign, opts: { includeInjured?: boolean } = {}): CompanyList {
  const eligible = c.members.filter((m) => m.status === 'active' || (opts.includeInjured && m.status === 'injured'));
  const unitOf = (m: Member): Unit | undefined => index.units.get(m.unit);
  const heroes = eligible.filter((m) => unitOf(m)?.kind === 'hero');
  const warriors = eligible.filter((m) => unitOf(m)?.kind === 'warrior');
  const notes: string[] = [];
  const unplaced: Member[] = [];

  const slots = heroes.map((h) => ({ hero: h, unit: unitOf(h)!, room: unitOf(h)!.warband?.size ?? index.pack.ruleset.warbandSize, followers: [] as Member[] }));
  for (const w of warriors) {
    const slot = slots.find((s) => s.room > s.followers.length && (!s.unit.warband?.allowed || s.unit.warband.allowed.includes(w.unit)));
    if (slot) slot.followers.push(w);
    else unplaced.push(w);
  }

  const asEntry = (m: Member): ListEntry => ({ unit: m.unit, options: [...m.options], count: 1, members: [m.id] });
  const warbands: Warband[] = slots.map((s) => {
    const members: ListEntry[] = [];
    const byKey = new Map<string, ListEntry>();
    for (const f of s.followers) {
      const have = byKey.get(keyOf(f));
      if (have) {
        have.count++;
        have.members!.push(f.id);
      } else {
        const e = asEntry(f);
        byKey.set(keyOf(f), e);
        members.push(e);
      }
    }
    return { ...newWarband(c.army), leader: asEntry(s.hero), members };
  });

  if (heroes.length === 0 && warriors.length > 0) notes.push('No hero is fit to lead: add a hero, or bring an injured one back.');
  if (unplaced.length > 0) notes.push(`${unplaced.length} model${unplaced.length === 1 ? '' : 's'} could not be placed: no warband has room for ${unplaced.length === 1 ? 'it' : 'them'}.`);

  const list: ArmyList = {
    ...newList(index, c.army, c.pointsLimit ?? companyCost(index, c), `${c.name} company`),
    warbands,
    campaign: c.id,
  };
  return { list, unplaced, notes };
}
