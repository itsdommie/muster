import type { Combat } from './schema.js';

// Fight maths. Every number comes from the pack's `combat` rules (see combatSchema); nothing here knows a particular game.
//
// Two tools:
//   - fightOdds: an exact answer for one model against another, by following the fight as a Markov chain over (wounds, Fate, Might).
//   - simulateSquads: a dice-by-dice simulation of groups against groups, for fights too tangled to solve exactly.
//
// Both model the same simplified round (see combatSchema). Positioning, Heroic actions, and what a player would choose to do
// with Might beyond a fixed number per round are not modelled.

export interface Combatant {
  name: string;
  fight: number;
  attacks: number;
  strength: number;
  defence: number;
  wounds: number;
  /** Fate points (ignored if the pack has no fate rule). */
  fate: number;
  /** Might points available. */
  might: number;
  /** Added to this model's duel total every round (a situational modifier). */
  duelModifier?: number;
}

// --- Dice ---

/** Probability that one die meets or beats `target`. A null/out-of-range target is impossible; 1 or less always succeeds. */
export function hitChance(die: number, target: number | null): number {
  if (target === null || target > die) return 0;
  if (target <= 1) return 1;
  return (die - target + 1) / die;
}

/** The roll needed for a model of this Strength to wound one of this Defence, or null if it cannot. */
export function woundTarget(c: Combat, strength: number, defence: number): number | null {
  const w = c.wound;
  if ('table' in w) {
    const row = w.table[Math.min(Math.max(strength, 1), w.table.length) - 1]!;
    return row[Math.min(Math.max(defence, 1), row.length) - 1] ?? null;
  }
  const raw = w.base + w.perPoint * (defence - strength);
  return Math.min(w.max, Math.max(w.min, raw));
}

export const woundChance = (c: Combat, strength: number, defence: number): number => hitChance(c.die, woundTarget(c, strength, defence));

export const fateChance = (c: Combat): number => (c.fate ? hitChance(c.die, c.fate.target) : 0);

/** Probability each side wins a duel (they sum to 1; ties are resolved according to the pack's tie rule). */
export function duelOdds(c: Combat, a: { fight: number; bonus: number }, b: { fight: number; bonus: number }): { a: number; b: number } {
  let aWin = 0;
  let bWin = 0;
  let tie = 0;
  for (let x = 1; x <= c.die; x++) {
    for (let y = 1; y <= c.die; y++) {
      const ta = x + a.fight + a.bonus;
      const tb = y + b.fight + b.bonus;
      if (ta > tb) aWin++;
      else if (tb > ta) bWin++;
      else tie++;
    }
  }
  const total = c.die * c.die;
  if (tie > 0) {
    if (c.tie === 'coin') {
      aWin += tie / 2;
      bWin += tie / 2;
    } else if (c.tie === 'higher-fight' && a.fight !== b.fight) {
      if (a.fight > b.fight) aWin += tie;
      else bWin += tie;
    } else {
      // Roll again: the tie mass is shared in proportion to the decided outcomes.
      const decided = aWin + bWin;
      if (decided === 0) return { a: 0.5, b: 0.5 };
      aWin += (tie * aWin) / decided;
      bWin += (tie * bWin) / decided;
    }
  }
  return { a: aWin / total, b: bWin / total };
}

function binomial(n: number, p: number): number[] {
  const out = new Array<number>(n + 1).fill(0);
  let coef = 1;
  for (let k = 0; k <= n; k++) {
    out[k] = coef * p ** k * (1 - p) ** (n - k);
    coef = (coef * (n - k)) / (k + 1);
  }
  return out;
}

export interface WoundOutcome {
  damage: number;
  fateLeft: number;
  p: number;
}

/**
 * The damage a defender takes from `strikes` strikes that each wound with probability `p`, spending Fate (success chance `q`)
 * one point per wound while any remain. Exact.
 */
