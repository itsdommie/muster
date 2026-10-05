import { csvLine, parseCsv } from './csv.js';
import type { ArmyList } from './list.js';
import { loadPack } from './pack.js';
import type { Army, Pack, Scenario, SpecialRule, Stats, Unit, Wargear } from './schema.js';

// Editing a data pack in the app. The draft is a plain Pack-shaped object that may be unfinished or inconsistent while someone works on it
// (an army with no hero yet, a unit pointing at wargear that is not written); `problems` says what is wrong, and loadPack is still the
// only gate to using it. Ids are made from names once and then never change, so renaming something never breaks a reference; deleting
// something removes every reference to it.

export type PackDraft = Pack;

export const ZERO_STATS: Stats = { move: 6, fight: 3, shoot: null, strength: 3, defence: 3, attacks: 1, wounds: 1, courage: 3, might: 0, will: 0, fate: 0 };

export function blankPack(name = 'My pack'): PackDraft {
  return {
    schema: 1, id: uniqueId(slugify(name), []), name, version: '1.0.0',
    ruleset: { warbandSize: 12, break: 0.5, bowLimit: 0.33, allyLimits: {} },
    units: [], wargear: [], rules: [], armies: [], scenarios: [],
  };
}

/** An independent copy to edit, so the pack in use is never changed until the draft is applied. */
export const cloneDraft = (p: Pack): PackDraft => structuredClone(p);

export function slugify(name: string): string {
  const s = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'item';
}

/** `base`, or `base-2`, `base-3`… the first not already taken. */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

const ids = (items: { id: string }[]): string[] => items.map((i) => i.id);

// --- Wargear, rules, scenarios ---

export function addWargear(d: PackDraft, name: string, extra: Partial<Wargear> = {}): { draft: PackDraft; id: string } {
  const id = uniqueId(slugify(name), ids(d.wargear));
  return { id, draft: { ...d, wargear: [...d.wargear, { tags: [], ...extra, id, name: name.trim() || 'New wargear' }] } };
}

export function addRule(d: PackDraft, name: string, extra: Partial<SpecialRule> = {}): { draft: PackDraft; id: string } {
  const id = uniqueId(slugify(name), ids(d.rules));
  return { id, draft: { ...d, rules: [...d.rules, { text: '', ...extra, id, name: name.trim() || 'New rule' }] } };
}

export function addScenario(d: PackDraft, name: string): { draft: PackDraft; id: string } {
  const id = uniqueId(slugify(name), ids(d.scenarios));
  const scenario: Scenario = { id, name: name.trim() || 'New scenario', setup: '', objectives: '', victory: '', tags: [] };
  return { id, draft: { ...d, scenarios: [...d.scenarios, scenario] } };
}

const patchIn = <T extends { id: string }>(items: T[], id: string, patch: Partial<T>): T[] => items.map((x) => (x.id === id ? { ...x, ...patch, id } : x));

export const updateWargear = (d: PackDraft, id: string, patch: Partial<Wargear>): PackDraft => ({ ...d, wargear: patchIn(d.wargear, id, patch) });
export const updateRule = (d: PackDraft, id: string, patch: Partial<SpecialRule>): PackDraft => ({ ...d, rules: patchIn(d.rules, id, patch) });
export const updateScenario = (d: PackDraft, id: string, patch: Partial<Scenario>): PackDraft => ({ ...d, scenarios: patchIn(d.scenarios, id, patch) });
export const removeScenario = (d: PackDraft, id: string): PackDraft => ({ ...d, scenarios: d.scenarios.filter((s) => s.id !== id) });

/** Removing wargear takes it off every unit and every option that gave it. */
export function removeWargear(d: PackDraft, id: string): PackDraft {
  return {
    ...d,
    wargear: d.wargear.filter((w) => w.id !== id),
    units: d.units.map((u) => ({
      ...u,
      wargear: u.wargear.filter((w) => w !== id),
      options: u.options.map((o) => (o.wargear === id ? withoutWargear(o) : o)),
    })),
  };
}
const withoutWargear = <T extends { wargear?: string | undefined }>(o: T): T => {
  const { wargear: _removed, ...rest } = o;
  return rest as T;
};

