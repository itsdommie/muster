import { App } from '@capacitor/app';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { registerPlugin } from '@capacitor/core';
import { Share } from '@capacitor/share';

/**
 * Runs before the app. A phone's web view can neither print nor download a file, so this gives the web UI the same two hooks the
 * desktop app has (see packages/web/src/muster.d.ts), backed by Android: the system print dialog (which can save a PDF) and the
 * system share sheet.
 */
const MusterPrint = registerPlugin<{ print(options: { name: string }): Promise<void> }>('MusterPrint');

window.muster = {
  async savePdf(name: string): Promise<boolean> {
    try {
      await MusterPrint.print({ name });
      return true;
    } catch {
      return false;
    }
  },
  async saveFile(name: string, _mime: string, text: string): Promise<boolean> {
    // A web view cannot write a file the person can find, so write it to the app's cache and offer it to the share sheet (save to Drive,
    // send to another phone, put it in Files...).
    try {
      const safe = name.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'muster-file.json';
      const { uri } = await Filesystem.writeFile({ path: safe, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: safe, files: [uri], dialogTitle: 'Save backup' });
      return true;
    } catch {
      return false; // dismissed, or nothing to share with
    }
  },
  async shareText(name: string, text: string): Promise<boolean> {
    try {
      await Share.share({ title: name, text, dialogTitle: 'Share list' });
      return true;
    } catch {
      return false; // dismissed, or nothing to share with
    }
  },
};

// Back steps through the views (they live in the URL hash, so the web view's history has them). From the first screen it sends the app
// to the background, as Android apps do, rather than closing it and dropping the screen the person was on.
void App.addListener('backButton', ({ canGoBack }) => {
  if (canGoBack) window.history.back();
  else void App.minimizeApp();
});
