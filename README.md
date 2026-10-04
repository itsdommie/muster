# Muster

A local-first companion app for tabletop skirmish army building. Build lists with live points and legality checks, look up profiles and rules, and take the list to the table.

**Muster ships no game data.** Armies, units and rules live in JSON *data packs* you load yourself ([format](docs/pack-format.md)); a small invented sample pack is bundled so you can try it. See [NOTICE.md](NOTICE.md).

What it does today: build and validate army lists, browse every unit with a search language (`f>=5 r:terror army:vale or is:hero`, help is built into the Units view), read the rules and wargear reference, export/import lists, print or save a PDF, keep a collection and painting queue (and check a list against what you own), browse scenarios, run a Swiss tournament for a club night, track a game at the table (wounds, Might/Will/Fate, break point, turn, victory points, undo, resume), and work out fight odds (exact one-on-one, simulated squad vs squad) using the combat rules in your pack.

Targets: Windows, Linux and Android. See [PLAN.md](PLAN.md) for the roadmap and status.

## Develop

```
npm install
npm run dev:web        # http://127.0.0.1:5173
npm test               # engine unit tests
npm run e2e            # Playwright against system Chromium (CHROMIUM_PATH to override)
npm run typecheck
npm run validate-pack -- packs/sample.json
```

| Package | Role |
|---|---|
| `packages/shared` | Pure TypeScript rules engine: pack schema, list model, validator, text import/export. |
| `packages/web` | React + Vite UI shared by every platform. |
| `packages/mobile` | Capacitor wrapper that builds the Android APK around the same UI. No permissions at all (it cannot touch the network); print and share go through two small native bridges. |
| `packages/desktop` | Electron shell for Windows and Linux. Serves the built UI from a sandboxed `app://` protocol (no local server, no network), with a native Save-as-PDF. |

### Releases

Pushing a tag such as `v0.1.0` (it must match the version in `packages/desktop/package.json` and `packages/mobile/package.json`) makes CI build everything and publish a GitHub release with the Windows installer, the Linux AppImage and deb, the Android APK, and `SHA256SUMS.txt`. Releases below 1.0 are marked pre-release. The text is in `.github/release-notes.md`.

The Windows installer is not code-signed. The Android APK is signed with a throwaway debug key unless you add a release key as repository secrets: `ANDROID_KEYSTORE_BASE64` (the keystore file, base64-encoded), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Create the key once (`keytool -genkeypair -v -keystore muster.jks -alias muster -keyalg RSA -keysize 2048 -validity 10000`), keep the file and passwords somewhere safe outside the repository, and never lose them: Android only lets an app update when the new version is signed by the same key.

### Android app

```
npm run apk                  # debug APK: packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk (sideload to try)
npm run e2e:android          # builds it, then drives the real app on the one emulator/phone adb can see
```

Needs a JDK 21 and the Android SDK (platform 36); set `JAVA_HOME` and `ANDROID_HOME`. The debug APK is signed with Android's debug key. A release build is signed from a keystore **kept outside the repository**, given by `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`, then `npm run release -w @muster/mobile`.

A phone's web view can neither print nor save files, so on Android "Print / PDF" opens the system print dialog (which can save a PDF) and "Share list" opens the share sheet. Android writes web storage to disk about two seconds after a change, so a process killed inside that window loses the last edit; ordinary exits (Back, Home, swiping the app away) are safe.

### Desktop app

```
npm run desktop          # build and run
npm run desktop:dist     # installers into release/ (AppImage + deb on Linux, NSIS .exe on Windows)
npm run e2e:desktop      # drives the real app; needs a display (xvfb-run on a headless box)
MUSTER_EXE=release/Muster-*.AppImage APPIMAGE_EXTRACT_AND_RUN=1 npx playwright test -c playwright.desktop.config.ts   # test the packaged build
```

Windows installers must be built on Windows; `.github/workflows/build.yml` does that (and smoke-tests the installed app) once the repo is on GitHub. If `npm run desktop` complains that Electron failed to install, run `node node_modules/electron/install.js` once.

MIT licensed.
