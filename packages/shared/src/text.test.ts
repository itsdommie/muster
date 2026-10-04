import { describe, expect, it } from 'vitest';
import { sampleIndex } from './fixtures.js';
import { addUnit, addWarband, newList, setOptions } from './list.js';
import { exportText, importText } from './text.js';
import { validateList } from './validate.js';

const idx = sampleIndex();
const unit = (id: string) => idx.units.get(id)!;

function sampleList() {
  let list = { ...newList(idx, 'hollow-horde', 600), name: 'Raiders of the Marsh' };
  list = addWarband(list);
  const w1 = list.warbands[0]!.id;
  list = addUnit(list, w1, unit('gorrath-skullmaker'));
  for (let i = 0; i < 8; i++) list = addUnit(list, w1, unit('marsh-raider'));
  list = setOptions(list, w1, 0, ['shield']);
  list = addUnit(list, w1, unit('bog-brute'));
  list = addWarband(list, 'free-marches');
  const w2 = list.warbands[1]!.id;
  list = addUnit(list, w2, unit('warden-hale'));
  list = addUnit(list, w2, unit('march-scout'));
  return list;
}

describe('text export', () => {
  it('produces a readable list with costs and totals', () => {
    const text = exportText(idx, sampleList());
    expect(text).toContain('# Raiders of the Marsh');
    expect(text).toContain('Army: The Hollow Horde');
    expect(text).toContain('Points: 600');
    expect(text).toContain('Gorrath Skullmaker [100]');
    expect(text).toContain('8 Marsh Raider (Shield) [64]');
    expect(text).toContain('## Warband 2 (The Free Marches)');
    expect(text).toMatch(/Total: 233\/600 points, 12 models, broken at 6/);
  });
});

describe('text import', () => {
  it('round-trips an exported list', () => {
    const original = sampleList();
    const { list, problems } = importText(idx, exportText(idx, original));
    expect(problems).toEqual([]);
    expect(list.name).toBe(original.name);
    expect(list.army).toBe(original.army);
    expect(list.limit).toBe(600);
    const strip = (l: typeof list) => l.warbands.map((w) => ({ army: w.army, leader: w.leader, members: w.members }));
    expect(strip(list)).toEqual(strip(original));
    expect(validateList(idx, list).summary).toEqual(validateList(idx, original).summary);
  });

  it('accepts hand-typed lists: bullets, "3x", no costs, odd case', () => {
    const { list, problems } = importText(
      idx,
      `Army: realm of the vale\nPoints: 300\n\n- Sera Windfletcher (warhorse)\n- 3x vale spearman (SHIELD)\n* 2 Vale Archer`,
    );
    expect(problems).toEqual([]);
    expect(list.army).toBe('vale-realm');
    expect(list.warbands).toHaveLength(1);
    expect(list.warbands[0]!.leader).toMatchObject({ unit: 'sera-windfletcher', options: ['warhorse'] });
    expect(list.warbands[0]!.members.map((m) => [m.unit, m.count])).toEqual([['vale-spearman', 3], ['vale-archer', 2]]);
  });

  it('reports what it cannot read and imports the rest', () => {
    const { list, problems } = importText(idx, `Army: Realm of the Vale\n\nAldric the Bold (Jetpack)\nDragon Rider\n3 Vale Spearman`);
    expect(problems).toEqual([
      'Line 3: Aldric the Bold has no option "Jetpack".',
      'Line 4: unknown unit "Dragon Rider".',
    ]);
    expect(list.warbands[0]!.leader?.unit).toBe('aldric-the-bold');
    expect(list.warbands[0]!.members).toHaveLength(1);
  });

  it('starts a new warband when a second hero appears', () => {
    const { list, problems } = importText(idx, `Army: Realm of the Vale\nAldric the Bold\nVale Spearman\nSera Windfletcher\nVale Archer`);
    expect(list.warbands).toHaveLength(2);
    expect(problems).toHaveLength(1);
  });

  it('reports an unknown army', () => {
    expect(importText(idx, 'Army: Atlantis').problems).toEqual(['Line 1: unknown army "Atlantis".']);
  });
});
