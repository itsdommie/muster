import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const welcome = (page: Page) => page.getByRole('region', { name: 'Welcome' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('a first-time visitor is told Muster has no data and how to load some', async ({ page }) => {
  await expect(welcome(page)).toContainText('Muster ships no game data');
  await expect(welcome(page).getByRole('button', { name: 'Write my own pack' })).toBeVisible();
});

test('"Write my own pack" opens the pack editor', async ({ page }) => {
  await welcome(page).getByRole('button', { name: 'Write my own pack' }).click();
  await expect(page).toHaveURL(/#\/more\/pack/);
  await expect(page.getByLabel('Name for the new pack')).toBeVisible();
});

test('"Load a pack file" opens the data pack dialog', async ({ page }) => {
  await welcome(page).getByRole('button', { name: 'Load a pack file' }).click();
  await expect(page.getByRole('dialog', { name: 'Data pack' })).toBeVisible();
});

test('"Got it" hides it for good, even after a reload', async ({ page }) => {
  await welcome(page).getByRole('button', { name: 'Got it' }).click();
  await expect(welcome(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Muster', level: 1 })).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
});

test('it does not appear once the person has their own pack', async ({ page }) => {
  const sample = JSON.parse(readFileSync('packs/sample.json', 'utf8'));
  await page.evaluate((p) => localStorage.setItem('muster.pack.v1', p), JSON.stringify({ ...sample, id: 'mine', name: 'My pack' }));
  await page.reload();
  await expect(page.getByRole('button', { name: 'My pack' })).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
});
