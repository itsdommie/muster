import { describe, expect, it } from 'vitest';
import {
  addMember, adjustXp, availableAdvancements, companyCost, companyToList, levelOf, memberCost, newCampaign, outcomeOf, recordGame, recordSummary,
  removeMember, renameCampaign, renameMember, revertLastGame, setCampaignNotes, setMemberNotes, setMemberOptions, setMemberStatus, setPointsLimit,
  toggleAdvancement, toggleInjury, xpFor, type Campaign, type GameInput, type Member,
} from './campaign.js';
import { sampleIndex } from './fixtures.js';
import { dispatch, startGame } from './game.js';
import { validateList } from './validate.js';

const idx = sampleIndex();
const rules = idx.pack.ruleset.campaign;

/** A company: Aldric, Sera, five spearmen (one with a shield), two archers and a knight. */
function company(): Campaign {
  let c = newCampaign(idx, 'Vale Watch', 'vale-realm');
  c = addMember(idx, c, 'aldric-the-bold', 'Aldric');
  c = addMember(idx, c, 'sera-windfletcher');
  for (let i = 1; i <= 5; i++) c = addMember(idx, c, 'vale-spearman', `Spear ${i}`);
  c = addMember(idx, c, 'vale-archer', 'Archer 1');
  c = addMember(idx, c, 'vale-archer', 'Archer 2');
  c = addMember(idx, c, 'vale-knight', 'Rider');
  return setMemberOptions(c, byName(c, 'Spear 1').id, ['shield']);
}
const byName = (c: Campaign, name: string): Member => c.members.find((m) => m.name === name)!;

describe('the roster', () => {
  it('adds models the army can field, named after their unit unless told otherwise', () => {
    let c = newCampaign(idx, ' Vale Watch ', 'vale-realm');
    expect(c).toMatchObject({ name: 'Vale Watch', pack: 'sample', pointsLimit: null, members: [], log: [] });
    c = addMember(idx, c, 'vale-spearman');
    c = addMember(idx, c, 'vale-archer', '  Old Tam ');
    expect(c.members.map((m) => [m.name, m.unit, m.status, m.xp, m.games])).toEqual([['Vale Spearman', 'vale-spearman', 'active', 0, 0], ['Old Tam', 'vale-archer', 'active', 0, 0]]);
  });

  it('ignores units that do not exist or that the army cannot field', () => {
    const c = newCampaign(idx, 'x', 'vale-realm');
    expect(addMember(idx, c, 'ghost')).toBe(c);
    expect(addMember(idx, c, 'marsh-raider')).toBe(c); // a Hollow Horde unit
  });

  it('keeps a unique model unique, until the first one has died', () => {
    let c = addMember(idx, newCampaign(idx, 'x', 'vale-realm'), 'aldric-the-bold');
    expect(addMember(idx, c, 'aldric-the-bold')).toBe(c);
    c = setMemberStatus(c, c.members[0]!.id, 'dead');
    expect(addMember(idx, c, 'aldric-the-bold').members).toHaveLength(2);
  });

  it('edits members without touching others, and ignores unknown ids', () => {
    const c = company();
    const id = byName(c, 'Spear 2').id;
    const edited = setMemberNotes(renameMember(setMemberStatus(c, id, 'injured'), id, ' Sergeant '), id, 'Lost an eye');
    expect(edited.members.find((m) => m.id === id)).toMatchObject({ name: 'Sergeant', status: 'injured', notes: 'Lost an eye' });
    expect(edited.members.filter((m) => m.id !== id)).toEqual(c.members.filter((m) => m.id !== id));
    expect(renameMember(c, id, '   ')).toBe(c);
    expect(setMemberStatus(c, 'ghost', 'dead')).toBe(c);
    expect(removeMember(c, id).members).toHaveLength(c.members.length - 1);
  });

  it('experience goes up or down but never below zero or to a fraction', () => {
    const c = company();
    const id = byName(c, 'Archer 1').id;
    let d = adjustXp(c, id, 5);
    expect(byName(d, 'Archer 1').xp).toBe(5);
    d = adjustXp(d, id, -9);
    expect(byName(d, 'Archer 1').xp).toBe(0);
    expect(byName(adjustXp(c, id, 2.9), 'Archer 1').xp).toBe(2);
    expect(byName(adjustXp(c, id, Number.NaN), 'Archer 1').xp).toBe(0);
  });

  it('toggles advancements and injuries on and off', () => {
    let c = company();
    const id = byName(c, 'Aldric').id;
    c = toggleInjury(toggleAdvancement(toggleAdvancement(c, id, 'deadly'), id, 'tough'), id, 'limp');
    expect(byName(c, 'Aldric')).toMatchObject({ advancements: ['deadly', 'tough'], injuries: ['limp'] });
    c = toggleAdvancement(c, id, 'deadly');
    expect(byName(c, 'Aldric').advancements).toEqual(['tough']);
  });

  it('renames the campaign, keeps notes and sets a limit', () => {
    const c = company();
    expect(renameCampaign(c, 'Second Watch').name).toBe('Second Watch');
    expect(renameCampaign(c, ' ')).toBe(c);
    expect(setCampaignNotes(c, 'Winter').notes).toBe('Winter');
    expect(setPointsLimit(c, 350.7).pointsLimit).toBe(350);
    expect(setPointsLimit(setPointsLimit(c, 350), null).pointsLimit).toBeNull();
    expect(setPointsLimit(c, -5).pointsLimit).toBe(0);
  });

  it('never mutates what it was given', () => {
    const c = company();
    const before = JSON.stringify(c);
    const id = c.members[0]!.id;
    adjustXp(c, id, 3); setMemberStatus(c, id, 'dead'); toggleAdvancement(c, id, 'x'); removeMember(c, id); renameMember(c, id, 'Z');
    recordGame(c, { opponent: 'a', scenario: '', vpMe: 1, vpOpp: 0, notes: '', results: [{ member: id, played: true, status: 'dead', xp: 2 }] });
    expect(JSON.stringify(c)).toBe(before);
  });
});

