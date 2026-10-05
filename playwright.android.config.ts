import { defineConfig } from '@playwright/test';

// Drives the real APK on a running emulator or phone (adb must see exactly one device). Build the APK first:
// `npm run apk` (the e2e:android script does).
export default defineConfig({
  testDir: 'e2e-android',
  workers: 1,
  timeout: 120_000,
  // A hosted CI emulator is sometimes killed under memory pressure mid-test (the app process vanishes with an empty crash log while Google's
  // services die too, and which test it hits varies run to run). Retry there: a real failure fails every attempt, and each attempt starts clean.
  retries: process.env.CI ? 2 : 0,
});
