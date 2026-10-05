import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Uses the system Chromium when there is one (CHROMIUM_PATH to override), otherwise Playwright's own. Tests run against the production
// build, which is what ships on every platform; the Vite dev server proved unreliable under repeated reloads.
const PORT = 5273;

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) },
  },
  webServer: {
    command: 'npm run build:web && npm run preview -w @muster/web',
    env: { WEB_PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
  },
});
