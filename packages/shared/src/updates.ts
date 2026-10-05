// What the desktop app tells the page about updates. Types only: the checking itself happens in the desktop shell.

export type UpdateState =
  | { phase: 'unsupported'; reason: 'development' | 'package-manager' | 'platform' }
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'none' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string };

export interface UpdateInfo {
  state: UpdateState;
  /** The version running now. */
  version: string;
  /** true: checks automatically; false: only when asked; null: the person has not been asked yet. */
  auto: boolean | null;
  /** Whether the person still has to be asked about checking. */
  ask: boolean;
}
