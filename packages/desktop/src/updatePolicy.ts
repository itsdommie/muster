// Pure rules about updating, kept free of Electron so they can be unit-tested. Muster makes no network requests unless the person has said
// it may check for updates; everything here is about when that is allowed and what counts as an update.

export interface UpdateEnv {
  platform: NodeJS.Platform;
  /** Set by the AppImage runtime: the path of the running AppImage. */
  appImage: string | undefined;
  isPackaged: boolean;
  /** A loopback feed given for tests (see acceptTestFeed). */
  testFeed: boolean;
}

export type Support = { ok: true } | { ok: false; reason: 'development' | 'package-manager' | 'platform' };

/**
 * Self-updating works for the Windows installer and the Linux AppImage. A .deb is managed by the system's package tools, other platforms
 * are not shipped, and a development run has nothing to update (unless a test feed stands in for GitHub).
 */
export function updateSupport(e: UpdateEnv): Support {
  if (e.testFeed) return { ok: true };
  if (!e.isPackaged) return { ok: false, reason: 'development' };
  if (e.platform === 'win32') return { ok: true };
  if (e.platform === 'linux') return e.appImage ? { ok: true } : { ok: false, reason: 'package-manager' };
  return { ok: false, reason: 'platform' };
}

export interface UpdateSettings {
  /** true: check automatically; false: never unless asked; null: not asked yet. */
  auto: boolean | null;
  /** When the last automatic or manual check ran, in ms since the epoch. */
  lastChecked: number | null;
}

export const DEFAULT_SETTINGS: UpdateSettings = { auto: null, lastChecked: null };

/** Read the saved settings, whatever state the file is in. Anything unreadable means "never asked", which is the quiet default. */
export function parseSettings(raw: string | null | undefined): UpdateSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const j = JSON.parse(raw) as { auto?: unknown; lastChecked?: unknown };
    return {
      auto: typeof j.auto === 'boolean' ? j.auto : null,
      lastChecked: typeof j.lastChecked === 'number' && Number.isFinite(j.lastChecked) && j.lastChecked > 0 ? j.lastChecked : null,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Automatic checks happen only if allowed, supported, and not too soon after the last one (people launch the app often). */
export function shouldCheckAutomatically(s: UpdateSettings, support: Support, now: number, every = SIX_HOURS): boolean {
  if (!support.ok || s.auto !== true) return false;
  if (s.lastChecked === null) return true;
  // A clock set back must not stop checks forever.
  return s.lastChecked > now || now - s.lastChecked >= every;
}

/** Should the app ask whether it may check? Once, and only where updating is possible at all. */
export const shouldAsk = (s: UpdateSettings, support: Support): boolean => support.ok && s.auto === null;

/** True if `candidate` is a newer version than `current`. A release candidate sorts before the release it leads to. */
export function isNewer(candidate: string, current: string): boolean {
  const split = (v: string) => {
    const [core = '', pre] = v.replace(/^v/, '').split('-', 2);
    return { nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre: pre ?? null };
  };
  const a = split(candidate);
  const b = split(current);
  for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i++) {
    const x = a.nums[i] ?? 0;
    const y = b.nums[i] ?? 0;
    if (x !== y) return x > y;
  }
  if (a.pre === b.pre) return false;
  if (a.pre === null) return true; // 1.0.0 is newer than 1.0.0-rc1
  if (b.pre === null) return false;
  return a.pre > b.pre;
}

/**
 * A feed address given through the environment, honoured only when it points at this machine. That is enough for tests to stand in for GitHub
 * and means nobody can redirect real updates elsewhere with an environment variable.
 */
export function acceptTestFeed(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]') ? url : null;
  } catch {
    return null;
  }
}
