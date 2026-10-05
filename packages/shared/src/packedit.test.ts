import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';
import { sample, sampleIndex } from './fixtures.js';
import { addUnit as addListUnit, addWarband, newList } from './list.js';
import { loadPack } from './pack.js';
import * as P from './packedit.js';

const idx = sampleIndex();
const draft = () => P.cloneDraft(idx.pack);
const unit = (d: P.PackDraft, id: string) => d.units.find((u) => u.id === id)!;

describe('ids', () => {
  it('turns names into plain ids', () => {
    expect(P.slugify('Aldric the Bold')).toBe('aldric-the-bold');
    expect(P.slugify("  Vale's  Champion! ")).toBe('vale-s-champion');
    expect(P.slugify('Éowyn Ünïcode')).toBe('eowyn-unicode');
    expect(P.slugify('!!!')).toBe('item');
    expect(P.slugify('')).toBe('item');
  });

  it('makes ids unique without disturbing existing ones', () => {
    expect(P.uniqueId('orc', [])).toBe('orc');
    expect(P.uniqueId('orc', ['orc'])).toBe('orc-2');
    expect(P.uniqueId('orc', ['orc', 'orc-2', 'orc-3'])).toBe('orc-4');
    expect(P.uniqueId('orc', ['orc-2'])).toBe('orc');
  });

  it('gives two things with the same name different ids', () => {
    let d = P.blankPack();
    d = P.addUnit(d, 'Guard').draft;
    d = P.addUnit(d, 'Guard').draft;
    expect(d.units.map((u) => u.id)).toEqual(['guard', 'guard-2']);
  });
});

