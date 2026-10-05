import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { cpSync, statSync } from 'node:fs';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

// Updating, against a stand-in for GitHub on this machine. The app only honours a feed that points at the local machine, so none of this can
// reach the real network. A real install-and-restart is not exercised here (it would replace the program under test); everything up to a
// downloaded, checksum-verified update is.
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
const ext = process.platform === 'win32' ? 'exe' : 'AppImage';
/** The version under test: whatever packages/desktop/package.json says, so a release bump needs no change here. */
const current = (JSON.parse(readFileSync(join(process.cwd(), 'packages/desktop/package.json'), 'utf8')) as { version: string }).version;

interface Feed { url: string; requests: string[]; close(): Promise<void> }

/** A fake release feed advertising `version`, with a small installer file whose checksum is correct. */
async function feed(version: string): Promise<Feed> {
  const bytes = Buffer.alloc(400_000, 7);
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  const file = `Muster-${version}.${ext}`;
  const yml = `version: ${version}\nfiles:\n  - url: ${file}\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: ${file}\nsha512: ${sha512}\nreleaseDate: '2026-10-05T00:00:00.000Z'\n`;
  const requests: string[] = [];
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!).replace(/^\//, '');
    requests.push(path);
    if (path === 'latest.yml' || path === 'latest-linux.yml') { res.writeHead(200, { 'content-type': 'text/yaml' }); res.end(yml); return; }
    if (path === file) { res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': bytes.length }); res.end(bytes); return; }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests, close: () => new Promise((r) => server.close(() => r())) };
}

// Downloads land in a throwaway folder, not the real cache. An unpackaged run has no AppImage, which the Linux updater needs to know which file
// it would replace; a packaged one gets the real thing from the AppImage runtime.
const launch = (userData: string, feedUrl: string): Promise<ElectronApplication> =>
  electron.launch({
    executablePath: exe ?? (require('electron') as string),
    args: [...(exe ? [] : ['packages/desktop']), '--no-sandbox'],
    env: {
      ...process.env, MUSTER_USER_DATA: userData, MUSTER_TEST_UPDATE_FEED: feedUrl, MUSTER_TEST_UPDATE_DELAY_MS: '300',
      XDG_CACHE_HOME: join(userData, 'cache'),
      ...(exe ? {} : { APPIMAGE: join(userData, 'Muster-dev.AppImage') }),
    },
  });

const banner = (page: Page) => page.getByRole('region', { name: 'Updates' });
const settingsFile = (userData: string) => join(userData, 'updates.json');
const saved = (userData: string) => (existsSync(settingsFile(userData)) ? (JSON.parse(readFileSync(settingsFile(userData), 'utf8')) as { auto: boolean | null; lastChecked: number | null }) : null);

test('asks first, and makes no network request until the answer is yes', async () => {
  const f = await feed('99.0.0');
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  let app = await launch(userData, f.url);
  let page = await app.firstWindow();

  await expect(banner(page)).toContainText('Muster can look for new versions on GitHub');
  await expect(banner(page)).toContainText('only time it uses the internet');
  await page.waitForTimeout(2500); // well past the (shortened) startup delay
  expect(f.requests).toEqual([]); // nothing asked, nothing sent

  await banner(page).getByRole('button', { name: 'No thanks' }).click();
  await expect(banner(page)).toHaveCount(0);
  await expect.poll(() => saved(userData)?.auto).toBe(false);
  await page.waitForTimeout(1000);
  expect(f.requests).toEqual([]);
  await app.close();

  // Remembered: not asked again, still silent.
  app = await launch(userData, f.url);
  page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Muster', level: 1 })).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(banner(page)).toHaveCount(0);
  expect(f.requests).toEqual([]);
  await app.close();
  await f.close();
});

test('with permission it looks, offers the new version, downloads it and verifies it', async () => {
  const f = await feed('99.0.0');
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  const app = await launch(userData, f.url);
  const page = await app.firstWindow();

  await banner(page).getByRole('button', { name: 'Check automatically' }).click();
  await expect(banner(page)).toContainText('Muster 99.0.0 is available');
  expect(f.requests.some((r) => /^latest(-linux)?\.yml$/.test(r))).toBe(true);
  expect(f.requests.some((r) => r.endsWith(`.${ext}`))).toBe(false); // offered, not downloaded: that is the person's choice
  expect(saved(userData)).toMatchObject({ auto: true });
  expect(typeof saved(userData)?.lastChecked).toBe('number');

  await banner(page).getByRole('button', { name: 'Download' }).click();
  await expect(banner(page)).toContainText('is ready', { timeout: 30_000 });
  await expect(banner(page)).toContainText('installs when you close Muster');
  await expect(banner(page).getByRole('button', { name: 'Restart and install' })).toBeVisible();
  expect(f.requests.some((r) => r === `Muster-99.0.0.${ext}`)).toBe(true);

  await banner(page).getByRole('button', { name: 'Later' }).click();
  await expect(banner(page)).toHaveCount(0);
  await app.close();
  await f.close();
});

test('"Not now" hides an offer for the session, and the About dialog still shows it', async () => {
  const f = await feed('99.0.0');
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  writeFileSync(settingsFile(userData), JSON.stringify({ auto: true, lastChecked: null }));
  const app = await launch(userData, f.url);
  const page = await app.firstWindow();
  await expect(banner(page)).toContainText('Muster 99.0.0 is available'); // permission was already given: it looks on its own
  await banner(page).getByRole('button', { name: 'Not now' }).click();
  await expect(banner(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'About' }).click();
  const about = page.getByRole('dialog', { name: 'About Muster' });
  await expect(about).toContainText(`Version ${current}`);
  await expect(about.getByRole('status')).toContainText('Muster 99.0.0 is available');
  await expect(about.getByLabel('Check for updates automatically')).toBeChecked();
  await expect(about.getByRole('button', { name: 'Download Muster 99.0.0' })).toBeVisible();
  await app.close();
  await f.close();
});

test('a manual check from About works even with automatic checks off, and can switch them on', async () => {
  const f = await feed('99.0.0');
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  writeFileSync(settingsFile(userData), JSON.stringify({ auto: false, lastChecked: null }));
  const app = await launch(userData, f.url);
  const page = await app.firstWindow();
  await page.waitForTimeout(1500);
  expect(f.requests).toEqual([]); // off means off

  await page.getByRole('button', { name: 'About' }).click();
  const about = page.getByRole('dialog', { name: 'About Muster' });
  await expect(about.getByLabel('Check for updates automatically')).not.toBeChecked();
  await expect(about).toContainText('While this is off, Muster makes no network requests at all.');
  await about.getByRole('button', { name: 'Check for updates' }).click();
  await expect(about.getByRole('status')).toContainText('Muster 99.0.0 is available');
  expect(f.requests.length).toBeGreaterThan(0);

  await about.getByLabel('Check for updates automatically').check();
  await expect.poll(() => saved(userData)?.auto).toBe(true);
  await expect(about).toContainText('at most every six hours');
  await app.close();
  await f.close();
});

test('says when you are already up to date', async () => {
  const f = await feed(current); // the version running
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  writeFileSync(settingsFile(userData), JSON.stringify({ auto: false, lastChecked: null }));
  const app = await launch(userData, f.url);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'About' }).click();
  await page.getByRole('dialog', { name: 'About Muster' }).getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByRole('dialog', { name: 'About Muster' }).getByRole('status')).toContainText(`You are up to date (${current})`);
  await expect(banner(page).filter({ hasText: 'available' })).toHaveCount(0);
  await app.close();
  await f.close();
});

