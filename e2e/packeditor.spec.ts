import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/builder');
  await page.reload();
});

const nav = (page: Page) => page.getByRole('navigation', { name: 'Views' });
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Pack sections' });
const bar = (page: Page) => page.getByRole('region', { name: 'Pack draft' });
const tab = (page: Page, name: string) => tabs(page).getByRole('button', { name, exact: true }).click();

async function openEditor(page: Page) {
  await nav(page).getByRole('button', { name: 'More' }).click();
  await page.getByRole('navigation', { name: 'More sections' }).getByRole('button', { name: 'Pack' }).click();
}

const TABLE = [
  'Name,Kind,Cost,M,F,Sh,S,D,A,W,C,Might,Will,Fate,Rules,Wargear,Army',
  'Captain Marr,hero,60,6,5,4+,4,5,2,2,5,2,2,1,Stalwart; Fearless,Sword; Shield,The Order',
  'Guard,warrior,8,6,3,-,3,5,1,1,3,,,,Stalwart,Spear,The Order',
].join('\n');

async function startFromTable(page: Page, name = 'Order') {
  await openEditor(page);
  await page.getByLabel('Name for the new pack').fill(name);
  await page.getByRole('button', { name: 'Start with a table of units' }).click();
  await page.getByLabel('Table to import').fill(TABLE);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
}

test.describe('writing a pack', () => {
  test('from a pasted table to a working pack, end to end', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByRole('heading', { name: 'Data pack editor' })).toBeVisible();
    await expect(page.getByText('The pack in use now is the invented sample')).toBeVisible();
    await startFromTable(page);

    const result = page.locator('.import-result');
    await expect(result).toContainText('Imported: 2 added, 0 updated.');
    await expect(result).toContainText('Created 2 rules, 3 wargear, 1 army to fill in.');
    await expect(bar(page)).toContainText('2 units · 1 armies · 3 wargear · 2 rules');
    await expect(bar(page)).toContainText('ready to use');

    await tab(page, 'Units');
    await expect(page.getByRole('region', { name: 'Units' })).toContainText('Captain Marr');
    await page.getByRole('region', { name: 'Units' }).getByRole('button', { name: /Guard/ }).click();
    await expect(page.getByRole('article', { name: 'Edit Guard' }).getByLabel('Points', { exact: true })).toHaveValue('8');

    await bar(page).getByRole('button', { name: 'Use this pack' }).click();
    await expect(bar(page).getByRole('status').filter({ hasText: 'Now using' })).toContainText('Now using “Order”.');
    await expect(bar(page).getByRole('button', { name: 'In use' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Order$/ })).toBeVisible(); // the pack button in the top bar

    // And it works like any pack: build a list from it.
    await nav(page).getByRole('button', { name: 'Builder' }).click();
    await expect(page.getByRole('heading', { name: 'The Order', level: 2 })).toBeVisible();
    await page.getByRole('button', { name: '+ Warband' }).click();
    await page.getByRole('button', { name: 'Add Captain Marr' }).click();
    await page.getByRole('button', { name: 'Add Guard' }).click();
    await page.getByRole('button', { name: 'Add Guard' }).click();
    await expect(page.locator('.summary .points')).toContainText('76 / 500'); // 60 + 8 + 8
    await expect(page.getByRole('status').filter({ hasText: 'Legal list' })).toBeVisible();

    // The unit's profile and rules came through.
    await nav(page).getByRole('button', { name: 'Units' }).click();
    await page.getByLabel('Search all units').fill('is:hero sh<=4');
    await expect(page.locator('.units-view .results [role=status]')).toHaveText('1 of 2 units');
  });

  test('from scratch: it says what is missing, and what is fixed as you go', async ({ page }) => {
    await openEditor(page);
    await page.getByLabel('Name for the new pack').fill('Scratch');
    await page.getByRole('button', { name: 'Start from scratch' }).click();
    await expect(bar(page)).toContainText('to fix');
    await expect(bar(page).getByRole('button', { name: 'Use this pack' })).toBeDisabled();
    await expect(bar(page).locator('.problems')).toContainText('armies');

    // An army, a rule, a piece of wargear, then a hero for the army.
    await expect(page.getByRole('region', { name: 'Armies' })).toBeVisible();
    await page.getByLabel('New army name').fill('The Order');
    await page.getByRole('button', { name: 'Add army' }).click();
    await expect(page.getByRole('article', { name: 'Edit The Order' })).toContainText('An army needs at least one hero');
    await tab(page, 'Wargear');
    await page.getByLabel('New item name').fill('Longbow');
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('group', { name: 'Counts toward the bow limit as' }).getByRole('button', { name: 'Bow' }).click();
    await tab(page, 'Rules');
    await page.getByLabel('New rule name').fill('Stalwart');
    await page.getByRole('button', { name: 'Add rule' }).click();
    await page.getByLabel('What it does').fill('Re-roll one failed Courage test.');

    await tab(page, 'Units');
    await page.getByLabel('New unit name').fill('Captain');
    await page.getByRole('button', { name: 'Add unit' }).click();
    const form = page.getByRole('article', { name: 'Edit Captain' });
    await form.getByLabel('Kind').selectOption('hero');
    await form.getByLabel('Points', { exact: true }).fill('55');
    await form.getByLabel('Fight', { exact: true }).fill('5');
    await form.getByLabel('Shoot (n+)').fill('4');
    await form.getByRole('group', { name: 'Wargear' }).getByRole('button', { name: 'Longbow' }).click();
    await form.getByRole('group', { name: 'Special rules' }).getByRole('button', { name: 'Stalwart' }).click();
    await expect(bar(page)).toContainText('to fix'); // not in any army yet — but a pack needs a hero in an army
    await form.getByRole('group', { name: 'Available to' }).getByLabel('The Order').check();
    await expect(bar(page)).toContainText('ready to use');

    await bar(page).getByRole('button', { name: 'Use this pack' }).click();
    await nav(page).getByRole('button', { name: 'Units' }).click();
    await page.getByLabel('Search all units').fill('g:longbow r:stalwart is:ranged f>=5');
    await expect(page.locator('.units-view .results [role=status]')).toHaveText('1 of 1 units');
  });
});

