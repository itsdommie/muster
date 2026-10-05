import { test, type Page } from '@playwright/test';

// Regenerates the README screenshots from the invented sample pack: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
test.skip(!process.env.SCREENSHOTS, 'only when regenerating the README screenshots');

const views = (page: Page) => page.getByRole('navigation', { name: 'Views' });
const OUT = 'docs/images';

async function buildList(page: Page) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('muster.welcome.v1', 'true'); });
  await page.goto('/#/builder');
  await page.reload();
  await page.getByRole('button', { name: '+ Warband' }).click();
  const add = page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Add' });
  if (await add.isVisible()) await add.click();
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Add Vale Archer' }).click();
  await page.getByRole('button', { name: 'Add Vale Spearman' }).click();
}

test('desktop, dark: builder', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await buildList(page);
  await page.screenshot({ path: `${OUT}/builder-dark.png` });
});

test('desktop, light: units', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/#/units');
  await page.reload();
  await page.getByLabel('Search all units').fill('is:hero');
  await page.locator('.units-view .results-table').getByRole('button', { name: /Aldric/ }).first().click();
  await page.screenshot({ path: `${OUT}/units-light.png` });
});

test('phone, dark: game tracker', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await buildList(page);
  await views(page).getByRole('button', { name: 'Game' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.getByRole('button', { name: 'Casualty: Vale Archer 1' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/game-phone.png` });
});
