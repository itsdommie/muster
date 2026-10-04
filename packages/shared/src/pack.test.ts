import { describe, expect, it } from 'vitest';
import { clone, sample, sampleIndex } from './fixtures.js';
import { loadPack } from './pack.js';

const errorsFor = (mutate: (p: any) => void): string[] => {
  const p = clone(sample) as any;
  mutate(p);
  const r = loadPack(p);
  return r.ok ? [] : r.errors;
};

describe('loadPack', () => {
  it('accepts the bundled sample pack and indexes it', () => {
    const idx = sampleIndex();
    expect(idx.armies.size).toBe(3);
    expect(idx.units.get('aldric-the-bold')?.stats.might).toBe(3);
    expect(idx.units.get('vale-spearman')?.stats.might).toBe(0); // defaults applied
  });

  it('reports schema errors with their path', () => {
    const errs = errorsFor((p) => (p.units[0].cost = -1));
    expect(errs.some((e) => e.startsWith('units.0.cost'))).toBe(true);
  });

  it('rejects an unknown schema version', () => {
    expect(errorsFor((p) => (p.schema = 2)).length).toBeGreaterThan(0);
  });

  it('catches duplicate ids', () => {
    expect(errorsFor((p) => p.units.push(clone(p.units[0])))).toContain('duplicate unit id "aldric-the-bold"');
  });

  it('catches dangling references', () => {
    expect(errorsFor((p) => p.units[0].wargear.push('nope'))).toContain('unit "aldric-the-bold" uses unknown wargear "nope"');
    expect(errorsFor((p) => p.units[0].rules.push('nope'))).toContain('unit "aldric-the-bold" uses unknown rule "nope"');
    expect(errorsFor((p) => p.armies[0].units.push({ unit: 'ghost' }))).toContain('army "vale-realm" lists unknown unit "ghost"');
    expect(errorsFor((p) => (p.armies[0].allies[0].army = 'ghost'))).toContain('army "vale-realm" allies with unknown army "ghost"');
  });

  it('requires ally levels to exist in the ruleset', () => {
    expect(errorsFor((p) => (p.armies[0].allies[0].level = 'friendly'))[0]).toMatch(/missing from ruleset.allyLimits/);
  });

  it('requires every army to have a hero', () => {
    expect(errorsFor((p) => (p.armies[2].units = [{ unit: 'march-scout' }]))).toContain('army "free-marches" has no hero to lead a warband');
  });

  it('rejects warbands that allow non-warriors, and warriors defining warbands', () => {
    expect(errorsFor((p) => (p.units[2].warband.allowed = ['sera-windfletcher']))[0]).toMatch(/not a warrior/);
    expect(errorsFor((p) => (p.units[3].warband = { size: 3 }))[0]).toMatch(/cannot define a warband/);
  });

  it('treats combat rules as optional and validates them when present', () => {
    expect(loadPack(sample).ok).toBe(true);
    const without = clone(sample) as any;
    delete without.ruleset.combat;
    const r = loadPack(without);
    expect(r.ok).toBe(true);
    expect(r.ok && r.index.pack.ruleset.combat).toBeUndefined();

    expect(errorsFor((p) => (p.ruleset.combat.die = 1)).some((e) => e.startsWith('ruleset.combat.die'))).toBe(true);
    expect(errorsFor((p) => delete p.ruleset.combat.wound).some((e) => e.startsWith('ruleset.combat.wound'))).toBe(true);
    expect(errorsFor((p) => (p.ruleset.combat.tie = 'arm-wrestle')).some((e) => e.startsWith('ruleset.combat.tie'))).toBe(true);
    expect(errorsFor((p) => (p.ruleset.combat.wound = { table: [] })).length).toBeGreaterThan(0);
    // A table with an "impossible" entry is fine.
    expect(errorsFor((p) => (p.ruleset.combat.wound = { table: [[4, null], [3, 5]] }))).toEqual([]);
  });

  it('indexes scenarios, treats them as optional, and rejects duplicates', () => {
    const idx = sampleIndex();
    expect(idx.scenarios.size).toBe(4);
    expect(idx.scenarios.get('seize-the-beacon')?.points).toEqual({ min: 200, max: 800 });
    const without = clone(sample) as any;
    delete without.scenarios;
    const r = loadPack(without);
    expect(r.ok && r.index.scenarios.size).toBe(0);
    expect(errorsFor((p) => p.scenarios.push(clone(p.scenarios[0])))).toContain('duplicate scenario id "hold-the-ford"');
    expect(errorsFor((p) => delete p.scenarios[0].name).some((e) => e.startsWith('scenarios.0.name'))).toBe(true);
  });
});