describe('cost', () => {
  it('adds a unit\'s cost and its chosen options, and leaves out the dead', () => {
    const c = company();
    expect(memberCost(idx, byName(c, 'Spear 1'))).toBe(9); // 8 + shield 1
    expect(memberCost(idx, byName(c, 'Spear 2'))).toBe(8);
    // Aldric 90, Sera 60, spearmen 9+8*4, archers 9*2, knight 14
    expect(companyCost(idx, c)).toBe(90 + 60 + 9 + 32 + 18 + 14);
    expect(companyCost(idx, setMemberStatus(c, byName(c, 'Rider').id, 'dead'))).toBe(90 + 60 + 9 + 32 + 18);
    expect(companyCost(idx, setMemberStatus(c, byName(c, 'Rider').id, 'injured'))).toBe(90 + 60 + 9 + 32 + 18 + 14); // injured still cost
  });
});

describe('levels and awards (rules from the pack)', () => {
  it('finds the level for an amount of experience, and what is needed next', () => {
    expect(levelOf(rules, 0)).toEqual({ index: 0, name: 'Recruit', next: { at: 4, name: 'Veteran' }, toNext: 4 });
    expect(levelOf(rules, 3)).toMatchObject({ name: 'Recruit', toNext: 1 });
    expect(levelOf(rules, 4)).toMatchObject({ index: 1, name: 'Veteran', toNext: 6 });
    expect(levelOf(rules, 19)).toMatchObject({ name: 'Champion', toNext: 1 });
    expect(levelOf(rules, 20)).toEqual({ index: 3, name: 'Legend', next: null, toNext: null });
    expect(levelOf(rules, 999)).toMatchObject({ name: 'Legend', toNext: null });
  });

  it('copes with no level rules, and with levels given out of order', () => {
    expect(levelOf(undefined, 50)).toEqual({ index: 0, name: null, next: null, toNext: null });
    expect(levelOf({ levels: [], xp: { play: 0, win: 0, draw: 0 }, advancements: [], injuries: [] }, 5).name).toBeNull();
    const shuffled = { levels: [{ at: 10, name: 'B' }, { at: 0, name: 'A' }], xp: { play: 0, win: 0, draw: 0 }, advancements: [], injuries: [] };
    expect(levelOf(shuffled, 12).name).toBe('B');
    expect(levelOf(shuffled, 2).name).toBe('A');
  });

  it('offers only advancements the level allows and that are not yet taken', () => {
    const m = (xp: number, advancements: string[] = []): Member => ({ id: 'm', unit: 'u', options: [], name: 'n', status: 'active', xp, games: 0, advancements, injuries: [], notes: '' });
    expect(availableAdvancements(rules, m(0)).map((a) => a.id)).toEqual([]);
    expect(availableAdvancements(rules, m(4)).map((a) => a.id)).toEqual(['sharp-eyed', 'iron-will']);
    expect(availableAdvancements(rules, m(10, ['sharp-eyed'])).map((a) => a.id)).toEqual(['iron-will', 'deadly']);
    expect(availableAdvancements(rules, m(20)).map((a) => a.id)).toHaveLength(4);
    expect(availableAdvancements(undefined, m(20))).toEqual([]);
  });

  it('awards experience for taking part, plus extra for the result', () => {
    expect(xpFor(rules, 'win')).toBe(2);
    expect(xpFor(rules, 'draw')).toBe(1);
    expect(xpFor(rules, 'loss')).toBe(1);
    expect(xpFor(undefined, 'win')).toBe(0);
  });

  it('works out the result from the scores', () => {
    expect(outcomeOf(5, 3)).toBe('win');
    expect(outcomeOf(3, 3)).toBe('draw');
    expect(outcomeOf(0, 1)).toBe('loss');
  });
});