test.describe('changing the pack in use', () => {
  test('edits a copy, and nothing changes until it is used', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Edit this pack' }).click();
    await page.getByRole('region', { name: 'Units' }).getByRole('button', { name: /Vale Spearman/ }).click();
    await page.getByRole('article', { name: 'Edit Vale Spearman' }).getByLabel('Points', { exact: true }).fill('10');
    await expect(bar(page).getByRole('button', { name: 'Use this pack' })).toBeEnabled();

    await nav(page).getByRole('button', { name: 'Builder' }).click();
    await expect(page.locator('.library').locator('li', { hasText: 'Vale Spearman' }).locator('.cost')).toHaveText('8'); // still the old cost

    await openEditor(page);
    await bar(page).getByRole('button', { name: 'Use this pack' }).click();
    await nav(page).getByRole('button', { name: 'Builder' }).click();
    await expect(page.locator('.library').locator('li', { hasText: 'Vale Spearman' }).locator('.cost')).toHaveText('10');
    await expect(page.getByRole('button', { name: /Sample Pack/ })).toBeVisible(); // the same pack, edited in place
  });

  test('deleting a unit warns about the saved lists that use it, and cleans up its armies', async ({ page }) => {
    await page.getByRole('button', { name: '+ Warband' }).click();
    await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
    await page.getByRole('button', { name: 'Add Vale Archer' }).click();

    await openEditor(page);
    await page.getByRole('button', { name: 'Edit this pack' }).click();
    await page.getByRole('region', { name: 'Units' }).getByRole('button', { name: /Vale Archer/ }).click();
    page.once('dialog', (d) => { expect(d.message()).toContain('removed from every army'); void d.accept(); });
    await page.getByRole('article', { name: 'Edit Vale Archer' }).getByRole('button', { name: 'Delete' }).click();
    await expect(bar(page)).toContainText('13 units');
    await expect(bar(page)).toContainText('ready to use');
    await expect(bar(page)).toContainText('1 saved list would break');

    await tab(page, 'Armies');
    await page.getByRole('region', { name: 'Armies' }).getByRole('button', { name: /Realm of the Vale/ }).click();
    await expect(page.getByRole('group', { name: /Units in this army/ }).getByRole('button', { name: 'Vale Archer' })).toHaveCount(0);

    page.once('dialog', (d) => { expect(d.message()).toContain('1 of your saved lists'); void d.accept(); });
    await bar(page).getByRole('button', { name: 'Use this pack' }).click();
    await nav(page).getByRole('button', { name: 'Builder' }).click();
    await expect(page.locator('.list-panel')).toContainText('"vale-archer" is not in the data pack');
    await expect(page.locator('.summary')).toContainText('1 problem');
  });

  test('options, warband limits and army membership are edited on the unit', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Edit this pack' }).click();
    await page.getByRole('region', { name: 'Units' }).getByRole('button', { name: /Aldric the Bold/ }).click();
    const form = page.getByRole('article', { name: 'Edit Aldric the Bold' });
    await form.getByRole('button', { name: 'Add an option' }).click();
    await form.getByLabel('Option 3 name').fill('Banner');
    await form.getByRole('group', { name: 'Options' }).getByLabel('Cost').nth(2).fill('4');
    await form.getByLabel('Wargear given by Banner').selectOption({ label: 'Spear' });
    await form.getByLabel('Warband size').fill('9');
    await form.getByLabel('Most in Realm of the Vale').fill('1');
    await bar(page).getByRole('button', { name: 'Use this pack' }).click();

    await nav(page).getByRole('button', { name: 'Builder' }).click();
    await page.getByRole('button', { name: '+ Warband' }).click();
    await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
    await page.getByRole('button', { name: /Banner/ }).click();
    await expect(page.locator('.summary .points')).toContainText('94 / 500'); // 90 + 4
    await expect(page.locator('.warband header')).toContainText('0/9 warriors'); // the new warband size
  });

  test('the fight and campaign rules can be turned off, and the calculator follows', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Edit this pack' }).click();
    await tab(page, 'Pack');
    await page.getByLabel('This pack has fight rules').uncheck();
    await bar(page).getByRole('button', { name: 'Use this pack' }).click();
    await nav(page).getByRole('button', { name: 'Fight' }).click();
    await expect(page.getByText('does not define combat rules')).toBeVisible();

    await openEditor(page);
    await tab(page, 'Pack');
    await page.getByLabel('This pack has fight rules').check();
    await expect(page.getByLabel('Sides on the die')).toHaveValue('6');
    await page.getByLabel('Sides on the die').fill('10');
    await bar(page).getByRole('button', { name: 'Use this pack' }).click();
    await nav(page).getByRole('button', { name: 'Fight' }).click();
    await expect(page.getByRole('region', { name: 'Side A' })).toBeVisible();
  });
});

