import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/builder');
  await page.reload();
});

const nav = (page: Page) => page.getByRole('navigation', { name: 'Views' });
const sub = (page: Page) => page.getByRole('navigation', { name: 'More sections' });
const more = async (page: Page, section: 'Collection' | 'Scenarios' | 'Tournament') => {
  await nav(page).getByRole('button', { name: 'More' }).click();
  await sub(page).getByRole('button', { name: section }).click();
};
const up = (page: Page, unit: string, stage: string) => page.getByRole('button', { name: `${unit} ${stage} up`, exact: true });
const card = (page: Page, unit: string) => page.locator('.unit-card', { has: page.getByText(unit, { exact: true }) });

/** Aldric + 4 spearmen in the builder. */
async function buildList(page: Page) {
  await page.getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Add Vale Spearman' }).click();
  await page.getByLabel('List name').fill('Vanguard');
}

test.describe('collection', () => {
  test('counts models through the painting queue and keeps them across a reload', async ({ page }) => {
    await more(page, 'Collection');
    const summary = page.getByRole('region', { name: 'Collection summary' });
    await expect(summary).toContainText('0 models owned');

    for (let i = 0; i < 4; i++) await up(page, 'Vale Spearman', 'in the box').click();
    await expect(summary).toContainText('4 models owned');
    await page.getByRole('button', { name: 'Move one Vale Spearman to built' }).click();
    await page.getByRole('button', { name: 'Move one Vale Spearman to built' }).click();
    await page.getByRole('button', { name: 'Move one Vale Spearman to primed' }).click();
    await expect(summary.getByRole('img')).toHaveAttribute('aria-label', '2 in the box, 1 built, 1 primed, 0 painted');
    await page.getByRole('button', { name: 'Move one Vale Spearman to painted' }).click();
    await expect(summary.getByRole('img')).toHaveAttribute('aria-label', '2 in the box, 1 built, 0 primed, 1 painted');

    await up(page, 'Vale Spearman', 'painted').click();
    await expect(summary).toContainText('5 models owned');
    await expect(summary).toContainText('40% painted'); // 2 of 5

    await page.reload();
    await expect(page.getByRole('region', { name: 'Collection summary' })).toContainText('5 models owned');
    await expect(page).toHaveURL(/#\/more\/collection$/);
  });

  test('counters stop at zero', async ({ page }) => {
    await more(page, 'Collection');
    await expect(page.getByRole('button', { name: 'Vale Archer built down' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Move one Vale Archer to built' })).toBeDisabled();
  });

  test('says whether a list can be fielded, what to buy and what to paint', async ({ page }) => {
    await buildList(page);
    await more(page, 'Collection');
    const check = page.getByRole('region', { name: 'List check' });
    await expect(check.getByRole('status')).toHaveText('Not yet: 5 models to buy.');

    for (let i = 0; i < 4; i++) await up(page, 'Vale Spearman', 'built').click();
    await expect(check.getByRole('status')).toHaveText('Not yet: 1 model to buy, 4 to paint.');
    await expect(check.getByRole('row', { name: /Aldric the Bold/ })).toContainText('1');

    await up(page, 'Aldric the Bold', 'painted').click();
    await expect(check.getByRole('status')).toHaveText('You can field this list. 4 models still to paint.');

    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Vale Spearman built down' }).click();
    for (let i = 0; i < 4; i++) await up(page, 'Vale Spearman', 'painted').click();
    await expect(check.getByRole('status')).toHaveText('Table-ready: you own every model and all are painted.');
    await expect(check.getByRole('button', { name: 'Copy shopping list' })).toHaveCount(0);
  });

  test('offers a shopping list for what is missing', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await buildList(page);
    await more(page, 'Collection');
    await up(page, 'Vale Spearman', 'in the box').click();
    await page.getByRole('button', { name: 'Copy shopping list' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('To buy:\n  1 x Aldric the Bold\n  3 x Vale Spearman');
    expect(text).toContain('To paint:\n  1 x Vale Spearman'); // the one boxed model they do own
  });

  test('wishlist models become owned when bought; the filters narrow the list', async ({ page }) => {
    await more(page, 'Collection');
    await up(page, 'Vale Archer', 'wishlist').click();
    await up(page, 'Vale Archer', 'wishlist').click();
    await expect(page.getByRole('region', { name: 'Collection summary' })).toContainText('2 on the wishlist');
    await page.getByRole('button', { name: 'Bought one Vale Archer' }).click();
    await expect(page.getByRole('region', { name: 'Collection summary' })).toContainText('1 models owned');

    await page.getByRole('button', { name: 'Wishlist', exact: true }).click();
    await expect(page.locator('.unit-card')).toHaveCount(1);
    await expect(card(page, 'Vale Archer')).toBeVisible();
    await page.getByRole('button', { name: 'To paint', exact: true }).click();
    await expect(page.locator('.unit-card')).toHaveCount(1); // the one boxed archer
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.locator('.collection').getByLabel('Army').selectOption({ label: 'The Free Marches' });
    await expect(page.locator('.unit-card')).toHaveCount(2);
    await page.getByLabel('Search your models').fill('scout');
    await expect(page.locator('.unit-card')).toHaveCount(1);
  });

  test('each pack has its own collection', async ({ page }) => {
    await more(page, 'Collection');
    await up(page, 'Vale Archer', 'built').click();
    const pack = {
      schema: 1, id: 'other', name: 'Other Pack', version: '1', ruleset: { warbandSize: 2, break: 0.5, bowLimit: 0.5 },
      units: [{ id: 'chief', name: 'Chief', kind: 'hero', cost: 10, stats: { move: 6, fight: 3, strength: 3, defence: 3, attacks: 1, wounds: 1, courage: 3 } }],
      armies: [{ id: 'tribe', name: 'The Tribe', side: 'x', units: [{ unit: 'chief' }] }],
    };
    await page.getByRole('button', { name: /Sample Pack/ }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
    await expect(page.getByRole('region', { name: 'Collection summary' })).toContainText('0 models owned');
    await page.getByRole('button', { name: /Other Pack/ }).click();
    await page.getByRole('button', { name: 'Back to sample pack' }).click();
    await expect(page.getByRole('region', { name: 'Collection summary' })).toContainText('1 models owned');
  });
});

test.describe('scenarios', () => {
  test('lists, searches and filters the pack\'s scenarios', async ({ page }) => {
    await more(page, 'Scenarios');
    const status = page.locator('.scenario-list [role=status]');
    await expect(status).toHaveText('4 of 4 scenarios');
    await page.getByLabel('Search scenarios').fill('beacon');
    await expect(status).toHaveText('1 of 4 scenarios');
    await page.getByLabel('Search scenarios').fill('');
    await page.getByRole('button', { name: 'objective', exact: true }).click();
    await expect(status).toHaveText('2 of 4 scenarios');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByLabel('Search scenarios').fill('zzz');
    await expect(page.getByText('No scenarios match.')).toBeVisible();
  });

  test('shows a scenario in full', async ({ page }) => {
    await more(page, 'Scenarios');
    await page.getByRole('button', { name: /Hold the Ford/ }).click();
    const detail = page.getByRole('article', { name: 'Hold the Ford' });
    await expect(detail).toContainText('300–600 pts');
    await expect(detail.getByRole('heading', { name: 'Set-up' })).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'Objectives' })).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'Winning' })).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'Special rules' })).toBeVisible();
    await expect(detail).toContainText('difficult terrain');
  });

  test('picks one at random', async ({ page }) => {
    await more(page, 'Scenarios');
    await expect(page.getByText('Choose a scenario to read it')).toBeVisible();
    await page.getByRole('button', { name: 'Pick one at random' }).click();
    await expect(page.locator('.scenario-detail')).toBeVisible();
  });

  test('"Play this scenario" starts a game with it, shows it in the tracker and keeps it in the history', async ({ page }) => {
    await buildList(page);
    await more(page, 'Scenarios');
    await page.getByRole('button', { name: /Seize the Beacon/ }).click();
    await page.getByRole('button', { name: 'Play this scenario' }).click();
    await expect(page).toHaveURL(/#\/game$/);
    await expect(page.getByLabel('Scenario', { exact: true })).toHaveValue('seize-the-beacon');
    await page.getByRole('button', { name: 'Start game' }).click();

    const note = page.getByRole('group', { name: 'Scenario' }).or(page.locator('.scenario-note'));
    await expect(note).toContainText('Seize the Beacon');
    await note.locator('summary').click();
    await expect(note).toContainText('more models within 3" of the beacon');

    await page.reload();
    await expect(page.locator('.scenario-note')).toContainText('Seize the Beacon'); // saved with the game
    await page.getByRole('button', { name: 'End game' }).click();
    await page.getByRole('button', { name: 'Finish and save' }).click();
    await expect(page.locator('.past')).toContainText('Seize the Beacon');
  });

  test('a game can start with no scenario', async ({ page }) => {
    await buildList(page);
    await nav(page).getByRole('button', { name: 'Game' }).click();
    await expect(page.getByLabel('Scenario', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Start game' }).click();
    await expect(page.locator('.scenario-note')).toHaveCount(0);
  });
});

test.describe('tournament', () => {
  async function create(page: Page, players: string[], name = 'Friday night') {
    await more(page, 'Tournament');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Players, one per line').fill(players.join('\n'));
    await page.getByRole('button', { name: 'Create tournament' }).click();
  }
  const result = (page: Page, roundN: number, player: string) => page.getByLabel(`${player} victory points, round ${roundN}`);

  test('suggests a round count and flags an odd field before creating', async ({ page }) => {
    await more(page, 'Tournament');
    await page.getByLabel('Players, one per line').fill('Ann\nBob\nCat\nDan\nEve');
    await expect(page.getByRole('status')).toContainText('5 players · 3 rounds recommended · odd number');
    await expect(page.getByRole('button', { name: 'Create tournament' })).toBeEnabled();
    await page.getByLabel('Players, one per line').fill('Ann');
    await expect(page.getByRole('button', { name: 'Create tournament' })).toBeDisabled();
  });

  test('plays a two-round event for four players end to end', async ({ page }) => {
    await create(page, ['Ann', 'Bob', 'Cat', 'Dan']);
    await expect(page.getByRole('region', { name: 'Progress' })).toContainText('0 of 2 rounds played');

    await page.getByRole('button', { name: 'Start round 1' }).click();
    const round1 = page.getByRole('group', { name: 'Round 1' }).or(page.locator('details[aria-label="Round 1"]'));
    await expect(round1.locator('.pairing')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Start round 2' })).toHaveCount(0); // round 1 is not finished

    // Enter a result for every game: whoever is listed first wins 5-2.
    const games = await round1.locator('.pairing').all();
    for (const g of games) {
      const [a, b] = await g.locator('input').all();
      await a!.fill('5');
      await b!.fill('2');
    }
    await expect(round1.locator('.result').first()).toContainText('wins');
    await expect(page.getByRole('region', { name: 'Progress' })).toContainText('1 of 2 rounds played');

    await page.getByRole('button', { name: 'Start round 2' }).click();
    const round2 = page.locator('details[aria-label="Round 2"]');
    await expect(round2.locator('.pairing')).toHaveCount(2);
    for (const g of await round2.locator('.pairing').all()) {
      const [a, b] = await g.locator('input').all();
      await a!.fill('4');
      await b!.fill('4'); // draws
    }
    await expect(page.getByRole('region', { name: 'Progress' })).toContainText('2 of 2 rounds played');
    await page.getByRole('button', { name: 'Finish tournament' }).click();
    await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Finished');

    const standings = page.getByRole('region', { name: 'Standings', exact: true });
    await expect(standings.locator('tbody tr')).toHaveCount(4);
    // Two players won round 1 (3 pts) and drew round 2 (1 pt): 4 points each; the other two have 1 point.
    const pts = await standings.locator('tbody tr td:nth-child(3)').allTextContents();
    expect(pts).toEqual(['4', '4', '1', '1']);
    await expect(standings.locator('tbody tr').first()).toContainText('1-1-0');
  });

  test('a score box keeps focus while typing a two-digit score, and a result can be taken back', async ({ page }) => {
    await create(page, ['Ann', 'Bob']);
    await page.getByRole('button', { name: 'Start round 1' }).click();
    const [first, second] = await page.locator('.pairing input').all();
    await first!.fill('1');
    await second!.pressSequentially('12');
    await expect(second).toHaveValue('12'); // not reset, and not dropped after the first digit
    await expect(page.locator('.pairing .result')).toContainText('wins');
    await first!.fill('');
    await expect(page.locator('.pairing .result')).toHaveText('');
    await expect(second).toHaveValue('12'); // clearing one box leaves the other alone
    await expect(page.getByRole('region', { name: 'Progress' })).toContainText('0 of 1 rounds played');
  });

  test('handles an odd field with a bye, and keeps going after a reload', async ({ page }) => {
    await create(page, ['Ann', 'Bob', 'Cat']);
    await page.getByRole('button', { name: 'Start round 1' }).click();
    await expect(page.locator('.pairing.bye')).toContainText('has a bye (counts as a win)');
    await expect(page.locator('.pairing:not(.bye)')).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Friday night');
    await expect(page.locator('.pairing.bye')).toBeVisible();
  });

  test('players can be dropped, added and removed, and a round can be undone', async ({ page }) => {
    await create(page, ['Ann', 'Bob', 'Cat', 'Dan'], 'Club');
    const players = page.getByRole('region', { name: 'Players' });
    await players.getByLabel('New player name').fill('Eve');
    await players.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(players.locator('li')).toHaveCount(5);
    await players.getByRole('button', { name: 'Remove Eve' }).click();
    await expect(players.locator('li')).toHaveCount(4);

    await page.getByRole('button', { name: 'Start round 1' }).click();
    await expect(players.getByRole('button', { name: /^Remove / })).toHaveCount(0); // they have played now: drop instead
    await players.locator('li', { hasText: 'Dan' }).getByRole('button', { name: 'Drop' }).click();
    await expect(page.getByRole('region', { name: 'Standings', exact: true })).toContainText('dropped');

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Undo round 1' }).click();
    await expect(page.locator('details[aria-label="Round 1"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start round 1' }).click();
    await expect(page.locator('.pairing')).toHaveCount(2); // Dan is out, so three players: one game and a bye
    await expect(page.locator('.pairing.bye')).toHaveCount(1);
  });

  test('copies the standings, and a tournament can be deleted', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await create(page, ['Ann', 'Bob']);
    await page.getByRole('button', { name: 'Copy standings' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Friday night');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: 'New tournament' })).toBeVisible();
  });

  test('the More tab remembers its section', async ({ page }) => {
    await more(page, 'Tournament');
    await nav(page).getByRole('button', { name: 'Units' }).click();
    await nav(page).getByRole('button', { name: 'More' }).click();
    await expect(page).toHaveURL(/#\/more\/tournament$/);
  });
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('collection, scenarios and tournament fit the screen', async ({ page }) => {
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    await more(page, 'Collection');
    expect(await sideways()).toBe(false);
    await more(page, 'Scenarios');
    await page.getByRole('button', { name: /Hold the Ford/ }).click();
    expect(await sideways()).toBe(false);
    await more(page, 'Tournament');
    await page.getByLabel('Players, one per line').fill('Ann\nBob\nCat\nDan');
    expect(await sideways()).toBe(false);
    await page.getByRole('button', { name: 'Create tournament' }).click();
    await page.getByRole('button', { name: 'Start round 1' }).click();
    expect(await sideways()).toBe(false);
    for (const b of await nav(page).getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  });
});
