import { contextBridge, ipcRenderer } from 'electron';

// The only doors from the page to the system: ask the main process to save the print sheet as a PDF, or a text file (a backup, a list).
contextBridge.exposeInMainWorld('muster', {
  savePdf: (suggestedName: string): Promise<boolean> => ipcRenderer.invoke('muster:save-pdf', suggestedName),
  saveFile: (name: string, mime: string, text: string): Promise<boolean> => ipcRenderer.invoke('muster:save-file', name, mime, text),
});
