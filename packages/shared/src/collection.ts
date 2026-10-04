import { warbandEntries, type ArmyList } from './list.js';
import type { PackIndex } from './pack.js';

// The models a person owns, and how far along the painting queue each is. Counts are per unit (not per loadout), in four stages that
// every miniature goes through, so the tracker needs nothing from the data pack but its unit ids.

export const STAGES = ['unbuilt', 'built', 'primed', 'painted'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = { unbuilt: 'In the box', built: 'Built', primed: 'Primed', painted: 'Painted' };

export interface CollectionEntry {
  unbuilt: number;
  built: number;
  primed: number;
  painted: number;
  /** Models still to buy. */
  wanted: number;
}

/** Keyed by unit id. Units with nothing owned or wanted are absent. */
export type Collection = Record<string, CollectionEntry>;

const empty = (): CollectionEntry => ({ unbuilt: 0, built: 0, primed: 0, painted: 0, wanted: 0 });

export const entryOf = (c: Collection, unit: string): CollectionEntry => c[unit] ?? empty();
export const ownedOf = (e: CollectionEntry): number => e.unbuilt + e.built + e.primed + e.painted;

const clean = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

function store(c: Collection, unit: string, e: CollectionEntry): Collection {
  const { [unit]: _old, ...rest } = c;
  return ownedOf(e) === 0 && e.wanted === 0 ? rest : { ...rest, [unit]: e };
}

export function setAmount(c: Collection, unit: string, field: Stage | 'wanted', n: number): Collection {
  return store(c, unit, { ...entryOf(c, unit), [field]: clean(n) });
}

export const adjust = (c: Collection, unit: string, field: Stage | 'wanted', delta: number): Collection =>
  setAmount(c, unit, field, entryOf(c, unit)[field] + delta);

/** Move `n` models from one stage to the next. Stops at what is available, and the last stage has no next. */
export function advance(c: Collection, unit: string, from: Stage, n = 1): Collection {
  const next = STAGES[STAGES.indexOf(from) + 1];
  if (!next) return c;
  const e = entryOf(c, unit);
  const moved = Math.min(clean(n), e[from]);
  if (moved === 0) return c;
  return store(c, unit, { ...e, [from]: e[from] - moved, [next]: e[next] + moved });
}

/** Buying: wanted models become owned, in the box. */
export function bought(c: Collection, unit: string, n = 1): Collection {
  const e = entryOf(c, unit);
  const got = Math.min(clean(n), e.wanted);
  if (got === 0) return c;
  return store(c, unit, { ...e, wanted: e.wanted - got, unbuilt: e.unbuilt + got });
}

export interface CollectionTotals {
  owned: number;
  byStage: Record<Stage, number>;
  wanted: number;
  units: number;
  /** Share of owned models that are painted, 0 to 1 (0 with none owned). */
  paintedShare: number;
}

export function totals(c: Collection): CollectionTotals {
  const byStage: Record<Stage, number> = { unbuilt: 0, built: 0, primed: 0, painted: 0 };
  let wanted = 0;
  let units = 0;
  for (const e of Object.values(c)) {
    for (const s of STAGES) byStage[s] += e[s];
    wanted += e.wanted;
    if (ownedOf(e) > 0) units++;
  }
  const owned = STAGES.reduce((n, s) => n + byStage[s], 0);
  return { owned, byStage, wanted, units, paintedShare: owned === 0 ? 0 : byStage.painted / owned };
}

// --- Can I field this list? ---

/** How many of each unit a list needs on the table. */
export function requirements(list: ArmyList): Map<string, number> {
  const need = new Map<string, number>();
  for (const w of list.warbands) for (const e of warbandEntries(w)) need.set(e.unit, (need.get(e.unit) ?? 0) + e.count);
  return need;
}

export interface CoverageLine {
  unit: string;
  need: number;
  owned: number;
  painted: number;
  /** Models to buy (need minus owned). */
  missing: number;
  /** Models owned for this list but not yet painted. */
  toPaint: number;
}

export interface Coverage {
  lines: CoverageLine[];
  /** Everything needed is owned. */
  fieldable: boolean;
  /** Everything needed is owned and painted. */
  tableReady: boolean;
  missingModels: number;
  toPaintModels: number;
  needModels: number;
}

export function coverage(c: Collection, list: ArmyList): Coverage {
  const lines: CoverageLine[] = [...requirements(list)].map(([unit, need]) => {
    const e = entryOf(c, unit);
    const owned = ownedOf(e);
    return {
      unit, need, owned, painted: e.painted,
      missing: Math.max(0, need - owned),
      toPaint: Math.max(0, Math.min(need, owned) - Math.min(need, e.painted)),
    };
  });
  const missingModels = lines.reduce((n, l) => n + l.missing, 0);
  const toPaintModels = lines.reduce((n, l) => n + l.toPaint, 0);
  return {
    lines,
    fieldable: missingModels === 0,
    tableReady: missingModels === 0 && toPaintModels === 0,
    missingModels,
    toPaintModels,
    needModels: lines.reduce((n, l) => n + l.need, 0),
  };
}

/** Plain text of what to buy for a list, and what is left to paint. */
export function shoppingText(index: PackIndex, cov: Coverage, listName: string): string {
  const name = (id: string) => index.units.get(id)?.name ?? id;
  const buy = cov.lines.filter((l) => l.missing > 0).map((l) => `${l.missing} x ${name(l.unit)}`);
  const paint = cov.lines.filter((l) => l.toPaint > 0).map((l) => `${l.toPaint} x ${name(l.unit)}`);
  const out = [`${listName}`, ''];
  out.push(buy.length ? 'To buy:' : 'Nothing to buy: you own everything this list needs.', ...buy.map((b) => `  ${b}`));
  if (paint.length) out.push('', 'To paint:', ...paint.map((p) => `  ${p}`));
  return out.join('\n') + '\n';
}

/** Plain text wishlist. */
export function wishlistText(index: PackIndex, c: Collection): string {
  const rows = Object.entries(c).filter(([, e]) => e.wanted > 0).map(([id, e]) => ({ name: index.units.get(id)?.name ?? id, n: e.wanted }));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows.length ? rows.map((r) => `${r.n} x ${r.name}`).join('\n') + '\n' : 'The wishlist is empty.\n';
}

/** Read a collection back from storage or a backup, dropping anything malformed instead of failing. */
export function parseCollection(raw: unknown): Collection {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Collection = {};
  for (const [unit, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue;
    const r = v as Record<string, unknown>;
    const e: CollectionEntry = { unbuilt: clean(Number(r.unbuilt)), built: clean(Number(r.built)), primed: clean(Number(r.primed)), painted: clean(Number(r.painted)), wanted: clean(Number(r.wanted)) };
    if (ownedOf(e) > 0 || e.wanted > 0) out[unit] = e;
  }
  return out;
}
