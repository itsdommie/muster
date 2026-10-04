import { describe, expect, it } from 'vitest';
import { damageDistribution, duelOdds, fateChance, fightOdds, hitChance, mergeTallies, rng, simulateSquads, woundChance, woundTarget, type Combatant } from './combat.js';
import { sampleIndex } from './fixtures.js';
import type { Combat } from './schema.js';

const combat: Combat = sampleIndex().pack.ruleset.combat!;
const mk = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'M', fight: 4, attacks: 1, strength: 4, defence: 4, wounds: 1, fate: 0, might: 0, ...over,
});
const near = (x: number, y: number, eps = 1e-9) => expect(Math.abs(x - y)).toBeLessThan(eps);

describe('the sample pack declares combat rules', () => {
  it('has the shape the tests below rely on', () => {
    expect(combat).toMatchObject({ die: 6, tie: 'higher-fight', supportBonus: 1, fate: { target: 4 }, might: { duelBonus: 1 } });
  });
});

describe('wound targets', () => {
  it('uses the formula: clamp(base + perPoint x (Defence - Strength), min, max)', () => {
    expect(woundTarget(combat, 4, 4)).toBe(4);
    expect(woundTarget(combat, 5, 4)).toBe(3);
    expect(woundTarget(combat, 3, 5)).toBe(6);
    expect(woundTarget(combat, 9, 2)).toBe(2); // clamped to min
    expect(woundTarget(combat, 1, 9)).toBe(6); // clamped to max
  });

  it('uses an explicit table, clamping out-of-range indices and honouring "impossible"', () => {
    const table: Combat = { ...combat, wound: { table: [[4, 5, null], [3, 4, 5]] } };
    expect(woundTarget(table, 1, 1)).toBe(4);
    expect(woundTarget(table, 1, 3)).toBeNull();
    expect(woundTarget(table, 2, 3)).toBe(5);
    expect(woundTarget(table, 7, 7)).toBe(5); // beyond the table: last row/column
    expect(woundChance(table, 1, 3)).toBe(0);
  });

  it('converts a target into a probability', () => {
    near(hitChance(6, 4), 3 / 6);
    near(hitChance(6, 2), 5 / 6);
    near(hitChance(6, 6), 1 / 6);
    expect(hitChance(6, 7)).toBe(0);
    expect(hitChance(6, null)).toBe(0);
    expect(hitChance(6, 1)).toBe(1);
    near(woundChance(combat, 4, 5), 2 / 6); // needs 5+
    near(fateChance(combat), 3 / 6);
    expect(fateChance({ ...combat, fate: undefined })).toBe(0);
  });
});

describe('duel odds', () => {
  it('is even for equal Fight', () => {
    const o = duelOdds(combat, { fight: 4, bonus: 0 }, { fight: 4, bonus: 0 });
    near(o.a, 0.5);
    near(o.b, 0.5);
  });

  it('matches the hand count: Fight 5 vs 3 with ties to the higher Fight is 30/36', () => {
    // A wins unless (dB - dA) >= 3, which is 3+2+1 = 6 of the 36 rolls.
    const o = duelOdds(combat, { fight: 5, bonus: 0 }, { fight: 3, bonus: 0 });
    near(o.a, 30 / 36);
    near(o.a + o.b, 1);
  });

  it('applies bonuses to the total but breaks ties on the base Fight', () => {
    // 3 vs 3 base, A has +1: A wins when dA + 1 >= dB ... a tie at equal totals goes to A only if A's Fight is higher (it is not),
    // so equal totals are rolled again instead.
    const o = duelOdds(combat, { fight: 3, bonus: 1 }, { fight: 3, bonus: 0 });
    // totals: A = dA + 4, B = dB + 3. A > B when dA >= dB: 21 of 36. B > A when dB >= dA + 2: 10 of 36. Tie (dB = dA + 1): 5 of 36, rerolled.
    near(o.a, 21 / 31);
    near(o.b, 10 / 31);
  });

  it('handles the other tie rules', () => {
    const base = { fight: 4, bonus: 0 };
    const coin = duelOdds({ ...combat, tie: 'coin' }, { fight: 5, bonus: 0 }, base);
    // 5 vs 4: A > B when dA >= dB: 21; B > A when dB >= dA + 2: 10; tie (dB = dA + 1): 5 split evenly.
    near(coin.a, (21 + 2.5) / 36);
    const reroll = duelOdds({ ...combat, tie: 'reroll' }, { fight: 5, bonus: 0 }, base);
    near(reroll.a, 21 / 31);
  });
});

