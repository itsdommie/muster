import { describe, expect, it } from 'vitest';
import { sampleIndex } from './fixtures.js';
import { canRedo, canUndo, dispatch, finishGame, forceStatus, opponentStatus, redo, replay, startGame, undo, type GameEvent, type GameRecord } from './game.js';
import { addUnit, addWarband, newList, setOptions } from './list.js';

const idx = sampleIndex();
const unit = (id: string) => idx.units.get(id)!;

/** Warband 1: Aldric + 4 spearmen (one shielded group) + 2 archers.  Warband 2: Sera + 1 knight.  10 models. */
function sampleRecord(opts: { opponentStart?: number } = {}): GameRecord {
  let list = addWarband(newList(idx, 'vale-realm', 500, 'Vale vanguard'));
  const w1 = list.warbands[0]!.id;
  list = addUnit(list, w1, unit('aldric-the-bold'));
  for (let i = 0; i < 4; i++) list = addUnit(list, w1, unit('vale-spearman'));
  list = setOptions(list, w1, 0, ['shield']);
  for (let i = 0; i < 2; i++) list = addUnit(list, w1, unit('vale-archer'));
  list = addWarband(list);
  const w2 = list.warbands[1]!.id;
  list = addUnit(list, w2, unit('sera-windfletcher'));
  list = addUnit(list, w2, unit('vale-knight'));
  return startGame(idx, list, opts);
}

const run = (r: GameRecord, ...events: GameEvent[]) => events.reduce(dispatch, r);
const id = (r: GameRecord, label: string) => r.start.models.find((m) => m.label === label)!.id;

describe('startGame', () => {
  it('creates one tracked model per model in the list, with stats from the pack', () => {
    const r = sampleRecord();
    expect(r.start.models).toHaveLength(9);
    const aldric = r.start.models[0]!;
    expect(aldric).toMatchObject({ label: 'Aldric the Bold', leader: true, warband: 0, ranged: false });
    expect(aldric.wounds).toEqual({ cur: 3, max: 3 });
    expect(aldric.might).toEqual({ cur: 3, max: 3 });
    expect(aldric.fate).toEqual({ cur: 3, max: 3 });
    expect(r.start.models.find((m) => m.label === 'Vale Spearman 1')?.might).toBeUndefined(); // warriors have no Might
  });

  it('numbers repeated units within a warband and records chosen options', () => {
    const r = startGame(idx, (() => {
      let l = addWarband(newList(idx, 'vale-realm'));
      l = addUnit(l, l.warbands[0]!.id, unit('aldric-the-bold'));
      l = addUnit(l, l.warbands[0]!.id, unit('vale-spearman'));
      l = setOptions(l, l.warbands[0]!.id, 0, ['shield']);
      l = addUnit(l, l.warbands[0]!.id, unit('vale-archer'));
      return l;
    })());
    expect(r.start.models.map((m) => m.label)).toEqual(['Aldric the Bold', 'Vale Spearman', 'Vale Archer']); // singles are not numbered
    expect(r.start.models[1]!.detail).toEqual(['Shield']);
  });

  it('flags ranged models, including those that get a bow from an option, and keeps pack settings', () => {
    const r = sampleRecord();
    expect(r.start.models.filter((m) => m.ranged).map((m) => m.label)).toEqual(['Vale Archer 1', 'Vale Archer 2', 'Sera Windfletcher']);
    expect(r.start.breakFraction).toBe(0.5);
    expect(r.pack).toBe('sample');
    expect(r.name).toBe('Vale vanguard');
  });

  it('keeps going with an empty list', () => {
    const r = startGame(idx, newList(idx, 'vale-realm'));
    expect(r.start.models).toEqual([]);
    expect(forceStatus(replay(r)).broken).toBe(false); // nothing to break
  });
});

describe('scenarios', () => {
  it('a game can be started with a scenario, which is copied into the record', () => {
    const scenario = idx.scenarios.get('hold-the-ford')!;
    const r = startGame(idx, newList(idx, 'vale-realm'), { scenario });
    expect(r.scenario).toMatchObject({ id: 'hold-the-ford', name: 'Hold the Ford', special: expect.stringContaining('difficult terrain') });
    expect(r.scenario!.objectives).toBe(scenario.objectives);
    // A copy: it survives a JSON round trip and does not point back into the pack.
    expect(JSON.parse(JSON.stringify(r)).scenario).toEqual(r.scenario);
    expect(r.scenario).not.toBe(scenario);
  });

  it('is optional, and omitted fields stay omitted', () => {
    expect('scenario' in startGame(idx, newList(idx, 'vale-realm'))).toBe(false);
    const r = startGame(idx, newList(idx, 'vale-realm'), { scenario: idx.scenarios.get('seize-the-beacon')! });
    expect('special' in r.scenario!).toBe(false); // this scenario has no special rules
  });
});