export function removeRule(d: PackDraft, id: string): PackDraft {
  return { ...d, rules: d.rules.filter((r) => r.id !== id), units: d.units.map((u) => ({ ...u, rules: u.rules.filter((r) => r !== id) })) };
}

// --- Units ---

export function addUnit(d: PackDraft, name: string, extra: Partial<Unit> = {}): { draft: PackDraft; id: string } {
  const id = uniqueId(slugify(name), ids(d.units));
  const unit: Unit = { kind: 'warrior', cost: 0, unique: false, stats: { ...ZERO_STATS }, wargear: [], rules: [], keywords: [], options: [], ...extra, id, name: name.trim() || 'New unit' };
  return { id, draft: { ...d, units: [...d.units, unit] } };
}

export function updateUnit(d: PackDraft, id: string, patch: Partial<Unit>): PackDraft {
  let next: PackDraft = { ...d, units: patchIn(d.units, id, patch) };
  // A warrior cannot lead a warband, and a hero's warband may only name warriors.
  const u = next.units.find((x) => x.id === id);
  if (u && u.kind === 'warrior' && u.warband) next = { ...next, units: patchIn(next.units, id, { warband: undefined }) };
  if (patch.kind === 'hero') {
    // Turning a unit into a hero never leaves it listed as a follower of another hero.
    next = { ...next, units: next.units.map((x) => (x.warband?.allowed ? { ...x, warband: { ...x.warband, allowed: x.warband.allowed.filter((a) => a !== id) } } : x)) };
  }
  return next;
}

export function updateStats(d: PackDraft, id: string, patch: Partial<Stats>): PackDraft {
  const u = d.units.find((x) => x.id === id);
  return u ? updateUnit(d, id, { stats: { ...u.stats, ...patch } }) : d;
}

/** Removing a unit takes it out of every army and every hero's list of followers. */
export function removeUnit(d: PackDraft, id: string): PackDraft {
  return {
    ...d,
    units: d.units
      .filter((u) => u.id !== id)
      .map((u) => (u.warband?.allowed ? { ...u, warband: { ...u.warband, allowed: u.warband.allowed.filter((a) => a !== id) } } : u)),
    armies: d.armies.map((a) => ({ ...a, units: a.units.filter((e) => e.unit !== id) })),
  };
}

export function duplicateUnit(d: PackDraft, id: string): { draft: PackDraft; id: string } {
  const src = d.units.find((u) => u.id === id);
  if (!src) return { draft: d, id };
  const copy = structuredClone(src);
  const newId = uniqueId(slugify(`${src.name} copy`), ids(d.units));
  const dup: Unit = { ...copy, id: newId, name: `${src.name} (copy)`, unique: false };
  const at = d.units.findIndex((u) => u.id === id);
  const units = [...d.units.slice(0, at + 1), dup, ...d.units.slice(at + 1)];
  // The copy can be fielded wherever the original can.
  const armies = d.armies.map((a) => {
    const e = a.units.find((x) => x.unit === id);
    return e ? { ...a, units: [...a.units, { unit: newId, ...(e.max ? { max: e.max } : {}) }] } : a;
  });
  return { id: newId, draft: { ...d, units, armies } };
}

export function addOption(d: PackDraft, unitId: string, name: string): PackDraft {
  const u = d.units.find((x) => x.id === unitId);
  if (!u) return d;
  const id = uniqueId(slugify(name), u.options.map((o) => o.id));
  return updateUnit(d, unitId, { options: [...u.options, { id, name: name.trim() || 'New option', cost: 0 }] });
}

// --- Armies ---

export function addArmy(d: PackDraft, name: string): { draft: PackDraft; id: string } {
  const id = uniqueId(slugify(name), ids(d.armies));
  const army: Army = { id, name: name.trim() || 'New army', side: 'Side', units: [], allies: [] };
  return { id, draft: { ...d, armies: [...d.armies, army] } };
}

export const updateArmy = (d: PackDraft, id: string, patch: Partial<Army>): PackDraft => ({ ...d, armies: patchIn(d.armies, id, patch) });

