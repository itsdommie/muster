import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { _android as android, expect, test, type AndroidDevice, type Page } from '@playwright/test';

// The real APK on a real (emulated) Android: the web view, Capacitor, the print plugin and the share sheet.
const PKG = 'io.github.itsdommie.muster';
const APK = process.env.MUSTER_APK ?? resolve('packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk');

let device: AndroidDevice;

/** Give up on a step that has no timeout of its own (attaching to a web view can hang). The step is abandoned, not cancelled. */
const withTimeout = <T,>(work: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} did not finish within ${ms / 1000}s`)), ms))]);

/**
 * The one connected device, once it can really take an install. "Boot completed" is reported a little before the package service is
 * ready, so a test run started right after a cold boot can otherwise fail before it begins.
 */
async function readyDevice(): Promise<AndroidDevice> {
  const deadline = Date.now() + 180_000;
  for (;;) {
    const devices = await android.devices();
    if (devices.length > 1) throw new Error(`Expected exactly one adb device, found ${devices.length}.`);
    const [candidate] = devices;
    if (candidate) {
      try {
        const booted = (await candidate.shell('getprop sys.boot_completed')).toString().trim() === '1';
        if (booted && (await candidate.shell('pm path android')).toString().includes('package:')) return candidate;
      } catch {
        // not ready yet
      }
      await candidate.close().catch(() => undefined);
    }
    if (Date.now() > deadline) throw new Error('No adb device became ready within three minutes.');
    await new Promise((r) => setTimeout(r, 2000));
  }
}

test.beforeAll(async () => {
  // The first start after a cold boot is slow while the system's web view initialises, so allow for that here, once, and let the
  // tests themselves run against a warm device.
  test.setTimeout(600_000);
  if (!existsSync(APK)) throw new Error(`No APK at ${APK}. Run \`npm run apk\` first.`);
  device = await readyDevice();
  // Keep the screen on and unlocked for the whole run: a key press or a share sheet needs the app to be the window on top. These are
  // best-effort and time-limited, so a command that hangs on some image costs seconds and is named in the log, not the whole run.
  for (const cmd of ['svc power stayon true', 'settings put system screen_off_timeout 2147483647', 'input keyevent KEYCODE_WAKEUP', 'wm dismiss-keyguard']) {
    const started = Date.now();
    const done = await Promise.race([device.shell(cmd).then(() => true, () => false), new Promise<boolean>((r) => setTimeout(() => r(false), 20_000))]);
    console.log(`setup: ${cmd} -> ${done ? 'ok' : 'did not finish'} (${Date.now() - started} ms)`);
  }
  for (let attempt = 1; ; attempt++) {
    try {
      await device.installApk(APK);
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  console.log('setup: installed; warming up the app');
  // The first start after a cold boot can be very slow, and sometimes the web view never shows up: restart the app rather than wait.
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try {
      await device.shell(`am force-stop ${PKG}`);
      await device.shell(`am start -n ${PKG}/.MainActivity`);
      const view = await withTimeout(device.webView({ pkg: PKG }, { timeout: 90_000 }), 100_000, 'finding the web view');
      const warm = await withTimeout(view.page(), 60_000, 'opening the page');
      await expect(warm.getByRole('heading', { name: 'Muster', level: 1 })).toBeVisible({ timeout: 60_000 });
      console.log(`setup: warm-up attempt ${attempt} ok (${Math.round((Date.now() - started) / 1000)} s)`);
      break;
    } catch (error) {
      console.log(`setup: warm-up attempt ${attempt} failed after ${Math.round((Date.now() - started) / 1000)} s: ${String(error).split('\n')[0]}`);
      if (attempt === 3) throw error;
    }
  }
  await device.shell(`am force-stop ${PKG}`);
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || !device) return;
  const grab = async (cmd: string) => (await device.shell(cmd).catch((e: unknown) => String(e))).toString().trim();
  const lines = [
    `app process: ${(await grab(`pidof ${PKG}`)) || 'NOT RUNNING'}`,
    `focus: ${(await grab('dumpsys window | grep mCurrentFocus'))}`,
    `crash log:\n${(await grab('logcat -d -b crash -t 40')) || '(empty)'}`,
    `process deaths and ANRs:\n${(await grab(`logcat -d -t 600 | grep -iE "has died|Process ${PKG}|ANR in|FATAL|Force finishing|am_kill|am_proc_died|lowmemorykiller" | tail -15`)) || '(none)'}`,
  ];
  console.log(`\n--- device state after "${testInfo.title}" failed ---\n${lines.join('\n')}\n---`);
});

