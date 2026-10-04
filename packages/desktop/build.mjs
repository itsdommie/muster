// Builds the web UI, then bundles the Electron main process and preload into single CJS files,
// so the packaged app needs no node_modules.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';

execSync('npm run build -w @muster/web', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });

await build({
  entryPoints: { main: 'src/main.ts', preload: 'src/preload.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
});
