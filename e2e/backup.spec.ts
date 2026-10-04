import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/builder');
  await page.reload();
});

const nav = (page: Page) => page.getByRole('navigation', { name: 'Views' });
const more = (page: Page) => page.getByRole('navigation', { name: 'More sections' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Backup and restore' });
const openBackup = (page: Page) => page.getByRole('button', { name: /^Backup/ }).click();
const closeBackup = (page: Page) => dialog(page).getByRole('button', { name: 'Close' }).click();
const lists = (page: Page) => page.getByRole('combobox', { name: 'Saved lists' }).locator('option');

/** A list (Aldric 90 + a spearman 8 = 98 points), three painted archers, and a tournament with one result: one of each kind of data. */
async function makeData(page: Page, listName = 'Vanguard') {
  await page.getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  await page.getByRole('button', { name: 'Add Vale Spearman' }).click();
  await page.getByLabel('List name').fill(listName);
  await nav(page).getByRole('button', { name: 'More' }).click();
  await more(page).getByRole('button', { name: 'Collection' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Vale Archer painted up' }).click();
  await more(page).getByRole('button', { name: 'Tournament' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Club night');
  await page.getByLabel('Players, one per line').fill('Ann\nBob\nCat\nDan');
  await page.getByRole('button', { name: 'Create tournament' }).click();
  await page.getByRole('button', { name: 'Start round 1' }).click();
  const [a, b] = await page.locator('.pairing').first().locator('input').all();
  await a!.fill('6');
  await b!.fill('1');
}

/** Save a backup and return the file's text and where it landed. */
async function saveBackup(page: Page): Promise<{ text: string; path: string }> {
  await openBackup(page);
  const download = page.waitForEvent('download');
  await dialog(page).getByRole('button', { name: 'Save backup file' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^muster-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = join(tmpdir(), `muster-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await file.saveAs(path);
  return { text: readFileSync(path, 'utf8'), path };
}

const choose = (page: Page, path: string) => dialog(page).locator('input[type=file]').setInputFiles(path);
const writeTemp = (content: unknown) => {
  const path = join(tmpdir(), `muster-fake-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
  return path;
};
/** Pretend to be a different device: nothing stored. */
async function wipe(page: Page) {
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/builder');
  await page.reload();
}

test('saves one file holding everything, and notes when', async ({ page }) => {
  await makeData(page);
  await openBackup(page);
  await expect(dialog(page)).toContainText('1 list, 0 games, 1 tournament, 3 models in your collection');
  await expect(dialog(page)).toContainText('You have not saved a backup yet.');
  await closeBackup(page);

  const { text } = await saveBackup(page);
  const backup = JSON.parse(text);
  expect(backup).toMatchObject({ app: 'muster', format: 1 });
  expect(backup.data.lists.map((l: { name: string }) => l.name)).toEqual(['Vanguard']);
  expect(backup.data.tournaments[0].name).toBe('Club night');
  expect(backup.data.collections.sample['vale-archer'].painted).toBe(3);
  await expect(dialog(page).getByRole('status')).toContainText('Backup saved');
  await expect(dialog(page)).toContainText('Last backup:');
});

test('a reminder dot shows once there is data and no backup, and goes away after one', async ({ page }) => {
  await expect(page.getByRole('img', { name: 'backup due' })).toHaveCount(0); // nothing to lose yet
  await makeData(page);
  await expect(page.getByRole('img', { name: 'backup due' })).toBeVisible();
  await saveBackup(page);
  await closeBackup(page);
  await expect(page.getByRole('img', { name: 'backup due' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('img', { name: 'backup due' })).toHaveCount(0); // remembered
});

test('restoring on a wiped device brings everything back', async ({ page }) => {
  await makeData(page);
  const { path } = await saveBackup(page);
  await wipe(page);
  await expect(page.getByLabel('List name')).toHaveValue('New list');

  await openBackup(page);
  await choose(page, path);
  const preview = dialog(page).getByLabel('Backup contents');
  await expect(preview).toContainText('1 list, 0 games, 1 tournament, 3 models');
  await expect(preview.getByRole('radio', { name: /Add to what is here/ })).toBeChecked();
  await preview.getByRole('button', { name: 'Restore' }).click();
  await expect(dialog(page).getByRole('status')).toContainText('Restored. This device now has 2 lists');
  await closeBackup(page);

  await page.getByRole('combobox', { name: 'Saved lists' }).selectOption({ label: 'Vanguard' });
  await expect(page.locator('.summary .points')).toContainText('98 / 500');
  await nav(page).getByRole('button', { name: 'More' }).click();
  await more(page).getByRole('button', { name: 'Collection' }).click();
  await expect(page.getByRole('region', { name: 'Collection summary' })).toContainText('3 models owned');
  await more(page).getByRole('button', { name: 'Tournament' }).click();
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Club night');
  await expect(page.locator('.pairing .result').first()).toContainText('wins'); // the entered result came back too

  await page.reload(); // and it was saved, not just shown
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Club night');
});

test('"add to what is here" keeps the device\'s own data', async ({ page }) => {
  await makeData(page, 'From backup');
  const { path } = await saveBackup(page);
  await wipe(page);
  await page.getByLabel('List name').fill('Already here');
  await page.getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Sera Windfletcher' }).click();

  await openBackup(page);
  await choose(page, path);
  await dialog(page).getByRole('button', { name: 'Restore' }).click();
  await expect(dialog(page).getByRole('status')).toContainText('Restored.');
  await closeBackup(page);
  await expect(lists(page)).toHaveText(['Already here', 'From backup']);
});

test('"replace everything" asks first, then makes the device exactly the backup', async ({ page }) => {
  await makeData(page, 'From backup');
  const { path } = await saveBackup(page);
  await wipe(page);
  await page.getByLabel('List name').fill('Doomed');

  await openBackup(page);
  await choose(page, path);
  await dialog(page).getByRole('radio', { name: /Replace everything/ }).check();
  page.once('dialog', (d) => d.dismiss()); // say no
  await dialog(page).getByRole('button', { name: 'Replace everything' }).click();
  await expect(dialog(page).getByLabel('Backup contents')).toBeVisible(); // still waiting; nothing changed
  await closeBackup(page);
  await expect(lists(page)).toHaveText(['Doomed']);

  await openBackup(page);
  await choose(page, path);
  await dialog(page).getByRole('radio', { name: /Replace everything/ }).check();
  page.once('dialog', (d) => d.accept()); // now say yes
  await dialog(page).getByRole('button', { name: 'Replace everything' }).click();
  await expect(dialog(page).getByRole('status')).toContainText('Restored.');
  await closeBackup(page);
  await expect(lists(page)).toHaveText(['From backup']);
});

test('restoring brings back the data pack, and the collection that goes with it', async ({ page }) => {
  const pack = {
    schema: 1, id: 'mini', name: 'Mini Pack', version: '2', ruleset: { warbandSize: 2, break: 0.5, bowLimit: 0.5 },
    units: [{ id: 'chief', name: 'Chief', kind: 'hero', cost: 10, stats: { move: 6, fight: 3, strength: 3, defence: 3, attacks: 1, wounds: 1, courage: 3 } }],
    armies: [{ id: 'tribe', name: 'The Tribe', side: 'x', units: [{ unit: 'chief' }] }],
  };
  await page.getByRole('button', { name: /Sample Pack/ }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await nav(page).getByRole('button', { name: 'More' }).click();
  await more(page).getByRole('button', { name: 'Collection' }).click();
  await page.getByRole('button', { name: 'Chief built up' }).click();
  const { path } = await saveBackup(page);
  await closeBackup(page);

  await wipe(page);
  await expect(page.getByRole('button', { name: /Sample Pack/ })).toBeVisible();
  await openBackup(page);
  await choose(page, path);
  await dialog(page).getByRole('button', { name: 'Restore' }).click();
  await expect(dialog(page).getByRole('status')).toContainText('Now using the data pack "Mini Pack"');
  await closeBackup(page);
  await expect(page.getByRole('button', { name: /Mini Pack/ })).toBeVisible();
  await nav(page).getByRole('button', { name: 'More' }).click();
  await more(page).getByRole('button', { name: 'Collection' }).click();
  await expect(page.getByRole('region', { name: 'Collection summary' })).toContainText('1 models owned');
});

test('a game in progress comes back, and only one game stays active', async ({ page }) => {
  await page.getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  await page.getByRole('button', { name: 'Add Vale Spearman' }).click();
  await nav(page).getByRole('button', { name: 'Game' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.getByRole('button', { name: 'Casualty: Vale Spearman' }).click();
  await page.getByRole('button', { name: 'Your victory points up' }).click();
  await page.getByRole('button', { name: 'Your victory points up' }).click(); // 2 events: further along than the one started below
  const { path } = await saveBackup(page);
  await closeBackup(page);

  // Another device with its own game under way.
  await wipe(page);
  await page.getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Sera Windfletcher' }).click();
  await nav(page).getByRole('button', { name: 'Game' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.getByRole('button', { name: 'Next turn' }).click();

  await openBackup(page);
  await choose(page, path);
  await dialog(page).getByRole('button', { name: 'Restore' }).click();
  await expect(dialog(page).getByRole('status')).toContainText('Restored.');
  await closeBackup(page);
  // The backup's game was further along, so it is the active one; the other is in the history, not lost.
  await expect(page.getByRole('group', { name: 'Your victory points' })).toContainText('2');
  await expect(page.locator('.past li')).toHaveCount(1);
});

test('refuses files that are not backups, with a reason', async ({ page }) => {
  await openBackup(page);
  const error = dialog(page).getByRole('alert');
  await choose(page, writeTemp('this is not json'));
  await expect(error).toContainText('not valid JSON');
  await choose(page, writeTemp({ hello: 'world' }));
  await expect(error).toContainText('not a Muster backup file');
  await choose(page, writeTemp({ app: 'muster', format: 99, data: {} }));
  await expect(error).toContainText('newer version of Muster');
  await expect(dialog(page).getByLabel('Backup contents')).toHaveCount(0);
  await expect(page.getByLabel('List name')).toHaveValue('New list'); // nothing was touched
});

test('a damaged backup restores what is good and says what it left out', async ({ page }) => {
  await makeData(page);
  const { text } = await saveBackup(page);
  await closeBackup(page);
  const damaged = JSON.parse(text);
  damaged.data.lists.push({ id: 'junk' });
  damaged.data.tournaments.push('nonsense');
  const path = writeTemp(damaged);
  await wipe(page);

  await openBackup(page);
  await choose(page, path);
  const preview = dialog(page).getByLabel('Backup contents');
  await expect(preview).toContainText('1 list, 0 games, 1 tournament');
  await expect(preview.getByRole('status')).toContainText('will be left out: 1 list, 1 tournament');
  await preview.getByRole('button', { name: 'Restore' }).click();
  await expect(dialog(page).getByRole('status')).toContainText('Restored.');
});

test('"Cancel" abandons a chosen file without changing anything', async ({ page }) => {
  await makeData(page);
  const { path } = await saveBackup(page); // the dialog is still open after saving
  await choose(page, path);
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page).getByLabel('Backup contents')).toHaveCount(0);
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the dialog and the top bar fit the screen', async ({ page }) => {
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(await sideways()).toBe(false);
    const button = page.getByRole('button', { name: /^Backup/ });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    await openBackup(page);
    await expect(dialog(page)).toBeVisible();
    expect(await sideways()).toBe(false);
    const box = (await dialog(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });
});
