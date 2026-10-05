import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// An automated accessibility audit of every screen, in both colour schemes and at phone size, against WCAG 2.1 A and AA. Automated checks
// find roughly a third of real problems (contrast, names, roles, labels), so this is a floor, not a verdict.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Every violation across a whole tour is collected and reported together, so one run shows everything to fix.
const found: string[] = [];
async function audit(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const v of violations) {
    found.push(`[${label}] ${v.id} (${v.impact}): ${v.help}\n      ${v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')}  ${n.any[0]?.message ?? ''}`.trim()).join('\n      ')}${v.nodes.length > 4 ? `\n      …and ${v.nodes.length - 4} more` : ''}`);
  }
}
test.beforeEach(() => { found.length = 0; });

const nav = (page: Page) => page.getByRole('navigation', { name: 'Views' });
const sub = (page: Page) => page.getByRole('navigation', { name: 'More sections' });

/** Visit every screen with something on it, auditing each. */
async function tour(page: Page, scheme: string) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/builder');
  await page.reload();

  // Builder, with a list that has a warband, options and a problem on it.
  await page.getByRole('button', { name: '+ Warband' }).click();
  const addTab = page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Add' });
  if (await addTab.isVisible()) await addTab.click();
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Add Vale Archer' }).click();
  for (const t of ['Add', 'List', 'Summary']) {
    const tab = page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: t, exact: true });
    if (await tab.isVisible()) await tab.click();
    await audit(page, `${scheme}: builder (${t})`);
  }
  if (await addTab.isVisible()) await addTab.click(); // on a phone the unit library is its own tab
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await audit(page, `${scheme}: import list dialog`);
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await page.locator('.library').getByRole('button', { name: /Aldric the Bold/ }).first().click();
  await audit(page, `${scheme}: unit profile dialog`);
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  await nav(page).getByRole('button', { name: 'Units' }).click();
  await page.getByLabel('Search all units').fill('f>=5');
  await page.locator('.units-view .results-table').getByRole('button', { name: /Aldric/ }).first().click();
  await audit(page, `${scheme}: units`);
  const sheet = page.getByRole('dialog');
  if (await sheet.count()) { // on a phone a unit's profile opens as a sheet over the page
    await audit(page, `${scheme}: unit sheet`);
    await sheet.getByRole('button', { name: 'Close' }).click();
  }
  await nav(page).getByRole('button', { name: 'Rules' }).click();
  await audit(page, `${scheme}: rules`);
  await page.getByRole('tab', { name: /Wargear/ }).click();
  await audit(page, `${scheme}: wargear`);

  await nav(page).getByRole('button', { name: 'Fight' }).click();
  await audit(page, `${scheme}: fight (exact)`);
  await page.getByRole('tab', { name: /Squad vs squad/ }).click();
  await expect(page.getByRole('region', { name: 'Result' }).getByRole('status')).toContainText('6,000 battles');
  await audit(page, `${scheme}: fight (squad)`);

  await nav(page).getByRole('button', { name: 'Game' }).click();
  await audit(page, `${scheme}: game (start)`);
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.getByRole('button', { name: 'Casualty: Vale Archer 1' }).click();
  await audit(page, `${scheme}: game (tracker)`);
  await page.getByRole('button', { name: 'End game' }).click();
  await audit(page, `${scheme}: end game dialog`);
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  for (const s of ['Collection', 'Campaign', 'Scenarios', 'Tournament', 'Pack']) {
    await nav(page).getByRole('button', { name: 'More' }).click();
    await sub(page).getByRole('button', { name: s }).click();
    if (s === 'Campaign') {
      await page.getByRole('button', { name: 'Create campaign' }).click();
      await page.getByLabel('Unit to add').selectOption({ index: 0 });
      await page.getByRole('button', { name: 'Add to the company' }).click();
      await page.getByRole('button', { name: 'Make a list from this company' }).click();
    }
    if (s === 'Scenarios') await page.getByRole('button', { name: /Hold the Ford/ }).click();
    if (s === 'Tournament') {
      await page.getByLabel('Players, one per line').fill('Ann\nBob\nCat');
      await page.getByRole('button', { name: 'Create tournament' }).click();
      await page.getByRole('button', { name: 'Start round 1' }).click();
    }
    await audit(page, `${scheme}: more / ${s}`);
    if (s === 'Pack') {
      await page.getByRole('button', { name: 'Edit this pack' }).click();
      for (const t of ['Units', 'Wargear', 'Rules', 'Armies', 'Scenarios', 'Import & JSON', 'Pack']) {
        await page.getByRole('navigation', { name: 'Pack sections' }).getByRole('button', { name: t, exact: true }).click();
        await audit(page, `${scheme}: pack editor / ${t}`);
      }
    }
  }
  await nav(page).getByRole('button', { name: 'More' }).click();
  await sub(page).getByRole('button', { name: 'Campaign' }).click();
  await page.getByRole('button', { name: 'Record a game' }).click();
  await audit(page, `${scheme}: record a game dialog`);
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  for (const [open, name] of [[() => page.getByRole('button', { name: /^Backup/ }).click(), 'backup'], [() => page.getByRole('button', { name: /Sample Pack/ }).click(), 'data pack'], [() => page.getByRole('contentinfo').getByRole('button', { name: 'About' }).click(), 'about']] as const) {
    await open();
    await expect(page.getByRole('dialog'), `${name} dialog opens`).toBeVisible();
    await audit(page, `${scheme}: ${name} dialog`);
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  }
}

for (const scheme of ['dark', 'light'] as const) {
  test(`desktop, ${scheme}: every screen has no WCAG A/AA violations`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await tour(page, `desktop ${scheme}`);
    expect(found.join('\n'), 'accessibility violations').toBe('');
  });
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const scheme of ['dark', 'light'] as const) {
    test(`phone, ${scheme}: every screen has no WCAG A/AA violations`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await tour(page, `phone ${scheme}`);
      expect(found.join('\n'), 'accessibility violations').toBe('');
    });
  }
});
