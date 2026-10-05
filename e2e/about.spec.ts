import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const version = (JSON.parse(readFileSync(join(process.cwd(), 'packages/desktop/package.json'), 'utf8')) as { version: string }).version;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/builder');
  await page.reload();
});

test('About shows the version and where to get newer ones, with no update machinery in a browser', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Updates' })).toHaveCount(0); // no banner, no question: a browser cannot update itself
  await page.getByRole('contentinfo').getByRole('button', { name: 'About' }).click();
  const about = page.getByRole('dialog', { name: 'About Muster' });
  await expect(about).toContainText(`Version ${version}`);
  await expect(about).toContainText('Everything you make stays on your device');
  await expect(about).toContainText('not affiliated with or endorsed by any publisher');
  await expect(about).toContainText('MIT licence');
  await expect(about.getByRole('link', { name: 'Source code' })).toHaveAttribute('href', 'https://github.com/itsdommie/muster');
  await expect(about.getByRole('link', { name: 'What changed' })).toHaveAttribute('href', /CHANGELOG\.md$/);
  await expect(about.getByRole('region', { name: 'Updates' })).toContainText('This version does not update itself');
  await expect(about.getByRole('link', { name: 'Releases page' })).toHaveAttribute('href', 'https://github.com/itsdommie/muster/releases');
  await expect(about.getByLabel('Check for updates automatically')).toHaveCount(0);
  for (const link of await about.getByRole('link').all()) {
    expect(await link.getAttribute('target')).toBe('_blank');
    expect(await link.getAttribute('rel')).toContain('noreferrer'); // opened links learn nothing about the app
  }
  await about.getByRole('button', { name: 'Close' }).click();
  await expect(about).toHaveCount(0);
});

test('the page makes no network request of its own', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1')) external.push(r.url()); });
  await page.goto('/#/builder');
  await page.reload();
  await page.getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'More' }).click();
  await page.getByRole('contentinfo').getByRole('button', { name: 'About' }).click();
  await page.waitForTimeout(500);
  expect(external).toEqual([]);
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the About dialog fits the screen', async ({ page }) => {
    await page.getByRole('contentinfo').getByRole('button', { name: 'About' }).click();
    const box = (await page.getByRole('dialog', { name: 'About Muster' }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