test.afterAll(async () => {
  await device?.close();
});

/**
 * Start the app from a clean slate (or, with `fresh: false`, from its saved data), and attach to its web view. Attaching occasionally
 * misses a freshly started process on a slow machine, so a missing web view means "start the app again", not "the app is broken".
 */
async function launch(fresh = true): Promise<Page> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    await device.shell(`am force-stop ${PKG}`);
    if (attempt === 0) await device.shell('logcat -c'); // so a failure report only shows this test
    if (fresh && attempt === 0) await device.shell(`pm clear ${PKG}`);
    await device.shell(`am start -n ${PKG}/.MainActivity`);
    try {
      const view = await withTimeout(device.webView({ pkg: PKG }, { timeout: 20_000 }), 30_000, 'finding the web view');
      const page = await withTimeout(view.page(), 30_000, 'opening the page');
      await expect(page.getByRole('heading', { name: 'Muster', level: 1 })).toBeVisible();
      // Being attachable is not the same as being on screen: key presses and system dialogs need the app to hold the focus.
      await expect.poll(focused, { timeout: 15_000 }).toContain(PKG);
      return page;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Android's web view writes page storage to disk a moment after a change (about two seconds in measurements), so a kill landing inside
 * that window loses the last edit. Tests that kill the app wait it out first; real exits (Back, Home, Recents) take longer than this.
 */
const STORAGE_FLUSH_MS = 4000;

const shell = async (cmd: string) => (await device.shell(cmd)).toString();
/** The window that currently has focus (the app, the print dialog, the share sheet…). */
const focused = async () => (await shell('dumpsys window')).split('\n').find((l) => l.includes('mCurrentFocus')) ?? '';
const sections = (page: Page) => page.getByRole('navigation', { name: 'Sections' });
const views = (page: Page) => page.getByRole('navigation', { name: 'Views' });

async function buildList(page: Page) {
  await page.getByRole('button', { name: '+ Warband' }).click();
  await sections(page).getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Add Aldric the Bold' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Add Vale Spearman' }).click();
  await sections(page).getByRole('button', { name: 'List' }).click();
  await page.getByLabel('List name').fill('Phone patrol');
}

test('is the right app, works fully offline, and asks for no permissions', async () => {
  const page = await launch();
  expect(page.url()).toBe('https://localhost/');
  const info = await shell(`dumpsys package ${PKG}`);
  expect(info).toContain('versionName=0.1.0');
  expect(info).not.toContain('android.permission.INTERNET');
  // On a phone the unit library is its own tab. If this fails, the numbers say whether the web view reported a desktop-sized page.
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, dpr: window.devicePixelRatio, narrow: matchMedia('(max-width: 960px)').matches }));
  expect(viewport, JSON.stringify(viewport)).toMatchObject({ narrow: true });
  await expect(page.getByRole('heading', { name: 'Realm of the Vale', level: 2 })).toBeHidden();
  await sections(page).getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('heading', { name: 'Realm of the Vale', level: 2 })).toBeVisible();
});

test('a list survives the app being killed and reopened', async () => {
  let page = await launch();
  await buildList(page);
  await sections(page).getByRole('button', { name: 'Summary' }).click();
  await expect(page.locator('.summary .points')).toContainText('114 / 500');

  await page.waitForTimeout(STORAGE_FLUSH_MS);
  page = await launch(false);
  await expect(page.getByLabel('List name')).toHaveValue('Phone patrol');
  await sections(page).getByRole('button', { name: 'Summary' }).click();
  await expect(page.locator('.summary .points')).toContainText('114 / 500');
  await expect(page.getByRole('status')).toHaveText('Legal list');
});

