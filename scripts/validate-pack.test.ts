import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const run = (file: string) => spawnSync('npx', ['tsx', 'scripts/validate-pack.ts', file], { encoding: 'utf8' });

describe('validate-pack script', () => {
  it('accepts the bundled sample pack', () => {
    const r = run('packs/sample.json');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('OK: Sample Pack');
  });

  it('exits non-zero and lists problems for a bad pack', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muster-'));
    const file = join(dir, 'bad.json');
    writeFileSync(file, JSON.stringify({ schema: 1, id: 'x' }));
    const r = run(file);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not a valid pack');
  });
});
