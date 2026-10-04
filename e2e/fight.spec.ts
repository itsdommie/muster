import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/fight');
  await page.reload();
});

const result = (page: Page) => page.getByRole('region', { name: 'Result' });
const sideA = (page: Page) => page.getByRole('region', { name: 'Side A' });
const sideB = (page: Page) => page.getByRole('region', { name: 'Side B' });

/** Two identical one-wound models (Fight 3, Strength 3, Defence 4): each round either side kills with 1/6, so a fight lasts 3 rounds. */
async function evenMatch(page: Page) {
  await sideA(page).getByLabel('Side A model 1', { exact: true }).selectOption({ label: 'Vale Spearman' });
  await sideB(page).getByLabel('Side B model 1', { exact: true }).selectOption({ label: 'Marsh Raider' });
}

test('copies a unit\'s profile into the editor and solves an even fight exactly', async ({ page }) => {
  await evenMatch(page);
  await expect(sideA(page).getByLabel('Side A model 1 Fight')).toHaveValue('3');
  await expect(sideA(page).getByLabel('Side A model 1 Defence')).toHaveValue('4');

  const bar = result(page).getByRole('img', { name: /wins/ });
  await expect(bar).toHaveAttribute('aria-label', 'Vale Spearman wins 50.0%, Marsh Raider wins 50.0%');
  await expect(result(page).getByRole('status')).toContainText('about 3.0 rounds');

  const first = result(page).locator('.first-round');
  await expect(first.getByRole('row', { name: /Wins the duel/ })).toContainText('50.0%');
  await expect(first.getByRole('row', { name: /Each strike wounds/ })).toContainText('33.3%'); // Strength 3 against Defence 4 needs a 5+
  await expect(first.getByRole('row', { name: /Defeats the other/ })).toContainText('16.7%');
});

test('a second wound makes the fight 75/25, and edits are reflected live', async ({ page }) => {
  await evenMatch(page);
  await sideA(page).getByLabel('Side A model 1 Wounds').fill('2');
  await expect(result(page).getByRole('img', { name: /wins/ })).toHaveAttribute('aria-label', 'Vale Spearman wins 75.0%, Marsh Raider wins 25.0%');
  await expect(result(page).getByText('wounds left if it wins').first()).toBeVisible();

  // Extra Fight changes who wins the duel.
  await sideA(page).getByLabel('Side A model 1 Fight').fill('5');
  const label = await result(page).getByRole('img', { name: /wins/ }).getAttribute('aria-label');
  expect(Number(/Vale Spearman wins ([\d.]+)%/.exec(label!)![1])).toBeGreaterThan(75);
});

test('supporters add strikes; Might spent raises the duel odds', async ({ page }) => {
  await evenMatch(page);
  const first = result(page).locator('.first-round');
  await expect(first.getByRole('row', { name: /Strikes if it wins/ })).toContainText('1');
  await sideA(page).getByLabel('Side A supporting models').fill('2');
  await expect(first.getByRole('row', { name: /Strikes if it wins/ })).toContainText('3'); // 1 attack + 2 supporters
  await sideA(page).getByLabel('Side A supporting models').fill('0');

  await sideA(page).getByLabel('Side A model 1', { exact: true }).selectOption({ label: 'Aldric the Bold' }); // a hero with Might
  const before = await first.getByRole('row', { name: /Wins the duel/ }).textContent();
  await sideA(page).getByLabel('Side A Might per round').fill('1');
  await expect(first.getByRole('row', { name: /Wins the duel/ })).not.toHaveText(before!);
});

test('custom models can be entered by hand', async ({ page }) => {
  await sideA(page).getByLabel('Side A model 1', { exact: true }).selectOption({ label: 'Custom model' });
  await sideA(page).getByLabel('Side A model 1 Attacks').fill('3');
  await expect(result(page).getByRole('img', { name: /wins/ })).toHaveAttribute('aria-label', /Custom model wins/);
});

