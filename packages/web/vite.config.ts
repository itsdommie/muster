import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const version = (JSON.parse(readFileSync(new URL('../desktop/package.json', import.meta.url), 'utf8')) as { version: string }).version;

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Relative asset paths so the same build works under Electron (file://) and Capacitor.
  base: './',
  server: { host: '127.0.0.1', port: Number(process.env.WEB_PORT ?? 5173) },
  preview: { host: '127.0.0.1', port: Number(process.env.WEB_PORT ?? 4173), strictPort: true },
});
