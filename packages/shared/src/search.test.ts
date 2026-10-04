import { describe, expect, it } from 'vitest';
import { sampleIndex } from './fixtures.js';
import { armiesOfUnit, ruleCategories, searchRules, searchUnits, searchWargear, unitsWithRule } from './search.js';

const idx = sampleIndex();
const ids = (q: string) => searchUnits(idx, q).units.map((u) => u.id).sort();
const errs = (q: string) => searchUnits(idx, q).errors;

describe('searchUnits: text', () => {
  it('returns everything for an empty query', () => {
    expect(searchUnits(idx, '').units).toHaveLength(idx.pack.units.length);
    expect(searchUnits(idx, '   ').units).toHaveLength(idx.pack.units.length);
  });

  it('matches name, tier and keyword words, case-insensitively, ANDed', () => {
    expect(ids('ALDRIC')).toEqual(['aldric-the-bold']);
    expect(ids('sage')).toEqual(['old-marren']);
    expect(ids('wizard')).toEqual(['old-marren', 'vexa-the-hex']);
    expect(ids('vale archer')).toEqual(['vale-archer']); // every word must match the same unit
    expect(ids('archer sage')).toEqual([]);
    expect(ids('"archer vale"')).toEqual([]); // a quoted phrase is one literal string
  });
});

describe('searchUnits: numeric filters', () => {
  it('supports comparison operators on stats and cost', () => {
    expect(ids('f>=7')).toEqual(['gorrath-skullmaker']);
    expect(ids('cost<=8')).toEqual(['crooked-archer', 'march-scout', 'marsh-raider', 'vale-spearman']);
    expect(ids('d>6 or d=7')).toEqual(['gorrath-skullmaker']);
    expect(ids('w>=3 is:hero')).toEqual(['aldric-the-bold', 'gorrath-skullmaker', 'old-marren']);
    expect(ids('move>6')).toEqual(['march-scout', 'sera-windfletcher', 'vale-knight', 'warden-hale']);
  });

  it('treats shoot as a target number and understands none', () => {
    expect(ids('sh<=3')).toEqual(['march-scout', 'sera-windfletcher', 'vale-archer', 'warden-hale']);
    expect(ids('sh!=none is:hero')).toEqual(['aldric-the-bold', 'grub-chief', 'sera-windfletcher', 'warden-hale']);
    expect(ids('sh:none is:warrior')).toEqual(['bog-brute', 'vale-knight', 'vale-spearman']);
    expect(ids('sh:3+')).toEqual(['march-scout', 'sera-windfletcher', 'vale-archer', 'warden-hale']);
  });

  it('accepts long names for stats', () => {
    expect(ids('strength>=5')).toEqual(['bog-brute', 'gorrath-skullmaker']);
    expect(ids('might>=3')).toEqual(['aldric-the-bold', 'gorrath-skullmaker']);
  });
});

describe('searchUnits: text filters', () => {
  it('filters by rule name and rule text', () => {
    expect(ids('r:terror')).toEqual(['gorrath-skullmaker', 'vexa-the-hex']);
    expect(ids('rt:"re-roll"')).toEqual(['aldric-the-bold']);
    expect(ids('rule:"light footed"')).toEqual(['march-scout', 'sera-windfletcher', 'warden-hale']);
  });

  it('filters by wargear, options, keyword, army, tier and kind', () => {
    expect(ids('g:longbow')).toEqual(['crooked-archer', 'march-scout', 'sera-windfletcher', 'vale-archer', 'warden-hale']);
    expect(ids('o:javelins')).toEqual(['grub-chief', 'marsh-raider']);
    expect(ids('k:cavalry')).toEqual(['vale-knight']);
    expect(ids('army:horde kind:hero')).toEqual(['gorrath-skullmaker', 'grub-chief', 'vexa-the-hex']);
    expect(ids('tier:warlord')).toEqual(['gorrath-skullmaker']);
    expect(ids('name=vale spearman')).toEqual([]); // unquoted: "spearman" is a separate bare word
    expect(ids('name="vale spearman"')).toEqual(['vale-spearman']);
  });

  it('supports flags', () => {
    expect(ids('is:unique is:warrior')).toEqual([]);
    expect(ids('is:unique army:vale')).toEqual(['aldric-the-bold', 'old-marren', 'sera-windfletcher']);
    expect(ids('is:unique army:marches')).toEqual([]); // Warden Hale is not marked unique in the sample
    expect(ids('is:ranged is:warrior')).toEqual(['crooked-archer', 'march-scout', 'marsh-raider', 'vale-archer']);
    expect(ids('is:shooter army:horde')).toEqual(['crooked-archer', 'grub-chief', 'marsh-raider']);
  });
});

