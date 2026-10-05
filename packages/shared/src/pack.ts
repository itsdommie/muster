import { packSchema, type Army, type Pack, type Scenario, type SpecialRule, type Unit, type Wargear } from './schema.js';

/** A validated pack plus lookup tables. All engine functions take this, never raw JSON. */
export interface PackIndex {
  pack: Pack;
  units: Map<string, Unit>;
  wargear: Map<string, Wargear>;
  rules: Map<string, SpecialRule>;
  armies: Map<string, Army>;
  scenarios: Map<string, Scenario>;
}

export type PackResult = { ok: true; index: PackIndex } | { ok: false; errors: string[] };

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const i of ids) (seen.has(i) ? dup : seen).add(i);
  return [...dup];
}

/** Parse and cross-check a data pack. Errors are human-readable so the pack editor/loader can show them. */
export function loadPack(json: unknown): PackResult {
  const parsed = packSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'pack'}: ${i.message}`),
    };
  }
  const pack = parsed.data;
  const errors: string[] = [];

  const collections: [string, string[]][] = [
    ['unit', pack.units.map((u) => u.id)],
    ['wargear', pack.wargear.map((w) => w.id)],
    ['rule', pack.rules.map((r) => r.id)],
    ['army', pack.armies.map((a) => a.id)],
    ['scenario', pack.scenarios.map((x) => x.id)],
  ];
  for (const [label, ids] of collections) {
    for (const d of duplicates(ids)) errors.push(`duplicate ${label} id "${d}"`);
  }

  const units = new Map(pack.units.map((u) => [u.id, u]));
  const wargear = new Map(pack.wargear.map((w) => [w.id, w]));
  const rules = new Map(pack.rules.map((r) => [r.id, r]));
  const armies = new Map(pack.armies.map((a) => [a.id, a]));

  for (const u of pack.units) {
    for (const w of u.wargear) if (!wargear.has(w)) errors.push(`unit "${u.id}" uses unknown wargear "${w}"`);
    for (const r of u.rules) if (!rules.has(r)) errors.push(`unit "${u.id}" uses unknown rule "${r}"`);
    for (const d of duplicates(u.options.map((o) => o.id))) errors.push(`unit "${u.id}" has duplicate option "${d}"`);
    for (const o of u.options) {
      if (o.wargear && !wargear.has(o.wargear)) errors.push(`option "${u.id}/${o.id}" uses unknown wargear "${o.wargear}"`);
    }
    for (const a of u.warband?.allowed ?? []) {
      const target = units.get(a);
      if (!target) errors.push(`unit "${u.id}" warband allows unknown unit "${a}"`);
      else if (target.kind !== 'warrior') errors.push(`unit "${u.id}" warband allows "${a}", which is not a warrior`);
    }
    if (u.kind === 'warrior' && u.warband) errors.push(`warrior "${u.id}" cannot define a warband`);
  }
  for (const a of pack.armies) {
    for (const e of a.units) if (!units.has(e.unit)) errors.push(`army "${a.id}" lists unknown unit "${e.unit}"`);
    for (const d of duplicates(a.units.map((e) => e.unit))) errors.push(`army "${a.id}" lists unit "${d}" twice`);
    if (!a.units.some((e) => units.get(e.unit)?.kind === 'hero')) errors.push(`army "${a.id}" has no hero to lead a warband`);
    for (const al of a.allies) {
      if (!armies.has(al.army)) errors.push(`army "${a.id}" allies with unknown army "${al.army}"`);
      if (al.army === a.id) errors.push(`army "${a.id}" lists itself as an ally`);
      if (!(al.level in pack.ruleset.allyLimits)) errors.push(`army "${a.id}" uses ally level "${al.level}" missing from ruleset.allyLimits`);
    }
  }

  const camp = pack.ruleset.campaign;
  if (camp) {
    for (const d of duplicates(camp.advancements.map((a) => a.id))) errors.push(`duplicate advancement id "${d}"`);
    for (const d of duplicates(camp.injuries.map((i) => i.id))) errors.push(`duplicate injury id "${d}"`);
    const ats = camp.levels.map((l) => l.at);
    if (camp.levels.length > 0 && ats[0] !== 0) errors.push('campaign levels must start at 0 experience');
    if (ats.some((a, i) => i > 0 && a <= ats[i - 1]!)) errors.push('campaign levels must be in increasing order of experience');
    for (const a of camp.advancements) {
      if (a.minLevel >= Math.max(1, camp.levels.length)) errors.push(`advancement "${a.id}" needs level ${a.minLevel}, which does not exist`);
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, index: { pack, units, wargear, rules, armies, scenarios: new Map(pack.scenarios.map((x) => [x.id, x])) } };
}