describe('recording a game', () => {
  const base = (c: Campaign, over: Partial<GameInput> = {}): GameInput => ({
    opponent: ' Dave ', scenario: 'Hold the Ford', vpMe: 6, vpOpp: 2, notes: 'Close',
    results: [
      { member: byName(c, 'Aldric').id, played: true, status: 'active', xp: 2 },
      { member: byName(c, 'Spear 1').id, played: true, status: 'dead', xp: 2 },
      { member: byName(c, 'Archer 1').id, played: true, status: 'injured', xp: 3 },
      { member: byName(c, 'Rider').id, played: false, status: 'dead', xp: 9 }, // did not play: nothing changes
    ],
    ...over,
  });

  it('updates those who played, leaves the others alone, and logs the game', () => {
    const c = company();
    const d = recordGame(c, base(c), 1000);
    expect(byName(d, 'Aldric')).toMatchObject({ xp: 2, games: 1, status: 'active' });
    expect(byName(d, 'Spear 1')).toMatchObject({ xp: 2, games: 1, status: 'dead' });
    expect(byName(d, 'Archer 1')).toMatchObject({ xp: 3, games: 1, status: 'injured' });
    expect(byName(d, 'Rider')).toEqual(byName(c, 'Rider')); // did not play
    expect(byName(d, 'Sera Windfletcher')).toEqual(byName(c, 'Sera Windfletcher'));
    expect(d.log).toHaveLength(1);
    expect(d.log[0]).toMatchObject({ at: 1000, opponent: 'Dave', scenario: 'Hold the Ford', vpMe: 6, vpOpp: 2, outcome: 'win', notes: 'Close' });
    expect(d.log[0]!.changes).toHaveLength(3);
    expect(d.log[0]!.changes.find((x) => x.name === 'Spear 1')).toMatchObject({ before: { status: 'active', xp: 0, games: 0 }, after: { status: 'dead', xp: 2, games: 1 } });
  });

  it('accumulates over several games, and summarises the record', () => {
    let c = company();
    const id = byName(c, 'Aldric').id;
    const one = (vpMe: number, vpOpp: number): GameInput => ({ opponent: '', scenario: '', vpMe, vpOpp, notes: '', results: [{ member: id, played: true, status: 'active', xp: 1 }] });
    c = recordGame(recordGame(recordGame(c, one(5, 1)), one(2, 2)), one(0, 4));
    expect(byName(c, 'Aldric')).toMatchObject({ xp: 3, games: 3 });
    expect(recordSummary(c)).toEqual({ games: 3, wins: 1, draws: 1, losses: 1 });
  });

  it('cleans up scores and experience it is given', () => {
    const c = company();
    const id = byName(c, 'Aldric').id;
    const d = recordGame(c, { opponent: '', scenario: '', vpMe: -4, vpOpp: 2.9, notes: '', results: [{ member: id, played: true, status: 'active', xp: -5 }] });
    expect(d.log[0]).toMatchObject({ vpMe: 0, vpOpp: 2, outcome: 'loss' });
    expect(byName(d, 'Aldric').xp).toBe(0);
    expect(byName(recordGame(c, { opponent: '', scenario: '', vpMe: 1, vpOpp: 0, notes: '', results: [{ member: id, played: true, status: 'active', xp: Number.NaN }] }), 'Aldric').xp).toBe(0);
  });

  it('ignores results for people who are not in the company', () => {
    const c = company();
    const d = recordGame(c, { opponent: '', scenario: '', vpMe: 1, vpOpp: 0, notes: '', results: [{ member: 'ghost', played: true, status: 'dead', xp: 3 }] });
    expect(d.members).toEqual(c.members);
    expect(d.log).toHaveLength(1);
  });

  it('can take back the latest game exactly', () => {
    const c = company();
    const once = recordGame(c, base(c));
    const twice = recordGame(once, { ...base(once), vpMe: 1, vpOpp: 1 });
    const back = revertLastGame(twice);
    expect(back.members).toEqual(once.members);
    expect(back.log).toEqual(once.log);
    expect(revertLastGame(back).members).toEqual(c.members);
    expect(revertLastGame(revertLastGame(back)).log).toEqual([]);
  });

  it('takes back only what the game did: later hand edits stay, removed members are skipped', () => {
    const c = company();
    const d = recordGame(c, base(c));
    const aldric = byName(d, 'Aldric').id;
    const archer = byName(d, 'Archer 1').id;
    const edited = removeMember(adjustXp(d, aldric, 5), archer); // Aldric was edited since; the archer left
    const back = revertLastGame(edited);
    expect(byName(back, 'Aldric').xp).toBe(7); // not rewound: it no longer matches what the game left
    expect(byName(back, 'Spear 1')).toMatchObject({ status: 'active', xp: 0, games: 0 }); // untouched since, so rewound
    expect(back.members.some((m) => m.id === archer)).toBe(false);
    expect(back.log).toHaveLength(0);
  });
});

