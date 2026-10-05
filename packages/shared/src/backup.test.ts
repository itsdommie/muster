import { describe, expect, it } from 'vitest';
import { backupFileName, countData, countSkipped, createBackup, parseBackup, restore, BACKUP_FORMAT, type AppData } from './backup.js';
import { setAmount } from './collection.js';
import { clone, sample, sampleIndex } from './fixtures.js';
import { dispatch, startGame } from './game.js';
import { addUnit, addWarband, newList, type ArmyList } from './list.js';
import { newTournament, setResult, startRound } from './tournament.js';
import { addMember, companyToList, newCampaign, recordGame, setMemberStatus } from './campaign.js';

const idx = sampleIndex();

function aList(name: string, updated = 1): ArmyList {
  let l = addWarband(newList(idx, 'vale-realm', 500, name));
  l = addUnit(l, l.warbands[0]!.id, idx.units.get('aldric-the-bold')!);
  l = addUnit(l, l.warbands[0]!.id, idx.units.get('vale-spearman')!);
  return { ...l, updated };
}

function data(): AppData {
  const list = aList('Vanguard', 10);
  let game = startGame(idx, list, { opponent: 'Dave', opponentStart: 8, scenario: idx.scenarios.get('hold-the-ford')! });
  game = dispatch(dispatch(game, { t: 'wound', model: game.start.models[1]!.id, n: 1 }), { t: 'vp', side: 'me', n: 2 });
  let t = newTournament('Club', ['Ann', 'Bob', 'Cat', 'Dan'], {}, 3);
  const r = startRound(t);
  if (!r.ok) throw new Error(r.reason);
  t = setResult(r.tournament, 1, 1, 5, 2);
  // A campaign company, a list made from it, and a game played from that list (so the member links must survive).
  let camp = addMember(idx, addMember(idx, newCampaign(idx, 'Vale Watch', 'vale-realm'), 'aldric-the-bold', 'Aldric'), 'vale-spearman', 'Spear');
  const company = companyToList(idx, camp).list;
  const played = startGame(idx, company);
  camp = recordGame(camp, { opponent: 'Dave', scenario: 'Ford', vpMe: 3, vpOpp: 1, notes: '', results: camp.members.map((m) => ({ member: m.id, played: true, status: 'active' as const, xp: 2 })) });
  return {
    lists: [list, company],
    games: [game, { ...played, finishedAt: 5, campaignRecorded: true }],
    collections: { sample: setAmount(setAmount({}, 'vale-spearman', 'painted', 3), 'vale-archer', 'wanted', 2) },
    tournaments: [t],
    campaigns: [camp],
    customPack: null,
  };
}

const roundTrip = (d: AppData) => {
  const p = parseBackup(JSON.stringify(createBackup(d, 1234)));
  if (!p.ok) throw new Error(p.error);
  return p;
};

