import { resolve, sep } from 'node:path';

/**
 * Map the path of an app:// URL onto a file under `webRoot`, or null if it would escape it.
 * Kept separate from the Electron code so the traversal check is unit-tested.
 */
export function resolveAppPath(webRoot: string, urlPath: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const root = resolve(webRoot);
  const file = resolve(root, '.' + (rel.startsWith('/') ? rel : `/${rel}`));
  return file === root || file.startsWith(root + sep) ? file : null;
}
