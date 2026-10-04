import { expect, test, type Page } from '@playwright/test';

/** Builds: Aldric + 4 spearmen + 1 archer = 6 models in one warband (break point 3). */
async function buildList(page: Page) {
  await page.goto('/#/builder');
  await page.getByRole('button', { name: '+ Warband' }).click();
  const addTab = page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Add' });
  if (await addTab.isVisible()) await addTab.click(); // phone layout: the unit library is its own tab
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Add Vale Spearman' }).click();
  await page.getByRole('button', { name: 'Add Vale Archer' }).click();
  const listTab = page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'List' });
  if (await listTab.isVisible()) await listTab.click();
  await page.getByLabel('List name').fill('Test patrol');
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Views' });
const force = (page: Page) => page.getByRole('region', { name: 'Your force' });
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Game controls' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function startGame(page: Page) {
  await buildList(page);
  await nav(page).getByRole('button', { name: 'Game' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(bar(page)).toBeVisible();
}

test('needs a list with models before a game can start', async ({ page }) => {
  await nav(page).getByRole('button', { name: 'Game' }).click();
  await expect(page.getByText('Build a list first')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start game' })).toHaveCount(0);
});

test('tracks casualties against the break point, with undo and redo', async ({ page }) => {
  await startGame(page);
  await expect(force(page).getByRole('status')).toHaveText('3 more losses until broken');
  await expect(force(page)).toContainText('6 / 6');

  await page.getByRole('button', { name: 'Casualty: Vale Spearman 1' }).click();
  await page.getByRole('button', { name: 'Casualty: Vale Spearman 2' }).click();
  await expect(force(page).getByRole('status')).toHaveText('1 more loss until broken');
  await expect(page.getByText('Vale Spearman 1', { exact: true })).toHaveCount(0); // casualties are tucked away

  await page.getByRole('button', { name: 'Casualty: Vale Spearman 3' }).click();
  await expect(force(page).getByRole('status')).toHaveText('Your force is BROKEN');
  await expect(force(page)).toHaveClass(/broken/);

  await bar(page).getByRole('button', { name: 'Undo' }).click();
  await expect(force(page).getByRole('status')).toHaveText('1 more loss until broken');
  await bar(page).getByRole('button', { name: 'Redo' }).click();
  await expect(force(page).getByRole('status')).toHaveText('Your force is BROKEN');
  await expect(bar(page).getByRole('button', { name: 'Redo' })).toBeDisabled();

  // A casualty can be brought back from the casualty list.
  await page.getByLabel('Show casualties').check();
  await page.getByRole('button', { name: 'Restore Vale Spearman 1' }).click();
  await expect(force(page).getByRole('status')).toHaveText('1 more loss until broken');
});

test('tracks hero wounds and Might, Will and Fate', async ({ page }) => {
  await startGame(page);
  const aldric = page.locator('.model', { hasText: 'Aldric the Bold' });
  await expect(aldric.getByRole('img', { name: '3 of 3 wounds' })).toBeVisible();

  await aldric.getByRole('button', { name: 'Wound Aldric the Bold' }).click();
  await expect(aldric.getByRole('img', { name: '2 of 3 wounds' })).toBeVisible();
  await expect(force(page).getByRole('status')).toHaveText('3 more losses until broken'); // wounded, not lost

  await aldric.getByRole('button', { name: 'Spend Might' }).click();
  await aldric.getByRole('button', { name: 'Spend Might' }).click();
  await expect(aldric.getByRole('group', { name: 'Aldric the Bold Might' })).toContainText('1/3');
  await aldric.getByRole('button', { name: 'Regain Might' }).click();
  await expect(aldric.getByRole('group', { name: 'Aldric the Bold Might' })).toContainText('2/3');

  await aldric.getByRole('button', { name: 'Heal Aldric the Bold' }).click();
  await expect(aldric.getByRole('img', { name: '3 of 3 wounds' })).toBeVisible();
  await expect(aldric.getByRole('button', { name: 'Heal Aldric the Bold' })).toBeDisabled();

  await aldric.getByRole('button', { name: 'Casualty: Aldric the Bold' }).click();
  await expect(force(page)).toContainText('Heroes0 / 1');
});

test('tracks turn, priority and victory points and logs them', async ({ page }) => {
  await startGame(page);
  await bar(page).getByRole('button', { name: 'Next turn' }).click();
  await bar(page).getByRole('button', { name: 'Next turn' }).click();
  await expect(bar(page).getByRole('group', { name: 'Turn' })).toContainText('3');

  await bar(page).getByRole('button', { name: 'Them', exact: true }).click();
  await expect(bar(page).getByRole('button', { name: 'Them', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await bar(page).getByRole('button', { name: 'Your victory points up' }).click();
  await bar(page).getByRole('button', { name: 'Your victory points up' }).click();
  await bar(page).getByRole('button', { name: 'Opponent victory points down' }).click(); // floors at 0
  await expect(bar(page).getByRole('group', { name: 'Your victory points' })).toContainText('2');
  await expect(bar(page).getByRole('group', { name: 'Opponent victory points' })).toContainText('0');

  await page.getByText(/Game log/).click();
  const log = page.locator('.log');
  await expect(log).toContainText('Turn 3 begins.');
  await expect(log).toContainText('Your opponent has priority.');
  await expect(log).toContainText('You score 1 VP (2).');
});

test('tracks the opponent force and its break point', async ({ page }) => {
  await startGame(page);
  const opp = page.getByRole('region', { name: 'Opponent force' });
  await expect(opp.getByRole('status')).toContainText('Set their starting models');
  for (let i = 0; i < 8; i++) await opp.getByRole('button', { name: 'Opponent starting models up' }).click();
  await expect(opp.getByRole('status')).toHaveText('Breaks at 4 lost (4 to go)');
  for (let i = 0; i < 4; i++) await opp.getByRole('button', { name: 'Opponent models lost up' }).click();
  await expect(opp.getByRole('status')).toHaveText('Their force is BROKEN');
});

test('survives a reload, including undo history, and finishes into the past games list', async ({ page }) => {
  await startGame(page);
  await page.getByRole('button', { name: 'Casualty: Vale Spearman 1' }).click();
  await bar(page).getByRole('button', { name: 'Your victory points up' }).click();
  await page.getByLabel('Notes').fill('Hold the ford');
  await expect(nav(page).getByRole('img', { name: 'game in progress' })).toBeVisible();

  await page.reload();
  await expect(bar(page)).toBeVisible();
  await expect(force(page).getByRole('status')).toHaveText('2 more losses until broken');
  await expect(page.getByLabel('Notes')).toHaveValue('Hold the ford');
  await expect(bar(page).getByRole('button', { name: 'Undo' })).toBeEnabled();
  await bar(page).getByRole('button', { name: 'Undo' }).click(); // undoes the VP, from before the reload
  await expect(bar(page).getByRole('group', { name: 'Your victory points' })).toContainText('0');
  await bar(page).getByRole('button', { name: 'Redo' }).click();

  await bar(page).getByRole('button', { name: 'End game' }).click();
  await expect(page.getByRole('dialog')).toContainText('Final score: 1 – 0 victory points');
  await page.getByRole('button', { name: 'Finish and save' }).click();

  await expect(page.getByRole('heading', { name: 'Start a game' })).toBeVisible();
  const past = page.locator('.past');
  await expect(past).toContainText('Test patrol');
  await expect(past).toContainText('1–0 VP · Won');
  await expect(nav(page).getByRole('img', { name: 'game in progress' })).toHaveCount(0);

  page.once('dialog', (d) => d.accept());
  await past.getByRole('button', { name: /Delete Test patrol/ }).click();
  await expect(page.locator('.past')).toHaveCount(0);
});

test('discarding a game removes it without a record', async ({ page }) => {
  await startGame(page);
  await bar(page).getByRole('button', { name: 'End game' }).click();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('heading', { name: 'Start a game' })).toBeVisible();
  await expect(page.locator('.past')).toHaveCount(0);
});

test('a model name opens its profile', async ({ page }) => {
  await startGame(page);
  await page.locator('.model').getByRole('button', { name: 'Vale Archer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Vale Archer' })).toBeVisible();
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('fits without sideways scrolling and keeps controls within reach', async ({ page }) => {
    await startGame(page);
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(await sideways()).toBe(false);
    for (const b of await bar(page).getByRole('button').all()) {
      const box = (await b.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(40); // a thumb-sized target
    }
    const wound = page.getByRole('button', { name: 'Wound Aldric the Bold' });
    await wound.click();
    expect((await wound.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    expect(await sideways()).toBe(false);
  });
});
