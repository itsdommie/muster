import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// A pack far bigger than any real one. The lists must stay capped so the app stays quick, and "Show more" must reach the rest.
const sample = JSON.parse(readFileSync('packs/sample.json', 'utf8'));
const COUNT = 3000;
const units = [...sample.units];
for (let i = 0; i < COUNT; i++) {
  const t = sample.units[i % sample.units.length];
  units.push({ ...t, id: `gen-${i}`, name: `${t.name} Variant ${i}`, unique: false });
}
const huge = { ...sample, units, armies: [...sample.armies, { ...sample.armies[0], id: 'huge', name: 'Huge Host', units: units.map((u: { id: string }) => ({ unit: u.id })) }] };
const TOTAL = units.length;

const views = (page: Page) => page.getByRole('navigation', { name: 'Views' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((p) => { localStorage.clear(); localStorage.setItem('muster.pack.v1', p); }, JSON.stringify(huge));
  await page.goto('/#/units');
  await page.reload();
});

test('units table draws a page at a time, and Show more reaches the rest', async ({ page }) => {
  const rows = page.locator('.units-view tbody tr');
  await expect(page.getByRole('status').filter({ hasText: `${TOTAL} of ${TOTAL} units` })).toBeVisible();
  await expect(rows).toHaveCount(200);
  await expect(page.locator('.units-view').getByText(`Showing 200 of ${TOTAL}.`)).toBeVisible();

  await page.getByRole('button', { name: 'Show more' }).click();
  await expect(rows).toHaveCount(400);

  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(rows).toHaveCount(TOTAL);
  await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0);

  // A new search starts over from a short page, and finds a unit that was far down the list.
  await page.getByLabel('Search all units').fill('variant 2999');
  await expect(rows).toHaveCount(1);
  await page.getByLabel('Search all units').fill('');
  await expect(rows).toHaveCount(200);
});

test('the builder library and the collection are capped too', async ({ page }) => {
  await views(page).getByRole('button', { name: 'Builder' }).click();
  await page.locator('.list-panel .row-controls select').first().selectOption({ label: 'Huge Host' });
  const library = page.locator('.library');
  // At most a page of heroes and a page of warriors, with a way to the rest.
  expect(await library.locator('li').count()).toBeLessThanOrEqual(400);
  await expect(library.getByText(/Showing \d+ of \d+\./).first()).toBeVisible();
  await library.getByRole('button', { name: 'Show all' }).first().click();
  expect(await library.locator('li').count()).toBeGreaterThan(400);

  await views(page).getByRole('button', { name: 'More' }).click();
  await page.getByRole('navigation', { name: 'More sections' }).getByRole('button', { name: 'Collection' }).click();
  const cards = page.locator('.collection .unit-card');
  await expect(cards).toHaveCount(200);
  await expect(page.locator('.collection').getByText(`Showing 200 of ${TOTAL}.`)).toBeVisible();
  await page.locator('.collection').getByRole('button', { name: 'Show more' }).click();
  await expect(cards).toHaveCount(400);
});

test('searching a huge pack stays responsive', async ({ page }) => {
  const box = page.getByLabel('Search all units');
  const started = Date.now();
  await box.fill('vale');
  await expect(page.locator('.units-view tbody tr').first()).toBeVisible();
  await box.fill('f>=3 w>=2');
  await expect(page.getByRole('status').filter({ hasText: /of \d+ units/ })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(5000);
});
