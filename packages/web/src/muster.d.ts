// Present only inside the desktop app (see packages/desktop/src/preload.ts).
interface Window {
  muster?: { savePdf(suggestedName: string): Promise<boolean> };
}