describe('turning the company into a list', () => {
  it('makes a legal list with the heroes leading and the warriors in their warbands', () => {
    const c = company();
    const { list, unplaced, notes } = companyToList(idx, c);
    expect(unplaced).toEqual([]);
    expect(notes).toEqual([]);
    expect(list).toMatchObject({ name: 'Vale Watch company', army: 'vale-realm', campaign: c.id, pack: 'sample' });
    expect(list.warbands).toHaveLength(2);
    expect(list.warbands.map((w) => w.leader!.unit)).toEqual(['aldric-the-bold', 'sera-windfletcher']);
    expect(list.limit).toBe(companyCost(idx, c));
    const v = validateList(idx, list);
    expect(v.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(v.summary.points).toBe(companyCost(idx, c));
  });

  it('fills the first hero\'s warband first and groups identical models, remembering who is who', () => {
    const c = company();
    const { list } = companyToList(idx, c);
    const first = list.warbands[0]!;
    // Aldric leads all eight warriors (his warband takes 15): shielded spearman, four plain spearmen, two archers, the knight.
    expect(first.members.map((e) => [e.unit, e.options.join(), e.count])).toEqual([
      ['vale-spearman', 'shield', 1], ['vale-spearman', '', 4], ['vale-archer', '', 2], ['vale-knight', '', 1],
    ]);
    expect(first.leader!.members).toEqual([byName(c, 'Aldric').id]);
    expect(first.members[1]!.members).toEqual(['Spear 2', 'Spear 3', 'Spear 4', 'Spear 5'].map((n) => byName(c, n).id));
    expect(list.warbands[1]!.members).toEqual([]);
  });

  it('respects each hero\'s warband size and who they may lead', () => {
    let c = newCampaign(idx, 'x', 'vale-realm');
    c = addMember(idx, c, 'old-marren', 'Marren'); // leads at most 6, spearmen and archers only
    for (let i = 0; i < 8; i++) c = addMember(idx, c, 'vale-spearman', `S${i}`);
    c = addMember(idx, c, 'vale-knight', 'Rider');
    const { list, unplaced, notes } = companyToList(idx, c);
    expect(list.warbands[0]!.members.reduce((n, e) => n + e.count, 0)).toBe(6);
    expect(unplaced.map((m) => m.name).sort()).toEqual(['Rider', 'S6', 'S7']);
    expect(notes[0]).toMatch(/3 models could not be placed/);
    expect(validateList(idx, list).issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('keeps a hero to the warriors they may lead, even when there is room', () => {
    let c = newCampaign(idx, 'x', 'vale-realm');
    c = addMember(idx, c, 'old-marren', 'Marren'); // spearmen and archers only, room for 6
    c = addMember(idx, c, 'vale-spearman', 'Spear');
    c = addMember(idx, c, 'vale-knight', 'Rider'); // plenty of room, but Marren may not lead cavalry
    const r = companyToList(idx, c);
    expect(r.list.warbands[0]!.members.map((e) => e.unit)).toEqual(['vale-spearman']);
    expect(r.unplaced.map((m) => m.name)).toEqual(['Rider']);
    // With a second hero who can lead anyone, the knight finds a place.
    const withAldric = companyToList(idx, addMember(idx, c, 'aldric-the-bold', 'Aldric'));
    expect(withAldric.unplaced).toEqual([]);
    expect(withAldric.list.warbands.find((w) => w.leader!.unit === 'aldric-the-bold')!.members.map((e) => e.unit)).toEqual(['vale-knight']);
  });

  it('leaves out the dead, and the injured unless asked', () => {
    let c = company();
    c = setMemberStatus(setMemberStatus(c, byName(c, 'Archer 1').id, 'dead'), byName(c, 'Sera Windfletcher').id, 'injured');
    const count = (l: ReturnType<typeof companyToList>['list']) => l.warbands.reduce((n, w) => n + (w.leader ? 1 : 0) + w.members.reduce((m, e) => m + e.count, 0), 0);
    expect(count(companyToList(idx, c).list)).toBe(10 - 2); // Archer 1 dead, Sera injured
    expect(count(companyToList(idx, c, { includeInjured: true }).list)).toBe(10 - 1);
    expect(companyToList(idx, c).list.warbands).toHaveLength(1);
    expect(companyToList(idx, c, { includeInjured: true }).list.warbands).toHaveLength(2);
  });

  it('says so when there is no hero to lead', () => {
    let c = newCampaign(idx, 'x', 'vale-realm');
    c = addMember(idx, c, 'vale-spearman');
    const r = companyToList(idx, c);
    expect(r.list.warbands).toEqual([]);
    expect(r.unplaced).toHaveLength(1);
    expect(r.notes[0]).toMatch(/No hero is fit to lead/);
    expect(companyToList(idx, newCampaign(idx, 'empty', 'vale-realm')).notes).toEqual([]);
  });

  it('uses the campaign\'s points limit for the list when it has one', () => {
    expect(companyToList(idx, setPointsLimit(company(), 400)).list.limit).toBe(400);
  });

  it('carries each roster member through into a game, so results can be matched back', () => {
    const c = company();
    const { list } = companyToList(idx, c);
    const game = startGame(idx, list);
    expect(game.campaign).toBe(c.id);
    const ids = new Set(c.members.map((m) => m.id));
    expect(game.start.models).toHaveLength(10);
    expect(game.start.models.every((m) => m.member && ids.has(m.member))).toBe(true);
    expect(new Set(game.start.models.map((m) => m.member)).size).toBe(10); // each member once
    const spear1 = game.start.models.find((m) => m.member === byName(c, 'Spear 1').id)!;
    expect(spear1.label).toBe('Vale Spearman 1');
    expect(spear1.detail).toEqual(['Shield']);
    // And a casualty in the game can be traced to its roster member.
    const played = dispatch(game, { t: 'wound', model: spear1.id, n: 1 });
    expect(played.events).toHaveLength(1);
  });

  it('a list that was not made from a company has no campaign link', () => {
    expect(startGame(idx, companyToList(idx, company()).list).campaign).toBeDefined();
    const plain = { ...companyToList(idx, company()).list };
    delete (plain as { campaign?: string }).campaign;
    expect('campaign' in startGame(idx, plain)).toBe(false);
  });
});
