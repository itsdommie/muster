import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

const list = (page: import('@playwright/test').Page) => page.locator('.list-panel');
const summary = (page: import('@playwright/test').Page) => page.locator('.summary');

test('builds a legal list and shows live points', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Realm of the Vale', level: 2 })).toBeVisible();
  await expect(summary(page)).toContainText('Add a warband to start building.');

  await list(page).getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  await page.getByRole('button', { name: 'Add Vale Spearman' }).click();
  await page.getByRole('button', { name: 'Add Vale Spearman' }).click();

  await expect(summary(page).locator('.points')).toContainText('106 / 500');
  await expect(summary(page).getByRole('status')).toHaveText('Legal list');

  await list(page).getByRole('button', { name: 'Shield', exact: false }).first().click();
  await expect(summary(page).locator('.points')).toContainText('108 / 500');
});

test('flags problems: no leader, over the limit', async ({ page }) => {
  await list(page).getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Vale Spearman' }).click();
  await expect(list(page)).toContainText('has no hero to lead it');
  await expect(summary(page).getByRole('status')).toContainText('1 problem');

  await list(page).getByLabel('Points').fill('0');
  await expect(summary(page)).toContainText('over the 0 limit');
});

test('allied warband uses the ally army and respects restrictions', async ({ page }) => {
  await list(page).getByLabel('Add allied warband').selectOption({ label: 'The Free Marches' });
  await expect(page.getByRole('heading', { name: 'The Free Marches', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: 'Add Warden Hale' }).click();
  await expect(summary(page)).toContainText('Allied points');
  await expect(list(page).locator('.badge.ally')).toHaveText('The Free Marches');
});

test('lists persist across reloads and can be renamed, duplicated and deleted', async ({ page }) => {
  await list(page).getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Sera Windfletcher' }).click();
  await list(page).getByLabel('List name').fill('Border Patrol');
  await page.reload();
  await expect(list(page).getByLabel('List name')).toHaveValue('Border Patrol');
  await expect(summary(page).locator('.points')).toContainText('60 / 500');

  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(list(page).getByLabel('List name')).toHaveValue('Border Patrol (copy)');
  await expect(page.getByLabel('Saved lists').locator('option')).toHaveCount(2);

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByLabel('Saved lists').locator('option')).toHaveCount(1);
});

test('exports text and imports a hand-typed list', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await list(page).getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  await summary(page).getByRole('button', { name: 'Copy as text' }).click();
  await expect(summary(page).getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Aldric the Bold [90]');

  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByLabel('List text').fill('Army: The Hollow Horde\nPoints: 300\n\nGrub Chief (Javelins)\n4x Marsh Raider (Shield)\nDragon');
  await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
  await expect(summary(page).locator('.points')).toContainText('75 / 300');
  await expect(page.getByRole('heading', { name: 'The Hollow Horde', level: 2 })).toBeVisible();
});

test('rejects a broken data pack with readable errors, accepts a valid one', async ({ page }) => {
  await page.getByRole('button', { name: /Sample Pack/ }).click();
  const bad = { schema: 1, id: 'x', name: 'Bad', version: '1', ruleset: { warbandSize: 1, break: 0.5, bowLimit: 0.3 }, units: [], armies: [{ id: 'a', name: 'A', side: 's', units: [{ unit: 'ghost' }] }] };
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.getByRole('dialog')).toContainText('lists unknown unit "ghost"');

  const good = {
    schema: 1, id: 'mini', name: 'Mini Pack', version: '2', ruleset: { warbandSize: 2, break: 0.5, bowLimit: 0.5 },
    units: [{ id: 'chief', name: 'Chief', kind: 'hero', cost: 10, stats: { move: 6, fight: 3, strength: 3, defence: 3, attacks: 1, wounds: 1, courage: 3 } }],
    armies: [{ id: 'tribe', name: 'The Tribe', side: 'x', units: [{ unit: 'chief' }] }],
  };
  await page.locator('input[type=file]').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(good)) });
  await expect(page.getByRole('button', { name: /Mini Pack/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Tribe', level: 2 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Mini Pack/ })).toBeVisible(); // persisted

  // Lists belong to the pack they were built with: going back restores the original one.
  await page.getByRole('button', { name: /Mini Pack/ }).click();
  await page.getByRole('button', { name: 'Back to sample pack' }).click();
  await expect(page.getByRole('button', { name: /Sample Pack/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Realm of the Vale', level: 2 })).toBeVisible();
});

test('unit profile opens from the library', async ({ page }) => {
  await page.locator('.library').getByRole('button', { name: /Aldric the Bold/ }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Aldric the Bold');
  await expect(page.getByRole('dialog').locator('table.stats')).toBeVisible();
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('uses tabs and has no horizontal scroll', async ({ page }) => {
    await expect(page.locator('.list-panel')).toBeVisible();
    await expect(page.locator('.library')).toBeHidden();
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('.library')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
