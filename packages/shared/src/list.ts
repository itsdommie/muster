import type { PackIndex } from './pack.js';
import type { Unit } from './schema.js';

/** A group of identical models: same unit, same chosen options. */
export interface ListEntry {
  unit: string;
  options: string[];
  count: number;
  /** Campaign roster members these models are, in order. Only lists made from a campaign company have it. */
  members?: string[];
}

export interface Warband {
  id: string;
  /** The army this warband is drawn from; differs from the list's army for allied warbands. */
  army: string;
  leader: ListEntry | null;
  members: ListEntry[];
}

export interface ArmyList {
  id: string;
  name: string;
  army: string;
  limit: number;
  warbands: Warband[];
  updated: number;
  /** Id of the data pack this list was built with; unit and army ids only mean something within it. */
  pack: string;
  /** Set on a list made from a campaign company: the campaign it belongs to. */
  campaign?: string;
}

/** Where an entry lives inside a warband. */
export type Slot = 'leader' | number;

export const newId = (): string => globalThis.crypto.randomUUID();

export function newList(index: PackIndex, army = index.pack.armies[0]!.id, limit = 500, name = 'New list'): ArmyList {
  return { id: newId(), name, army, limit, warbands: [], updated: Date.now(), pack: index.pack.id };
}

export function newWarband(army: string): Warband {
  return { id: newId(), army, leader: null, members: [] };
}

export function entryCost(index: PackIndex, e: ListEntry): number {
  const unit = index.units.get(e.unit);
  if (!unit) return 0;
  const options = e.options.reduce((sum, id) => sum + (unit.options.find((o) => o.id === id)?.cost ?? 0), 0);
  return (unit.cost + options) * e.count;
}

export function warbandEntries(w: Warband): ListEntry[] {
  return w.leader ? [w.leader, ...w.members] : [...w.members];
}

export function warbandCost(index: PackIndex, w: Warband): number {
  return warbandEntries(w).reduce((sum, e) => sum + entryCost(index, e), 0);
}

export function listCost(index: PackIndex, list: ArmyList): number {
  return list.warbands.reduce((sum, w) => sum + warbandCost(index, w), 0);
}

export function warbandModels(w: Warband): number {
  return warbandEntries(w).reduce((sum, e) => sum + e.count, 0);
}

/** Wargear ids a model with these options carries (base kit plus option-granted items). */
export function entryWargear(unit: Unit, options: string[]): string[] {
  const granted = options.flatMap((id) => unit.options.find((o) => o.id === id)?.wargear ?? []);
  return [...unit.wargear, ...granted];
}

const sameOptions = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

// --- Immutable edit helpers (UI state is plain data, so undo/redo and persistence stay trivial) ---

const touch = (list: ArmyList, warbands: Warband[]): ArmyList => ({ ...list, warbands, updated: Date.now() });

const mapWarband = (list: ArmyList, wid: string, fn: (w: Warband) => Warband): ArmyList =>
  touch(list, list.warbands.map((w) => (w.id === wid ? fn(w) : w)));

export function addWarband(list: ArmyList, army = list.army): ArmyList {
  return touch(list, [...list.warbands, newWarband(army)]);
}

export function removeWarband(list: ArmyList, wid: string): ArmyList {
  return touch(list, list.warbands.filter((w) => w.id !== wid));
}

/** Heroes become the warband leader (replacing any current one); warriors are added to the members. */
export function addUnit(list: ArmyList, wid: string, unit: Unit, options: string[] = []): ArmyList {
  return mapWarband(list, wid, (w) => {
    if (unit.kind === 'hero') return { ...w, leader: { unit: unit.id, options, count: 1 } };
    const existing = w.members.findIndex((m) => m.unit === unit.id && sameOptions(m.options, options));
    if (existing >= 0) {
      return { ...w, members: w.members.map((m, i) => (i === existing ? { ...m, count: m.count + 1 } : m)) };
    }
    return { ...w, members: [...w.members, { unit: unit.id, options, count: 1 }] };
  });
}

export function setCount(list: ArmyList, wid: string, slot: Slot, count: number): ArmyList {
  if (count < 1) return removeEntry(list, wid, slot);
  return mapWarband(list, wid, (w) => {
    if (slot === 'leader') return w; // a leader is always exactly one model
    return { ...w, members: w.members.map((m, i) => (i === slot ? { ...m, count } : m)) };
  });
}

export function setOptions(list: ArmyList, wid: string, slot: Slot, options: string[]): ArmyList {
  return mapWarband(list, wid, (w) => {
    if (slot === 'leader') return w.leader ? { ...w, leader: { ...w.leader, options } } : w;
    return { ...w, members: w.members.map((m, i) => (i === slot ? { ...m, options } : m)) };
  });
}

export function removeEntry(list: ArmyList, wid: string, slot: Slot): ArmyList {
  return mapWarband(list, wid, (w) =>
    slot === 'leader' ? { ...w, leader: null } : { ...w, members: w.members.filter((_, i) => i !== slot) },
  );
}

/** Toggle an option, dropping any other option in the same group so exclusive choices stay consistent. */
export function toggleOption(unit: Unit, current: string[], optionId: string): string[] {
  if (current.includes(optionId)) return current.filter((o) => o !== optionId);
  const opt = unit.options.find((o) => o.id === optionId);
  if (!opt) return current;
  const kept = opt.group ? current.filter((id) => unit.options.find((o) => o.id === id)?.group !== opt.group) : current;
  return [...kept, optionId];
}