describe('backup file', () => {
  it('round-trips everything', () => {
    const d = data();
    const p = roundTrip(d);
    expect(p.backup.data).toEqual(d);
    expect(p.backup).toMatchObject({ app: 'muster', format: BACKUP_FORMAT, exportedAt: 1234 });
    expect(countSkipped(p.skipped)).toBe(0);
  });

  it('carries a loaded data pack, and refuses a broken one without failing the rest', () => {
    const withPack = { ...data(), customPack: sample as unknown };
    expect(roundTrip(withPack).backup.data.customPack).toEqual(sample);
    const bad = JSON.parse(JSON.stringify(createBackup(data())));
    bad.data.customPack = { schema: 1, id: 'x' };
    const p = parseBackup(JSON.stringify(bad));
    expect(p.ok && p.backup.data.customPack).toBeNull();
    expect(p.ok && p.skipped.customPack).toBe(true);
    expect(p.ok && p.backup.data.lists).toHaveLength(2);
  });

  it('keeps every campaign link through a round trip (they are easy to lose, because unknown fields are dropped)', () => {
    const d = data();
    const p = roundTrip(d);
    const company = p.backup.data.lists.find((l) => l.campaign)!;
    expect(company.campaign).toBe(d.campaigns[0]!.id);
    expect(company.warbands[0]!.leader!.members).toEqual([d.campaigns[0]!.members[0]!.id]);
    const game = p.backup.data.games.find((g) => g.campaign)!;
    expect(game).toMatchObject({ campaign: d.campaigns[0]!.id, campaignRecorded: true });
    expect(game.start.models.map((m) => m.member)).toEqual(d.campaigns[0]!.members.map((m) => m.id));
    expect(p.backup.data.campaigns[0]!.log[0]!.changes).toHaveLength(2);
    expect(p.backup.data.campaigns).toEqual(d.campaigns);
  });

  it('skips a damaged campaign and reads a backup from before campaigns existed', () => {
    const b = JSON.parse(JSON.stringify(createBackup(data())));
    b.data.campaigns.push({ id: 'half', name: 'Half' });
    const p = parseBackup(JSON.stringify(b));
    expect(p.ok && p.backup.data.campaigns).toHaveLength(1);
    expect(p.ok && p.skipped.campaigns).toBe(1);
    delete b.data.campaigns;
    const old = parseBackup(JSON.stringify(b));
    expect(old.ok && old.backup.data.campaigns).toEqual([]);
    expect(old.ok && old.skipped.campaigns).toBe(0);
  });

  it('names the file by date', () => {
    expect(backupFileName(Date.UTC(2026, 9, 4, 12))).toBe('muster-backup-2026-10-04.json');
  });

  it('reports a clear reason when a file is not a usable backup', () => {
    const reason = (text: string) => { const p = parseBackup(text); return p.ok ? 'OK' : p.error; };
    expect(reason('not json {')).toMatch(/not valid JSON/);
    expect(reason('[1,2]')).toMatch(/not a Muster backup/);
    expect(reason('{"app":"something-else","format":1,"data":{}}')).toMatch(/not a Muster backup/);
    expect(reason('{"app":"muster","data":{}}')).toMatch(/no format version/);
    expect(reason('{"app":"muster","format":"1","data":{}}')).toMatch(/no format version/);
    expect(reason(`{"app":"muster","format":${BACKUP_FORMAT + 1},"data":{}}`)).toMatch(/newer version/);
    expect(reason(`{"app":"muster","format":${BACKUP_FORMAT}}`)).toMatch(/no data/);
    expect(reason('')).toMatch(/not valid JSON/);
    expect(reason('null')).toMatch(/not a Muster backup/);
  });

  it('accepts an empty backup', () => {
    const p = parseBackup(`{"app":"muster","format":${BACKUP_FORMAT},"data":{}}`);
    expect(p.ok && countData(p.backup.data)).toEqual({ lists: 0, games: 0, tournaments: 0, campaigns: 0, models: 0 });
  });

  it('skips damaged items, counts them, and keeps the good ones', () => {
    const b = JSON.parse(JSON.stringify(createBackup(data())));
    b.data.lists.push({ id: 'broken' }, 'nope', null);
    b.data.lists.push({ ...clone(b.data.lists[0]), warbands: 'not a list' });
    b.data.games[0].events[0] = { t: 'explode' };
    b.data.tournaments.push({ id: 'half', name: 'Half' });
    b.data.collections.bad = 'nope';
    const p = parseBackup(JSON.stringify(b));
    if (!p.ok) throw new Error(p.error);
    expect(p.backup.data.lists).toHaveLength(2);
    expect(p.skipped).toMatchObject({ lists: 4, games: 1, tournaments: 1, collections: 1 });
    expect(p.backup.data.games).toHaveLength(1); // one game's event list was damaged, so that whole game is left out
    expect(p.backup.data.tournaments).toHaveLength(1);
    expect(countSkipped(p.skipped)).toBe(7);
  });

  it('drops a duplicated id rather than letting two items collide', () => {
    const b = JSON.parse(JSON.stringify(createBackup(data())));
    b.data.lists.push(clone(b.data.lists[0]));
    const p = parseBackup(JSON.stringify(b));
    expect(p.ok && p.backup.data.lists).toHaveLength(2);
    expect(p.ok && p.skipped.lists).toBe(1);
  });

  it('cleans up a collection instead of trusting it', () => {
    const b = JSON.parse(JSON.stringify(createBackup(data())));
    b.data.collections.sample['vale-archer'] = { painted: -5, built: 'x', wanted: 2.9 };
    b.data.collections.sample.junk = 'nope';
    const p = parseBackup(JSON.stringify(b));
    expect(p.ok && p.backup.data.collections.sample).toEqual({
      'vale-spearman': { unbuilt: 0, built: 0, primed: 0, painted: 3, wanted: 0 },
      'vale-archer': { unbuilt: 0, built: 0, primed: 0, painted: 0, wanted: 2 },
    });
  });

  it('never throws, whatever the file holds (fuzz)', () => {
    const base = JSON.stringify(createBackup(data()));
    let seed = 7;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 400; i++) {
      // Cut the file somewhere, or overwrite a few characters with junk.
      let text = base;
      if (rand() < 0.5) text = text.slice(0, Math.floor(rand() * text.length));
      else for (let k = 0; k < 5; k++) { const at = Math.floor(rand() * text.length); text = text.slice(0, at) + '{"x":[null,1e999]}'.slice(0, 1 + Math.floor(rand() * 6)) + text.slice(at + 1); }
      expect(() => parseBackup(text)).not.toThrow();
    }
    for (const junk of ['{"app":"muster","format":1,"data":{"lists":7,"games":{},"tournaments":"x","collections":[]}}', '{"app":"muster","format":1,"data":[]}']) {
      expect(() => parseBackup(junk)).not.toThrow();
    }
  });
});