export function damageDistribution(strikes: number, p: number, fate: number, q: number): WoundOutcome[] {
  const dist = binomial(strikes, p);
  const out = new Map<string, WoundOutcome>();
  const add = (damage: number, fateLeft: number, prob: number) => {
    if (prob <= 0) return;
    const key = `${damage}/${fateLeft}`;
    const cur = out.get(key);
    if (cur) cur.p += prob;
    else out.set(key, { damage, fateLeft, p: prob });
  };
  for (let k = 0; k <= strikes; k++) {
    const pk = dist[k]!;
    if (pk === 0) continue;
    // Resolve the k wounds one at a time. state[f] = distribution over damage with f Fate points left.
    let states = new Map<string, number>([[`0/${fate}`, 1]]);
    for (let w = 0; w < k; w++) {
      const next = new Map<string, number>();
      const bump = (key: string, v: number) => next.set(key, (next.get(key) ?? 0) + v);
      for (const [key, prob] of states) {
        const [d, f] = key.split('/').map(Number) as [number, number];
        if (f > 0 && q > 0) {
          bump(`${d}/${f - 1}`, prob * q); // saved
          bump(`${d + 1}/${f - 1}`, prob * (1 - q)); // Fate spent, wound goes through
        } else {
          bump(`${d + 1}/${f}`, prob);
        }
      }
      states = next;
    }
    for (const [key, prob] of states) {
      const [d, f] = key.split('/').map(Number) as [number, number];
      add(d, f, pk * prob);
    }
  }
  return [...out.values()];
}

// --- Exact odds for one model against another ---

export interface FightOptions {
  /** Friendly models helping each side (each gives the side `supportBonus` extra strikes when it wins a duel). */
  supportA?: number;
  supportB?: number;
  /** Might points each side spends per round on its duel, while it has any. */
  mightPerRoundA?: number;
  mightPerRoundB?: number;
  /** Rounds to follow before giving up on a result (a fight between very tough models can go on). */
  maxRounds?: number;
}

export interface FightOdds {
  aWins: number;
  bWins: number;
  /** Neither side was beaten within maxRounds. */
  unresolved: number;
  /** Expected number of rounds fought (a lower bound if `unresolved` is not tiny). */
  expectedRounds: number;
  /** P(A wins with exactly n wounds left), indexed by n. */
  aWoundsLeftWhenWinning: number[];
  bWoundsLeftWhenWinning: number[];
  firstRound: RoundOdds;
}

export interface RoundOdds {
  aWinsDuel: number;
  bWinsDuel: number;
  /** Chance one strike wounds, before Fate. */
  aWoundChance: number;
  bWoundChance: number;
  /** Strikes the winner would get. */
  aStrikes: number;
  bStrikes: number;
  /** Expected wounds suffered by B / A in the first round (after Fate saves). */
  expectedDamageToB: number;
  expectedDamageToA: number;
  /** Chance the first round alone defeats B / A. */
  aKillsB: number;
  bKillsA: number;
}

interface State {
  wa: number;
  wb: number;
  fa: number;
  fb: number;
  ma: number;
  mb: number;
}

const keyOf = (s: State): string => `${s.wa},${s.wb},${s.fa},${s.fb},${s.ma},${s.mb}`;

