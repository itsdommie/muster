import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/units');
  await page.reload();
});

const views = (page: Page) => page.getByRole('navigation', { name: 'Views' });
const search = (page: Page) => page.getByLabel('Search all units');
const count = (page: Page) => page.locator('.results [role=status]');
const firstRowName = (page: Page) => page.locator('.units-view .results-table tbody tr').first().locator('.name');

test.describe('unit database', () => {
  test('lists every unit and narrows with the query language', async ({ page }) => {
    await expect(count(page)).toHaveText('14 of 14 units');
    await search(page).fill('f>=7');
    await expect(count(page)).toHaveText('1 of 14 units');
    await expect(firstRowName(page)).toHaveText('Gorrath Skullmaker');

    await search(page).fill('r:terror or k:cavalry');
    await expect(count(page)).toHaveText('3 of 14 units');
    await search(page).fill('is:warrior -k:infantry');
    await expect(firstRowName(page)).toHaveText('Knight of the Vale');
    await search(page).fill('zzzz');
    await expect(page.getByText('No units match.')).toBeVisible();
  });

  test('explains bad filters but keeps searching', async ({ page }) => {
    await search(page).fill('zz:1 k:cavalry');
    await expect(page.locator('.results .issue')).toHaveText(/Unknown filter "zz"/);
    await expect(count(page)).toHaveText('1 of 14 units');
  });

  test('example chips fill the search, Clear resets it', async ({ page }) => {
    await page.getByText('Search syntax and examples').click();
    await page.getByRole('button', { name: 'r:terror', exact: true }).click();
    await expect(search(page)).toHaveValue('r:terror');
    await expect(count(page)).toHaveText('2 of 14 units');
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(count(page)).toHaveText('14 of 14 units');
  });

  test('sorts by a column, descending first for numbers, and toggles', async ({ page }) => {
    await expect(firstRowName(page)).toHaveText('Aldric the Bold'); // alphabetical by default
    await page.getByRole('button', { name: 'Pts', exact: true }).click();
    await expect(firstRowName(page)).toHaveText('Gorrath Skullmaker'); // 100
    await page.getByRole('button', { name: 'Pts', exact: true }).click();
    await expect(firstRowName(page)).toHaveText('March Scout'); // 7, ties broken by name
    await expect(page.getByRole('columnheader', { name: /Pts/ })).toHaveAttribute('aria-sort', 'ascending');
  });

  test('models that cannot shoot sort last in both directions', async ({ page }) => {
    const shoot = page.getByRole('button', { name: 'Sh', exact: true });
    await shoot.click(); // descending: worst target number first (5+), unshooters last
    await expect(page.locator('.units-view .results-table tbody tr').last().locator('td').nth(4)).toHaveText('-');
    await shoot.click();
    await expect(page.locator('.units-view .results-table tbody tr').last().locator('td').nth(4)).toHaveText('-');
  });

  test('shows a full profile and follows a rule to the reference and back', async ({ page }) => {
    await search(page).fill('gorrath');
    await page.locator('.units-view .results-table').getByRole('button', { name: /Gorrath Skullmaker/ }).click();
    const profile = page.getByRole('complementary', { name: 'Unit profile' });
    await expect(profile).toContainText('Warlord · 100 pts');
    await expect(profile).toContainText('Armies: The Hollow Horde');
    await expect(profile.locator('table.stats')).toBeVisible();

    await profile.getByRole('button', { name: 'Terror' }).click();
    await expect(page).toHaveURL(/#\/rules$/);
    await expect(page.locator('#rule-terror')).toHaveClass(/focus/);
    await page.locator('#rule-terror').getByRole('button', { name: 'Gorrath Skullmaker' }).click();
    await expect(page).toHaveURL(/#\/units$/);
    await expect(page.getByRole('complementary', { name: 'Unit profile' })).toContainText('Gorrath Skullmaker');
  });

  test('keeps the query when switching views, and the view across a reload', async ({ page }) => {
    await search(page).fill('k:cavalry');
    await views(page).getByRole('button', { name: 'Rules' }).click();
    await views(page).getByRole('button', { name: 'Units' }).click();
    await expect(search(page)).toHaveValue('k:cavalry');
    await page.reload();
    await expect(views(page).getByRole('button', { name: 'Units' })).toHaveAttribute('aria-current', 'page');
  });

  test('the browser back button steps between views', async ({ page }) => {
    await views(page).getByRole('button', { name: 'Rules' }).click();
    await expect(page).toHaveURL(/#\/rules$/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/units$/);
    await expect(search(page)).toBeVisible();
  });
});

test.describe('rules reference', () => {
  test.beforeEach(async ({ page }) => {
    await views(page).getByRole('button', { name: 'Rules' }).click();
  });

  test('searches rule names and text, with all words required', async ({ page }) => {
    const status = page.locator('.rules-view [role=status]');
    await expect(status).toHaveText('8 rules');
    await page.getByLabel('Search the reference').fill('courage');
    await expect(status).toHaveText('2 rules');
    await page.getByLabel('Search the reference').fill('enemy courage');
    await expect(status).toHaveText('1 rule');
    await expect(page.locator('.cards .card')).toContainText('Terror');
  });

  test('filters by category and lists who uses a rule', async ({ page }) => {
    await page.getByRole('button', { name: 'Magic', exact: true }).click();
    await expect(page.locator('.cards .card')).toHaveCount(2);
    await expect(page.locator('#rule-hex')).toContainText('Used by: Vexa the Hex');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('.cards .card')).toHaveCount(8);
  });

  test('switches to wargear and searches it', async ({ page }) => {
    await page.getByRole('tab', { name: /Wargear/ }).click();
    await expect(page.locator('.cards .card')).toHaveCount(8);
    await page.getByLabel('Search the reference').fill('throwing');
    await expect(page.locator('.cards .card')).toHaveCount(1);
    await expect(page.locator('.cards .card')).toContainText('Javelins');
  });
});

test.describe('builder links into the reference', () => {
  test('a rule on a profile opened from the builder jumps to the reference', async ({ page }) => {
    await page.goto('/#/builder');
    await page.locator('.library').getByRole('button', { name: /Aldric the Bold/ }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Stalwart' }).click();
    await expect(page).toHaveURL(/#\/rules$/);
    await expect(page.locator('#rule-stalwart')).toHaveClass(/focus/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('results scroll inside their panel, profiles open as a sheet, and the page never scrolls sideways', async ({ page }) => {
    await expect(count(page)).toHaveText('14 of 14 units');
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(await sideways()).toBe(false);

    await page.locator('.units-view .results-table').getByRole('button', { name: /Vale Archer/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Vale Archer' });
    await expect(sheet).toBeVisible();
    expect(await sideways()).toBe(false);
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);

    await views(page).getByRole('button', { name: 'Rules' }).click();
    await expect(page.locator('.cards .card').first()).toBeVisible();
    expect(await sideways()).toBe(false);
  });
});