describe('wounds and casualties', () => {
  it('reduces wounds, makes a casualty at zero, and never goes below zero', () => {
    let r = sampleRecord();
    const aldric = id(r, 'Aldric the Bold');
    r = run(r, { t: 'wound', model: aldric, n: 1 });
    expect(replay(r).models[0]!.wounds.cur).toBe(2);
    r = run(r, { t: 'wound', model: aldric, n: 5 });
    expect(replay(r).models[0]!.wounds.cur).toBe(0);
    expect(replay(r).log.at(-1)!.text).toBe('Aldric the Bold is a casualty.');
  });

  it('healing is capped at the maximum and brings a casualty back', () => {
    let r = sampleRecord();
    const aldric = id(r, 'Aldric the Bold');
    r = run(r, { t: 'wound', model: aldric, n: 1 }, { t: 'wound', model: aldric, n: -5 });
    expect(replay(r).models[0]!.wounds.cur).toBe(3);
    r = run(r, { t: 'wound', model: aldric, n: 9 }, { t: 'wound', model: aldric, n: -1 });
    expect(replay(r).models[0]!.wounds.cur).toBe(1);
    expect(replay(r).log.at(-1)!.text).toMatch(/back in the fight/);
  });

  it('ignores no-op events and events for unknown models', () => {
    let r = sampleRecord();
    r = run(r, { t: 'wound', model: 'ghost', n: 1 }, { t: 'wound', model: id(r, 'Aldric the Bold'), n: -1 });
    expect(replay(r).log).toEqual([]);
  });
});

describe('Might, Will and Fate', () => {
  it('spends and regains within 0..max, only for heroes', () => {
    let r = sampleRecord();
    const aldric = id(r, 'Aldric the Bold');
    r = run(r, { t: 'spend', model: aldric, stat: 'might', n: 1 }, { t: 'spend', model: aldric, stat: 'might', n: 1 });
    expect(replay(r).models[0]!.might!.cur).toBe(1);
    r = run(r, { t: 'spend', model: aldric, stat: 'might', n: 9 });
    expect(replay(r).models[0]!.might!.cur).toBe(0);
    r = run(r, { t: 'spend', model: aldric, stat: 'might', n: -1 });
    expect(replay(r).models[0]!.might!.cur).toBe(1);
    r = run(r, { t: 'spend', model: aldric, stat: 'might', n: -9 });
    expect(replay(r).models[0]!.might!.cur).toBe(3);

    const logBefore = replay(r).log.length;
    r = run(r, { t: 'spend', model: id(r, 'Vale Spearman 1'), stat: 'fate', n: 1 });
    expect(replay(r).log).toHaveLength(logBefore);
  });
});

describe('force status and the break point', () => {
  it('counts casualties against the break point (50% of 9 = 5)', () => {
    let r = sampleRecord();
    expect(forceStatus(replay(r))).toMatchObject({ start: 9, remaining: 9, lost: 0, breakAt: 5, untilBroken: 5, broken: false });
    r = run(r, ...['Vale Spearman 1', 'Vale Spearman 2', 'Vale Spearman 3', 'Vale Spearman 4'].map((l): GameEvent => ({ t: 'wound', model: id(r, l), n: 1 })));
    expect(forceStatus(replay(r))).toMatchObject({ lost: 4, untilBroken: 1, broken: false });
    r = run(r, { t: 'wound', model: id(r, 'Vale Archer 1'), n: 1 });
    expect(forceStatus(replay(r))).toMatchObject({ lost: 5, untilBroken: 0, broken: true });
    r = run(r, { t: 'wound', model: id(r, 'Vale Archer 1'), n: -1 });
    expect(forceStatus(replay(r)).broken).toBe(false); // a model recovered
  });

  it('tracks remaining heroes and ranged models', () => {
    let r = sampleRecord();
    r = run(r, { t: 'wound', model: id(r, 'Sera Windfletcher'), n: 2 }, { t: 'wound', model: id(r, 'Vale Archer 2'), n: 1 });
    expect(forceStatus(replay(r))).toMatchObject({ heroesStart: 2, heroesRemaining: 1, rangedStart: 3, rangedRemaining: 1 });
  });

  it('multi-wound models are only lost at zero', () => {
    let r = sampleRecord();
    r = run(r, { t: 'wound', model: id(r, 'Aldric the Bold'), n: 2 });
    expect(forceStatus(replay(r)).lost).toBe(0);
    r = run(r, { t: 'wound', model: id(r, 'Aldric the Bold'), n: 1 });
    expect(forceStatus(replay(r)).lost).toBe(1);
  });
});