describe('searchUnits: logic', () => {
  it('negates terms', () => {
    expect(ids('is:warrior -k:infantry')).toEqual(['vale-knight']);
    expect(ids('-is:hero -g:longbow -k:cavalry')).toEqual(['bog-brute', 'marsh-raider', 'vale-spearman']);
    expect(ids('is:hero -r:terror army:horde')).toEqual(['grub-chief']);
  });

  it('supports or between alternatives, with and binding tighter', () => {
    expect(ids('r:terror or k:cavalry')).toEqual(['gorrath-skullmaker', 'vale-knight', 'vexa-the-hex']);
    expect(ids('is:hero army:vale or is:warrior army:vale r:brutal')).toEqual(['aldric-the-bold', 'old-marren', 'sera-windfletcher', 'vale-knight']);
  });

  it('does not treat a quoted "or" or a trailing/leading or as an operator', () => {
    expect(ids('"or"')).toEqual(['gorrath-skullmaker']); // quoted, so it is searched as text (Gorrath, Warlord)
    expect(ids('or')).toHaveLength(idx.pack.units.length);
    expect(ids('k:cavalry or')).toEqual(['vale-knight']);
  });
});

describe('searchUnits: errors', () => {
  it('reports unknown filters but still applies the rest', () => {
    const r = searchUnits(idx, 'zz:1 k:cavalry');
    expect(r.errors).toEqual(['Unknown filter "zz".']);
    expect(r.units.map((u) => u.id)).toEqual(['vale-knight']);
  });

  it('reports bad numbers, bad operators and unknown flags', () => {
    expect(errs('f>=high')).toEqual(['"f>=high": expected a number.']);
    expect(errs('k>3')).toEqual(['"k" can only be used with ":" or "=".']);
    expect(errs('is:legendary')[0]).toMatch(/Unknown flag "is:legendary"/);
    expect(errs('f>=5 k:cavalry')).toEqual([]);
  });
});

describe('rules and wargear reference', () => {
  it('searches rule names, categories and text, all words required', () => {
    expect(searchRules(idx, 'terror').map((r) => r.id)).toEqual(['terror']);
    expect(searchRules(idx, 'courage').map((r) => r.id)).toEqual(['stalwart', 'terror']);
    expect(searchRules(idx, 'enemy courage')).toHaveLength(1);
    expect(searchRules(idx, 'magic').map((r) => r.id)).toEqual(['hex', 'mend']);
    expect(searchRules(idx, '')).toHaveLength(idx.pack.rules.length);
  });

  it('filters by category and lists categories', () => {
    expect(ruleCategories(idx)).toEqual(['Active', 'Magic', 'Passive']);
    expect(searchRules(idx, '', 'Magic').map((r) => r.id)).toEqual(['hex', 'mend']);
    expect(searchRules(idx, 'range', 'Passive')).toEqual([]);
  });

  it('finds the units using a rule', () => {
    expect(unitsWithRule(idx, 'terror').map((u) => u.id)).toEqual(['gorrath-skullmaker', 'vexa-the-hex']);
    expect(unitsWithRule(idx, 'nope')).toEqual([]);
  });

  it('searches wargear by name, tag and description', () => {
    expect(searchWargear(idx, 'longbow').map((w) => w.id)).toEqual(['longbow']);
    expect(searchWargear(idx, 'bow').map((w) => w.id)).toEqual(['javelins', 'longbow']); // javelins' description mentions the bow limit
    expect(searchWargear(idx, 'throwing').map((w) => w.id)).toEqual(['javelins']);
    expect(searchWargear(idx, 'mount').map((w) => w.id)).toEqual(['warhorse']);
  });

  it('lists the armies a unit belongs to, with caps', () => {
    expect(armiesOfUnit(idx, 'vale-knight')).toEqual([{ id: 'vale-realm', name: 'Realm of the Vale', max: 6 }]);
    expect(armiesOfUnit(idx, 'ghost')).toEqual([]);
  });
});
