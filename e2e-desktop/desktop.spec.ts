import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

// Drives the real desktop app. MUSTER_EXE tests a packaged binary (an AppImage or installed exe) instead of the dev build.
const require = createRequire(import.meta.url);

function isolated(path: string | undefined): string | undefined {
  if (!path) return path;
  if (relative(process.cwd(), path).startsWith('..')) return path;
  const dest = mkdtempSync(join(tmpdir(), 'muster-app-'));
  if (statSync(path).isFile() && /\.AppImage$/i.test(path)) { cpSync(path, join(dest, basename(path))); return join(dest, basename(path)); }
  cpSync(dirname(path), dest, { recursive: true });
  return join(dest, basename(path));
}
const exe = isolated(process.env.MUSTER_EXE);

const launch = (userData: string, extraEnv: Record<string, string> = {}): Promise<ElectronApplication> =>
  electron.launch({
    executablePath: exe ?? (require('electron') as string),
    args: [...(exe ? [] : ['packages/desktop']), '--no-sandbox'],
    env: { ...process.env, MUSTER_USER_DATA: userData, ...extraEnv },
  });

test('builds a list, keeps it across a restart, and serves only its own files', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));

  let app = await launch(userData);
  let page = await app.firstWindow();
  expect(await page.title()).toBe('Muster');
  expect(page.url()).toBe('app://muster/');
  await expect(page.getByRole('heading', { name: 'Realm of the Vale', level: 2 })).toBeVisible();

  await page.getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  await page.getByRole('button', { name: 'Add Vale Spearman' }).click();
  await page.getByLabel('List name').fill('Desktop test');
  await expect(page.locator('.summary .points')).toContainText('98 / 500');
  await expect(page.getByRole('status')).toHaveText('Legal list');

  // Clipboard works under the locked-down permissions.
  await page.getByRole('button', { name: 'Copy as text' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

  // Nothing outside the web root is reachable, and the policy header is on.
  const probe = await page.evaluate(async () => {
    // Chromium may collapse the dots before the request reaches the handler (then it is just a missing file), or the handler refuses it.
    const traversal = await fetch('app://muster/%2e%2e/%2e%2e/etc/passwd').then(async (r) => ({ status: r.status, leaked: (await r.text()).includes('root:') }));
    const missing = await fetch('app://muster/nope.js').then((r) => r.status).catch(() => -1);
    const csp = (await fetch('app://muster/')).headers.get('content-security-policy');
    return { traversal, missing, csp };
  });
  expect([403, 404]).toContain(probe.traversal.status);
  expect(probe.traversal.leaked).toBe(false);
  expect(probe.missing).toBe(404);
  expect(probe.csp).toContain("default-src 'self'");

  await app.close();

  // Relaunch with the same profile: the list is still there.
  app = await launch(userData);
  page = await app.firstWindow();
  await expect(page.getByLabel('List name')).toHaveValue('Desktop test');
  await expect(page.locator('.summary .points')).toContainText('98 / 500');
  await app.close();
});

test('unit database and rules reference work under the app:// origin', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  const app = await launch(userData);
  const page = await app.firstWindow();

  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Units' }).click();
  await expect(page).toHaveURL('app://muster/#/units');
  await page.getByLabel('Search all units').fill('r:terror');
  await expect(page.locator('.results [role=status]')).toHaveText('2 of 14 units');
  await page.locator('.results-table').getByRole('button', { name: /Vexa the Hex/ }).click();
  await page.getByRole('complementary', { name: 'Unit profile' }).getByRole('button', { name: 'Hex' }).click();
  await expect(page.locator('#rule-hex')).toHaveClass(/focus/);

  // The view survives a restart of the page (hash routing under a custom protocol).
  await page.reload();
  await expect(page).toHaveURL('app://muster/#/rules');
  await expect(page.locator('#rule-hex')).toBeVisible();
  await app.close();
});

test('the fight calculator solves a fight and runs a squad simulation in the desktop app', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  const app = await launch(userData);
  const page = await app.firstWindow();
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Fight' }).click();
  const a = page.getByRole('region', { name: 'Side A' });
  const b = page.getByRole('region', { name: 'Side B' });
  await a.getByLabel('Side A model 1', { exact: true }).selectOption({ label: 'Vale Spearman' });
  await b.getByLabel('Side B model 1', { exact: true }).selectOption({ label: 'Marsh Raider' });
  const result = page.getByRole('region', { name: 'Result' });
  await expect(result.getByRole('img', { name: /wins/ })).toHaveAttribute('aria-label', 'Vale Spearman wins 50.0%, Marsh Raider wins 50.0%');
  await expect(result.getByRole('status')).toContainText('about 3.0 rounds');

  await page.getByRole('tab', { name: /Squad vs squad/ }).click();
  await a.getByLabel('Side A model 1 count').fill('12');
  await b.getByLabel('Side B model 1 count').fill('4');
  await expect(result.getByRole('status')).toContainText('6,000 battles');
  const label = await result.getByRole('img', { name: /wins/ }).getAttribute('aria-label');
  expect(Number(/Side A wins ([\d.]+)%/.exec(label!)![1])).toBeGreaterThan(95);
  await app.close();
});

