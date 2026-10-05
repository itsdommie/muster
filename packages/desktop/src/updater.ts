import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { autoUpdater } from 'electron-updater';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UpdateInfo, UpdateState } from '@muster/shared';
import { acceptTestFeed, parseSettings, shouldAsk, shouldCheckAutomatically, SIX_HOURS, updateSupport, type UpdateSettings } from './updatePolicy';

// Updating is opt-in. Until the person says yes, Muster makes no network request at all. When allowed it asks GitHub's public releases for a newer
// version, tells the page (which shows a banner), and downloads only when the person chooses. The download is checked against the checksum in the
// release's metadata, and it installs when the app next quits (or when the person chooses to restart now).

const settingsPath = () => join(app.getPath('userData'), 'updates.json');
const feed = acceptTestFeed(process.env.MUSTER_TEST_UPDATE_FEED);

let settings: UpdateSettings;
let state: UpdateState;
let started = false;

const support = () => updateSupport({ platform: process.platform, appImage: process.env.APPIMAGE, isPackaged: app.isPackaged, testFeed: feed !== null });

function load(): UpdateSettings {
  try { return parseSettings(readFileSync(settingsPath(), 'utf8')); } catch { return parseSettings(null); }
}
function save(): void {
  // A read-only profile only means the choice is not remembered; it must never break the app.
  try { writeFileSync(settingsPath(), JSON.stringify(settings)); } catch { /* not remembered */ }
}

export const updateInfo = (): UpdateInfo => ({ state, version: app.getVersion(), auto: settings.auto, ask: shouldAsk(settings, support()) });

function setState(next: UpdateState): void {
  state = next;
  const info = updateInfo();
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('muster:updates:changed', info);
}

async function check(): Promise<void> {
  const s = support();
  if (!s.ok) { setState({ phase: 'unsupported', reason: s.reason }); return; }
  if (state.phase === 'checking' || state.phase === 'downloading') return;
  setState({ phase: 'checking' });
  settings = { ...settings, lastChecked: Date.now() };
  save();
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.warn('Update check failed:', error instanceof Error ? error.message : error);
    setState({ phase: 'error', message: "Couldn't reach GitHub to look for updates. Check your internet connection and try again." });
  }
}

export function startUpdater(isTrusted: (e: IpcMainInvokeEvent) => boolean): void {
  if (started) return;
  started = true;
  settings = load();
  const s = support();
  state = s.ok ? { phase: 'idle' } : { phase: 'unsupported', reason: s.reason };

  if (feed) {
    autoUpdater.setFeedURL({ provider: 'generic', url: feed });
    autoUpdater.forceDevUpdateConfig = true;
  }
  autoUpdater.autoDownload = false; // the person chooses whether to download
  // Once downloaded, an update installs when the app is closed. (Never with a test feed: that would replace the program under test with the stand-in
  // download. A packaged run showed it does replace the file, which is the point.)
  autoUpdater.autoInstallOnAppQuit = feed === null;
  autoUpdater.allowPrerelease = true; // releases below 1.0 are marked pre-release on GitHub, and the default lookup skips those
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('update-available', (info) => setState({ phase: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => setState({ phase: 'none' }));
  autoUpdater.on('download-progress', (p) => { if (state.phase === 'downloading') setState({ ...state, percent: Math.round(p.percent) }); });
  autoUpdater.on('update-downloaded', (info) => setState({ phase: 'ready', version: info.version }));
  autoUpdater.on('error', (error) => {
    console.warn('Updater error:', error?.message ?? error);
    if (state.phase === 'checking' || state.phase === 'downloading') setState({ phase: 'error', message: "The update didn't work out. Check your internet connection and try again." });
  });

  // Every door from the page is checked to come from the app's own page.
  const guard = <A extends unknown[], R>(fn: (...a: A) => R, fallback: R) => (e: IpcMainInvokeEvent, ...a: A): R => (isTrusted(e) ? fn(...a) : fallback);
  ipcMain.handle('muster:updates:info', guard(updateInfo, updateInfo()));
  ipcMain.handle('muster:updates:check', guard(() => check(), Promise.resolve()));
  ipcMain.handle('muster:updates:download', guard(async () => {
    if (state.phase !== 'available') return;
    setState({ phase: 'downloading', version: state.version, percent: 0 });
    try { await autoUpdater.downloadUpdate(); } catch (error) {
      console.warn('Update download failed:', error instanceof Error ? error.message : error);
      setState({ phase: 'error', message: "The update didn't download. Check your internet connection and try again." });
    }
  }, Promise.resolve()));
  ipcMain.handle('muster:updates:install', guard(() => { if (state.phase === 'ready') autoUpdater.quitAndInstall(); }, undefined));
  ipcMain.handle('muster:updates:set-auto', guard((on: unknown) => {
    settings = { ...settings, auto: on === true };
    save();
    setState(state); // the question has been answered: tell the page
    if (settings.auto && support().ok) void check(); // a yes is followed by a visible look straight away
  }, undefined));

  // Quietly, a little after start, and again every few hours while the app stays open: only if allowed.
  const due = () => shouldCheckAutomatically(settings, support(), Date.now());
  // (Tests, which have a local feed, shorten the wait.)
  const wait = feed ? Number(process.env.MUSTER_TEST_UPDATE_DELAY_MS ?? 15_000) : 15_000;
  setTimeout(() => { if (due()) void check(); }, Number.isFinite(wait) ? wait : 15_000).unref();
  setInterval(() => { if (due()) void check(); }, SIX_HOURS).unref();
}

/** The Help menu's "Check for updates…": the page shows the result. */
export function checkNow(): void {
  void check();
}