describe('damage distribution', () => {
  it('is a binomial without Fate', () => {
    const d = damageDistribution(2, 0.5, 0, 0);
    const p = (k: number) => d.filter((o) => o.damage === k).reduce((s, o) => s + o.p, 0);
    near(p(0), 0.25);
    near(p(1), 0.5);
    near(p(2), 0.25);
  });

  it('lets Fate cancel wounds one at a time and tracks the points left', () => {
    // One strike that always wounds; 1 Fate point saving on 1/2: damage 0 w.p. 1/2 (fate used), damage 1 w.p. 1/2 (fate used).
    const d = damageDistribution(1, 1, 1, 0.5);
    expect(d).toHaveLength(2);
    for (const o of d) {
      near(o.p, 0.5);
      expect(o.fateLeft).toBe(0);
    }
    // Two sure wounds and one Fate point: the first wound may be saved, the second always goes through.
    const e = damageDistribution(2, 1, 1, 0.5);
    near(e.filter((o) => o.damage === 1).reduce((s, o) => s + o.p, 0), 0.5);
    near(e.filter((o) => o.damage === 2).reduce((s, o) => s + o.p, 0), 0.5);
  });

  it('always sums to 1', () => {
    for (const [n, p, f, q] of [[3, 0.4, 2, 0.5], [5, 0.7, 3, 1 / 3], [0, 0.5, 2, 0.5]] as const) {
      near(damageDistribution(n, p, f, q).reduce((s, o) => s + o.p, 0), 1);
    }
  });
});