export function removeArmy(d: PackDraft, id: string): PackDraft {
  return { ...d, armies: d.armies.filter((a) => a.id !== id).map((a) => ({ ...a, allies: a.allies.filter((al) => al.army !== id) })) };
}

export function setArmyUnit(d: PackDraft, armyId: string, unitId: string, present: boolean, max?: number): PackDraft {
  const a = d.armies.find((x) => x.id === armyId);
  if (!a) return d;
  const without = a.units.filter((e) => e.unit !== unitId);
  const units = present ? [...without, { unit: unitId, ...(max ? { max } : {}) }] : without;
  // Keep the army's own order stable by the pack's unit order.
  const order = new Map(d.units.map((u, i) => [u.id, i]));
  units.sort((x, y) => (order.get(x.unit) ?? 0) - (order.get(y.unit) ?? 0));
  return updateArmy(d, armyId, { units });
}

// --- Checking ---

/** What stops this draft being used, in plain words. Empty when it is ready. */
export function problems(d: PackDraft): string[] {
  const r = loadPack(d);
  return r.ok ? [] : r.errors;
}

/** The draft in the exact shape the app holds a loaded pack in (defaults filled in, keys in order), or null if it cannot be loaded. */
export function normalized(d: PackDraft): Pack | null {
  const r = loadPack(d);
  return r.ok ? r.index.pack : null;
}

/** Saved lists that name a unit or army the draft does not have, so they would stop working if the draft were used. */
export function brokenLists(d: PackDraft, lists: ArmyList[]): ArmyList[] {
  const units = new Set(d.units.map((u) => u.id));
  const armies = new Set(d.armies.map((a) => a.id));
  return lists.filter((l) => l.pack === d.id && (!armies.has(l.army) || l.warbands.some((w) => !armies.has(w.army) || [w.leader, ...w.members].some((e) => e && !units.has(e.unit)))));
}

// --- Units from a table ---

export const UNIT_CSV_COLUMNS = ['name', 'kind', 'tier', 'cost', 'unique', 'move', 'fight', 'shoot', 'strength', 'defence', 'attacks', 'wounds', 'courage', 'might', 'will', 'fate', 'rules', 'wargear', 'keywords', 'army'] as const;

/** Header names people use, mapped to the column they mean. Single letters follow the usual stat-line order. */
const ALIASES: Record<string, (typeof UNIT_CSV_COLUMNS)[number]> = {
  name: 'name', unit: 'name', model: 'name', kind: 'kind', type: 'kind', tier: 'tier', class: 'tier', cost: 'cost', points: 'cost', pts: 'cost',
  unique: 'unique', move: 'move', m: 'move', mv: 'move', fight: 'fight', f: 'fight', fv: 'fight', shoot: 'shoot', sh: 'shoot', shooting: 'shoot',
  strength: 'strength', str: 'strength', s: 'strength', defence: 'defence', defense: 'defence', def: 'defence', d: 'defence',
  attacks: 'attacks', att: 'attacks', a: 'attacks', wounds: 'wounds', w: 'wounds', wd: 'wounds', wnd: 'wounds', wnds: 'wounds', courage: 'courage', cou: 'courage', c: 'courage',
  might: 'might', mi: 'might', will: 'will', wi: 'will', fate: 'fate', fa: 'fate',
  rules: 'rules', 'special rules': 'rules', abilities: 'rules', wargear: 'wargear', equipment: 'wargear', keywords: 'keywords', tags: 'keywords',
  army: 'army', armies: 'army',
};

const list = (cell: string): string[] => cell.split(/[;|]/).map((x) => x.trim()).filter(Boolean);
const yes = (cell: string): boolean => /^(y|yes|true|1|x)$/i.test(cell.trim());

export interface CsvImport {
  draft: PackDraft;
  added: number;
  updated: number;
  /** Rules, wargear and armies named in the table that the pack did not have yet, now created (rules and wargear empty, for filling in). */
  created: { rules: number; wargear: number; armies: number };
  /** Rows that could not be used, and why. The rest are still imported. */
  problems: string[];
}

