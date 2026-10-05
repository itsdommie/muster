import { contextBridge, ipcRenderer } from 'electron';
import type { UpdateInfo } from '@muster/shared';

// The only doors from the page to the system: ask the main process to save the print sheet as a PDF, or a text file (a backup, a list).
contextBridge.exposeInMainWorld('muster', {
  savePdf: (suggestedName: string): Promise<boolean> => ipcRenderer.invoke('muster:save-pdf', suggestedName),
  saveFile: (name: string, mime: string, text: string): Promise<boolean> => ipcRenderer.invoke('muster:save-file', name, mime, text),
  updates: {
    info: (): Promise<UpdateInfo> => ipcRenderer.invoke('muster:updates:info'),
    check: (): Promise<void> => ipcRenderer.invoke('muster:updates:check'),
    download: (): Promise<void> => ipcRenderer.invoke('muster:updates:download'),
    install: (): Promise<void> => ipcRenderer.invoke('muster:updates:install'),
    setAuto: (on: boolean): Promise<void> => ipcRenderer.invoke('muster:updates:set-auto', on),
    onChange: (cb: (info: UpdateInfo) => void): (() => void) => {
      const handler = (_e: unknown, info: UpdateInfo) => cb(info);
      ipcRenderer.on('muster:updates:changed', handler);
      return () => { ipcRenderer.removeListener('muster:updates:changed', handler); };
    },
  },
  /** Menu commands the page should act on (the Help menu's About and Check for updates). */
  onMenu: (cb: (action: 'about') => void): (() => void) => {
    const handler = (_e: unknown, action: 'about') => cb(action);
    ipcRenderer.on('muster:menu', handler);
    return () => { ipcRenderer.removeListener('muster:menu', handler); };
  },
});