describe('exact fight odds: hand-worked cases', () => {
  it('equal one-wound models: each wins half the time and a fight lasts 2 rounds on average', () => {
    // Each round: A wins the duel 1/2 and then wounds 1/2 = 1/4 to kill B; likewise 1/4 for B; 1/2 nothing happens.
    const r = fightOdds(combat, mk(), mk());
    near(r.aWins, 0.5, 1e-6);
    near(r.bWins, 0.5, 1e-6);
    near(r.expectedRounds, 2, 1e-6);
    expect(r.unresolved).toBeLessThan(1e-6);
    near(r.firstRound.aKillsB, 0.25);
    near(r.firstRound.bKillsA, 0.25);
    near(r.firstRound.expectedDamageToB, 0.25);
  });

  it('a second wound on one side drops the other side to 1/4', () => {
    // x = P(A wins | B has 2 wounds): x = x/2 + y/4 with y = 1/2, so x = 1/4.
    const r = fightOdds(combat, mk(), mk({ wounds: 2 }));
    near(r.aWins, 0.25, 1e-6);
    near(r.bWins, 0.75, 1e-6);
  });

  it('one Fate point at 3+ ... 4+ (1/2) turns A\'s chance from 1/2 into 5/8', () => {
    // P(B wins | A has Fate) = 1/8 + (1/8) * (1/2) + (1/2) * P  =>  P = 3/8.
    const r = fightOdds(combat, mk({ fate: 1 }), mk());
    near(r.aWins, 5 / 8, 1e-6);
    near(r.bWins, 3 / 8, 1e-6);
  });

  it('a pack without a Fate rule ignores Fate points', () => {
    const noFate: Combat = { ...combat, fate: undefined };
    near(fightOdds(noFate, mk({ fate: 3 }), mk()).aWins, 0.5, 1e-6);
  });

  it('supporters add strikes for the side that wins the duel', () => {
    // One supporter makes A strike twice: kills B with 1 - (1/2)^2 = 3/4 on a won duel (1/2): 3/8 in the first round.
    const r = fightOdds(combat, mk(), mk(), { supportA: 1 });
    near(r.firstRound.aStrikes, 2);
    near(r.firstRound.aKillsB, 3 / 8);
    near(r.firstRound.bKillsA, 1 / 4);
    expect(r.aWins).toBeGreaterThan(0.5);
  });

  it('Might spent on the duel raises the odds and runs out', () => {
    const noMight = fightOdds(combat, mk({ might: 2 }), mk());
    const spend = fightOdds(combat, mk({ might: 2 }), mk(), { mightPerRoundA: 1 });
    expect(spend.aWins).toBeGreaterThan(noMight.aWins);
    expect(spend.firstRound.aWinsDuel).toBeGreaterThan(0.5);
    // Only two Might points: a third round's duel is back to even. Spending all at once beats nothing but not by an unbounded margin.
    expect(spend.aWins).toBeLessThan(0.75);
  });

  it('reports wounds left when winning, and the outcomes add up', () => {
    const r = fightOdds(combat, mk({ wounds: 3 }), mk({ wounds: 3 }));
    near(r.aWins + r.bWins + r.unresolved, 1, 1e-9);
    near(r.aWoundsLeftWhenWinning.reduce((s, v) => s + v, 0), r.aWins);
    expect(r.aWoundsLeftWhenWinning[0]).toBe(0); // winning with zero wounds left is impossible
    near(r.bWoundsLeftWhenWinning.reduce((s, v) => s + v, 0), r.bWins);
  });

  it('is symmetric: swapping the sides swaps the answer', () => {
    const a = mk({ fight: 6, strength: 5, wounds: 3, fate: 2, attacks: 2 });
    const b = mk({ fight: 4, defence: 5, wounds: 2 });
    const ab = fightOdds(combat, a, b);
    const ba = fightOdds(combat, b, a);
    near(ab.aWins, ba.bWins, 1e-9);
    near(ab.bWins, ba.aWins, 1e-9);
  });

  it('a hopeless attacker (cannot wound) never wins; the result is reported as unresolved if the defender cannot wound either', () => {
    const table: Combat = { ...combat, wound: { table: [[null]] } };
    const r = fightOdds(table, mk(), mk(), { maxRounds: 10 });
    expect(r.aWins).toBe(0);
    expect(r.bWins).toBe(0);
    near(r.unresolved, 1);
    near(r.expectedRounds, 10);
  });

  it('handles a model that is already down', () => {
    expect(fightOdds(combat, mk({ wounds: 0 }), mk()).bWins).toBe(1);
    expect(fightOdds(combat, mk(), mk({ wounds: 0 })).aWins).toBe(1);
  });

  it('more of everything is better', () => {
    const base = fightOdds(combat, mk(), mk()).aWins;
    for (const better of [{ fight: 5 }, { attacks: 2 }, { strength: 5 }, { defence: 5 }, { wounds: 2 }, { fate: 1 }]) {
      expect(fightOdds(combat, mk(better), mk()).aWins, JSON.stringify(better)).toBeGreaterThan(base);
    }
  });
});

describe('rng', () => {
  it('is deterministic per seed, in [0, 1), and differs between seeds', () => {
    const a = rng(1);
    const b = rng(1);
    const seq = Array.from({ length: 5 }, () => a());
    expect(seq).toEqual(Array.from({ length: 5 }, () => b()));
    expect(seq.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(rng(2)()).not.toBe(seq[0]);
    const many = rng(7);
    const mean = Array.from({ length: 20000 }, () => many()).reduce((s, v) => s + v, 0) / 20000;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.01);
  });
});

