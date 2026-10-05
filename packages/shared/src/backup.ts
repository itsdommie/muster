import { z } from 'zod';
import { parseCollection, type Collection } from './collection.js';
import type { GameRecord } from './game.js';
import type { ArmyList } from './list.js';
import { loadPack } from './pack.js';
import type { Tournament } from './tournament.js';
import type { Campaign } from './campaign.js';

// Everything a person has made lives on their device, so there is one file that holds all of it: lists, games, collections,
// tournaments and (if they loaded one) their data pack. A backup file is read defensively: it may be old, hand-edited or damaged, and
// whatever it contains is fed straight to the engines, so every item is checked and damaged ones are skipped and counted, never trusted.

export const BACKUP_FORMAT = 1;

export interface AppData {
  lists: ArmyList[];
  games: GameRecord[];
  /** Keyed by data pack id. */
  collections: Record<string, Collection>;
  tournaments: Tournament[];
  campaigns: Campaign[];
  /** The pack JSON the person loaded, if any (the bundled sample pack is not backed up). */
  customPack: unknown | null;
}

export interface Backup {
  app: 'muster';
  format: number;
  exportedAt: number;
  data: AppData;
}

const num = z.number().finite();
const entry = z.object({ unit: z.string(), options: z.array(z.string()), count: z.number().int().min(1), members: z.array(z.string()).optional() });
const warband = z.object({ id: z.string(), army: z.string(), leader: entry.nullable(), members: z.array(entry) });
const listSchema = z.object({ id: z.string(), name: z.string(), army: z.string(), limit: num, warbands: z.array(warband), updated: num, pack: z.string(), campaign: z.string().optional() });

const counter = z.object({ cur: num, max: num });
const model = z.object({
  id: z.string(), warband: num, unit: z.string(), label: z.string(), detail: z.array(z.string()), leader: z.boolean(), ranged: z.boolean(), member: z.string().optional(),
  wounds: counter, might: counter.optional(), will: counter.optional(), fate: counter.optional(),
});
const side = z.enum(['me', 'opponent']);
const stat = z.enum(['might', 'will', 'fate']);
const event = z.discriminatedUnion('t', [
  z.object({ t: z.literal('wound'), model: z.string(), n: num }),
  z.object({ t: z.literal('spend'), model: z.string(), stat, n: num }),
  z.object({ t: z.literal('turn'), turn: num }),
  z.object({ t: z.literal('priority'), side: side.nullable() }),
  z.object({ t: z.literal('vp'), side, n: num }),
  z.object({ t: z.literal('opp-lost'), n: num }),
  z.object({ t: z.literal('opp-start'), n: num }),
]);
const gameSchema = z.object({
  id: z.string(), name: z.string(), pack: z.string(), listName: z.string(), opponent: z.string(),
  scenario: z.object({ id: z.string(), name: z.string(), setup: z.string(), objectives: z.string(), victory: z.string(), special: z.string().optional() }).optional(),
  campaign: z.string().optional(), campaignRecorded: z.boolean().optional(),
  startedAt: num, finishedAt: num.nullable(), notes: z.string(),
  start: z.object({ models: z.array(model), breakFraction: num, opponentStart: num }),
  events: z.array(event), undone: z.array(event),
});

const pairing = z.object({ table: num, a: z.string(), b: z.string().nullable(), vpA: num.nullable(), vpB: num.nullable() });
const tournamentSchema = z.object({
  id: z.string(), name: z.string(), created: num, seed: num,
  config: z.object({ rounds: num, win: num, draw: num, loss: num, byeVp: num }),
  players: z.array(z.object({ id: z.string(), name: z.string(), dropped: z.boolean() })),
  rounds: z.array(z.object({ number: num, pairings: z.array(pairing) })),
  finished: z.boolean(),
});

const memberStatus = z.enum(['active', 'injured', 'dead']);
const memberState = z.object({ status: memberStatus, xp: num, games: num });
const campaignSchema = z.object({
  id: z.string(), name: z.string(), pack: z.string(), army: z.string(), created: num, updated: num, pointsLimit: num.nullable(), notes: z.string(),
  members: z.array(z.object({
    id: z.string(), unit: z.string(), options: z.array(z.string()), name: z.string(), status: memberStatus, xp: num, games: num,
    advancements: z.array(z.string()), injuries: z.array(z.string()), notes: z.string(),
  })),
  log: z.array(z.object({
    id: z.string(), at: num, opponent: z.string(), scenario: z.string(), vpMe: num, vpOpp: num, outcome: z.enum(['win', 'draw', 'loss']), notes: z.string(),
    changes: z.array(z.object({ member: z.string(), name: z.string(), before: memberState, after: memberState })),
  })),
});

export function createBackup(data: AppData, now = Date.now()): Backup {
  return { app: 'muster', format: BACKUP_FORMAT, exportedAt: now, data };
}

export const backupFileName = (now = Date.now()): string => `muster-backup-${new Date(now).toISOString().slice(0, 10)}.json`;

export interface Skipped {
  lists: number;
  games: number;
  tournaments: number;
  campaigns: number;
  collections: number;
  customPack: boolean;
}

export type ParsedBackup = { ok: true; backup: Backup; skipped: Skipped } | { ok: false; error: string };

function keep<T>(raw: unknown, schema: z.ZodType<T>): { items: T[]; skipped: number } {
  if (raw === undefined) return { items: [], skipped: 0 };
  if (!Array.isArray(raw)) return { items: [], skipped: 1 };
  const items: T[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const r of raw) {
    const p = schema.safeParse(r);
    const id = p.success ? (p.data as { id: string }).id : null;
    if (p.success && id !== null && !seen.has(id)) {
      seen.add(id);
      items.push(p.data);
    } else skipped++;
  }
  return { items, skipped };
}