describe('opponent, turn, priority and victory points', () => {
  it('tracks an opponent force by count and its own break point', () => {
    let r = sampleRecord({ opponentStart: 12 });
    r = run(r, { t: 'opp-lost', n: 5 });
    expect(opponentStatus(replay(r))).toMatchObject({ start: 12, lost: 5, remaining: 7, breakAt: 6, broken: false });
    r = run(r, { t: 'opp-lost', n: 1 });
    expect(opponentStatus(replay(r)).broken).toBe(true);
    r = run(r, { t: 'opp-lost', n: 99 }, { t: 'opp-lost', n: -99 });
    expect(replay(r).opponent.lost).toBe(0);
    r = run(r, { t: 'opp-lost', n: 99 });
    expect(replay(r).opponent.lost).toBe(12); // cannot lose more than the force
  });

  it('lets the opponent size be set or corrected mid-game', () => {
    let r = sampleRecord();
    expect(opponentStatus(replay(r)).broken).toBe(false); // size unknown: never "broken"
    r = run(r, { t: 'opp-lost', n: 3 }, { t: 'opp-start', n: 8 });
    expect(opponentStatus(replay(r))).toMatchObject({ start: 8, lost: 3, breakAt: 4, broken: false });
    r = run(r, { t: 'opp-start', n: 2 });
    expect(replay(r).opponent.lost).toBe(2); // lost can't exceed the corrected size
  });

  it('records turn, priority and victory points; VP never go negative', () => {
    let r = sampleRecord();
    r = run(r, { t: 'turn', turn: 3 }, { t: 'priority', side: 'opponent' }, { t: 'vp', side: 'me', n: 3 }, { t: 'vp', side: 'opponent', n: -2 });
    const g = replay(r);
    expect(g).toMatchObject({ turn: 3, priority: 'opponent', vp: { me: 3, opponent: 0 } });
    expect(replay(run(r, { t: 'turn', turn: 0 })).turn).toBe(1);
  });

  it('stamps log lines with the turn they happened in', () => {
    let r = sampleRecord();
    r = run(r, { t: 'wound', model: id(r, 'Vale Spearman 1'), n: 1 }, { t: 'turn', turn: 2 }, { t: 'wound', model: id(r, 'Vale Spearman 2'), n: 1 });
    expect(replay(r).log.map((l) => [l.turn, l.text])).toEqual([
      [1, 'Vale Spearman 1 is a casualty.'],
      [2, 'Turn 2 begins.'],
      [2, 'Vale Spearman 2 is a casualty.'],
    ]);
  });
});

describe('undo and redo', () => {
  it('steps back and forward through events', () => {
    let r = sampleRecord();
    const aldric = id(r, 'Aldric the Bold');
    expect(canUndo(r)).toBe(false);
    r = run(r, { t: 'wound', model: aldric, n: 1 }, { t: 'wound', model: aldric, n: 1 });
    expect(replay(r).models[0]!.wounds.cur).toBe(1);
    r = undo(r);
    expect(replay(r).models[0]!.wounds.cur).toBe(2);
    expect(canRedo(r)).toBe(true);
    r = redo(r);
    expect(replay(r).models[0]!.wounds.cur).toBe(1);
    expect(canRedo(r)).toBe(false);
  });

  it('undoing an overkill restores the true previous wounds, and a new event clears redo', () => {
    let r = sampleRecord();
    const aldric = id(r, 'Aldric the Bold');
    r = run(r, { t: 'wound', model: aldric, n: 1 }, { t: 'wound', model: aldric, n: 9 });
    r = undo(r);
    expect(replay(r).models[0]!.wounds.cur).toBe(2); // not 3 or 1: replay, not arithmetic inverse
    r = run(r, { t: 'vp', side: 'me', n: 1 });
    expect(canRedo(r)).toBe(false);
  });

  it('is a no-op with nothing to undo or redo, and never mutates the record it was given', () => {
    const r = sampleRecord();
    expect(undo(r)).toBe(r);
    expect(redo(r)).toBe(r);
    const before = JSON.stringify(r);
    run(r, { t: 'wound', model: id(r, 'Aldric the Bold'), n: 1 });
    replay(run(r, { t: 'wound', model: id(r, 'Aldric the Bold'), n: 1 }));
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe('persistence and finishing', () => {
  it('survives a JSON round trip with the same game', () => {
    let r = sampleRecord({ opponentStart: 10 });
    r = run(r, { t: 'wound', model: id(r, 'Aldric the Bold'), n: 2 }, { t: 'spend', model: id(r, 'Aldric the Bold'), stat: 'fate', n: 1 }, { t: 'opp-lost', n: 4 });
    r = undo(r);
    const back = JSON.parse(JSON.stringify(r)) as GameRecord;
    expect(replay(back)).toEqual(replay(r));
    expect(redo(back).events).toEqual(redo(r).events);
  });

  it('marks a game finished', () => {
    const r = finishGame(sampleRecord(), 1234);
    expect(r.finishedAt).toBe(1234);
  });
});