export function fightOdds(c: Combat, a: Combatant, b: Combatant, opts: FightOptions = {}): FightOdds {
  const maxRounds = opts.maxRounds ?? 60;
  const supA = opts.supportA ?? 0;
  const supB = opts.supportB ?? 0;
  const mightBonus = c.might?.duelBonus ?? 0;
  const strikesA = a.attacks + c.supportBonus * supA;
  const strikesB = b.attacks + c.supportBonus * supB;
  const pA = woundChance(c, a.strength, b.defence); // A's strike wounds B
  const pB = woundChance(c, b.strength, a.defence);
  const q = fateChance(c);
  const fateA = c.fate ? a.fate : 0;
  const fateB = c.fate ? b.fate : 0;
  const mightA = c.might ? a.might : 0;
  const mightB = c.might ? b.might : 0;

  const duelCache = new Map<string, { a: number; b: number }>();
  const duel = (spendA: number, spendB: number) => {
    const key = `${spendA}/${spendB}`;
    let d = duelCache.get(key);
    if (!d) {
      d = duelOdds(c, { fight: a.fight, bonus: (a.duelModifier ?? 0) + spendA * mightBonus }, { fight: b.fight, bonus: (b.duelModifier ?? 0) + spendB * mightBonus });
      duelCache.set(key, d);
    }
    return d;
  };
  const damageToB = new Map<number, WoundOutcome[]>(); // by Fate B has
  const damageToA = new Map<number, WoundOutcome[]>();
  const dist = (cache: Map<number, WoundOutcome[]>, strikes: number, p: number, fate: number) => {
    let d = cache.get(fate);
    if (!d) {
      d = damageDistribution(strikes, p, fate, q);
      cache.set(fate, d);
    }
    return d;
  };

  const start: State = { wa: a.wounds, wb: b.wounds, fa: fateA, fb: fateB, ma: mightA, mb: mightB };
  let live = new Map<string, { s: State; p: number }>([[keyOf(start), { s: start, p: 1 }]]);
  let aWins = 0;
  let bWins = 0;
  let expectedRounds = 0;
  const aLeft = new Array<number>(a.wounds + 1).fill(0);
  const bLeft = new Array<number>(b.wounds + 1).fill(0);

  // A fight with a model that has no wounds is already over.
  if (a.wounds <= 0 || b.wounds <= 0) {
    return emptyOdds(a, b);
  }

  for (let round = 0; round < maxRounds && live.size > 0; round++) {
    const next = new Map<string, { s: State; p: number }>();
    const push = (s: State, p: number) => {
      if (p <= 0) return;
      if (s.wb <= 0) {
        aWins += p;
        aLeft[s.wa]! += p;
        return;
      }
      if (s.wa <= 0) {
        bWins += p;
        bLeft[s.wb]! += p;
        return;
      }
      const key = keyOf(s);
      const cur = next.get(key);
      if (cur) cur.p += p;
      else next.set(key, { s, p });
    };

    for (const { s, p } of live.values()) {
      expectedRounds += p;
      const spendA = Math.min(opts.mightPerRoundA ?? 0, s.ma);
      const spendB = Math.min(opts.mightPerRoundB ?? 0, s.mb);
      const d = duel(spendA, spendB);
      const after = { ...s, ma: s.ma - spendA, mb: s.mb - spendB };
      // A wins the duel and strikes B.
      for (const o of dist(damageToB, strikesA, pA, s.fb)) push({ ...after, wb: s.wb - o.damage, fb: o.fateLeft }, p * d.a * o.p);
      // B wins the duel and strikes A.
      for (const o of dist(damageToA, strikesB, pB, s.fa)) push({ ...after, wa: s.wa - o.damage, fa: o.fateLeft }, p * d.b * o.p);
    }
    live = next;
  }

  const unresolved = [...live.values()].reduce((sum, v) => sum + v.p, 0);

  // The first round on its own, for the summary table.
  const d1 = duel(Math.min(opts.mightPerRoundA ?? 0, mightA), Math.min(opts.mightPerRoundB ?? 0, mightB));
  const toB = damageDistribution(strikesA, pA, fateB, q);
  const toA = damageDistribution(strikesB, pB, fateA, q);
  const firstRound: RoundOdds = {
    aWinsDuel: d1.a,
    bWinsDuel: d1.b,
    aWoundChance: pA,
    bWoundChance: pB,
    aStrikes: strikesA,
    bStrikes: strikesB,
    expectedDamageToB: d1.a * toB.reduce((s, o) => s + o.damage * o.p, 0),
    expectedDamageToA: d1.b * toA.reduce((s, o) => s + o.damage * o.p, 0),
    aKillsB: d1.a * toB.filter((o) => o.damage >= b.wounds).reduce((s, o) => s + o.p, 0),
    bKillsA: d1.b * toA.filter((o) => o.damage >= a.wounds).reduce((s, o) => s + o.p, 0),
  };

  return { aWins, bWins, unresolved, expectedRounds, aWoundsLeftWhenWinning: aLeft, bWoundsLeftWhenWinning: bLeft, firstRound };
}

