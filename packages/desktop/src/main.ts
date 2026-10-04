import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell, type IpcMainInvokeEvent } from 'electron';
import { appendFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveAppPath } from './appPath';

// Tests (and portable installs) can relocate all app data.
if (process.env.MUSTER_USER_DATA) app.setPath('userData', process.env.MUSTER_USER_DATA);

const ORIGIN = 'app://muster';
// Everything is local: no network access from the page at all.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

// Must run before the app is ready.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const webRoot = app.isPackaged ? join(process.resourcesPath, 'web') : resolve(__dirname, '../../web/dist');

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const file = url.host === 'muster' ? resolveAppPath(webRoot, url.pathname) : null;
    if (!file) return new Response('Forbidden', { status: 403 });
    try {
      const res = await net.fetch(pathToFileURL(file).toString());
      const headers = new Headers(res.headers);
      headers.set('content-security-policy', CSP);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

const isAppUrl = (url: string): boolean => url === ORIGIN || url.startsWith(`${ORIGIN}/`);

/** Only https links ever leave the app, and they go to the user's own browser. */
function openExternalIfSafe(url: string) {
  if (!/^https:\/\//i.test(url)) return;
  // Tests record the request instead of launching a browser.
  if (process.env.MUSTER_TEST_EXTERNAL_LOG) appendFileSync(process.env.MUSTER_TEST_EXTERNAL_LOG, `${url}\n`);
  else void shell.openExternal(url);
}

let mainWindow: BrowserWindow | undefined;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 480,
    title: 'Muster',
    backgroundColor: '#15130f',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { mainWindow = undefined; });

  // The page may only ever show the app itself; links go to the user's browser.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      openExternalIfSafe(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url);
    return { action: 'deny' };
  });

  void win.loadURL(`${ORIGIN}/`);
}

/** Save the print sheet as a PDF. Only the app's own pages may ask. */
async function savePdf(event: IpcMainInvokeEvent, suggestedName: unknown): Promise<boolean> {
  if (!event.senderFrame || !isAppUrl(event.senderFrame.url)) return false;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  const base = (typeof suggestedName === 'string' ? suggestedName : 'list').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'list';
  // Tests choose the destination instead of a dialog.
  let target = process.env.MUSTER_TEST_PDF_PATH;
  if (!target) {
    const r = await dialog.showSaveDialog(win, { defaultPath: `${base}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return false;
    target = r.filePath;
  }
  const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: false });
  await writeFile(target, pdf);
  return true;
}

/**
 * Save a text file from the page (a backup, a list). Done here and not as a browser download, because a download counts as unfinished for
 * a moment after the bytes are written (Windows scans it), and closing the app in that moment cancels it and removes the file. This
 * answers only once the file is on disk.
 */
async function saveFile(event: IpcMainInvokeEvent, name: unknown, _mime: unknown, text: unknown): Promise<boolean> {
  if (!event.senderFrame || !isAppUrl(event.senderFrame.url)) return false;
  if (typeof name !== 'string' || typeof text !== 'string' || text.length > 50 * 1024 * 1024) return false;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  const safe = name.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'muster-file';
  // Tests choose the folder instead of a dialog.
  let target = process.env.MUSTER_TEST_DOWNLOAD_DIR ? join(process.env.MUSTER_TEST_DOWNLOAD_DIR, safe) : undefined;
  if (!target) {
    const ext = extname(safe).slice(1);
    const r = await dialog.showSaveDialog(win, { defaultPath: safe, ...(ext ? { filters: [{ name: ext.toUpperCase(), extensions: [ext] }] } : {}) });
    if (r.canceled || !r.filePath) return false;
    target = r.filePath;
  }
  await writeFile(target, text, 'utf8');
  return true;
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: 'File', submenu: [{ role: 'quit' }] },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' as const }, { role: 'reload' as const }, { role: 'toggleDevTools' as const }]),
      ],
    },
    {
      label: 'Help',
      submenu: [{
        label: 'About Muster',
        click: () => void dialog.showMessageBox({
          type: 'info',
          title: 'About Muster',
          message: `Muster ${app.getVersion()}`,
          detail: 'An unofficial, non-commercial fan project. It contains no game data and is not affiliated with or endorsed by any publisher.',
        }),
      }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// One window; a second launch focuses it.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    registerAppProtocol();
    // The page needs nothing beyond copying text to the clipboard.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write');
    ipcMain.handle('muster:save-pdf', savePdf);
    ipcMain.handle('muster:save-file', saveFile);
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
