import { describe, expect, it } from 'vitest';
import { adjust, advance, bought, coverage, entryOf, ownedOf, parseCollection, requirements, setAmount, shoppingText, totals, wishlistText, type Collection } from './collection.js';
import { sampleIndex } from './fixtures.js';
import { addUnit, addWarband, newList } from './list.js';

const idx = sampleIndex();
const unit = (id: string) => idx.units.get(id)!;

/** Aldric + 4 spearmen + 2 archers in warband 1; Sera + 1 knight in warband 2. */
function sampleList() {
  let l = addWarband(newList(idx, 'vale-realm'));
  const w1 = l.warbands[0]!.id;
  l = addUnit(l, w1, unit('aldric-the-bold'));
  for (let i = 0; i < 4; i++) l = addUnit(l, w1, unit('vale-spearman'));
  for (let i = 0; i < 2; i++) l = addUnit(l, w1, unit('vale-archer'));
  l = addWarband(l);
  const w2 = l.warbands[1]!.id;
  l = addUnit(l, w2, unit('sera-windfletcher'));
  l = addUnit(l, w2, unit('vale-knight'));
  return l;
}

describe('editing a collection', () => {
  it('counts per stage, never below zero or fractional', () => {
    let c: Collection = {};
    c = setAmount(c, 'a', 'painted', 3.9);
    expect(entryOf(c, 'a').painted).toBe(3);
    c = adjust(c, 'a', 'painted', -10);
    expect(c).toEqual({}); // nothing owned or wanted: the entry disappears
    expect(setAmount({}, 'a', 'built', -4)).toEqual({});
    expect(setAmount({}, 'a', 'built', Number.NaN)).toEqual({});
  });

  it('moves models down the painting queue and stops at what is there', () => {
    let c = setAmount({}, 'a', 'unbuilt', 3);
    c = advance(c, 'a', 'unbuilt', 2);
    expect(entryOf(c, 'a')).toMatchObject({ unbuilt: 1, built: 2 });
    c = advance(c, 'a', 'built', 99);
    expect(entryOf(c, 'a')).toMatchObject({ built: 0, primed: 2 });
    c = advance(advance(c, 'a', 'primed', 2), 'a', 'painted', 5); // the last stage has no next
    expect(entryOf(c, 'a')).toMatchObject({ primed: 0, painted: 2 });
    expect(advance(c, 'a', 'built')).toBe(c); // nothing at that stage: unchanged
    expect(ownedOf(entryOf(c, 'a'))).toBe(3); // moving never creates or loses models
  });

  it('buying turns wishlist models into boxed ones', () => {
    let c = setAmount({}, 'a', 'wanted', 3);
    c = bought(c, 'a', 2);
    expect(entryOf(c, 'a')).toMatchObject({ wanted: 1, unbuilt: 2 });
    c = bought(c, 'a', 9);
    expect(entryOf(c, 'a')).toMatchObject({ wanted: 0, unbuilt: 3 });
    expect(bought(c, 'a')).toBe(c);
  });

  it('does not mutate the collection it was given', () => {
    const c = setAmount({}, 'a', 'built', 2);
    const before = JSON.stringify(c);
    adjust(c, 'a', 'built', 1);
    advance(c, 'a', 'built');
    expect(JSON.stringify(c)).toBe(before);
  });
});

describe('totals', () => {
  it('sums stages, wishlist and painted share', () => {
    let c: Collection = {};
    c = setAmount(c, 'a', 'painted', 3);
    c = setAmount(c, 'a', 'unbuilt', 1);
    c = setAmount(c, 'b', 'primed', 4);
    c = setAmount(c, 'c', 'wanted', 5);
    expect(totals(c)).toMatchObject({ owned: 8, byStage: { unbuilt: 1, built: 0, primed: 4, painted: 3 }, wanted: 5, units: 2 });
    expect(totals(c).paintedShare).toBeCloseTo(3 / 8);
    expect(totals({}).paintedShare).toBe(0);
  });
});

