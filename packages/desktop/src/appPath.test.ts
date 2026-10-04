import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppPath } from './appPath';

const root = resolve('/srv/web');

describe('resolveAppPath', () => {
  it('maps the root to index.html and normal assets under the root', () => {
    expect(resolveAppPath(root, '/')).toBe(resolve(root, 'index.html'));
    expect(resolveAppPath(root, '/assets/index-abc.js')).toBe(resolve(root, 'assets/index-abc.js'));
    expect(resolveAppPath(root, '/favicon.svg')).toBe(resolve(root, 'favicon.svg'));
  });

  it('rejects traversal, plain and encoded', () => {
    expect(resolveAppPath(root, '/../secret')).toBeNull();
    expect(resolveAppPath(root, '/assets/../../secret')).toBeNull();
    expect(resolveAppPath(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    expect(resolveAppPath(root, '/..%2fsecret')).toBeNull();
    expect(resolveAppPath(root, '/%2e%2e%5csecret')).toSatisfy((p: string | null) => p === null || p.startsWith(root));
  });

  it('rejects sibling directories that share the root as a prefix, bad escapes and NULs', () => {
    expect(resolveAppPath(root, '/../web-secrets/x')).toBeNull();
    expect(resolveAppPath(root, '/%E0%A4%A')).toBeNull();
    expect(resolveAppPath(root, '/a%00b')).toBeNull();
  });
});
