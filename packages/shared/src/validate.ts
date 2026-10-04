import { entryWargear, listCost, warbandCost, warbandEntries, type ArmyList, type ListEntry } from './list.js';
import type { PackIndex } from './pack.js';

export interface Issue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  warband?: string;
}

export interface Summary {
  points: number;
  limit: number;
  models: number;
  warbands: number;
  heroes: number;
  /** Models carrying a bow or throwing weapon. */
  bowModels: number;
  /** The most such models the ruleset allows for this many models. */
  bowAllowed: number;
  /** Number of models that must be lost for the force to be broken. */
  breakAt: number;
  alliedPoints: number;
}

export interface Validation {
  issues: Issue[];
  summary: Summary;
  valid: boolean;
}

const RANGED_TAGS = ['bow', 'throwing'];

export function validateList(index: PackIndex, list: ArmyList): Validation {
  const { ruleset } = index.pack;
  const issues: Issue[] = [];
  const err = (code: string, message: string, warband?: string) => issues.push({ severity: 'error', code, message, ...(warband ? { warband } : {}) });
  const warn = (code: string, message: string, warband?: string) => issues.push({ severity: 'warning', code, message, ...(warband ? { warband } : {}) });

  const mainArmy = index.armies.get(list.army);
  if (!mainArmy) err('unknown-army', `Army "${list.army}" is not in the loaded data pack.`);

  const unitTotals = new Map<string, number>(); // per-army cap check: key `${army}/${unit}`
  const uniqueTotals = new Map<string, number>();
  let models = 0;
  let heroes = 0;
  let bowModels = 0;
  let alliedPoints = 0;

  const checkEntry = (e: ListEntry, armyId: string, wid: string, where: string) => {
    const unit = index.units.get(e.unit);
    if (!unit) return err('unknown-unit', `${where}: unit "${e.unit}" is not in the data pack.`, wid);
    const army = index.armies.get(armyId);
    if (army && !army.units.some((u) => u.unit === unit.id)) {
      err('unit-not-in-army', `${unit.name} is not available to ${army.name}.`, wid);
    }
    const chosen = new Set<string>();
    const groups = new Map<string, string>();
    for (const oid of e.options) {
      const opt = unit.options.find((o) => o.id === oid);
      if (!opt) {
        err('unknown-option', `${unit.name} has no option "${oid}".`, wid);
        continue;
      }
      if (chosen.has(oid)) err('duplicate-option', `${unit.name} takes "${opt.name}" more than once.`, wid);
      chosen.add(oid);
      if (opt.group) {
        const prior = groups.get(opt.group);
        if (prior) err('option-conflict', `${unit.name} cannot take both "${prior}" and "${opt.name}" (${opt.group}).`, wid);
        groups.set(opt.group, opt.name);
      }
    }
    const key = `${armyId}/${unit.id}`;
    unitTotals.set(key, (unitTotals.get(key) ?? 0) + e.count);
    uniqueTotals.set(unit.id, (uniqueTotals.get(unit.id) ?? 0) + e.count);
    models += e.count;
    if (unit.kind === 'hero') heroes += e.count;
    const carried = entryWargear(unit, e.options).some((w) => index.wargear.get(w)?.tags.some((t) => RANGED_TAGS.includes(t)));
    if (carried) bowModels += e.count;
  };

  list.warbands.forEach((w, i) => {
    const label = `Warband ${i + 1}`;
    const army = index.armies.get(w.army);
    const entries = warbandEntries(w);
    if (!army) err('unknown-army', `${label}: army "${w.army}" is not in the loaded data pack.`, w.id);
    if (entries.length === 0) {
      warn('warband-empty', `${label} is empty.`, w.id);
      return;
    }

    const leaderUnit = w.leader ? index.units.get(w.leader.unit) : undefined;
    if (!w.leader) err('warband-no-leader', `${label} has no hero to lead it.`, w.id);
    else if (leaderUnit && leaderUnit.kind !== 'hero') err('leader-not-hero', `${label}: ${leaderUnit.name} is not a hero.`, w.id);
    if (w.leader && w.leader.count !== 1) err('leader-count', `${label} must have exactly one leader.`, w.id);

    if (w.army !== list.army && mainArmy) {
      const rel = mainArmy.allies.find((a) => a.army === w.army);
      if (!rel) err('not-allied', `${army?.name ?? w.army} cannot ally with ${mainArmy.name}.`, w.id);
      else alliedPoints += warbandCost(index, w);
    }

    if (w.leader) checkEntry(w.leader, w.army, w.id, label);
    for (const m of w.members) {
      checkEntry(m, w.army, w.id, label);
      const mu = index.units.get(m.unit);
      if (mu?.kind === 'hero') err('hero-as-member', `${label}: ${mu.name} is a hero and can only lead a warband.`, w.id);
      if (mu && leaderUnit?.warband?.allowed && !leaderUnit.warband.allowed.includes(mu.id)) {
        err('not-in-warband', `${leaderUnit.name} cannot lead ${mu.name}.`, w.id);
      }
    }

    const max = leaderUnit?.warband?.size ?? ruleset.warbandSize;
    const followers = w.members.reduce((n, m) => n + m.count, 0);
    if (followers > max) err('warband-too-large', `${label} has ${followers} warriors; ${leaderUnit?.name ?? 'its leader'} can lead at most ${max}.`, w.id);
  });

  // Per-army unit caps and unique models.
  for (const [key, total] of unitTotals) {
    const [armyId, unitId] = key.split('/') as [string, string];
    const cap = index.armies.get(armyId)?.units.find((u) => u.unit === unitId)?.max;
    const name = index.units.get(unitId)?.name ?? unitId;
    if (cap !== undefined && total > cap) err('unit-limit', `${name}: ${total} taken, at most ${cap} allowed.`);
  }
  for (const [unitId, total] of uniqueTotals) {
    const u = index.units.get(unitId);
    if (u?.unique && total > 1) err('unique-duplicate', `${u.name} is unique and can only be taken once.`);
  }

  const points = listCost(index, list);
  if (points > list.limit) err('over-limit', `The list costs ${points} points, ${points - list.limit} over the ${list.limit} limit.`);

  const bowAllowed = Math.floor(models * ruleset.bowLimit + 1e-9);
  if (bowModels > bowAllowed) err('bow-limit', `${bowModels} models carry bows or throwing weapons; at most ${bowAllowed} are allowed for ${models} models.`);

  if (mainArmy) {
    // Ally points are capped per relationship level.
    const byLevel = new Map<string, number>();
    for (const w of list.warbands) {
      if (w.army === list.army) continue;
      const level = mainArmy.allies.find((a) => a.army === w.army)?.level;
      if (level) byLevel.set(level, (byLevel.get(level) ?? 0) + warbandCost(index, w));
    }
    for (const [level, pts] of byLevel) {
      const cap = ruleset.allyLimits[level];
      if (cap !== null && cap !== undefined && pts > (list.limit * cap) / 100) {
        err('ally-limit', `${level} allies cost ${pts} points; at most ${cap}% of the ${list.limit} limit (${Math.floor((list.limit * cap) / 100)}) is allowed.`);
      }
    }
  }

  if (list.warbands.length === 0) warn('no-warbands', 'Add a warband to start building.');

  return {
    issues,
    valid: !issues.some((i) => i.severity === 'error'),
    summary: {
      points,
      limit: list.limit,
      models,
      warbands: list.warbands.length,
      heroes,
      bowModels,
      bowAllowed,
      breakAt: Math.ceil(models * ruleset.break - 1e-9),
      alliedPoints,
    },
  };
}
