import type { ArmyList, Campaign, Collection, GameRecord, PackDraft, Tournament } from '@muster/shared';
import { parseCollection } from '@muster/shared';

// Everything lives on the device. Reads and writes are wrapped because storage can be blocked or full
// (private windows, quota), and the app must keep working in memory when it is.

const LISTS = 'muster.lists.v1';
const CURRENT = 'muster.current.v1';
const PACK = 'muster.pack.v1';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadLists = (): ArmyList[] => read<ArmyList[]>(LISTS) ?? [];
export const saveLists = (lists: ArmyList[]): boolean => write(LISTS, lists);
export const loadCurrent = (): string | null => read<string>(CURRENT);
export const saveCurrent = (id: string): boolean => write(CURRENT, id);
/** The user's own pack JSON, if they loaded one; the bundled sample pack is used otherwise. */
export const loadCustomPack = (): unknown => read<unknown>(PACK);
export const saveCustomPack = (json: unknown): boolean => write(PACK, json);
export function clearCustomPack(): void {
  try {
    localStorage.removeItem(PACK);
  } catch {
    /* nothing to clear */
  }
}

const GAMES = 'muster.games.v1';
export const loadGames = (): GameRecord[] => read<GameRecord[]>(GAMES) ?? [];
export const saveGames = (games: GameRecord[]): boolean => write(GAMES, games);

const COLLECTIONS = 'muster.collections.v1';
/** One collection per data pack, since unit ids only mean something within their pack. */
export function loadCollections(): Record<string, Collection> {
  const raw = read<Record<string, unknown>>(COLLECTIONS);
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw).map(([pack, c]) => [pack, parseCollection(c)]));
}
export const saveCollections = (all: Record<string, Collection>): boolean => write(COLLECTIONS, all);

const TOURNAMENTS = 'muster.tournaments.v1';
export const loadTournaments = (): Tournament[] => {
  const raw = read<Tournament[]>(TOURNAMENTS);
  return Array.isArray(raw) ? raw : [];
};
export const saveTournaments = (all: Tournament[]): boolean => write(TOURNAMENTS, all);

const LAST_BACKUP = 'muster.lastBackup.v1';
export const loadLastBackup = (): number | null => {
  const t = read<number>(LAST_BACKUP);
  return typeof t === 'number' ? t : null;
};
export const saveLastBackup = (t: number): boolean => write(LAST_BACKUP, t);

const CAMPAIGNS = 'muster.campaigns.v1';
export const loadCampaigns = (): Campaign[] => {
  const raw = read<Campaign[]>(CAMPAIGNS);
  return Array.isArray(raw) ? raw : [];
};
export const saveCampaigns = (all: Campaign[]): boolean => write(CAMPAIGNS, all);

const DRAFT = 'muster.packdraft.v1';
/** The data pack being edited, kept so unfinished work survives a reload. */
export const loadDraft = (): PackDraft | null => {
  const d = read<PackDraft>(DRAFT);
  return d && typeof d === 'object' && Array.isArray(d.units) && Array.isArray(d.armies) ? d : null;
};
export const saveDraft = (d: PackDraft | null): boolean => {
  if (d !== null) return write(DRAFT, d);
  try { localStorage.removeItem(DRAFT); return true; } catch { return false; }
};