test('the collection and a tournament are kept across a restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  let app = await launch(userData);
  let page = await app.firstWindow();
  const more = (section: string) => page.getByRole('navigation', { name: 'More sections' }).getByRole('button', { name: section });

  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'More' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Vale Spearman in the box up' }).click();
  await page.getByRole('button', { name: 'Move one Vale Spearman to built' }).click();
  await more('Tournament').click();
  await page.getByLabel('Name', { exact: true }).fill('Club night');
  await page.getByLabel('Players, one per line').fill('Ann\nBob\nCat\nDan');
  await page.getByRole('button', { name: 'Create tournament' }).click();
  await page.getByRole('button', { name: 'Start round 1' }).click();
  const [x, y] = await page.locator('.pairing').first().locator('input').all();
  await x!.fill('7');
  await y!.fill('2');
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('0 of 2 rounds played'); // the other game is still open
  await app.close();

  app = await launch(userData);
  page = await app.firstWindow();
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('region', { name: 'Collection summary' })).toContainText('3 models owned');
  await expect(page.getByRole('group', { name: 'Vale Spearman built' })).toContainText('1');
  await more('Tournament').click();
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Club night');
  await expect(page.locator('.pairing .result').first()).toContainText('wins'); // the entered result survived
  await app.close();
});

test('a backup saves as a real file and restores into a brand-new profile', async () => {
  const downloads = mkdtempSync(join(tmpdir(), 'muster-downloads-'));
  let app = await launch(mkdtempSync(join(tmpdir(), 'muster-data-')), { MUSTER_TEST_DOWNLOAD_DIR: downloads });
  let page = await app.firstWindow();

  await page.getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  await page.getByLabel('List name').fill('Desktop list');

  // Exporting a list as text also goes through the main process and a real file.
  await page.getByRole('button', { name: 'Download .txt' }).click();
  const listFile = join(downloads, 'Desktop_list.txt');
  await expect.poll(() => (existsSync(listFile) ? readFileSync(listFile, 'utf8') : ''), { timeout: 10_000 }).toContain('Aldric the Bold [90]');

  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'More' }).click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Vale Archer painted up' }).click();

  await page.getByRole('button', { name: /^Backup/ }).click();
  await page.getByRole('button', { name: 'Save backup file' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Backup saved' })).toBeVisible();
  // The save finishes a moment after the click; wait for a complete file (a partial one would not parse).
  const read = () => {
    const names = readdirSync(downloads).filter((n) => /^muster-backup-.*\.json$/.test(n)); // (a half-written file is *.json.part)
    if (names.length !== 1) return null;
    try { return { name: names[0]!, backup: JSON.parse(readFileSync(join(downloads, names[0]!), 'utf8')) }; } catch { return null; }
  };
  await expect.poll(read, { timeout: 10_000 }).not.toBeNull();
  const { name: fileName, backup } = read()!;
  const files = [fileName];
  expect(files[0]).toMatch(/^muster-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(backup).toMatchObject({ app: 'muster', format: 1 });
  expect(backup.data.lists.map((l: { name: string }) => l.name)).toEqual(['Desktop list']);
  await app.close();

  // A different profile, as on another computer.
  app = await launch(mkdtempSync(join(tmpdir(), 'muster-data-')));
  page = await app.firstWindow();
  await page.getByRole('button', { name: /^Backup/ }).click();
  await page.locator('input[type=file]').setInputFiles(join(downloads, files[0]!));
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Restored.' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('combobox', { name: 'Saved lists' }).locator('option')).toContainText(['New list', 'Desktop list']);
  await app.close();
});

test('a campaign company is kept across a restart and makes a list', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  let app = await launch(userData);
  let page = await app.firstWindow();
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'More' }).click();
  await page.getByRole('navigation', { name: 'More sections' }).getByRole('button', { name: 'Campaign' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Desktop watch');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  const roster = page.getByRole('region', { name: 'Roster' });
  const add = async (label: RegExp, name: string) => {
    const options = await roster.getByLabel('Unit to add').locator('option').allTextContents();
    await roster.getByLabel('Unit to add').selectOption({ label: options.find((t) => label.test(t))! });
    await roster.getByLabel('Name for the new model').fill(name);
    await roster.getByRole('button', { name: 'Add to the company' }).click();
  };
  await add(/^Aldric/, 'Aldric');
  await add(/^Vale Spearman/, 'Tam');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Experience of Aldric up' }).click();
  await app.close();

  app = await launch(userData);
  page = await app.firstWindow();
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'More' }).click();
  await page.getByRole('navigation', { name: 'More sections' }).getByRole('button', { name: 'Campaign' }).click();
  await expect(page.getByLabel('Campaign name')).toHaveValue('Desktop watch');
  await expect(page.getByRole('group', { name: 'Experience of Aldric' })).toContainText('4');
  await expect(page.getByRole('region', { name: 'Roster' })).toContainText('Veteran');
  await page.getByRole('button', { name: 'Make a list from this company' }).click();
  await expect(page.getByRole('region', { name: 'Company' }).getByRole('status')).toContainText('Desktop watch company is ready: 2 models, 98 points.');
  await app.close();
});

