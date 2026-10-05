import { describe, expect, it } from 'vitest';
import { acceptTestFeed, isNewer, parseSettings, shouldAsk, shouldCheckAutomatically, SIX_HOURS, updateSupport, type Support, type UpdateEnv } from './updatePolicy';

const env = (over: Partial<UpdateEnv> = {}): UpdateEnv => ({ platform: 'linux', appImage: '/x/Muster.AppImage', isPackaged: true, testFeed: false, ...over });
const ok: Support = { ok: true };

describe('updateSupport', () => {
  it('works for the Windows installer and the Linux AppImage', () => {
    expect(updateSupport(env({ platform: 'win32', appImage: undefined }))).toEqual(ok);
    expect(updateSupport(env())).toEqual(ok);
  });

  it('leaves a .deb to the package manager, and development builds alone', () => {
    expect(updateSupport(env({ appImage: undefined }))).toEqual({ ok: false, reason: 'package-manager' });
    expect(updateSupport(env({ isPackaged: false }))).toEqual({ ok: false, reason: 'development' });
    expect(updateSupport(env({ platform: 'darwin' }))).toEqual({ ok: false, reason: 'platform' });
  });

  it('a test feed makes an unpackaged run updatable', () => {
    expect(updateSupport(env({ isPackaged: false, appImage: undefined, testFeed: true }))).toEqual(ok);
  });
});

describe('settings', () => {
  it('reads what was saved', () => {
    expect(parseSettings('{"auto":true,"lastChecked":1700000000000}')).toEqual({ auto: true, lastChecked: 1700000000000 });
    expect(parseSettings('{"auto":false}')).toEqual({ auto: false, lastChecked: null });
  });

  it('treats anything unreadable as "not asked yet", never as consent', () => {
    for (const raw of [null, undefined, '', 'not json', '[]', '{"auto":"yes"}', '{"auto":1}', '{"lastChecked":"soon"}', '{"lastChecked":-5}', '{"lastChecked":1e999}']) {
      const s = parseSettings(raw as string | null | undefined);
      expect(s.auto, String(raw)).toBeNull();
      expect(s.lastChecked, String(raw)).toBeNull();
    }
    expect(parseSettings('{"auto":"yes","lastChecked":5}')).toEqual({ auto: null, lastChecked: 5 });
  });
});

describe('when to check', () => {
  const now = 1_800_000_000_000;

  it('never without consent, and never where updating is not possible', () => {
    expect(shouldCheckAutomatically({ auto: null, lastChecked: null }, ok, now)).toBe(false);
    expect(shouldCheckAutomatically({ auto: false, lastChecked: null }, ok, now)).toBe(false);
    expect(shouldCheckAutomatically({ auto: true, lastChecked: null }, { ok: false, reason: 'development' }, now)).toBe(false);
  });

  it('checks when allowed and never checked, then waits six hours', () => {
    expect(shouldCheckAutomatically({ auto: true, lastChecked: null }, ok, now)).toBe(true);
    expect(shouldCheckAutomatically({ auto: true, lastChecked: now - 1000 }, ok, now)).toBe(false);
    expect(shouldCheckAutomatically({ auto: true, lastChecked: now - SIX_HOURS + 1 }, ok, now)).toBe(false);
    expect(shouldCheckAutomatically({ auto: true, lastChecked: now - SIX_HOURS }, ok, now)).toBe(true);
  });

  it('a clock set back does not stop checks for ever', () => {
    expect(shouldCheckAutomatically({ auto: true, lastChecked: now + 10 * SIX_HOURS }, ok, now)).toBe(true);
  });

  it('asks once, only where updating is possible', () => {
    expect(shouldAsk({ auto: null, lastChecked: null }, ok)).toBe(true);
    expect(shouldAsk({ auto: true, lastChecked: null }, ok)).toBe(false);
    expect(shouldAsk({ auto: false, lastChecked: null }, ok)).toBe(false);
    expect(shouldAsk({ auto: null, lastChecked: null }, { ok: false, reason: 'package-manager' })).toBe(false);
  });
});

describe('isNewer', () => {
  it('compares numbers, not strings', () => {
    expect(isNewer('0.10.0', '0.9.0')).toBe(true);
    expect(isNewer('0.2.0', '0.10.0')).toBe(false);
    expect(isNewer('1.0.0', '0.99.99')).toBe(true);
    expect(isNewer('0.2.1', '0.2.0')).toBe(true);
  });

  it('is false for the same version and for older ones', () => {
    expect(isNewer('0.2.0', '0.2.0')).toBe(false);
    expect(isNewer('v0.2.0', '0.2.0')).toBe(false);
    expect(isNewer('0.1.9', '0.2.0')).toBe(false);
    expect(isNewer('0.2', '0.2.0')).toBe(false);
  });

  it('puts a release after its own release candidates', () => {
    expect(isNewer('1.0.0', '1.0.0-rc1')).toBe(true);
    expect(isNewer('1.0.0-rc1', '1.0.0')).toBe(false);
    expect(isNewer('1.0.0-rc2', '1.0.0-rc1')).toBe(true);
    expect(isNewer('1.0.1-rc1', '1.0.0')).toBe(true);
  });
});

describe('acceptTestFeed', () => {
  it('accepts only addresses on this machine', () => {
    expect(acceptTestFeed('http://127.0.0.1:5000/feed')).toBe('http://127.0.0.1:5000/feed');
    expect(acceptTestFeed('http://localhost:8080')).toBe('http://localhost:8080');
    expect(acceptTestFeed('https://example.com/feed')).toBeNull();
    expect(acceptTestFeed('http://127.0.0.1.evil.example/feed')).toBeNull();
    expect(acceptTestFeed('http://evil.example/127.0.0.1')).toBeNull();
    expect(acceptTestFeed('ftp://127.0.0.1/feed')).toBeNull();
    expect(acceptTestFeed('file:///etc/passwd')).toBeNull();
    expect(acceptTestFeed('not a url')).toBeNull();
    expect(acceptTestFeed('')).toBeNull();
    expect(acceptTestFeed(undefined)).toBeNull();
  });
});
