import { describe, expect, it } from 'vitest';
import { rng } from './combat.js';
import {
  addPlayer, clearResult, finish, isBye, newTournament, playerName, recommendedRounds, removeLastRound, removePlayer, renamePlayer,
  roundComplete, setDropped, setResult, standings, standingsText, startRound, type Tournament,
} from './tournament.js';

const make = (names: string[], config = {}, seed = 1) => newTournament('Club night', names, config, seed);
const id = (t: Tournament, name: string) => t.players.find((p) => p.name === name)!.id;
const row = (t: Tournament, name: string) => standings(t).find((r) => r.player.name === name)!;

/** Start the next round, failing the test if that is not allowed. */
function start(t: Tournament): Tournament {
  const r = startRound(t);
  if (!r.ok) throw new Error(r.reason);
  return r.tournament;
}
/** Give every undecided game a result: the higher-seeded name wins by `margin`, using `pick` to choose. */
function playRound(t: Tournament, pick: (a: string, b: string) => [number, number]): Tournament {
  const r = t.rounds.at(-1)!;
  return r.pairings.reduce((acc, p) => (isBye(p) || p.vpA !== null ? acc : setResult(acc, r.number, p.table, ...pick(playerName(acc, p.a), playerName(acc, p.b)))), t);
}
/** The names of a round's pairings, as "A-B" (or "A-bye"). */
const pairs = (t: Tournament, n = t.rounds.length) =>
  t.rounds[n - 1]!.pairings.map((p) => [playerName(t, p.a), p.b === null ? 'bye' : playerName(t, p.b)].sort().join('-')).sort();