describe('restoring', () => {
  const emptyData = (): AppData => ({ lists: [], games: [], collections: {}, tournaments: [], campaigns: [], customPack: null });

  it('replace makes the device exactly the backup', () => {
    const d = data();
    expect(restore(d, emptyData(), 'replace')).toEqual(emptyData());
    expect(restore(emptyData(), d, 'replace')).toEqual(d);
  });

  it('merge into an empty device gives the backup, and merging the same backup again changes nothing', () => {
    const d = data();
    const once = restore(emptyData(), d, 'merge');
    expect(once).toEqual(d);
    expect(restore(once, d, 'merge')).toEqual(once);
  });

  it('merge keeps what is only on the device, and adds what is only in the backup', () => {
    const device = data();
    const incoming: AppData = { ...emptyData(), lists: [aList('From backup', 5)], collections: { other: setAmount({}, 'chief', 'built', 1) } };
    const out = restore(device, incoming, 'merge');
    expect(out.lists.map((l) => l.name).sort()).toEqual(['From backup', 'Vale Watch company', 'Vanguard']);
    expect(Object.keys(out.collections).sort()).toEqual(['other', 'sample']);
    expect(out.games).toHaveLength(2);
    expect(out.tournaments).toHaveLength(1);
    expect(out.campaigns).toHaveLength(1);
  });

  it('merge prefers the more recently edited list, the device on a tie', () => {
    const device = data();
    const newer = { ...device.lists[0]!, name: 'Newer', updated: 99 };
    expect(restore(device, { ...emptyData(), lists: [newer] }, 'merge').lists[0]!.name).toBe('Newer');
    const older = { ...device.lists[0]!, name: 'Older', updated: 1 };
    expect(restore(device, { ...emptyData(), lists: [older] }, 'merge').lists[0]!.name).toBe('Vanguard');
    const tie = { ...device.lists[0]!, name: 'Tie', updated: 10 };
    expect(restore(device, { ...emptyData(), lists: [tie] }, 'merge').lists[0]!.name).toBe('Vanguard');
  });

  it('merge keeps the game that is further along, and a finished one over an unfinished one', () => {
    const device = data();
    const g = device.games[0]!;
    const further = dispatch(g, { t: 'turn', turn: 2 });
    expect(restore(device, { ...emptyData(), games: [further] }, 'merge').games[0]!.events).toHaveLength(g.events.length + 1);
    expect(restore({ ...device, games: [further] }, { ...emptyData(), games: [g] }, 'merge').games[0]!.events).toHaveLength(g.events.length + 1);
    const finished = { ...g, finishedAt: 5 };
    expect(restore({ ...device, games: [further] }, { ...emptyData(), games: [finished] }, 'merge').games[0]!.finishedAt).toBe(5);
  });

  it('merge keeps the more recently changed campaign', () => {
    const device = data();
    const c = device.campaigns[0]!;
    const newer = { ...c, name: 'Newer', updated: c.updated + 10 };
    const older = { ...c, name: 'Older', updated: c.updated - 10 };
    expect(restore(device, { ...emptyData(), campaigns: [newer] }, 'merge').campaigns[0]!.name).toBe('Newer');
    expect(restore(device, { ...emptyData(), campaigns: [older] }, 'merge').campaigns[0]!.name).toBe('Vale Watch');
    expect(restore(emptyData(), { ...emptyData(), campaigns: [c] }, 'merge').campaigns).toEqual([c]);
  });

  it('merge keeps the tournament with more progress', () => {
    const device = data();
    const t = device.tournaments[0]!;
    const bare = { ...t, rounds: [] };
    expect(restore(device, { ...emptyData(), tournaments: [bare] }, 'merge').tournaments[0]!.rounds).toHaveLength(1);
    expect(restore({ ...device, tournaments: [bare] }, { ...emptyData(), tournaments: [t] }, 'merge').tournaments[0]!.rounds).toHaveLength(1);
  });

  it('merge combines collections per unit, taking the backup\'s counts for a unit in both', () => {
    const device: AppData = { ...emptyData(), collections: { sample: setAmount(setAmount({}, 'a', 'built', 1), 'b', 'built', 5) } };
    const incoming: AppData = { ...emptyData(), collections: { sample: setAmount(setAmount({}, 'a', 'painted', 2), 'c', 'wanted', 1) } };
    const out = restore(device, incoming, 'merge').collections.sample!;
    expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c']);
    expect(out.a).toMatchObject({ built: 0, painted: 2 });
    expect(out.b).toMatchObject({ built: 5 });
  });

  it('merge does not replace a pack already loaded on the device, and never mutates its inputs', () => {
    const d = data();
    const device: AppData = { ...d, customPack: { id: 'mine' } };
    const incoming: AppData = { ...d, customPack: { id: 'theirs' } };
    const before = JSON.stringify([device, incoming]);
    expect(restore(device, incoming, 'merge').customPack).toEqual({ id: 'mine' });
    expect(restore({ ...device, customPack: null }, incoming, 'merge').customPack).toEqual({ id: 'theirs' });
    expect(restore(device, incoming, 'replace').customPack).toEqual({ id: 'theirs' });
    expect(JSON.stringify([device, incoming])).toBe(before);
  });
});

