import { contextBridge, ipcRenderer } from 'electron';

// The only door from the page to the system: ask the main process to save the current print sheet as a PDF.
contextBridge.exposeInMainWorld('muster', {
  savePdf: (suggestedName: string): Promise<boolean> => ipcRenderer.invoke('muster:save-pdf', suggestedName),
});
