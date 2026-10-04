import { defineConfig } from '@playwright/test';

// Drives the real APK on a running emulator or phone (adb must see exactly one device). Build the APK first:
// `npm run apk` (the e2e:android script does).
export default defineConfig({
  testDir: 'e2e-android',
  workers: 1,
  timeout: 120_000,
});
