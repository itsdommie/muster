import type { PackIndex } from './pack.js';
import type { SpecialRule, Unit, Wargear } from './schema.js';

// Query language for the unit database. Terms are ANDed; `or` between terms starts an alternative; a leading `-` negates.
//
//   spearman                  name, keyword or tier contains the word
//   "light footed"            quoted phrase
//   f>=5 d>5 cost<=60         numeric filters (m f sh s d a w c mi wi fa cost)
//   r:terror  rt:"half"       has a rule whose name / text contains
//   g:bow  o:shield           carries wargear / offers an option containing
//   k:cavalry  army:vale      keyword / army contains
//   kind:hero  tier:sage      kind equals / tier contains
//   is:unique  is:ranged      flags: hero warrior unique ranged shooter
//   -k:infantry               negation
//   is:hero f>=6 or k:wizard  alternatives

export interface UnitSearch {
  units: Unit[];
  /** Problems in the query. Unusable terms are skipped and the rest still applies. */
  errors: string[];
}

const NUMERIC: Record<string, (u: Unit) => number | null> = {
  m: (u) => u.stats.move, move: (u) => u.stats.move,
  f: (u) => u.stats.fight, fight: (u) => u.stats.fight,
  sh: (u) => u.stats.shoot, shoot: (u) => u.stats.shoot,
  s: (u) => u.stats.strength, strength: (u) => u.stats.strength,
  d: (u) => u.stats.defence, defence: (u) => u.stats.defence, defense: (u) => u.stats.defence,
  a: (u) => u.stats.attacks, attacks: (u) => u.stats.attacks,
  w: (u) => u.stats.wounds, wounds: (u) => u.stats.wounds,
  c: (u) => u.stats.courage, courage: (u) => u.stats.courage,
  mi: (u) => u.stats.might, might: (u) => u.stats.might,
  wi: (u) => u.stats.will, will: (u) => u.stats.will,
  fa: (u) => u.stats.fate, fate: (u) => u.stats.fate,
  cost: (u) => u.cost, pts: (u) => u.cost, points: (u) => u.cost,
};

const TEXT_KEYS = ['k', 'keyword', 'r', 'rule', 'rt', 'ruletext', 'g', 'gear', 'wargear', 'o', 'option', 'army', 'name', 'tier', 'kind', 't', 'is'] as const;

/** Everything about a unit that queries look at, lower-cased once. */
interface Doc {
  unit: Unit;
  name: string;
  tier: string;
  keywords: string[];
  ruleNames: string[];
  ruleTexts: string[];
  wargear: string[];
  options: string[];
  armies: string[];
  ranged: boolean;
}

const docCache = new WeakMap<PackIndex, Doc[]>();

function docs(index: PackIndex): Doc[] {
  const cached = docCache.get(index);
  if (cached) return cached;
  const armiesOf = new Map<string, string[]>();
  for (const a of index.pack.armies) {
    for (const e of a.units) armiesOf.set(e.unit, [...(armiesOf.get(e.unit) ?? []), a.name.toLowerCase()]);
  }
  const built = index.pack.units.map((unit): Doc => {
    const gear = [...unit.wargear, ...unit.options.flatMap((o) => (o.wargear ? [o.wargear] : []))].map((id) => index.wargear.get(id));
    return {
      unit,
      name: unit.name.toLowerCase(),
      tier: (unit.tier ?? '').toLowerCase(),
      keywords: unit.keywords.map((k) => k.toLowerCase()),
      ruleNames: unit.rules.map((r) => index.rules.get(r)?.name.toLowerCase() ?? r),
      ruleTexts: unit.rules.map((r) => index.rules.get(r)?.text.toLowerCase() ?? ''),
      wargear: unit.wargear.map((id) => index.wargear.get(id)?.name.toLowerCase() ?? id),
      options: unit.options.map((o) => o.name.toLowerCase()),
      armies: armiesOf.get(unit.id) ?? [],
      ranged: gear.some((g) => g?.tags.some((t) => t === 'bow' || t === 'throwing')),
    };
  });
  docCache.set(index, built);
  return built;
}

type Pred = (d: Doc) => boolean;

const TOKEN = /\s*(-)?(?:([A-Za-z]+)(>=|<=|!=|:|=|>|<))?(?:"([^"]*)"|(\S+))/y;

function compare(op: string, left: number, right: number): boolean {
  switch (op) {
    case '>': return left > right;
    case '>=': return left >= right;
    case '<': return left < right;
    case '<=': return left <= right;
    case '!=': return left !== right;
    default: return left === right; // ':' and '='
  }
}

