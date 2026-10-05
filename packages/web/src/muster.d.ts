// Present only inside the native apps (the desktop shell's preload.ts and the Android bridge in packages/mobile/src/bridge.ts).
type UpdateInfo = import('@muster/shared').UpdateInfo;

interface Window {
  muster?: {
    /** Save or print the list sheet: a save dialog on desktop, the system print dialog (which can save a PDF) on Android. */
    savePdf(suggestedName: string): Promise<boolean>;
    /** Android: hand the list text to the system share sheet. Absent on desktop, where the list is saved as a file instead. */
    shareText?(name: string, text: string): Promise<boolean>;
    /** Desktop: a Save dialog, then write the file. Android: the system share sheet (a web view cannot save files itself). Absent in a browser. */
    saveFile?(name: string, mime: string, text: string): Promise<boolean>;
    /** Desktop only: checking for, downloading and installing new versions, once the person has allowed it. */
    updates?: {
      info(): Promise<UpdateInfo>;
      check(): Promise<void>;
      download(): Promise<void>;
      install(): Promise<void>;
      setAuto(on: boolean): Promise<void>;
      onChange(cb: (info: UpdateInfo) => void): () => void;
    };
    /** Desktop only: menu commands the page should act on. */
    onMenu?(cb: (action: 'about') => void): () => void;
  };
}

/** The app's version, from packages/desktop/package.json at build time (kept equal to the Android app's). */
declare const __APP_VERSION__: string;