/**
 * Add or update units from a pasted table. The first row names the columns (name, cost, move, fight, shoot, strength, defence, attacks, wounds,
 * courage, might, will, fate, kind, tier, rules, wargear, keywords, army, unique). A unit whose name is already in the pack is updated, not
 * duplicated. Rule, wargear and army names that do not exist yet are created.
 */
export function importUnitsCsv(d: PackDraft, text: string, opts: { armyId?: string } = {}): CsvImport {
  const rows = parseCsv(text);
  const result: CsvImport = { draft: d, added: 0, updated: 0, created: { rules: 0, wargear: 0, armies: 0 }, problems: [] };
  if (rows.length === 0) { result.problems.push('The table is empty.'); return result; }

  const header = rows[0]!.map((h) => ALIASES[h.trim().toLowerCase().replace(/[^a-z ]/g, '')]);
  const col = (name: (typeof UNIT_CSV_COLUMNS)[number]) => header.indexOf(name);
  if (col('name') < 0) { result.problems.push('The first row must name the columns, and one of them must be "name".'); return result; }
  const unknown = rows[0]!.filter((_, i) => header[i] === undefined && rows[0]![i]!.trim() !== '');
  if (unknown.length > 0) result.problems.push(`Ignored columns: ${unknown.map((u) => `"${u.trim()}"`).join(', ')}.`);

  let draft = d;
  const findByName = <T extends { id: string; name: string }>(items: T[], name: string) => items.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());

  rows.slice(1).forEach((cells, r) => {
    const get = (c: (typeof UNIT_CSV_COLUMNS)[number]) => (col(c) >= 0 ? (cells[col(c)] ?? '').trim() : '');
    const name = get('name');
    const where = `Row ${r + 2}${name ? ` (${name})` : ''}`;
    if (!name) { result.problems.push(`${where}: no name.`); return; }

    const fail = (what: string) => { result.problems.push(`${where}: ${what}`); };
    const int = (c: (typeof UNIT_CSV_COLUMNS)[number], fallback: number | null): number | null | 'bad' => {
      const raw = get(c).replace(/["”″']/g, '').replace(/\+$/, '').trim();
      if (raw === '') return fallback;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : 'bad';
    };

    // "5/4+" in the fight column means Fight 5 and a 4+ to shoot.
    let fightCell = get('fight');
    let shootCell = get('shoot');
    if (fightCell.includes('/') && shootCell === '') [fightCell, shootCell] = fightCell.split('/').map((x) => x.trim()) as [string, string];
    const shootRaw = shootCell.replace(/\+$/, '').trim();
    const shoot = shootRaw === '' || shootRaw === '-' || shootRaw === '–' ? null : Number(shootRaw);
    if (shoot !== null && (!Number.isInteger(shoot) || shoot < 2 || shoot > 6)) return fail(`shoot "${shootCell}" should be a number from 2 to 6 (for 2+ to 6+), or empty.`);

    const existing = findByName(draft.units, name);
    const base = existing?.stats ?? ZERO_STATS;
    const stat = (c: 'move' | 'strength' | 'defence' | 'attacks' | 'wounds' | 'courage' | 'might' | 'will' | 'fate', fallback: number): number | 'bad' => {
      const v = int(c, fallback);
      return v === null ? fallback : v;
    };
    const fightV = fightCell === '' ? base.fight : Number(fightCell.replace(/["”″']/g, ''));
    if (!Number.isFinite(fightV) || fightV < 0) return fail(`fight "${fightCell}" is not a number.`);
    const values = {
      move: stat('move', base.move), strength: stat('strength', base.strength), defence: stat('defence', base.defence), attacks: stat('attacks', base.attacks),
      wounds: stat('wounds', base.wounds), courage: stat('courage', base.courage), might: stat('might', base.might), will: stat('will', base.will), fate: stat('fate', base.fate),
    };
    const badStat = (Object.keys(values) as (keyof typeof values)[]).find((k) => values[k] === 'bad');
    if (badStat) return fail(`${badStat} "${get(badStat)}" is not a number.`);
    if ((values.wounds as number) < 1) return fail('wounds must be at least 1.');
    const cost = int('cost', existing?.cost ?? 0);
    if (cost === 'bad' || cost === null) return fail(`cost "${get('cost')}" is not a number.`);

    const kindRaw = get('kind').toLowerCase();
    const isHero = /^(h|hero|heroes)$/.test(kindRaw);
    const isWarrior = /^(w|warrior|warriors)$/.test(kindRaw);
    if (kindRaw !== '' && !isHero && !isWarrior) return fail(`kind "${get('kind')}" should be hero or warrior.`);
    const kind: Unit['kind'] = isHero ? 'hero' : isWarrior ? 'warrior' : (existing?.kind ?? 'warrior');

    // Rules and wargear by name; make the ones that do not exist yet.
    const resolve = <T extends { id: string; name: string }>(names: string[], items: () => T[], create: (n: string) => string, kindOf: 'rules' | 'wargear'): string[] =>
      names.map((n) => {
        const have = findByName(items(), n);
        if (have) return have.id;
        result.created[kindOf]++;
        return create(n);
      });
    const ruleIds = resolve(list(get('rules')), () => draft.rules, (n) => { const a = addRule(draft, n); draft = a.draft; return a.id; }, 'rules');
    const gearIds = resolve(list(get('wargear')), () => draft.wargear, (n) => { const a = addWargear(draft, n); draft = a.draft; return a.id; }, 'wargear');

    const parts: Partial<Unit> = {
      kind, cost, unique: get('unique') !== '' ? yes(get('unique')) : (existing?.unique ?? false),
      ...(get('tier') ? { tier: get('tier') } : existing?.tier ? { tier: existing.tier } : {}),
      stats: { ...values, shoot, fight: fightV } as Stats,
      rules: get('rules') !== '' || !existing ? ruleIds : existing.rules,
      wargear: get('wargear') !== '' || !existing ? gearIds : existing.wargear,
      keywords: get('keywords') !== '' || !existing ? list(get('keywords')) : existing.keywords,
    };

    let unitId: string;
    if (existing) {
      draft = updateUnit(draft, existing.id, parts);
      unitId = existing.id;
      result.updated++;
    } else {
      const a = addUnit(draft, name, parts);
      draft = a.draft;
      unitId = a.id;
      result.added++;
    }

    // Armies: those named in the row, or else the one the importer was pointed at.
    const armyNames = list(get('army'));
    const targets: string[] = armyNames.map((n) => {
      const have = findByName(draft.armies, n);
      if (have) return have.id;
      const a = addArmy(draft, n);
      draft = a.draft;
      result.created.armies++;
      return a.id;
    });
    if (targets.length === 0 && opts.armyId && !existing) targets.push(opts.armyId);
    for (const armyId of targets) draft = setArmyUnit(draft, armyId, unitId, true, draft.armies.find((a) => a.id === armyId)?.units.find((e) => e.unit === unitId)?.max);
  });

  result.draft = draft;
  return result;
}

/** The pack's units as a table, to edit in a spreadsheet and bring back with importUnitsCsv. (Options and warband limits are not included.) */
export function unitsToCsv(d: PackDraft): string {
  const rule = new Map(d.rules.map((r) => [r.id, r.name]));
  const gear = new Map(d.wargear.map((w) => [w.id, w.name]));
  const lines = [csvLine([...UNIT_CSV_COLUMNS])];
  for (const u of d.units) {
    const s = u.stats;
    lines.push(csvLine([
      u.name, u.kind, u.tier ?? '', u.cost, u.unique ? 'yes' : '', s.move, s.fight, s.shoot === null ? '' : s.shoot, s.strength, s.defence, s.attacks, s.wounds, s.courage, s.might, s.will, s.fate,
      u.rules.map((r) => rule.get(r) ?? r).join('; '), u.wargear.map((w) => gear.get(w) ?? w).join('; '), u.keywords.join('; '),
      d.armies.filter((a) => a.units.some((e) => e.unit === u.id)).map((a) => a.name).join('; '),
    ]));
  }
  return lines.join('\n') + '\n';
}
