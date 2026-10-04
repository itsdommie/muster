// Present only inside the native apps (the desktop shell's preload.ts and the Android bridge in packages/mobile/src/bridge.ts).
interface Window {
  muster?: {
    /** Save or print the list sheet: a save dialog on desktop, the system print dialog (which can save a PDF) on Android. */
    savePdf(suggestedName: string): Promise<boolean>;
    /** Android: hand the list text to the system share sheet. Absent on desktop, where the list is saved as a file instead. */
    shareText?(name: string, text: string): Promise<boolean>;
  };
}