function emptyOdds(a: Combatant, b: Combatant): FightOdds {
  const aDown = a.wounds <= 0;
  const bDown = b.wounds <= 0;
  return {
    aWins: bDown && !aDown ? 1 : 0,
    bWins: aDown && !bDown ? 1 : 0,
    unresolved: 0,
    expectedRounds: 0,
    aWoundsLeftWhenWinning: new Array<number>(Math.max(0, a.wounds) + 1).fill(0),
    bWoundsLeftWhenWinning: new Array<number>(Math.max(0, b.wounds) + 1).fill(0),
    firstRound: { aWinsDuel: 0.5, bWinsDuel: 0.5, aWoundChance: 0, bWoundChance: 0, aStrikes: 0, bStrikes: 0, expectedDamageToB: 0, expectedDamageToA: 0, aKillsB: 0, bKillsA: 0 },
  };
}

// --- Squad simulation ---

export interface Group {
  combatant: Combatant;
  count: number;
}

export interface SquadOptions {
  runs: number;
  seed: number;
  /** Rounds before a fight is called a draw. */
  maxRounds?: number;
  /** End the fight once a side has lost this fraction of its starting models (the pack's break point). */
  breakFraction?: number;
  mightPerRoundA?: number;
  mightPerRoundB?: number;
}

export interface SquadTally {
  runs: number;
  aWins: number;
  bWins: number;
  draws: number;
  /** aSurvivors[n] = runs ending with n of A's models standing. */
  aSurvivors: number[];
  bSurvivors: number[];
  totalRounds: number;
  /** Runs ending because a side broke (only when breakFraction is set). */
  aBroke: number;
  bBroke: number;
}

/** mulberry32: small, fast, seedable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Soldier {
  c: Combatant;
  wounds: number;
  fate: number;
  might: number;
}

const expand = (groups: Group[], c: Combat): Soldier[] =>
  groups.flatMap((g) =>
    Array.from({ length: Math.max(0, g.count) }, () => ({ c: g.combatant, wounds: g.combatant.wounds, fate: c.fate ? g.combatant.fate : 0, might: c.might ? g.combatant.might : 0 })),
  );

export const emptyTally = (a: number, b: number): SquadTally => ({
  runs: 0, aWins: 0, bWins: 0, draws: 0, aSurvivors: new Array<number>(a + 1).fill(0), bSurvivors: new Array<number>(b + 1).fill(0), totalRounds: 0, aBroke: 0, bBroke: 0,
});

export function mergeTallies(x: SquadTally, y: SquadTally): SquadTally {
  const add = (p: number[], q: number[]) => Array.from({ length: Math.max(p.length, q.length) }, (_, i) => (p[i] ?? 0) + (q[i] ?? 0));
  return {
    runs: x.runs + y.runs, aWins: x.aWins + y.aWins, bWins: x.bWins + y.bWins, draws: x.draws + y.draws,
    aSurvivors: add(x.aSurvivors, y.aSurvivors), bSurvivors: add(x.bSurvivors, y.bSurvivors),
    totalRounds: x.totalRounds + y.totalRounds, aBroke: x.aBroke + y.aBroke, bBroke: x.bBroke + y.bBroke,
  };
}

/**
 * Simulate groups of models fighting each other, round by round. Each round the surviving models are shuffled and paired off;
 * the larger side's surplus models are spread across the pairs as supporters. Pairs fight a round as in fightOdds.
 */
