import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/builder');
  await page.reload();
});

const nav = (page: Page) => page.getByRole('navigation', { name: 'Views' });
const roster = (page: Page) => page.getByRole('region', { name: 'Roster' });
const company = (page: Page) => page.getByRole('region', { name: 'Company' });

async function openCampaign(page: Page) {
  await nav(page).getByRole('button', { name: 'More' }).click();
  await page.getByRole('navigation', { name: 'More sections' }).getByRole('button', { name: 'Campaign' }).click();
}

async function createCampaign(page: Page, name = 'Vale Watch', limit = '') {
  await openCampaign(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  if (limit) await page.getByLabel('Points limit').fill(limit);
  await page.getByRole('button', { name: 'Create campaign' }).click();
}

async function addMember(page: Page, unit: RegExp | string, name: string) {
  await roster(page).getByLabel('Unit to add').selectOption({ label: typeof unit === 'string' ? unit : (await roster(page).getByLabel('Unit to add').locator('option').allTextContents()).find((t) => unit.test(t))! });
  await roster(page).getByLabel('Name for the new model').fill(name);
  await roster(page).getByRole('button', { name: 'Add to the company' }).click();
}

/** Aldric, Sera, three spearmen and an archer. */
async function fillCompany(page: Page) {
  await addMember(page, /^Aldric the Bold/, 'Aldric');
  await addMember(page, /^Sera Windfletcher/, 'Sera');
  await addMember(page, /^Vale Spearman/, 'Tam');
  await addMember(page, /^Vale Spearman/, 'Wil');
  await addMember(page, /^Vale Spearman/, 'Bram');
  await addMember(page, /^Vale Archer/, 'Pip');
}

const xp = (page: Page, name: string) => page.getByRole('group', { name: `Experience of ${name}` });
const condition = (page: Page, name: string) => page.getByRole('group', { name: `Condition of ${name}` });

test.describe('the roster', () => {
  test('starts a campaign and builds a company, costing it as it grows', async ({ page }) => {
    await createCampaign(page, 'Vale Watch');
    await expect(page.getByLabel('Campaign name')).toHaveValue('Vale Watch');
    await expect(company(page)).toContainText('Realm of the Vale · 0 models · no games yet');
    await expect(roster(page)).toContainText('Add the models your company starts with.');

    await addMember(page, /^Aldric the Bold/, 'Aldric');
    await addMember(page, /^Vale Spearman/, 'Tam');
    await expect(company(page)).toContainText('2 models');
    await expect(company(page)).toContainText('98 pts'); // 90 + 8
    await expect(page.getByLabel('Name of Aldric')).toBeVisible();
    await expect(roster(page)).toContainText('Aldric the Bold · 90 pts');
  });

  test('a unique model cannot be added twice, and a company can go over its limit', async ({ page }) => {
    await createCampaign(page, 'Small band', '100');
    await addMember(page, /^Aldric the Bold/, 'Aldric');
    await addMember(page, /^Aldric the Bold/, 'Aldric again');
    await expect(page.getByLabel('Name of Aldric again')).toHaveCount(0);
    await addMember(page, /^Vale Spearman/, 'Tam');
    await expect(company(page)).toContainText('98 pts');
    await expect(company(page).locator('.issue')).toHaveCount(0);
    await addMember(page, /^Vale Spearman/, 'Wil');
    await expect(company(page).locator('.issue')).toContainText('The company is 6 points over its limit.');
  });

  test('equipment adds to a model\'s cost', async ({ page }) => {
    await createCampaign(page);
    await addMember(page, /^Vale Spearman/, 'Tam');
    await expect(company(page)).toContainText('8 pts');
    await page.locator('.member', { has: page.getByLabel('Name of Tam') }).locator('summary').click();
    await page.getByRole('group', { name: 'Equipment of Tam' }).getByRole('button', { name: /Shield/ }).click();
    await expect(company(page)).toContainText('9 pts');
    await expect(roster(page)).toContainText('Vale Spearman · 9 pts');
  });

  test('keeps experience, levels, advancements, injuries and notes on each model', async ({ page }) => {
    await createCampaign(page);
    await addMember(page, /^Vale Archer/, 'Pip');
    const card = page.locator('.member', { has: page.getByLabel('Name of Pip') });
    await expect(card).toContainText('Recruit');
    await expect(card).toContainText('4 to Veteran');

    await card.locator('summary').click();
    await expect(card).toContainText('None available yet.');
    for (let i = 0; i < 4; i++) await xp(page, 'Pip').getByRole('button', { name: 'Experience of Pip up' }).click();
    await expect(card).toContainText('Veteran');
    await expect(card).toContainText('6 to Champion');
    await expect(card.getByRole('button', { name: '+ Sharp-eyed' })).toBeVisible();
    await expect(card.getByRole('button', { name: '+ Deadly' })).toHaveCount(0); // needs a higher level

    await card.getByRole('button', { name: '+ Sharp-eyed' }).click();
    await expect(page.getByRole('group', { name: 'Advancements of Pip' }).getByRole('button', { name: 'Sharp-eyed' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('group', { name: 'Injuries of Pip' }).getByRole('button', { name: 'Limp' }).click();
    await expect(page.getByRole('group', { name: 'Injuries of Pip' }).getByRole('button', { name: 'Limp' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Notes on Pip').fill('Lost her bow once');

    await page.reload();
    await expect(page.getByLabel('Name of Pip')).toBeVisible();
    await page.locator('.member', { has: page.getByLabel('Name of Pip') }).locator('summary').click();
    await expect(page.getByLabel('Notes on Pip')).toHaveValue('Lost her bow once');
    await expect(page.getByRole('group', { name: 'Advancements of Pip' }).getByRole('button', { name: 'Sharp-eyed' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('experience stops at zero; injured and dead models are marked, and the dead move to "Fallen"', async ({ page }) => {
    await createCampaign(page);
    await addMember(page, /^Vale Spearman/, 'Tam');
    await expect(page.getByRole('button', { name: 'Experience of Tam down' })).toBeDisabled();
    await condition(page, 'Tam').getByRole('button', { name: 'Injured' }).click();
    await expect(page.locator('.member.status-injured')).toHaveCount(1);
    await condition(page, 'Tam').getByRole('button', { name: 'Dead' }).click();
    await expect(page.getByRole('region', { name: 'Roster' }).locator('.fallen')).toContainText('Fallen (1)');
    await expect(company(page)).toContainText('0 models'); // the dead do not count
  });
});

test.describe('playing the company', () => {
  test('makes a list from the company, warns when it breaks the usual limits, and refreshes the same list each time', async ({ page }) => {
    await createCampaign(page);
    await fillCompany(page);
    const make = company(page).getByRole('button', { name: 'Make a list from this company' });
    await make.click();
    const status = company(page).getByRole('status');
    await expect(status).toContainText('Vale Watch company is ready: 6 models, 183 points.'); // 90 + 60 + 3 x 8 + 9
    // Two of the six carry bows, and the pack allows one: said plainly, not hidden.
    await expect(status).toContainText('Under the usual list-building rules this has 1 problem');
    await expect(status).toContainText('2 models carry bows or throwing weapons; at most 1 are allowed for 6 models.');

    // Without the archer the company is a legal list.
    await condition(page, 'Pip').getByRole('button', { name: 'Dead' }).click();
    await make.click();
    await expect(status).toContainText('5 models, 174 points.');
    await expect(status).not.toContainText('list-building rules');
    await company(page).getByRole('button', { name: 'Open it in the Builder' }).click();
    await expect(page).toHaveURL(/#\/builder$/);
    await expect(page.getByLabel('List name')).toHaveValue('Vale Watch company');
    await expect(page.getByRole('status').filter({ hasText: 'Legal list' })).toBeVisible();
    await expect(page.locator('.summary .points')).toContainText('174 / 174');

    // Change the company, make it again: the same list is updated, not copied.
    await openCampaign(page);
    await condition(page, 'Wil').getByRole('button', { name: 'Dead' }).click();
    await make.click();
    await expect(status).toContainText('4 models');
    await nav(page).getByRole('button', { name: 'Builder' }).click();
    await expect(page.getByRole('combobox', { name: 'Saved lists' }).locator('option')).toHaveText(['New list', 'Vale Watch company']);
  });

  test('injured models are left out of the list unless asked for', async ({ page }) => {
    await createCampaign(page);
    await fillCompany(page);
    await condition(page, 'Sera').getByRole('button', { name: 'Injured' }).click();
    await company(page).getByRole('button', { name: 'Make a list from this company' }).click();
    await expect(company(page).getByRole('status')).toContainText('5 models');
    await company(page).getByLabel('Include injured models').check();
    await company(page).getByRole('button', { name: 'Make a list from this company' }).click();
    await expect(company(page).getByRole('status')).toContainText('6 models');
  });

  test('says when there is no hero to lead', async ({ page }) => {
    await createCampaign(page);
    await addMember(page, /^Vale Spearman/, 'Tam');
    await company(page).getByRole('button', { name: 'Make a list from this company' }).click();
    await expect(company(page).getByRole('status')).toContainText('No hero is fit to lead');
  });

  test('the whole loop: play the company, then record the game back into the campaign', async ({ page }) => {
    await createCampaign(page);
    await fillCompany(page);
    await company(page).getByRole('button', { name: 'Make a list from this company' }).click();

    await nav(page).getByRole('button', { name: 'Game' }).click();
    await expect(page.getByLabel('Your list')).toHaveValue(/.+/);
    await page.getByLabel('Your list').selectOption({ label: 'Vale Watch company (6 models)' });
    await expect(page.getByText('This is a campaign company (Vale Watch)')).toBeVisible();
    await page.getByRole('button', { name: 'Start game' }).click();
    await page.getByRole('button', { name: 'Casualty: Vale Spearman 2' }).click(); // Wil
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Your victory points up' }).click();
    await page.getByRole('button', { name: 'End game' }).click();
    await page.getByRole('button', { name: 'Finish and save' }).click();

    await expect(page.locator('.past')).toContainText('Record in Vale Watch');
    await page.locator('.past').getByRole('button', { name: 'Record in Vale Watch' }).click();
    await expect(page).toHaveURL(/#\/more\/campaign$/);

    const dialog = page.getByRole('dialog', { name: 'Record a game' });
    await expect(dialog).toContainText('Filled in from the game you tracked');
    await expect(dialog.getByLabel('Your victory points')).toHaveValue('3');
    await expect(dialog.getByLabel('Their victory points')).toHaveValue('0');
    await expect(dialog.getByRole('status')).toContainText('A win: 2 experience each');
    for (const name of ['Aldric', 'Sera', 'Tam', 'Wil', 'Bram', 'Pip']) await expect(dialog.getByLabel(`${name} played`)).toBeChecked();
    await expect(dialog.getByLabel('Wil condition')).toHaveValue('injured'); // ended the game down
    await expect(dialog.getByLabel('Tam condition')).toHaveValue('active');
    await expect(dialog.getByLabel('Tam experience')).toHaveValue('2');

    await dialog.getByLabel('Wil condition').selectOption('dead');
    await dialog.getByLabel('Aldric experience').fill('5');
    await dialog.getByLabel('Opponent').fill('Dave');
    await dialog.getByRole('button', { name: /^Record the game/ }).click();

    // The campaign now remembers it.
    await expect(company(page)).toContainText('1W 0D 0L');
    await expect(xp(page, 'Aldric')).toContainText('5');
    await expect(xp(page, 'Tam')).toContainText('2');
    await expect(roster(page).locator('.fallen')).toContainText('Fallen (1)');
    const log = page.getByRole('region', { name: 'Game log' });
    await expect(log).toContainText('3–0');
    await expect(log).toContainText('vs Dave');
    await expect(log).toContainText('Wil (+2 XP, dead)');
    await expect(page.getByRole('region', { name: 'Games to record' })).toHaveCount(0);

    // And the game history says so, rather than offering it again.
    await nav(page).getByRole('button', { name: 'Game' }).click();
    await expect(page.locator('.past')).toContainText('in Vale Watch');
    await expect(page.locator('.past').getByRole('button', { name: /Record in/ })).toHaveCount(0);
  });

  test('a recorded game can be taken back', async ({ page }) => {
    await createCampaign(page);
    await fillCompany(page);
    await company(page).getByRole('button', { name: 'Record a game' }).click();
    const dialog = page.getByRole('dialog', { name: 'Record a game' });
    await dialog.getByLabel('Your victory points').fill('4');
    await dialog.getByLabel('Pip played').uncheck();
    await dialog.getByLabel('Tam condition').selectOption('dead');
    await dialog.getByRole('button', { name: /^Record the game \(5 models\)/ }).click();
    await expect(company(page)).toContainText('1W 0D 0L');
    await expect(xp(page, 'Aldric')).toContainText('2');
    await expect(xp(page, 'Pip')).toContainText('0'); // sat it out

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Undo the last game' }).click();
    await expect(company(page)).toContainText('no games yet');
    await expect(xp(page, 'Aldric')).toContainText('0');
    await expect(roster(page).locator('.fallen')).toHaveCount(0); // Tam is back
    await expect(page.getByLabel('Name of Tam')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Game log' })).toContainText('No games recorded yet.');
  });

  test('a game can be recorded by hand, with a draw and no experience rules applied twice', async ({ page }) => {
    await createCampaign(page);
    await fillCompany(page);
    await company(page).getByRole('button', { name: 'Record a game' }).click();
    const dialog = page.getByRole('dialog', { name: 'Record a game' });
    await dialog.getByLabel('Your victory points').fill('2');
    await dialog.getByLabel('Their victory points').fill('2');
    await expect(dialog.getByRole('status')).toContainText('A draw: 1 experience each');
    await dialog.getByRole('button', { name: /^Record the game/ }).click();
    await expect(company(page)).toContainText('0W 1D 0L');
    await expect(xp(page, 'Sera')).toContainText('1');
  });
});

test.describe('keeping it', () => {
  test('campaigns survive a reload and a backup round trip', async ({ page }) => {
    await createCampaign(page, 'Winter war');
    await addMember(page, /^Aldric the Bold/, 'Aldric');
    for (let i = 0; i < 3; i++) await xp(page, 'Aldric').getByRole('button', { name: 'Experience of Aldric up' }).click();
    await page.reload();
    await expect(page.getByLabel('Campaign name')).toHaveValue('Winter war');
    await expect(xp(page, 'Aldric')).toContainText('3');

    await page.getByRole('button', { name: /^Backup/ }).click();
    await expect(page.getByRole('dialog', { name: 'Backup and restore' })).toContainText('1 campaign');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save backup file' }).click();
    const path = await (await download).path();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

    await page.evaluate(() => localStorage.clear());
    await page.goto('/#/builder');
    await page.reload();
    await page.getByRole('button', { name: /^Backup/ }).click();
    await page.getByRole('dialog').locator('input[type=file]').setInputFiles(path);
    await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('1 campaign');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

    await openCampaign(page);
    await expect(page.getByLabel('Campaign name')).toHaveValue('Winter war');
    await expect(xp(page, 'Aldric')).toContainText('3');
  });

  test('several campaigns can be kept, and each has its own company; one can be deleted', async ({ page }) => {
    await createCampaign(page, 'First');
    await addMember(page, /^Aldric the Bold/, 'Aldric');
    await page.getByRole('button', { name: 'New campaign' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Second');
    await page.getByRole('button', { name: 'Create campaign' }).click();
    await expect(page.getByLabel('Campaign name')).toHaveValue('Second');
    await expect(page.getByLabel('Name of Aldric')).toHaveCount(0);
    await page.getByLabel('Campaign', { exact: true }).selectOption({ label: 'First' });
    await expect(page.getByLabel('Name of Aldric')).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByLabel('Campaign name')).toHaveValue('Second');
  });
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the roster and the record form fit the screen', async ({ page }) => {
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    await createCampaign(page);
    await fillCompany(page);
    expect(await sideways()).toBe(false);
    await page.locator('.member').first().locator('summary').click();
    expect(await sideways()).toBe(false);
    await company(page).getByRole('button', { name: 'Record a game' }).click();
    const dialog = page.getByRole('dialog', { name: 'Record a game' });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await sideways()).toBe(false);
    // Every column of the table is really on screen, not clipped by the dialog (the XP box is the last one).
    const xpBox = (await dialog.getByLabel('Aldric experience').boundingBox())!;
    expect(xpBox.x).toBeGreaterThanOrEqual(box.x);
    expect(xpBox.x + xpBox.width).toBeLessThanOrEqual(box.x + box.width);
    expect(xpBox.x + xpBox.width).toBeLessThanOrEqual(390);
    for (const b of await page.locator('.member-head .segmented').first().getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(38);
  });
});