test('an unreachable feed is explained in About and does not nag with a banner', async () => {
  const f = await feed('99.0.0');
  const dead = f.url;
  await f.close(); // nothing listens there any more
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  writeFileSync(settingsFile(userData), JSON.stringify({ auto: true, lastChecked: null }));
  const app = await launch(userData, dead);
  const page = await app.firstWindow();
  await page.waitForTimeout(3000); // the automatic check has run and failed
  await expect(banner(page)).toHaveCount(0); // being offline is not worth interrupting anyone for

  await page.getByRole('button', { name: 'About' }).click();
  const about = page.getByRole('dialog', { name: 'About Muster' });
  await expect(about.getByRole('status')).toContainText("Couldn't reach GitHub");
  await expect(about.getByRole('button', { name: 'Check for updates' })).toBeVisible(); // and it can try again
  await app.close();
});

test('the Help menu opens About', async () => {
  const f = await feed('99.0.0');
  const userData = mkdtempSync(join(tmpdir(), 'muster-data-'));
  writeFileSync(settingsFile(userData), JSON.stringify({ auto: false, lastChecked: null }));
  const app = await launch(userData, f.url);
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Muster', level: 1 })).toBeVisible();
  await app.evaluate(({ Menu }) => {
    const help = Menu.getApplicationMenu()!.items.find((i) => i.label === 'Help')!;
    help.submenu!.items.find((i) => i.label === 'About Muster')!.click();
  });
  await expect(page.getByRole('dialog', { name: 'About Muster' })).toBeVisible();
  await app.close();
  await f.close();
});
