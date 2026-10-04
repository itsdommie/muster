// Assembles the Android app's web content in dist/: the unchanged web UI plus the bridge that gives it print and share on a phone.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../..');
const dist = resolve(here, 'dist');

execSync('npm run build -w @muster/web', { stdio: 'inherit', cwd: root });
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(resolve(root, 'packages/web/dist'), dist, { recursive: true });

await build({
  entryPoints: [resolve(here, 'src/bridge.ts')],
  outfile: resolve(dist, 'bridge.js'),
  bundle: true, format: 'iife', target: 'es2022', sourcemap: false, minify: true, logLevel: 'warning',
});

// The page makes no network requests and runs no inline script, so say so to the web view.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
  "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');

// The bridge must run before the app, so it goes in as a classic script ahead of the module script.
const indexPath = resolve(dist, 'index.html');
writeFileSync(
  indexPath,
  readFileSync(indexPath, 'utf8')
    .replace('<script type="module"', '<script src="./bridge.js"></script>\n    <script type="module"')
    .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
);