test('a game in progress resumes after the app is closed and reopened', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  let app = await launch(userData);
  let page = await app.firstWindow();

  await page.getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Add Vale Spearman' }).click();
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Game' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.getByRole('button', { name: 'Casualty: Vale Spearman 1' }).click();
  await page.getByRole('button', { name: 'Spend Might' }).click();
  await page.getByRole('button', { name: 'Your victory points up' }).click();
  await page.getByRole('button', { name: 'Next turn' }).click();
  await expect(page.getByRole('region', { name: 'Your force' }).getByRole('status')).toHaveText('1 more loss until broken');
  await app.close();

  app = await launch(userData);
  page = await app.firstWindow();
  await expect(page).toHaveURL(/#\/builder$|app:\/\/muster\/$/); // reopened on the default view
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Game' }).click();
  await expect(page.getByRole('region', { name: 'Your force' }).getByRole('status')).toHaveText('1 more loss until broken');
  await expect(page.getByRole('group', { name: 'Turn' })).toContainText('2');
  await expect(page.getByRole('group', { name: 'Your victory points' })).toContainText('1');
  await expect(page.getByRole('group', { name: 'Aldric the Bold Might' })).toContainText('2/3');
  await page.getByRole('button', { name: 'Undo' }).click(); // history survived too (undoes the turn change)
  await expect(page.getByRole('group', { name: 'Turn' })).toContainText('1');
  await app.close();
});

test('the page cannot navigate away from the app or open windows; only https links go to the OS', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  const log = join(userData, 'external.log');
  const app = await launch(userData, { MUSTER_TEST_EXTERNAL_LOG: log });
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Realm of the Vale', level: 2 })).toBeVisible();

  await page.evaluate(() => { window.location.href = 'https://example.com/nav'; });
  await expect.poll(() => (existsSync(log) ? readFileSync(log, 'utf8') : '')).toContain('https://example.com/nav');
  expect(page.url()).toBe('app://muster/');

  await page.evaluate(() => { window.open('https://example.com/popup'); });
  await expect.poll(() => readFileSync(log, 'utf8')).toContain('https://example.com/popup');
  expect(app.windows()).toHaveLength(1);

  // Anything that is not https is dropped, not handed to the operating system.
  await page.evaluate(() => { window.open('file:///etc/passwd'); window.open('javascript:alert(1)'); window.open('http://example.com/plain'); });
  await page.evaluate(() => { window.location.href = 'file:///etc/passwd'; });
  await page.waitForTimeout(500);
  expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(['https://example.com/nav', 'https://example.com/popup']);
  expect(page.url()).toBe('app://muster/');
  expect(app.windows()).toHaveLength(1);
  await app.close();
});

test('Print / PDF saves a real PDF of the list', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  const pdf = join(userData, 'out.pdf');
  const app = await launch(userData, { MUSTER_TEST_PDF_PATH: pdf });
  const page = await app.firstWindow();

  await page.getByRole('button', { name: '+ Warband' }).click();
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  await page.getByRole('button', { name: 'Print / PDF' }).click();
  // The file appears as soon as it is created, and on Windows it is empty until the write finishes: wait for real content.
  await expect.poll(() => (existsSync(pdf) ? statSync(pdf).size : 0), { timeout: 15_000 }).toBeGreaterThan(1500);

  const bytes = readFileSync(pdf);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(1500);
  try {
    // The print stylesheet shows the sheet, not the app chrome.
    const text = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
    expect(text).toContain('Aldric the Bold');
    expect(text).not.toContain('Add Aldric');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; // pdftotext not installed: the header check above still ran
  }
  await app.close();
});