describe('one game at a time', () => {
  const emptyData = (): AppData => ({ lists: [], games: [], collections: {}, tournaments: [], campaigns: [], customPack: null });
  const twoGames = () => {
    const d = data();
    const a = d.games[0]!; // 2 events, unfinished
    const b = dispatch(startGame(idx, d.lists[0]!, {}), { t: 'turn', turn: 2 }); // 1 event, unfinished
    return { a, b };
  };

  it('keeps the furthest-along unfinished game active and files the other in the history', () => {
    const { a, b } = twoGames();
    const out = restore({ ...emptyData(), games: [a] }, { ...emptyData(), games: [b] }, 'merge').games;
    expect(out).toHaveLength(2);
    expect(out.find((g) => g.id === a.id)!.finishedAt).toBeNull();
    expect(out.find((g) => g.id === b.id)!.finishedAt).toBe(b.startedAt);
    expect(out.find((g) => g.id === b.id)!.events).toEqual(b.events); // nothing was lost
  });

  it('prefers the incoming game when it is further along, and applies to replace as well', () => {
    const { a, b } = twoGames();
    const out = restore({ ...emptyData(), games: [b] }, { ...emptyData(), games: [a] }, 'merge').games;
    expect(out.find((g) => !g.finishedAt)!.id).toBe(a.id);
    const replaced = restore(emptyData(), { ...emptyData(), games: [a, b] }, 'replace').games;
    expect(replaced.filter((g) => !g.finishedAt)).toHaveLength(1);
  });

  it('leaves finished games and a single active game alone', () => {
    const { a, b } = twoGames();
    const done = { ...b, finishedAt: 5 };
    expect(restore({ ...emptyData(), games: [a] }, { ...emptyData(), games: [done] }, 'merge').games.find((g) => g.id === done.id)!.finishedAt).toBe(5);
  });
});

describe('counts', () => {
  it('summarises a backup for the confirmation screen', () => {
    expect(countData(data())).toEqual({ lists: 2, games: 2, tournaments: 1, campaigns: 1, models: 3 });
  });
});
