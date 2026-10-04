import { describe, expect, it } from 'vitest';
import { sampleIndex } from './fixtures.js';
import { addUnit, addWarband, entryCost, newList, removeEntry, setCount, setOptions, toggleOption, warbandCost } from './list.js';
import { validateList } from './validate.js';

const idx = sampleIndex();
const unit = (id: string) => idx.units.get(id)!;
const codes = (list: ReturnType<typeof newList>) => validateList(idx, list).issues.map((i) => i.code);

/** A list with one warband led by `leader`, then each [unit, count] added. */
function build(army: string, leader: string, members: [string, number][] = [], limit = 500) {
  let list = addWarband(newList(idx, army, limit));
  const wid = () => list.warbands.at(-1)!.id;
  list = addUnit(list, wid(), unit(leader));
  for (const [id, n] of members) for (let i = 0; i < n; i++) list = addUnit(list, wid(), unit(id));
  return list;
}

describe('points', () => {
  it('sums unit and option costs times count', () => {
    let list = build('vale-realm', 'aldric-the-bold', [['vale-spearman', 4]]);
    expect(validateList(idx, list).summary.points).toBe(90 + 4 * 8);
    const wid = list.warbands[0]!.id;
    list = setOptions(list, wid, 0, ['shield']);
    expect(entryCost(idx, list.warbands[0]!.members[0]!)).toBe(4 * 9);
    list = setOptions(list, wid, 'leader', ['warhorse', 'lance']);
    expect(warbandCost(idx, list.warbands[0]!)).toBe(90 + 10 + 5 + 36);
  });

  it('flags a list over the limit', () => {
    const list = build('vale-realm', 'aldric-the-bold', [['vale-spearman', 10]], 150);
    expect(codes(list)).toContain('over-limit');
    expect(codes(build('vale-realm', 'aldric-the-bold', [['vale-spearman', 10]], 170))).not.toContain('over-limit');
  });
});

describe('list editing', () => {
  it('merges identical warriors and replaces the leader', () => {
    let list = build('vale-realm', 'aldric-the-bold', [['vale-spearman', 3]]);
    expect(list.warbands[0]!.members).toEqual([{ unit: 'vale-spearman', options: [], count: 3 }]);
    list = addUnit(list, list.warbands[0]!.id, unit('sera-windfletcher'));
    expect(list.warbands[0]!.leader?.unit).toBe('sera-windfletcher');
  });

  it('removes entries when the count drops to zero', () => {
    let list = build('vale-realm', 'aldric-the-bold', [['vale-spearman', 2]]);
    const wid = list.warbands[0]!.id;
    list = setCount(list, wid, 0, 0);
    expect(list.warbands[0]!.members).toEqual([]);
    list = removeEntry(list, wid, 'leader');
    expect(list.warbands[0]!.leader).toBeNull();
  });

  it('does not mutate the previous list', () => {
    const a = build('vale-realm', 'aldric-the-bold');
    const b = addUnit(a, a.warbands[0]!.id, unit('vale-spearman'));
    expect(a.warbands[0]!.members).toHaveLength(0);
    expect(b.warbands[0]!.members).toHaveLength(1);
  });

  it('toggleOption keeps exclusive groups consistent', () => {
    const aldric = unit('aldric-the-bold');
    expect(toggleOption(aldric, [], 'warhorse')).toEqual(['warhorse']);
    expect(toggleOption(aldric, ['warhorse'], 'lance')).toEqual(['warhorse', 'lance']); // different groups
    expect(toggleOption(aldric, ['warhorse'], 'warhorse')).toEqual([]);
    const raider = unit('marsh-raider');
    expect(toggleOption(raider, ['javelins'], 'shield')).toEqual(['javelins', 'shield']);
  });
});

describe('warband rules', () => {
  it('requires a leader and no heroes among the members', () => {
    let list = addWarband(newList(idx, 'vale-realm'));
    list = addUnit(list, list.warbands[0]!.id, unit('vale-spearman'));
    expect(codes(list)).toContain('warband-no-leader');

    const forged = build('vale-realm', 'aldric-the-bold');
    forged.warbands[0]!.members.push({ unit: 'sera-windfletcher', options: [], count: 1 });
    expect(codes(forged)).toContain('hero-as-member');
  });

  it('warns on an empty warband without erroring', () => {
    const v = validateList(idx, addWarband(newList(idx, 'vale-realm')));
    expect(v.issues.map((i) => i.code)).toEqual(['warband-empty']);
    expect(v.valid).toBe(true);
  });

  it('enforces the default warband size and per-hero overrides', () => {
    // Default is 12; Sera has no override.
    expect(codes(build('vale-realm', 'sera-windfletcher', [['vale-spearman', 12]]))).not.toContain('warband-too-large');
    expect(codes(build('vale-realm', 'sera-windfletcher', [['vale-spearman', 13]]))).toContain('warband-too-large');
    // Aldric leads 15; Marren only 6 and only spearmen/archers.
    expect(codes(build('vale-realm', 'aldric-the-bold', [['vale-spearman', 15]]))).not.toContain('warband-too-large');
    expect(codes(build('vale-realm', 'old-marren', [['vale-spearman', 7]]))).toContain('warband-too-large');
  });

  it('restricts who a hero may lead', () => {
    expect(codes(build('vale-realm', 'old-marren', [['vale-knight', 1]]))).toContain('not-in-warband');
    expect(codes(build('vale-realm', 'old-marren', [['vale-spearman', 1]]))).not.toContain('not-in-warband');
  });

  it('rejects units from another army', () => {
    expect(codes(build('vale-realm', 'aldric-the-bold', [['marsh-raider', 1]]))).toContain('unit-not-in-army');
  });
});