describe('building a pack from nothing', () => {
  it('a blank pack is not usable until it has a hero in an army, and then it is', () => {
    let d = P.blankPack('Test pack');
    expect(d).toMatchObject({ id: 'test-pack', name: 'Test pack', version: '1.0.0' });
    expect(P.problems(d).length).toBeGreaterThan(0);

    d = P.addArmy(d, 'The Order').draft;
    expect(P.problems(d).join(' ')).toMatch(/at least 1|no hero|armies/i);
    const hero = P.addUnit(d, 'Captain', { kind: 'hero', cost: 50 });
    d = P.setArmyUnit(hero.draft, 'the-order', hero.id, true);
    expect(P.problems(d)).toEqual([]);
    expect(loadPack(d).ok).toBe(true);
  });

  it('new things start with sensible, complete values', () => {
    const d = P.blankPack();
    const u = P.addUnit(d, '  Guard  ').draft.units[0]!;
    expect(u).toMatchObject({ id: 'guard', name: 'Guard', kind: 'warrior', cost: 0, unique: false, wargear: [], rules: [], keywords: [], options: [] });
    expect(u.stats).toEqual(P.ZERO_STATS);
    expect(P.addWargear(d, 'Pike').draft.wargear[0]).toEqual({ id: 'pike', name: 'Pike', tags: [] });
    expect(P.addRule(d, 'Brave').draft.rules[0]).toEqual({ id: 'brave', name: 'Brave', text: '' });
    expect(P.addArmy(d, 'Order').draft.armies[0]).toMatchObject({ id: 'order', side: 'Side', units: [], allies: [] });
    expect(P.addScenario(d, 'Ford').draft.scenarios[0]).toMatchObject({ id: 'ford', setup: '', objectives: '', victory: '', tags: [] });
    expect(P.addUnit(d, '   ').draft.units[0]!.name).toBe('New unit');
  });

  it('edits keep the id fixed, so renaming never breaks a reference', () => {
    let d = draft();
    d = P.updateUnit(d, 'vale-archer', { name: 'Ranger', id: 'hacked' } as never);
    expect(unit(d, 'vale-archer').name).toBe('Ranger');
    expect(d.units.some((u) => u.id === 'hacked')).toBe(false);
    expect(d.armies[0]!.units.some((e) => e.unit === 'vale-archer')).toBe(true);
    expect(P.problems(d)).toEqual([]);
    d = P.updateStats(d, 'vale-archer', { fight: 4, shoot: 2 });
    expect(unit(d, 'vale-archer').stats).toMatchObject({ fight: 4, shoot: 2, strength: 3 });
    expect(P.updateStats(d, 'ghost', { fight: 9 })).toBe(d);
  });

  it('never mutates what it is given', () => {
    const d = draft();
    const before = JSON.stringify(d);
    P.addUnit(d, 'X'); P.updateUnit(d, 'vale-archer', { cost: 99 }); P.removeUnit(d, 'vale-archer'); P.removeWargear(d, 'longbow');
    P.removeRule(d, 'terror'); P.duplicateUnit(d, 'vale-archer'); P.setArmyUnit(d, 'vale-realm', 'vale-archer', false); P.removeArmy(d, 'free-marches');
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('deleting cleans up everything that pointed at it', () => {
  it('a unit leaves its armies and every hero\'s list of followers', () => {
    const d = P.removeUnit(draft(), 'vale-archer');
    expect(d.units.some((u) => u.id === 'vale-archer')).toBe(false);
    expect(d.armies.find((a) => a.id === 'vale-realm')!.units.some((e) => e.unit === 'vale-archer')).toBe(false);
    expect(unit(d, 'old-marren').warband!.allowed).toEqual(['vale-spearman']);
    expect(P.problems(d)).toEqual([]);
  });

  it('wargear leaves every unit and every option that gave it, but the option stays', () => {
    const d = P.removeWargear(draft(), 'shield');
    expect(d.wargear.some((w) => w.id === 'shield')).toBe(false);
    expect(unit(d, 'aldric-the-bold').wargear).toEqual(['sword']);
    expect(unit(d, 'vale-spearman').options.find((o) => o.id === 'shield')).toEqual({ id: 'shield', name: 'Shield', cost: 1, group: 'shield' });
    expect(P.problems(d)).toEqual([]);
  });

  it('a rule leaves every unit that had it', () => {
    const d = P.removeRule(draft(), 'terror');
    expect(unit(d, 'gorrath-skullmaker').rules).toEqual(['brutal-charge']);
    expect(unit(d, 'vexa-the-hex').rules).toEqual(['hex']);
    expect(P.problems(d)).toEqual([]);
  });

  it('an army leaves every other army\'s allies', () => {
    const d = P.removeArmy(draft(), 'free-marches');
    expect(d.armies.map((a) => a.id)).toEqual(['vale-realm', 'hollow-horde']);
    expect(d.armies.every((a) => a.allies.length === 0)).toBe(true);
    expect(P.problems(d)).toEqual([]);
  });

  it('removing anything at all from the sample pack never leaves a dangling reference (property)', () => {
    const base = draft();
    const cases: [string, P.PackDraft][] = [
      ...base.units.map((u) => [`unit ${u.id}`, P.removeUnit(base, u.id)] as [string, P.PackDraft]),
      ...base.wargear.map((w) => [`wargear ${w.id}`, P.removeWargear(base, w.id)] as [string, P.PackDraft]),
      ...base.rules.map((r) => [`rule ${r.id}`, P.removeRule(base, r.id)] as [string, P.PackDraft]),
      ...base.armies.map((a) => [`army ${a.id}`, P.removeArmy(base, a.id)] as [string, P.PackDraft]),
    ];
    expect(cases.length).toBeGreaterThan(30);
    for (const [what, d] of cases) {
      // Removing a hero can leave an army with no hero, which is a gap to fill, not a dangling reference.
      const dangling = P.problems(d).filter((e) => !/no hero/.test(e));
      expect(dangling, what).toEqual([]);
    }
  });
});

describe('units', () => {
  it('a warrior cannot lead a warband, and a new hero is not listed as someone\'s follower', () => {
    let d = draft();
    d = P.updateUnit(d, 'old-marren', { kind: 'warrior' });
    expect(unit(d, 'old-marren').warband).toBeUndefined();
    d = draft();
    d = P.updateUnit(d, 'vale-spearman', { kind: 'hero' });
    expect(unit(d, 'old-marren').warband!.allowed).toEqual(['vale-archer']);
    expect(P.problems(d)).toEqual([]);
  });

  it('duplicates a unit into the same armies, without making it unique', () => {
    const { draft: d, id } = P.duplicateUnit(draft(), 'aldric-the-bold');
    expect(id).toBe('aldric-the-bold-copy');
    expect(unit(d, id)).toMatchObject({ name: 'Aldric the Bold (copy)', unique: false, cost: 90 });
    expect(d.units.map((u) => u.id).indexOf(id)).toBe(d.units.map((u) => u.id).indexOf('aldric-the-bold') + 1);
    expect(d.armies.find((a) => a.id === 'vale-realm')!.units.some((e) => e.unit === id)).toBe(true);
    expect(d.armies.find((a) => a.id === 'hollow-horde')!.units.some((e) => e.unit === id)).toBe(false);
    expect(P.problems(d)).toEqual([]);
    expect(P.duplicateUnit(draft(), 'ghost').id).toBe('ghost');
  });

  it('keeps a cap when duplicating', () => {
    const { draft: d, id } = P.duplicateUnit(draft(), 'vale-knight');
    expect(d.armies.find((a) => a.id === 'vale-realm')!.units.find((e) => e.unit === id)).toEqual({ unit: id, max: 6 });
  });

  it('adds options with unique ids', () => {
    let d = P.addOption(draft(), 'vale-spearman', 'Shield');
    expect(unit(d, 'vale-spearman').options.map((o) => o.id)).toEqual(['shield', 'shield-2']);
    expect(P.addOption(d, 'ghost', 'x')).toBe(d);
  });

  it('puts a unit in an army or takes it out, keeping the pack\'s order and any cap', () => {
    let d = P.setArmyUnit(draft(), 'free-marches', 'vale-spearman', true, 4);
    expect(d.armies.find((a) => a.id === 'free-marches')!.units).toEqual([{ unit: 'vale-spearman', max: 4 }, { unit: 'warden-hale' }, { unit: 'march-scout' }].sort((a, b) => P.cloneDraft(idx.pack).units.findIndex((u) => u.id === a.unit) - P.cloneDraft(idx.pack).units.findIndex((u) => u.id === b.unit)));
    d = P.setArmyUnit(d, 'free-marches', 'vale-spearman', false);
    expect(d.armies.find((a) => a.id === 'free-marches')!.units.map((e) => e.unit)).toEqual(['warden-hale', 'march-scout']);
    expect(P.setArmyUnit(d, 'ghost', 'x', true)).toBe(d);
  });
});

describe('checking a draft', () => {
  it('knows when a draft is the pack already in use, however its keys happen to be ordered', () => {
    const inUse = idx.pack;
    expect(JSON.stringify(P.normalized(draft()))).toBe(JSON.stringify(inUse));
    // A draft built by hand has its keys in another order and lacks defaults; normalised, it still compares equal to a loaded copy.
    const built = P.blankPack('X');
    const hero = P.addUnit(P.addArmy(built, 'A').draft, 'H', { kind: 'hero' });
    const ready = P.setArmyUnit(hero.draft, 'a', hero.id, true);
    const loaded = loadPack(ready);
    expect(loaded.ok).toBe(true);
    expect(JSON.stringify(P.normalized(ready))).toBe(JSON.stringify(loaded.ok && loaded.index.pack));
    expect(JSON.stringify(ready)).not.toBe(JSON.stringify(P.normalized(ready))); // the raw forms differ, which is why comparing them was wrong
    expect(P.normalized(P.blankPack())).toBeNull();
  });

  it('the sample pack has no problems', () => {
    expect(P.problems(draft())).toEqual([]);
  });

  it('says what is wrong in plain words', () => {
    let d = draft();
    d = P.updateUnit(d, 'vale-spearman', { wargear: ['nope'] });
    expect(P.problems(d)).toContain('unit "vale-spearman" uses unknown wargear "nope"');
    d = P.updateArmy(draft(), 'vale-realm', { units: [{ unit: 'vale-spearman' }] });
    expect(P.problems(d)).toContain('army "vale-realm" has no hero to lead a warband');
  });

  it('finds saved lists that a draft would break', () => {
    let l = addWarband(newList(idx, 'vale-realm'));
    l = addListUnit(l, l.warbands[0]!.id, idx.units.get('aldric-the-bold')!);
    l = addListUnit(l, l.warbands[0]!.id, idx.units.get('vale-archer')!);
    const other = { ...newList(idx, 'vale-realm'), pack: 'another-pack' };
    expect(P.brokenLists(draft(), [l, other])).toEqual([]);
    expect(P.brokenLists(P.removeUnit(draft(), 'vale-archer'), [l, other])).toEqual([l]); // other packs' lists are not this draft's business
    expect(P.brokenLists(P.removeArmy(draft(), 'vale-realm'), [l])).toEqual([l]);
    expect(P.brokenLists(P.removeUnit(draft(), 'old-marren'), [l])).toEqual([]); // not used by that list
  });
});

describe('csv', () => {
  it('reads cells with quotes, commas, doubled quotes and line breaks inside', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n"line\nbreak",z')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['line\nbreak', 'z']]);
  });

  it('guesses the separator: tabs from a spreadsheet, semicolons from some locales', () => {
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('ignores blank lines and a leading byte-order mark', () => {
    expect(parseCsv('﻿a,b\n\n,\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('importing units from a table', () => {
  const TABLE = [
    'Name,Kind,Cost,M,F,Sh,S,D,A,W,C,Might,Will,Fate,Rules,Wargear,Army',
    'Captain Marr,hero,60,6,5,4+,4,5,2,2,5,2,2,1,Stalwart; Fearless,Sword; Shield,The Order',
    'Guard,warrior,8,6,3,-,3,5,1,1,3,,,,Stalwart,Spear,The Order',
  ].join('\n');

  it('builds a working pack from a table alone, creating rules, wargear and the army', () => {
    const r = P.importUnitsCsv(P.blankPack('Order'), TABLE);
    expect(r.problems).toEqual([]);
    expect(r).toMatchObject({ added: 2, updated: 0, created: { rules: 2, wargear: 3, armies: 1 } });
    const d = r.draft;
    expect(d.units.map((u) => u.name)).toEqual(['Captain Marr', 'Guard']);
    expect(d.units[0]).toMatchObject({ kind: 'hero', cost: 60, stats: { move: 6, fight: 5, shoot: 4, strength: 4, defence: 5, attacks: 2, wounds: 2, courage: 5, might: 2, will: 2, fate: 1 } });
    expect(d.units[1]!.stats).toMatchObject({ shoot: null, might: 0 });
    expect(d.units[0]!.rules).toEqual(['stalwart', 'fearless']);
    expect(d.units[1]!.rules).toEqual(['stalwart']); // the same rule, not a second copy
    expect(d.rules.map((x) => x.id)).toEqual(['stalwart', 'fearless']);
    expect(d.wargear.map((x) => x.name)).toEqual(['Sword', 'Shield', 'Spear']);
    expect(d.armies[0]).toMatchObject({ name: 'The Order', units: [{ unit: 'captain-marr' }, { unit: 'guard' }] });
    expect(P.problems(d)).toEqual([]);
  });

  it('understands the usual column names, "5/4+" for fight and shoot together, and inch marks', () => {
    const r = P.importUnitsCsv(P.blankPack(), 'Unit,Pts,Mv,FV,Str,Def,Att,Wd,Cou\nScout,7,"7""",3/3+,3,3,1,1,3');
    expect(r.problems).toEqual([]);
    expect(r.draft.units[0]).toMatchObject({ cost: 7, stats: { move: 7, fight: 3, shoot: 3 } });
  });

  it('updates a unit it already has (by name, ignoring case) and keeps what the table does not say', () => {
    const d = draft();
    const r = P.importUnitsCsv(d, 'name,cost,fight\nvale spearman,10,4');
    expect(r).toMatchObject({ added: 0, updated: 1, problems: [] });
    expect(r.draft.units).toHaveLength(d.units.length);
    expect(unit(r.draft, 'vale-spearman')).toMatchObject({ cost: 10, stats: { fight: 4, strength: 3, defence: 4 } });
    expect(unit(r.draft, 'vale-spearman').rules).toEqual(['hold-the-line']); // no rules column: unchanged
    expect(unit(r.draft, 'vale-spearman').options).toHaveLength(1);
    expect(r.draft.armies.find((a) => a.id === 'vale-realm')!.units.some((e) => e.unit === 'vale-spearman')).toBe(true);
  });

  it('skips bad rows with the row number and a reason, and still imports the good ones', () => {
    const r = P.importUnitsCsv(P.blankPack(), ['name,cost,fight,shoot,wounds,kind', 'Good,5,3,,1,warrior', ',5,3,,1,warrior', 'BadCost,abc,3,,1,warrior', 'BadShoot,5,3,9+,1,warrior', 'NoWounds,5,3,,0,warrior', 'BadKind,5,3,,1,wizard', 'BadFight,5,x,,1,warrior'].join('\n'));
    expect(r.added).toBe(1);
    expect(r.draft.units.map((u) => u.name)).toEqual(['Good']);
    expect(r.problems).toEqual([
      'Row 3: no name.',
      'Row 4 (BadCost): cost "abc" is not a number.',
      'Row 5 (BadShoot): shoot "9+" should be a number from 2 to 6 (for 2+ to 6+), or empty.',
      'Row 6 (NoWounds): wounds must be at least 1.',
      'Row 7 (BadKind): kind "wizard" should be hero or warrior.',
      'Row 8 (BadFight): fight "x" is not a number.',
    ]);
  });

  it('explains a table it cannot use', () => {
    expect(P.importUnitsCsv(P.blankPack(), '').problems).toEqual(['The table is empty.']);
    expect(P.importUnitsCsv(P.blankPack(), 'cost,fight\n5,3').problems[0]).toMatch(/must name the columns/);
    const r = P.importUnitsCsv(P.blankPack(), 'name,cost,flavour\nA,1,spicy');
    expect(r.added).toBe(1);
    expect(r.problems).toEqual(['Ignored columns: "flavour".']);
  });

  it('puts imported units in a chosen army when the table does not name one', () => {
    let d = P.addArmy(P.blankPack(), 'Order').draft;
    const r = P.importUnitsCsv(d, 'name,cost\nA,1\nB,2', { armyId: 'order' });
    expect(r.draft.armies[0]!.units.map((e) => e.unit)).toEqual(['a', 'b']);
    expect(r.created.armies).toBe(0);
  });

  it('flags unique models and reads yes/no forms', () => {
    const r = P.importUnitsCsv(P.blankPack(), 'name,unique\nA,yes\nB,no\nC,\nD,TRUE\nE,1');
    expect(r.draft.units.map((u) => u.unique)).toEqual([true, false, false, true, true]);
  });

  it('does not change the draft it was given', () => {
    const d = P.blankPack();
    const before = JSON.stringify(d);
    P.importUnitsCsv(d, TABLE);
    expect(JSON.stringify(d)).toBe(before);
  });

  it('exports a table that imports back to the same units (round trip)', () => {
    const d = draft();
    const csv = P.unitsToCsv(d);
    expect(csv.split('\n')[0]).toBe(P.UNIT_CSV_COLUMNS.join(','));
    const r = P.importUnitsCsv(P.blankPack('Copy'), csv);
    expect(r.problems).toEqual([]);
    expect(r.draft.units).toHaveLength(d.units.length);
    for (const u of d.units) {
      const back = r.draft.units.find((x) => x.name === u.name)!;
      expect(back, u.name).toBeDefined();
      expect([back.kind, back.cost, back.unique, back.tier, back.stats, back.keywords]).toEqual([u.kind, u.cost, u.unique, u.tier, u.stats, u.keywords]);
      expect(back.rules.map((r2) => r.draft.rules.find((x) => x.id === r2)!.name)).toEqual(u.rules.map((r2) => d.rules.find((x) => x.id === r2)!.name));
      expect(back.wargear.map((g) => r.draft.wargear.find((x) => x.id === g)!.name)).toEqual(u.wargear.map((g) => d.wargear.find((x) => x.id === g)!.name));
    }
    expect(r.draft.armies.map((a) => a.name).sort()).toEqual(d.armies.map((a) => a.name).sort());
  });
});

describe('the bundled sample is the sample pack', () => {
  it('loads', () => {
    expect(loadPack(sample).ok).toBe(true);
  });
});