test('a pack with no combat rules says so instead of calculating', async ({ page }) => {
  const pack = {
    schema: 1, id: 'nocombat', name: 'No Combat Pack', version: '1', ruleset: { warbandSize: 2, break: 0.5, bowLimit: 0.5 },
    units: [{ id: 'chief', name: 'Chief', kind: 'hero', cost: 10, stats: { move: 6, fight: 3, strength: 3, defence: 3, attacks: 1, wounds: 1, courage: 3 } }],
    armies: [{ id: 'tribe', name: 'The Tribe', side: 'x', units: [{ unit: 'chief' }] }],
  };
  await page.getByRole('button', { name: /Sample Pack/ }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await expect(page.getByText('does not define combat rules')).toBeVisible();
});

test.describe('squad simulation', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole('tab', { name: /Squad vs squad/ }).click();
    await sideA(page).getByLabel('Side A model 1', { exact: true }).selectOption({ label: 'Vale Spearman' });
    await sideB(page).getByLabel('Side B model 1', { exact: true }).selectOption({ label: 'Marsh Raider' });
  });

  const winPercent = async (page: Page, side: 'Side A' | 'Side B') => {
    const label = await result(page).getByRole('img', { name: /wins/ }).getAttribute('aria-label');
    return Number(new RegExp(`${side} wins ([\\d.]+)%`).exec(label!)![1]);
  };

  test('runs the battles to completion and reports a sensible split', async ({ page }) => {
    await sideA(page).getByLabel('Side A model 1 count').fill('6');
    await sideB(page).getByLabel('Side B model 1 count').fill('6');
    await expect(result(page).getByRole('status')).toContainText('6,000 battles');
    const a = await winPercent(page, 'Side A');
    expect(a).toBeGreaterThan(40);
    expect(a).toBeLessThan(60);
    await expect(result(page).getByText('Side A models left (average)')).toBeVisible();
    await expect(result(page).getByRole('figure')).toHaveCount(2);
  });

  test('a big numerical edge wins almost always, and "Roll again" keeps the verdict', async ({ page }) => {
    await sideA(page).getByLabel('Side A model 1 count').fill('12');
    await sideB(page).getByLabel('Side B model 1 count').fill('4');
    await expect(result(page).getByRole('status')).toContainText('6,000 battles');
    expect(await winPercent(page, 'Side A')).toBeGreaterThan(95);
    await page.getByRole('button', { name: 'Roll again' }).click();
    await expect(result(page).getByRole('status')).toContainText('6,000 battles');
    expect(await winPercent(page, 'Side A')).toBeGreaterThan(95);
  });

  test('model types can be added and removed, and "stop when a side breaks" reports who broke', async ({ page }) => {
    await sideA(page).getByRole('button', { name: '+ Add model type' }).click();
    await expect(sideA(page).getByLabel('Side A model 2', { exact: true })).toBeVisible();
    await sideA(page).getByRole('button', { name: 'Remove Side A model 2' }).click();
    await expect(sideA(page).getByLabel('Side A model 2', { exact: true })).toHaveCount(0);
    await expect(sideA(page).getByRole('button', { name: /Remove Side A model 1/ })).toHaveCount(0); // never remove the last one

    await sideA(page).getByLabel('Side A model 1 count').fill('8');
    await sideB(page).getByLabel('Side B model 1 count').fill('8');
    await expect(result(page).getByRole('status')).toContainText('6,000 battles');
    await page.getByLabel('Stop when a side breaks').check();
    await expect(result(page).getByText('Side A broke')).toBeVisible();
    await expect(result(page).getByRole('status')).toContainText('6,000 battles');
  });

  test('asks for models when a side is empty', async ({ page }) => {
    await sideA(page).getByLabel('Side A model 1 count').fill('0');
    await expect(page.getByText('Give both sides at least one model.')).toBeVisible();
  });
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('stacks the sides and never scrolls sideways', async ({ page }) => {
    await evenMatch(page);
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(await sideways()).toBe(false);
    await page.getByRole('tab', { name: /Squad vs squad/ }).click();
    await expect(result(page).getByRole('status')).toContainText('6,000 battles');
    expect(await sideways()).toBe(false);
  });
});