describe('rounds', () => {
  it('recommends ceil(log2 players), at least one', () => {
    expect([0, 1, 2, 3, 4, 5, 8, 9, 16, 17, 32].map(recommendedRounds)).toEqual([1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('defaults the round count from the field and lets a config override it', () => {
    expect(make(['a', 'b', 'c', 'd', 'e']).config).toMatchObject({ rounds: 3, win: 3, draw: 1, loss: 0 });
    expect(make(['a', 'b'], { rounds: 5, win: 2 }).config).toMatchObject({ rounds: 5, win: 2 });
  });

  it('ignores blank names', () => {
    expect(make(['a', '  ', '', 'b ']).players.map((p) => p.name)).toEqual(['a', 'b']);
  });
});

describe('the first round', () => {
  it('seats everyone exactly once, and a seed makes the draw repeatable', () => {
    const t = make(['a', 'b', 'c', 'd', 'e', 'f'], {}, 7);
    const one = start(t);
    const seated = one.rounds[0]!.pairings.flatMap((p) => [p.a, p.b]).sort();
    expect(seated).toEqual(t.players.map((p) => p.id).sort());
    expect(pairs(start(make(['a', 'b', 'c', 'd', 'e', 'f'], {}, 7)))).toEqual(pairs(one));
    expect(pairs(start(make(['a', 'b', 'c', 'd', 'e', 'f'], {}, 8)))).not.toEqual(pairs(one));
    expect(one.rounds[0]!.pairings.map((p) => p.table)).toEqual([1, 2, 3]);
  });

  it('gives an odd field a bye with an automatic win', () => {
    const t = start(make(['a', 'b', 'c'], { byeVp: 4 }));
    const bye = t.rounds[0]!.pairings.find(isBye)!;
    expect(bye).toMatchObject({ vpA: 4, vpB: 0 });
    expect(roundComplete({ number: 1, pairings: [bye] })).toBe(true);
    const r = row(t, playerName(t, bye.a));
    expect(r).toMatchObject({ points: 3, wins: 1, byes: 1, vpFor: 4, played: 1 });
  });

  it('needs two players', () => {
    expect(startRound(make(['solo']))).toEqual({ ok: false, reason: 'Need at least two players still in.' });
    expect(startRound(make([]))).toMatchObject({ ok: false });
  });
});

describe('results and standings', () => {
  it('scores wins, draws and losses from victory points', () => {
    let t = start(make(['A', 'B', 'C', 'D'], { win: 3, draw: 1, loss: 0 }, 3));
    t = playRound(t, (a) => (a === 'A' || a === 'C' ? [5, 2] : [2, 5])); // whoever is listed as A or C wins when first
    const r = standings(t);
    expect(r.reduce((s, x) => s + x.points, 0)).toBe(6); // two decisive games
    const drawn = playRound(start(make(['A', 'B'], {}, 1)), () => [4, 4]);
    expect(standings(drawn).map((x) => [x.points, x.draws])).toEqual([[1, 1], [1, 1]]);
  });

  it('breaks ties by strength of schedule, then VP difference, then VP scored, then name', () => {
    // Hand-built: four players, two rounds. P and Q both finish on 3 points.
    let t = make(['P', 'Q', 'R', 'S'], { rounds: 2 }, 1);
    const [P, Q, R, S] = ['P', 'Q', 'R', 'S'].map((n) => id(t, n));
    t = {
      ...t,
      rounds: [
        { number: 1, pairings: [{ table: 1, a: P!, b: R!, vpA: 6, vpB: 0 }, { table: 2, a: Q!, b: S!, vpA: 3, vpB: 2 }] },
        { number: 2, pairings: [{ table: 1, a: P!, b: Q!, vpA: 1, vpB: 4 }, { table: 2, a: R!, b: S!, vpA: 3, vpB: 3 }] },
      ],
    };
    // Points: P 3 (won R, lost Q), Q 6 (won both), R 1 (lost P, drew S), S 1 (lost Q, drew R).
    expect(Object.fromEntries(standings(t).map((r) => [r.player.name, r.points]))).toEqual({ P: 3, Q: 6, R: 1, S: 1 });
    // R and S tie on points and on SoS? R faced P(3) and S(1) = 2.0; S faced Q(6) and R(1) = 3.5, so S ranks above R.
    expect(standings(t).map((r) => r.player.name)).toEqual(['Q', 'P', 'S', 'R']);
    expect(row(t, 'S').sos).toBeCloseTo(3.5);
    expect(row(t, 'R').sos).toBeCloseTo(2);
    expect(row(t, 'P')).toMatchObject({ vpFor: 7, vpAgainst: 4, vpDiff: 3 });
  });

  it('uses VP difference when points and strength of schedule match, then VP scored, then name', () => {
    let t = make(['Ann', 'Bob', 'Cat', 'Dan'], { rounds: 1 }, 1);
    const [A, B, C, D] = ['Ann', 'Bob', 'Cat', 'Dan'].map((n) => id(t, n));
    t = { ...t, rounds: [{ number: 1, pairings: [{ table: 1, a: A!, b: B!, vpA: 5, vpB: 1 }, { table: 2, a: C!, b: D!, vpA: 3, vpB: 0 }] }] };
    // Ann and Cat both won; Ann by 4, Cat by 3. Bob and Dan lost; Bob by -4, Dan by -3.
    expect(standings(t).map((r) => r.player.name)).toEqual(['Ann', 'Cat', 'Dan', 'Bob']);
    // Same difference, more scored: Ann 6-2 beats Cat 4-0.
    t = { ...t, rounds: [{ number: 1, pairings: [{ table: 1, a: A!, b: B!, vpA: 6, vpB: 2 }, { table: 2, a: C!, b: D!, vpA: 4, vpB: 0 }] }] };
    expect(standings(t).slice(0, 2).map((r) => r.player.name)).toEqual(['Ann', 'Cat']);
    // Identical in every respect: alphabetical.
    t = { ...t, rounds: [{ number: 1, pairings: [{ table: 1, a: A!, b: B!, vpA: 3, vpB: 0 }, { table: 2, a: C!, b: D!, vpA: 3, vpB: 0 }] }] };
    expect(standings(t).map((r) => r.player.name)).toEqual(['Ann', 'Cat', 'Bob', 'Dan']);
    expect(standings(t).map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('counts only decided games, and lets a result be corrected', () => {
    let t = start(make(['a', 'b'], {}, 1));
    expect(standings(t).every((r) => r.played === 0 && r.points === 0)).toBe(true);
    t = setResult(t, 1, 1, 5, 1);
    expect(standings(t)[0]!.points).toBe(3);
    const winner = standings(t)[0]!.player.id;
    t = setResult(t, 1, 1, 1, 5); // corrected: the other player won
    expect(standings(t)[0]!.player.id).not.toBe(winner);
    t = clearResult(t, 1, 1);
    expect(standings(t).every((r) => r.played === 0)).toBe(true);
  });

  it('rejects nonsense results and leaves byes alone', () => {
    const t = start(make(['a', 'b', 'c'], {}, 1));
    const game = t.rounds[0]!.pairings.find((p) => !isBye(p))!;
    expect(setResult(t, 1, game.table, -1, 2)).toBe(t);
    expect(setResult(t, 1, game.table, Number.NaN, 2)).toBe(t);
    expect(setResult(t, 9, 1, 1, 1).rounds).toEqual(t.rounds); // no such round
    const bye = t.rounds[0]!.pairings.find(isBye)!;
    expect(setResult(t, 1, bye.table, 9, 9).rounds[0]!.pairings.find(isBye)).toEqual(bye);
    expect(setResult(t, 1, game.table, 3.9, 2.2).rounds[0]!.pairings[0]).toMatchObject({ vpA: 3, vpB: 2 });
  });
});

describe('later rounds', () => {
  it('pairs winners with winners', () => {
    let t = start(make(['A', 'B', 'C', 'D'], {}, 5));
    t = playRound(t, () => [5, 1]); // in each game the listed-first player wins
    const winners = standings(t).filter((r) => r.wins === 1).map((r) => r.player.name).sort();
    t = start(t);
    const round2 = pairs(t);
    expect(round2).toContain(winners.join('-'));
  });

  it('will not start a round while games are undecided, nor beyond the round count', () => {
    let t = start(make(['a', 'b', 'c', 'd'], { rounds: 1 }, 1));
    expect(startRound(t)).toEqual({ ok: false, reason: 'Round 1 still has games without a result.' });
    t = playRound(t, () => [2, 1]);
    expect(startRound(t)).toEqual({ ok: false, reason: 'All 1 rounds have been played. Raise the round count to play on.' });
    expect(startRound({ ...t, config: { ...t.config, rounds: 2 } })).toMatchObject({ ok: true });
  });

  it('never repeats a pairing when it can be avoided, across many field sizes and random results', () => {
    for (let n = 4; n <= 24; n++) {
      const names = Array.from({ length: n }, (_, i) => `P${String(i).padStart(2, '0')}`);
      const random = rng(n);
      let t = make(names, { rounds: recommendedRounds(n) + 1 }, n);
      const seen = new Set<string>();
      for (let r = 0; r < t.config.rounds; r++) {
        const res = startRound(t);
        if (!res.ok) throw new Error(res.reason);
        expect(res.rematches, `${n} players, round ${r + 1}`).toBe(0);
        t = res.tournament;
        for (const p of t.rounds[r]!.pairings) {
          if (isBye(p)) continue;
          const key = [p.a, p.b].sort().join('/');
          expect(seen.has(key), `${n} players: a rematch in round ${r + 1}`).toBe(false);
          seen.add(key);
        }
        t = playRound(t, () => (random() < 0.1 ? [3, 3] : random() < 0.5 ? [4, 1] : [1, 4]));
      }
    }
  });

  it('gives each player a bye before anyone gets a second, and the bye goes to a low-ranked player', () => {
    let t = make(['a', 'b', 'c', 'd', 'e'], { rounds: 5 }, 2);
    const byes: string[] = [];
    for (let r = 0; r < 5; r++) {
      t = start(t);
      byes.push(t.rounds[r]!.pairings.find(isBye)!.a);
      t = playRound(t, (a) => [a.charCodeAt(0) % 5, 0]);
    }
    expect(new Set(byes).size).toBe(5);
  });

  it('gives the bye to the lowest-ranked player who has not had one', () => {
    let t = make(['a', 'b', 'c', 'd', 'e'], { rounds: 3 }, 2);
    t = start(t);
    const firstBye = t.rounds[0]!.pairings.find(isBye)!.a;
    // Decisive results with distinct margins, so the standings have a clear bottom.
    t = playRound(t, () => [6, 1]);
    const ranked = standings(t).filter((r) => r.player.id !== firstBye);
    const expected = ranked.at(-1)!.player.id; // worst-ranked of those without a bye
    t = start(t);
    expect(t.rounds[1]!.pairings.find(isBye)!.a).toBe(expected);
    expect(expected).not.toBe(standings(t)[0]!.player.id);
  });

  it('keeps dropped players out of later rounds but keeps their results; late arrivals are paired', () => {
    let t = start(make(['A', 'B', 'C', 'D'], { rounds: 3 }, 4));
    t = playRound(t, () => [2, 1]);
    const out = standings(t)[3]!.player;
    t = setDropped(t, out.id, true);
    t = addPlayer(t, 'Late');
    t = removeLastRound(t);
    t = start(t);
    const seated = t.rounds[0]!.pairings.flatMap((p) => [p.a, p.b]);
    expect(seated).not.toContain(out.id);
    expect(seated).toContain(id(t, 'Late'));
    expect(t.players).toHaveLength(5);
  });

  it('removing the last round un-plays it', () => {
    let t = start(make(['a', 'b'], {}, 1));
    t = playRound(t, () => [2, 0]);
    t = removeLastRound(t);
    expect(t.rounds).toHaveLength(0);
    expect(standings(t).every((r) => r.played === 0)).toBe(true);
  });

  it('falls back to a rematch only when nobody can be kept apart, and says so', () => {
    // Two players, two rounds: the same pair must meet again.
    let t = start(make(['a', 'b'], { rounds: 2 }, 1));
    t = playRound(t, () => [2, 1]);
    const r = startRound(t);
    expect(r).toMatchObject({ ok: true, rematches: 1 });
  });
});

describe('managing players', () => {
  it('renames, and removes only players who have not played', () => {
    let t = make(['a', 'b', 'c'], {}, 1);
    t = renamePlayer(t, id(t, 'a'), ' Alice ');
    expect(t.players[0]!.name).toBe('Alice');
    expect(renamePlayer(t, id(t, 'b'), '  ')).toBe(t);
    expect(removePlayer(t, id(t, 'c')).players).toHaveLength(2);
    const started = start(t);
    const played = started.rounds[0]!.pairings.find((p) => !isBye(p))!.a;
    expect(removePlayer(started, played)).toBe(started); // drop them instead
  });
});

describe('export and persistence', () => {
  it('writes a plain-text standings table', () => {
    let t = start(make(['Ann', 'Bob'], { rounds: 1 }, 1));
    t = playRound(t, (a) => (a === 'Ann' ? [5, 2] : [2, 5]));
    const text = standingsText(finish(t));
    expect(text).toContain('Club night');
    expect(text).toContain('After 1 of 1 rounds');
    expect(text).toMatch(/ 1\. \w+: 3 pts, 1-0-0, VP \d-\d \(\+3\)/);
  });

  it('survives a JSON round trip', () => {
    let t = start(make(['a', 'b', 'c', 'd', 'e'], {}, 9));
    t = playRound(t, () => [3, 1]);
    const back = JSON.parse(JSON.stringify(t)) as Tournament;
    expect(standings(back)).toEqual(standings(t));
    expect(startRound(back)).toEqual(startRound(t));
  });
});