export function simulateSquads(c: Combat, sideA: Group[], sideB: Group[], opts: SquadOptions): SquadTally {
  const maxRounds = opts.maxRounds ?? 40;
  const random = rng(opts.seed);
  const roll = () => Math.floor(random() * c.die) + 1;
  const mightBonus = c.might?.duelBonus ?? 0;
  const nA = sideA.reduce((n, g) => n + Math.max(0, g.count), 0);
  const nB = sideB.reduce((n, g) => n + Math.max(0, g.count), 0);
  const tally = emptyTally(nA, nB);
  const breakA = opts.breakFraction !== undefined ? Math.ceil(nA * opts.breakFraction - 1e-9) : Infinity;
  const breakB = opts.breakFraction !== undefined ? Math.ceil(nB * opts.breakFraction - 1e-9) : Infinity;

  const shuffle = <T,>(arr: T[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
  };

  // Damage `target` by n wounds, letting Fate cancel each one.
  const hurt = (target: Soldier, wounds: number) => {
    for (let i = 0; i < wounds; i++) {
      if (target.fate > 0 && c.fate) {
        target.fate--;
        if (roll() >= c.fate.target) continue;
      }
      target.wounds--;
      if (target.wounds <= 0) return;
    }
  };

  for (let run = 0; run < opts.runs; run++) {
    let A = expand(sideA, c);
    let B = expand(sideB, c);
    let rounds = 0;
    let broke: 'a' | 'b' | null = null;

    while (A.length > 0 && B.length > 0 && rounds < maxRounds) {
      if (nA - A.length >= breakA && nA > 0) { broke = 'a'; break; }
      if (nB - B.length >= breakB && nB > 0) { broke = 'b'; break; }
      rounds++;
      shuffle(A);
      shuffle(B);
      const pairs = Math.min(A.length, B.length);
      const supportersA = new Array<number>(pairs).fill(0);
      const supportersB = new Array<number>(pairs).fill(0);
      for (let i = pairs; i < A.length; i++) supportersA[(i - pairs) % pairs]!++;
      for (let i = pairs; i < B.length; i++) supportersB[(i - pairs) % pairs]!++;

      for (let i = 0; i < pairs; i++) {
        const x = A[i]!;
        const y = B[i]!;
        const spendX = Math.min(opts.mightPerRoundA ?? 0, x.might);
        const spendY = Math.min(opts.mightPerRoundB ?? 0, y.might);
        x.might -= spendX;
        y.might -= spendY;
        const bonusX = (x.c.duelModifier ?? 0) + spendX * mightBonus;
        const bonusY = (y.c.duelModifier ?? 0) + spendY * mightBonus;

        // The duel, rolled again on a tie that the pack says to roll again.
        let xWins: boolean;
        for (;;) {
          const tx = roll() + x.c.fight + bonusX;
          const ty = roll() + y.c.fight + bonusY;
          if (tx !== ty) { xWins = tx > ty; break; }
          if (c.tie === 'coin') { xWins = random() < 0.5; break; }
          if (c.tie === 'higher-fight' && x.c.fight !== y.c.fight) { xWins = x.c.fight > y.c.fight; break; }
        }

        const winner = xWins ? x : y;
        const loser = xWins ? y : x;
        const support = xWins ? supportersA[i]! : supportersB[i]!;
        const strikes = winner.c.attacks + c.supportBonus * support;
        const target = woundTarget(c, winner.c.strength, loser.c.defence);
        let wounds = 0;
        for (let s = 0; s < strikes; s++) if (target !== null && roll() >= target) wounds++;
        hurt(loser, wounds);
      }
      A = A.filter((s) => s.wounds > 0);
      B = B.filter((s) => s.wounds > 0);
    }

    if (!broke) {
      if (nA - A.length >= breakA && nA > 0) broke = 'a';
      else if (nB - B.length >= breakB && nB > 0) broke = 'b';
    }
    tally.runs++;
    tally.totalRounds += rounds;
    tally.aSurvivors[A.length]!++;
    tally.bSurvivors[B.length]!++;
    if (broke === 'a') { tally.aBroke++; tally.bWins++; }
    else if (broke === 'b') { tally.bBroke++; tally.aWins++; }
    else if (B.length === 0 && A.length > 0) tally.aWins++;
    else if (A.length === 0 && B.length > 0) tally.bWins++;
    else tally.draws++;
  }
  return tally;
}