describe('squad simulation', () => {
  const one = (c: Combatant, count = 1) => [{ combatant: c, count }];
  const win = (t: ReturnType<typeof simulateSquads>) => t.aWins / t.runs;

  it('agrees with the exact answer for a single fight', () => {
    const cases: [Combatant, Combatant][] = [
      [mk(), mk()],
      [mk({ wounds: 3, fate: 2, fight: 5, attacks: 2 }), mk({ wounds: 2, strength: 5 })],
      [mk({ wounds: 2 }), mk({ wounds: 2, defence: 5 })],
    ];
    for (const [a, b] of cases) {
      const exact = fightOdds(combat, a, b).aWins;
      const t = simulateSquads(combat, one(a), one(b), { runs: 30000, seed: 42 });
      expect(Math.abs(win(t) - exact), `exact ${exact.toFixed(3)} vs sim ${win(t).toFixed(3)}`).toBeLessThan(0.015);
    }
  });

  it('agrees with the exact answer when Might is spent', () => {
    const a = mk({ might: 3, wounds: 2 });
    const exact = fightOdds(combat, a, mk({ wounds: 2 }), { mightPerRoundA: 1 }).aWins;
    const t = simulateSquads(combat, one(a), one(mk({ wounds: 2 })), { runs: 30000, seed: 9, mightPerRoundA: 1 });
    expect(Math.abs(win(t) - exact)).toBeLessThan(0.015);
  });

  it('is repeatable for a seed, and batches merge into the same totals', () => {
    const a = one(mk(), 5);
    const b = one(mk(), 4);
    const x = simulateSquads(combat, a, b, { runs: 400, seed: 5 });
    expect(simulateSquads(combat, a, b, { runs: 400, seed: 5 })).toEqual(x);
    const merged = mergeTallies(simulateSquads(combat, a, b, { runs: 200, seed: 1 }), simulateSquads(combat, a, b, { runs: 200, seed: 2 }));
    expect(merged.runs).toBe(400);
    expect(merged.aWins + merged.bWins + merged.draws).toBe(400);
    expect(merged.aSurvivors.reduce((s, v) => s + v, 0)).toBe(400);
    expect(merged.bSurvivors.reduce((s, v) => s + v, 0)).toBe(400);
  });

  it('equal squads are even; a clear numerical edge decides it; outnumbering is a snowball', () => {
    const even = simulateSquads(combat, one(mk(), 6), one(mk(), 6), { runs: 6000, seed: 3 });
    expect(Math.abs(win(even) - 0.5)).toBeLessThan(0.04);
    const edge = simulateSquads(combat, one(mk(), 12), one(mk(), 6), { runs: 3000, seed: 3 });
    expect(win(edge)).toBeGreaterThan(0.95);
    const avgSurvivors = edge.aSurvivors.reduce((s, v, n) => s + v * n, 0) / edge.runs;
    expect(avgSurvivors).toBeGreaterThan(6); // the bigger side keeps over half its models
  });

  it('one strong hero against a crowd of weak models', () => {
    const hero = mk({ fight: 7, attacks: 3, strength: 5, defence: 6, wounds: 3, fate: 3 });
    const crowd = one(mk({ defence: 3, strength: 3 }), 5);
    const weak = simulateSquads(combat, one(hero), crowd, { runs: 4000, seed: 11 });
    expect(win(weak)).toBeGreaterThan(0.8);
  });

  it('draws when nobody can wound, and rounds are capped', () => {
    const table: Combat = { ...combat, wound: { table: [[null]] } };
    const t = simulateSquads(table, one(mk(), 2), one(mk(), 2), { runs: 20, seed: 1, maxRounds: 5 });
    expect(t.draws).toBe(20);
    expect(t.totalRounds).toBe(100);
  });

  it('ends early when a side breaks, and records who broke', () => {
    const a = one(mk(), 10);
    const b = one(mk(), 10);
    const full = simulateSquads(combat, a, b, { runs: 800, seed: 8 });
    const broken = simulateSquads(combat, a, b, { runs: 800, seed: 8, breakFraction: 0.5 });
    expect(broken.totalRounds).toBeLessThan(full.totalRounds);
    expect(broken.aBroke + broken.bBroke).toBe(800);
    expect(broken.aBroke).toBe(broken.bWins);
    expect(broken.bBroke).toBe(broken.aWins);
    // At the break the broken side has lost at least half.
    expect(broken.aSurvivors.slice(6).reduce((s, v) => s + v, 0)).toBeLessThanOrEqual(broken.bBroke + broken.draws);
  });

  it('handles empty and lopsided sides without crashing', () => {
    const none = simulateSquads(combat, [], one(mk(), 3), { runs: 10, seed: 1 });
    expect(none.bWins).toBe(10);
    const both = simulateSquads(combat, [], [], { runs: 10, seed: 1 });
    expect(both.draws).toBe(10);
  });

  it('mixed groups on a side all fight', () => {
    const squad = [{ combatant: mk({ name: 'hero', wounds: 3 }), count: 1 }, { combatant: mk(), count: 4 }];
    const t = simulateSquads(combat, squad, one(mk(), 5), { runs: 500, seed: 4 });
    expect(t.aSurvivors).toHaveLength(6);
    expect(t.aWins + t.bWins + t.draws).toBe(500);
  });
});
