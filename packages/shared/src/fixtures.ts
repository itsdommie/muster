import sample from '../../../packs/sample.json';
import { loadPack, type PackIndex } from './pack.js';

/** Test helper: the bundled sample pack, loaded and indexed. */
export function sampleIndex(): PackIndex {
  const r = loadPack(sample);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.index;
}

export const clone = <T>(v: T): T => structuredClone(v);
export { sample };