function compileTerm(key: string | undefined, op: string | undefined, value: string, errors: string[]): Pred | null {
  const v = value.toLowerCase();
  if (!key) return (d) => d.name.includes(v) || d.tier.includes(v) || d.keywords.some((k) => k.includes(v));

  const k = key.toLowerCase();
  const numeric = NUMERIC[k];
  if (numeric) {
    if (k === 'sh' || k === 'shoot') {
      if (v === 'none' || v === '-') return op === '!=' ? (d) => numeric(d.unit) !== null : (d) => numeric(d.unit) === null;
    }
    const n = Number(value.replace(/\+$/, ''));
    if (value.trim() === '' || Number.isNaN(n)) {
      errors.push(`"${key}${op}${value}": expected a number.`);
      return null;
    }
    return (d) => {
      const left = numeric(d.unit);
      return left !== null && compare(op!, left, n);
    };
  }

  if (!(TEXT_KEYS as readonly string[]).includes(k)) {
    errors.push(`Unknown filter "${key}".`);
    return null;
  }
  if (op !== ':' && op !== '=' && op !== '!=') {
    errors.push(`"${key}" can only be used with ":" or "=".`);
    return null;
  }
  const test = (list: string[]): boolean => (op === '=' || op === '!=' ? list.includes(v) : list.some((x) => x.includes(v)));
  const withNeq = (p: Pred): Pred => (op === '!=' ? (d) => !p(d) : p);

  switch (k) {
    case 'k': case 'keyword': return withNeq((d) => test(d.keywords));
    case 'r': case 'rule': return withNeq((d) => test(d.ruleNames));
    case 'rt': case 'ruletext': return withNeq((d) => d.ruleTexts.some((t) => t.includes(v)));
    case 'g': case 'gear': case 'wargear': return withNeq((d) => test(d.wargear));
    case 'o': case 'option': return withNeq((d) => test(d.options));
    case 'army': return withNeq((d) => test(d.armies));
    case 'name': return withNeq((d) => (op === ':' ? d.name.includes(v) : d.name === v));
    case 'tier': return withNeq((d) => (op === ':' ? d.tier.includes(v) : d.tier === v));
    case 'kind': case 't': return withNeq((d) => d.unit.kind === v);
    case 'is': {
      const flags: Record<string, Pred> = {
        hero: (d) => d.unit.kind === 'hero',
        warrior: (d) => d.unit.kind === 'warrior',
        unique: (d) => d.unit.unique,
        ranged: (d) => d.ranged,
        shooter: (d) => d.unit.stats.shoot !== null,
      };
      const flag = flags[v];
      if (!flag) {
        errors.push(`Unknown flag "is:${value}". Try ${Object.keys(flags).join(', ')}.`);
        return null;
      }
      return withNeq(flag);
    }
    default: return null;
  }
}

/** Parse a query into alternatives (each a list of predicates that must all hold). */
function parse(query: string): { groups: Pred[][]; errors: string[] } {
  const errors: string[] = [];
  const groups: Pred[][] = [[]];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while (TOKEN.lastIndex < query.length && (m = TOKEN.exec(query))) {
    const [, neg, key, op, quoted, bare] = m;
    const value = quoted ?? bare ?? '';
    if (!key && !neg && quoted === undefined && value.toLowerCase() === 'or') {
      groups.push([]);
      continue;
    }
    const term = compileTerm(key, op, value, errors);
    if (!term) continue;
    groups.at(-1)!.push(neg ? (d) => !term(d) : term);
  }
  return { groups: groups.filter((g) => g.length > 0), errors };
}

export function searchUnits(index: PackIndex, query: string): UnitSearch {
  const { groups, errors } = parse(query);
  const all = docs(index);
  const hits = groups.length === 0 ? all : all.filter((d) => groups.some((g) => g.every((p) => p(d))));
  return { units: hits.map((d) => d.unit), errors };
}

// --- Rules and wargear reference ---

const words = (q: string): string[] => q.toLowerCase().split(/\s+/).filter(Boolean);

export function searchRules(index: PackIndex, query: string, category?: string): SpecialRule[] {
  const ws = words(query);
  return index.pack.rules
    .filter((r) => !category || r.category === category)
    .filter((r) => {
      const hay = `${r.name} ${r.category ?? ''} ${r.text}`.toLowerCase();
      return ws.every((w) => hay.includes(w));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function ruleCategories(index: PackIndex): string[] {
  return [...new Set(index.pack.rules.flatMap((r) => (r.category ? [r.category] : [])))].sort();
}

/** Units that carry a rule, directly or through their profile. */
export function unitsWithRule(index: PackIndex, ruleId: string): Unit[] {
  return index.pack.units.filter((u) => u.rules.includes(ruleId));
}

export function searchWargear(index: PackIndex, query: string): Wargear[] {
  const ws = words(query);
  return index.pack.wargear
    .filter((w) => {
      const hay = `${w.name} ${w.tags.join(' ')} ${w.description ?? ''}`.toLowerCase();
      return ws.every((x) => hay.includes(x));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Armies a unit can be taken in. */
export function armiesOfUnit(index: PackIndex, unitId: string): { id: string; name: string; max?: number }[] {
  return index.pack.armies.flatMap((a) => {
    const e = a.units.find((u) => u.unit === unitId);
    return e ? [{ id: a.id, name: a.name, ...(e.max ? { max: e.max } : {}) }] : [];
  });
}