/** Read a backup from the text of a file. Never throws. */
export function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not a Muster backup: the file is not valid JSON.' };
  }
  if (typeof json !== 'object' || json === null || (json as { app?: unknown }).app !== 'muster') {
    return { ok: false, error: 'This is not a Muster backup file.' };
  }
  const b = json as { format?: unknown; exportedAt?: unknown; data?: unknown };
  if (typeof b.format !== 'number' || !Number.isInteger(b.format)) return { ok: false, error: 'This backup has no format version, so it cannot be read safely.' };
  if (b.format > BACKUP_FORMAT) return { ok: false, error: `This backup was made by a newer version of Muster (format ${b.format}). Update the app, then try again.` };
  if (typeof b.data !== 'object' || b.data === null) return { ok: false, error: 'This backup has no data in it.' };
  const d = b.data as Record<string, unknown>;

  const lists = keep(d.lists, listSchema);
  const games = keep(d.games, gameSchema);
  const tournaments = keep(d.tournaments, tournamentSchema);
  const campaigns = keep(d.campaigns, campaignSchema);

  const collections: Record<string, Collection> = {};
  let badCollections = 0;
  if (d.collections !== undefined) {
    if (typeof d.collections !== 'object' || d.collections === null || Array.isArray(d.collections)) badCollections++;
    else for (const [pack, c] of Object.entries(d.collections)) {
      if (typeof c !== 'object' || c === null || Array.isArray(c)) badCollections++;
      else collections[pack] = parseCollection(c);
    }
  }

  let customPack: unknown | null = null;
  let badPack = false;
  if (d.customPack !== undefined && d.customPack !== null) {
    if (loadPack(d.customPack).ok) customPack = d.customPack;
    else badPack = true;
  }

  return {
    ok: true,
    backup: {
      app: 'muster', format: b.format, exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : 0,
      data: { lists: lists.items as ArmyList[], games: games.items as GameRecord[], collections, tournaments: tournaments.items as Tournament[], campaigns: campaigns.items as Campaign[], customPack },
    },
    skipped: { lists: lists.skipped, games: games.skipped, tournaments: tournaments.skipped, campaigns: campaigns.skipped, collections: badCollections, customPack: badPack },
  };
}

export const countSkipped = (s: Skipped): number => s.lists + s.games + s.tournaments + s.campaigns + s.collections + (s.customPack ? 1 : 0);

// --- Restoring ---

export type RestoreMode = 'merge' | 'replace';

/** How far along a game is, for choosing between two copies of it. */
const gameProgress = (g: GameRecord): number => (g.finishedAt ? 1e9 : 0) + g.events.length;
const decided = (t: Tournament): number => t.rounds.reduce((n, r) => n + r.pairings.filter((p) => p.vpA !== null && p.vpB !== null).length, 0);
const tournamentProgress = (t: Tournament): number => (t.finished ? 1e9 : 0) + t.rounds.length * 1e4 + decided(t);

/**
 * The app plays one game at a time. If a restore leaves several unfinished, the one furthest along stays active and the others move
 * into the history (finished at the moment they started), so no game is thrown away.
 */
export function settleGames(games: GameRecord[]): GameRecord[] {
  const open = games.filter((g) => !g.finishedAt);
  if (open.length < 2) return games;
  const keep = open.reduce((best, g) => (g.events.length > best.events.length || (g.events.length === best.events.length && g.startedAt > best.startedAt) ? g : best));
  return games.map((g) => (!g.finishedAt && g !== keep ? { ...g, finishedAt: g.startedAt } : g));
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[], prefer: (current: T, incoming: T) => boolean): T[] {
  const byId = new Map(current.map((x) => [x.id, x]));
  for (const x of incoming) {
    const have = byId.get(x.id);
    if (!have || prefer(have, x)) byId.set(x.id, x);
  }
  return [...byId.values()];
}

/**
 * Combine what is on the device with a backup.
 * - merge: nothing on the device is lost. Where both have the same list, game or tournament, the more recent or further-along copy
 *   wins (the device's copy on a tie); a unit in both collections takes the backup's counts.
 * - replace: the device ends up exactly as the backup says.
 * The data pack is handled by the caller, since adopting one changes what everything else means.
 */
export function restore(current: AppData, incoming: AppData, mode: RestoreMode): AppData {
  if (mode === 'replace') return { ...incoming, games: settleGames(incoming.games) };
  const collections: Record<string, Collection> = { ...current.collections };
  for (const [pack, c] of Object.entries(incoming.collections)) collections[pack] = { ...(collections[pack] ?? {}), ...c };
  return {
    lists: mergeById(current.lists, incoming.lists, (a, b) => b.updated > a.updated),
    games: settleGames(mergeById(current.games, incoming.games, (a, b) => gameProgress(b) > gameProgress(a))),
    collections,
    tournaments: mergeById(current.tournaments, incoming.tournaments, (a, b) => tournamentProgress(b) > tournamentProgress(a)),
    campaigns: mergeById(current.campaigns, incoming.campaigns, (a, b) => b.updated > a.updated),
    customPack: current.customPack ?? incoming.customPack,
  };
}

export interface Counts {
  lists: number;
  games: number;
  tournaments: number;
  campaigns: number;
  models: number;
}

export const countData = (d: AppData): Counts => ({
  lists: d.lists.length,
  games: d.games.length,
  tournaments: d.tournaments.length,
  campaigns: d.campaigns.length,
  models: Object.values(d.collections).reduce((n, c) => n + Object.values(c).reduce((m, e) => m + e.unbuilt + e.built + e.primed + e.painted, 0), 0),
});