test.describe('keeping it', () => {
  test('a draft survives a reload and can be closed', async ({ page }) => {
    await startFromTable(page, 'Keeper');
    await expect(bar(page)).toContainText('2 units');
    await page.reload();
    await expect(bar(page)).toContainText('Keeper');
    await expect(bar(page)).toContainText('2 units');
    page.once('dialog', (d) => d.accept());
    await bar(page).getByRole('button', { name: 'Close the draft' }).click();
    await expect(page.getByRole('heading', { name: 'Data pack editor' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Data pack editor' })).toBeVisible(); // gone for good
  });

  test('saves the pack as a file that loads back in', async ({ page }) => {
    await startFromTable(page, 'Filed');
    const download = page.waitForEvent('download');
    await bar(page).getByRole('button', { name: 'Save as a file' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('filed.json');
    const pack = JSON.parse(readFileSync((await file.path())!, 'utf8'));
    expect(pack).toMatchObject({ schema: 1, id: 'filed', name: 'Filed' });
    expect(pack.units.map((u: { name: string }) => u.name)).toEqual(['Captain Marr', 'Guard']);

    // The ordinary "load a pack file" accepts it.
    await page.getByRole('button', { name: /Sample Pack/ }).click();
    await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'filed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
    await expect(page.getByRole('button', { name: /^Filed$/ })).toBeVisible();
  });

  test('the pack dialog leads to the editor', async ({ page }) => {
    await page.getByRole('button', { name: /Sample Pack/ }).click();
    await page.getByRole('button', { name: 'Write or edit a pack…' }).click();
    await expect(page).toHaveURL(/#\/more\/pack$/);
    await expect(page.getByRole('heading', { name: 'Data pack editor' })).toBeVisible();
  });
});

test.describe('import and JSON', () => {
  test('reports the rows it cannot use and still imports the rest; a second import updates', async ({ page }) => {
    await openEditor(page);
    await page.getByLabel('Name for the new pack').fill('Rough');
    await page.getByRole('button', { name: 'Start with a table of units' }).click();
    await page.getByLabel('Table to import').fill('name,cost,fight,kind,flavour\nGood,5,3,warrior,x\nBad,abc,3,warrior,x\nWizard,5,3,wizard,x');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const result = page.locator('.import-result');
    await expect(result).toContainText('Imported: 1 added, 0 updated.');
    await expect(result).toContainText('Ignored columns: "flavour".');
    await expect(result).toContainText('Row 3 (Bad): cost "abc" is not a number.');
    await expect(result).toContainText('Row 4 (Wizard): kind "wizard" should be hero or warrior.');

    await page.getByLabel('Table to import').fill('name,cost\ngood,9');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(result).toContainText('Imported: 0 added, 1 updated.');
    await expect(bar(page)).toContainText('1 units');
  });

  test('the JSON box checks what is typed, applies it, and warns if the draft moved underneath it', async ({ page }) => {
    await startFromTable(page, 'Jsony');
    const json = page.getByLabel('Pack JSON');
    await json.fill('{ not json');
    await page.getByRole('button', { name: 'Check and use this JSON' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Not valid JSON' })).toBeVisible();

    await json.fill(JSON.stringify({ schema: 1, id: 'x' }));
    await page.getByRole('button', { name: 'Check and use this JSON' }).click();
    await expect(page.getByRole('alert')).toContainText('name');

    // A valid edit: rename the pack in the text.
    await page.getByRole('button', { name: 'Reload from the draft' }).click();
    const text = await json.inputValue();
    await json.fill(text.replace('"name": "Jsony"', '"name": "Renamed"'));
    await page.getByRole('button', { name: 'Check and use this JSON' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'now matches the JSON' })).toBeVisible();
    await expect(bar(page)).toContainText('Renamed');

    // Importing a table while there are unsaved edits in the box must not let them overwrite the import.
    await json.fill((await json.inputValue()) + ' ');
    await page.getByLabel('Table to import').fill('name,cost\nNewcomer,3');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'The draft has changed since you started editing this text' })).toBeVisible();
    await page.getByRole('button', { name: 'Reload from the draft' }).click();
    await expect(json).toHaveValue(/Newcomer/);
  });

  test('exports the units as a table that imports back', async ({ page }) => {
    await startFromTable(page, 'Round trip');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save the units as a table' }).click();
    const csv = readFileSync((await (await download).path())!, 'utf8');
    expect(csv.split('\n')[0]).toBe('name,kind,tier,cost,unique,move,fight,shoot,strength,defence,attacks,wounds,courage,might,will,fate,rules,wargear,keywords,army');
    expect(csv).toContain('Captain Marr,hero,,60');
    expect(csv).toContain('Stalwart; Fearless');
  });
});

test.describe('settings', () => {
  test('ally levels and the campaign rules can be edited', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Edit this pack' }).click();
    await tab(page, 'Pack');
    await page.getByLabel('Level', { exact: true }).first().fill('friendly');
    await expect(bar(page)).toContainText('ready to use'); // armies that used the level were renamed along with it
    await page.getByRole('button', { name: 'Add a level' }).click();
    await expect(page.getByLabel('Level 5 name')).toHaveValue('New level');
    await page.getByRole('button', { name: 'Add an advancement' }).click();
    await page.getByRole('button', { name: 'Add an injury' }).click();
    await expect(bar(page)).toContainText('ready to use');
    await page.getByLabel('Level 1 name').fill('');
    await page.getByLabel('Level 1 name').fill('Rookie');
    await expect(bar(page)).toContainText('ready to use');

    await tab(page, 'Armies');
    await page.getByRole('region', { name: 'Armies' }).getByRole('button', { name: /Realm of the Vale/ }).click();
    await expect(page.getByLabel('Ally 1 level')).toHaveValue('friendly');
  });
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the editor fits the screen and its controls are usable', async ({ page }) => {
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    await openEditor(page);
    expect(await sideways()).toBe(false);
    await page.getByRole('button', { name: 'Edit this pack' }).click();
    await page.getByRole('region', { name: 'Units' }).getByRole('button', { name: /Aldric the Bold/ }).click();
    expect(await sideways()).toBe(false);
    for (const t of ['Pack', 'Units', 'Wargear', 'Rules', 'Armies', 'Scenarios', 'Import & JSON']) {
      await tab(page, t);
      expect(await sideways(), `${t} tab`).toBe(false);
    }
    for (const b of await tabs(page).getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(38);
  });
});