describe('can I field this list?', () => {
  it('adds up the models a list needs, across warbands', () => {
    expect([...requirements(sampleList())].sort()).toEqual([
      ['aldric-the-bold', 1], ['sera-windfletcher', 1], ['vale-archer', 2], ['vale-knight', 1], ['vale-spearman', 4],
    ]);
  });

  it('says what to buy and what to paint', () => {
    let c: Collection = {};
    c = setAmount(c, 'aldric-the-bold', 'painted', 1);
    c = setAmount(c, 'vale-spearman', 'painted', 2);
    c = setAmount(c, 'vale-spearman', 'built', 1); // 3 of 4 owned
    c = setAmount(c, 'vale-archer', 'primed', 5); // plenty, none painted
    const cov = coverage(c, sampleList());
    const line = (u: string) => cov.lines.find((l) => l.unit === u)!;
    expect(line('aldric-the-bold')).toMatchObject({ need: 1, owned: 1, missing: 0, toPaint: 0 });
    expect(line('vale-spearman')).toMatchObject({ need: 4, owned: 3, painted: 2, missing: 1, toPaint: 1 });
    expect(line('vale-archer')).toMatchObject({ need: 2, owned: 5, missing: 0, toPaint: 2 }); // spare models are not "to paint"
    expect(line('sera-windfletcher')).toMatchObject({ owned: 0, missing: 1, toPaint: 0 });
    expect(cov).toMatchObject({ fieldable: false, tableReady: false, missingModels: 3, toPaintModels: 3, needModels: 9 });
  });

  it('is table-ready only when everything is owned and painted', () => {
    const list = sampleList();
    let c: Collection = {};
    for (const [u, n] of requirements(list)) c = setAmount(c, u, 'primed', n);
    expect(coverage(c, list)).toMatchObject({ fieldable: true, tableReady: false, missingModels: 0, toPaintModels: 9 });
    for (const [u, n] of requirements(list)) c = advance(c, u, 'primed', n);
    expect(coverage(c, list)).toMatchObject({ fieldable: true, tableReady: true, toPaintModels: 0 });
  });

  it('an empty list is trivially fieldable', () => {
    expect(coverage({}, newList(idx, 'vale-realm'))).toMatchObject({ lines: [], fieldable: true, tableReady: true, needModels: 0 });
  });

  it('writes plain-text shopping and wishlist lists', () => {
    let c: Collection = setAmount({}, 'vale-spearman', 'built', 3);
    c = setAmount(c, 'aldric-the-bold', 'painted', 1);
    const text = shoppingText(idx, coverage(c, sampleList()), 'Vale vanguard');
    expect(text).toContain('To buy:\n  1 x Vale Spearman\n  2 x Vale Archer\n  1 x Sera Windfletcher\n  1 x Knight of the Vale');
    expect(text).toContain('To paint:\n  3 x Vale Spearman');
    expect(shoppingText(idx, coverage({}, newList(idx, 'vale-realm')), 'Empty')).toContain('Nothing to buy');
    expect(wishlistText(idx, setAmount(setAmount({}, 'vale-archer', 'wanted', 2), 'aldric-the-bold', 'wanted', 1))).toBe('1 x Aldric the Bold\n2 x Vale Archer\n');
    expect(wishlistText(idx, {})).toBe('The wishlist is empty.\n');
  });
});

describe('parseCollection', () => {
  it('round-trips and drops malformed entries instead of failing', () => {
    const c = setAmount(setAmount({}, 'a', 'painted', 2), 'b', 'wanted', 1);
    expect(parseCollection(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(parseCollection(null)).toEqual({});
    expect(parseCollection([1, 2])).toEqual({});
    expect(parseCollection({ a: 'nope', b: { painted: -3, built: 'x' }, c: { painted: 2.7 } })).toEqual({ c: { unbuilt: 0, built: 0, primed: 0, painted: 2, wanted: 0 } });
  });
});