describe('army rules', () => {
  it('enforces per-army unit caps across warbands', () => {
    let list = build('vale-realm', 'aldric-the-bold', [['vale-knight', 4]]);
    list = addWarband(list);
    list = addUnit(list, list.warbands[1]!.id, unit('sera-windfletcher'));
    list = addUnit(list, list.warbands[1]!.id, unit('vale-knight'));
    list = addUnit(list, list.warbands[1]!.id, unit('vale-knight'));
    expect(codes(list)).not.toContain('unit-limit'); // 6 of 6
    list = addUnit(list, list.warbands[1]!.id, unit('vale-knight'));
    expect(codes(list)).toContain('unit-limit'); // 7 of 6
  });

  it('allows a unique model only once', () => {
    let list = build('vale-realm', 'aldric-the-bold');
    list = addWarband(list);
    list = addUnit(list, list.warbands[1]!.id, unit('aldric-the-bold'));
    expect(codes(list)).toContain('unique-duplicate');
    // Grub Chief is not unique.
    let horde = build('hollow-horde', 'grub-chief');
    horde = addWarband(horde);
    horde = addUnit(horde, horde.warbands[1]!.id, unit('grub-chief'));
    expect(codes(horde)).not.toContain('unique-duplicate');
  });

  it('catches conflicting and unknown options', () => {
    const list = build('hollow-horde', 'gorrath-skullmaker', [['marsh-raider', 1]]);
    list.warbands[0]!.members[0]!.options = ['shield', 'shield', 'nope'];
    const c = codes(list);
    expect(c).toContain('duplicate-option');
    expect(c).toContain('unknown-option');
    const conflict = build('vale-realm', 'aldric-the-bold');
    conflict.warbands[0]!.leader!.options = ['warhorse', 'lance'];
    expect(codes(conflict)).not.toContain('option-conflict');
    const clash = build('hollow-horde', 'grub-chief');
    clash.warbands[0]!.leader!.options = ['javelins', 'javelins'];
    expect(codes(clash)).toContain('duplicate-option');
  });
});

describe('bow limit and break point', () => {
  it('counts bows and throwing weapons, including those granted by options', () => {
    // 1 hero + 11 raiders = 12 models; floor(12 * 0.33) = 3 ranged allowed.
    let list = build('hollow-horde', 'gorrath-skullmaker', [['marsh-raider', 11]]);
    const wid = list.warbands[0]!.id;
    expect(validateList(idx, list).summary).toMatchObject({ models: 12, bowModels: 0, bowAllowed: 3 });
    list = setCount(list, wid, 0, 7); // 11 models, 3 ranged allowed; a 4th archer makes 12 models, still 3 allowed
    list = addUnit(list, wid, unit('crooked-archer'));
    list = addUnit(list, wid, unit('crooked-archer'));
    list = addUnit(list, wid, unit('crooked-archer'));
    const v = validateList(idx, list);
    expect(v.summary.bowModels).toBe(3);
    expect(v.issues.map((i) => i.code)).not.toContain('bow-limit');
    list = addUnit(list, wid, unit('crooked-archer'));
    expect(codes(list)).toContain('bow-limit');
  });

  it('counts javelins taken as an option', () => {
    let list = build('hollow-horde', 'gorrath-skullmaker', [['marsh-raider', 3]]);
    list = setOptions(list, list.warbands[0]!.id, 0, ['javelins']);
    // 4 models, floor(4 * .33) = 1 allowed, but 3 raiders now carry javelins.
    expect(validateList(idx, list).summary.bowModels).toBe(3);
    expect(codes(list)).toContain('bow-limit');
  });

  it('computes the break point from the ruleset fraction', () => {
    const list = build('vale-realm', 'aldric-the-bold', [['vale-spearman', 8]]);
    expect(validateList(idx, list).summary.breakAt).toBe(5); // 9 models, 50% rounded up
  });
});

describe('allies', () => {
  const withAlly = (armyLeader: string, army: string, allyArmy: string, allyLeader: string, allyMembers = 0, limit = 500) => {
    let list = build(army, armyLeader, [], limit);
    list = addWarband(list, allyArmy);
    const wid = list.warbands[1]!.id;
    list = addUnit(list, wid, unit(allyLeader));
    for (let i = 0; i < allyMembers; i++) list = addUnit(list, wid, unit('march-scout'));
    return list;
  };

  it('allows listed allies and rejects strangers', () => {
    expect(codes(withAlly('aldric-the-bold', 'vale-realm', 'free-marches', 'warden-hale'))).not.toContain('not-allied');
    expect(codes(withAlly('gorrath-skullmaker', 'hollow-horde', 'vale-realm', 'sera-windfletcher'))).toContain('not-allied');
  });

  it('applies the percentage cap only to levels that have one', () => {
    // Convenient allies are capped at 25% of 100 points = 25. Warden Hale alone costs 50.
    expect(codes(withAlly('gorrath-skullmaker', 'hollow-horde', 'free-marches', 'warden-hale', 0, 100))).toContain('ally-limit');
    expect(codes(withAlly('gorrath-skullmaker', 'hollow-horde', 'free-marches', 'warden-hale', 0, 400))).not.toContain('ally-limit');
    // Historical allies have no cap.
    expect(codes(withAlly('aldric-the-bold', 'vale-realm', 'free-marches', 'warden-hale', 6, 150))).not.toContain('ally-limit');
  });

  it('reports allied points in the summary', () => {
    const v = validateList(idx, withAlly('aldric-the-bold', 'vale-realm', 'free-marches', 'warden-hale', 2));
    expect(v.summary.alliedPoints).toBe(50 + 14);
  });
});