test('the system Back button steps back through the views', async () => {
  const page = await launch();
  await views(page).getByRole('button', { name: 'Units' }).click();
  await views(page).getByRole('button', { name: 'Rules' }).click();
  await expect(page).toHaveURL(/#\/rules$/);
  await device.shell('input keyevent KEYCODE_BACK');
  await expect(page).toHaveURL(/#\/units$/);
  await device.shell('input keyevent KEYCODE_BACK');
  await expect(page).toHaveURL('https://localhost/');
  expect(await focused()).toContain(PKG);

  // From the first screen, Back sends the app to the background but keeps it alive (and its screen as it was). A slow emulator can take
  // a while to bring its launcher forward, so wait for the app to stop being the resumed activity, and show the state if it never does.
  const resumed = async () => (await shell('dumpsys activity activities')).split('\n').filter((l) => /ResumedActivity/.test(l)).join('\n');
  await device.shell('input keyevent KEYCODE_BACK');
  try {
    await expect.poll(async () => (await resumed()).includes(PKG), { timeout: 30_000 }).toBe(false);
  } catch (error) {
    throw new Error(`Back at the first screen did not background the app. Resumed activity: ${await resumed()}\nFocus: ${await focused()}\n${String(error)}`);
  }
  expect((await shell(`pidof ${PKG}`)).trim()).not.toBe('');
});

test('copy works inside the web view', async () => {
  const page = await launch();
  await buildList(page);
  await sections(page).getByRole('button', { name: 'Summary' }).click();
  await page.getByRole('button', { name: 'Copy as text' }).click();
  // Either the clipboard accepted it, or the fallback dialog shows the text to copy by hand: never a silent failure.
  await expect(page.getByRole('button', { name: 'Copied' }).or(page.getByRole('dialog', { name: 'Copy list' }))).toBeVisible();
});

test('"Share list" opens the system share sheet with the list', async () => {
  const page = await launch();
  await buildList(page);
  await sections(page).getByRole('button', { name: 'Summary' }).click();
  await expect(page.getByRole('button', { name: 'Download .txt' })).toHaveCount(0); // a phone cannot save a file from a web page
  await page.getByRole('button', { name: 'Share list' }).click();
  await expect.poll(focused, { timeout: 15_000 }).toMatch(/Chooser|Resolver|Intent|sharesheet/i);
  expect(await focused()).not.toContain(PKG);
  await device.shell('input keyevent KEYCODE_BACK'); // dismiss the sheet
  await expect.poll(focused).toContain(PKG);
});

test('"Print / PDF" opens Android\'s print dialog for the list sheet', async () => {
  const page = await launch();
  await buildList(page);
  await sections(page).getByRole('button', { name: 'Summary' }).click();
  await page.getByRole('button', { name: 'Print / PDF' }).click();
  await expect.poll(focused, { timeout: 15_000 }).toMatch(/Print/i);
  await device.shell('input keyevent KEYCODE_BACK');
  await expect.poll(focused).toContain(PKG);
});

test('a game can be played and resumed after the app is killed', async () => {
  let page = await launch();
  await buildList(page);
  await views(page).getByRole('button', { name: 'Game' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.getByRole('button', { name: 'Casualty: Vale Spearman 1' }).click();
  await page.getByRole('button', { name: 'Spend Might' }).click();
  await page.getByRole('button', { name: 'Your victory points up' }).click();
  await expect(page.getByRole('region', { name: 'Your force' }).getByRole('status')).toHaveText('1 more loss until broken');

  await page.waitForTimeout(STORAGE_FLUSH_MS);
  page = await launch(false);
  await views(page).getByRole('button', { name: 'Game' }).click();
  await expect(page.getByRole('region', { name: 'Your force' }).getByRole('status')).toHaveText('1 more loss until broken');
  await expect(page.getByRole('group', { name: 'Aldric the Bold Might' })).toContainText('2/3');
  await expect(page.getByRole('group', { name: 'Your victory points' })).toContainText('1');
});

test('the fight calculator and squad simulation run on the phone', async () => {
  const page = await launch();
  await views(page).getByRole('button', { name: 'Fight' }).click();
  const a = page.getByRole('region', { name: 'Side A' });
  const b = page.getByRole('region', { name: 'Side B' });
  await a.getByLabel('Side A model 1', { exact: true }).selectOption({ label: 'Vale Spearman' });
  await b.getByLabel('Side B model 1', { exact: true }).selectOption({ label: 'Marsh Raider' });
  const result = page.getByRole('region', { name: 'Result' });
  await expect(result.getByRole('img', { name: /wins/ })).toHaveAttribute('aria-label', 'Vale Spearman wins 50.0%, Marsh Raider wins 50.0%');
  await page.getByRole('tab', { name: /Squad vs squad/ }).click();
  await expect(result.getByRole('status')).toContainText('6,000 battles', { timeout: 60_000 });
});

test('a tournament can be run on the phone, and the collection counts models', async () => {
  const page = await launch();
  await views(page).getByRole('button', { name: 'More' }).click();
  await page.getByRole('navigation', { name: 'More sections' }).getByRole('button', { name: 'Collection' }).click();
  await page.getByRole('button', { name: 'Vale Archer in the box up' }).click();
  await page.getByRole('button', { name: 'Vale Archer in the box up' }).click();
  await expect(page.getByRole('region', { name: 'Collection summary' })).toContainText('2 models owned');

  await page.getByRole('navigation', { name: 'More sections' }).getByRole('button', { name: 'Tournament' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Phone night');
  await page.getByLabel('Players, one per line').fill('Ann\nBob');
  await page.getByRole('button', { name: 'Create tournament' }).click();
  await page.getByRole('button', { name: 'Start round 1' }).click();
  const [a, b] = await page.locator('.pairing input').all();
  await a!.fill('5');
  await b!.pressSequentially('12'); // a two-digit score keeps its focus while typing
  await expect(b).toHaveValue('12');
  await expect(page.locator('.pairing .result')).toContainText('wins');
  await expect(page.getByRole('region', { name: 'Progress' })).toContainText('1 of 1 rounds played');
});

test('a backup is offered to the share sheet as a real file, and the file picker opens for restoring', async () => {
  const page = await launch();
  await views(page).getByRole('button', { name: 'More' }).click();
  await page.getByRole('navigation', { name: 'More sections' }).getByRole('button', { name: 'Collection' }).click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Vale Archer painted up' }).click();

  await page.getByRole('button', { name: /^Backup/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Backup and restore' });
  await dialog.getByRole('button', { name: 'Share backup file…' }).click();
  await expect.poll(focused, { timeout: 20_000 }).toMatch(/Chooser|Resolver|Intent|sharesheet/i);

  // The file the share sheet was handed exists in the app's cache and is a valid backup.
  // (`ls` prints in columns when it is not on a terminal, so split on any whitespace.)
  const name = (await shell(`run-as ${PKG} ls cache`)).split(/\s+/).find((l) => /^muster-backup-.*\.json$/.test(l));
  expect(name, 'a backup file in the cache').toBeTruthy();
  const backup = JSON.parse(await shell(`run-as ${PKG} cat cache/${name}`));
  expect(backup).toMatchObject({ app: 'muster', format: 1 });
  expect(backup.data.collections.sample['vale-archer'].painted).toBe(2);
  await device.shell('input keyevent KEYCODE_BACK');
  await expect.poll(focused).toContain(PKG);

  // Restoring opens Android's own file picker (a web view cannot show one by itself).
  await dialog.getByText('Choose backup file…').click();
  await expect.poll(focused, { timeout: 20_000 }).toMatch(/documentsui|picker|filepicker|files/i);
  await device.shell('input keyevent KEYCODE_BACK');
  await expect.poll(focused).toContain(PKG);
});

test('the screen is laid out for the phone: no sideways scroll, big touch targets', async () => {
  const page = await launch();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  for (const name of ['Builder', 'Units', 'Rules', 'Fight', 'Game']) {
    const box = (await views(page).getByRole('button', { name }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(40);
  }
});
