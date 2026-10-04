# Muster

A local-first companion app for tabletop skirmish army building. Build lists with live points and legality checks, look up profiles and rules, and take the list to the table.

**Muster ships no game data.** Armies, units and rules live in JSON *data packs* you load yourself ([format](docs/pack-format.md)); a small invented sample pack is bundled so you can try it. See [NOTICE.md](NOTICE.md).

What it does today: build and validate army lists, browse every unit with a search language (`f>=5 r:terror army:vale or is:hero`, help is built into the Units view), read the rules and wargear reference, export/import lists, print or save a PDF, track a game at the table (wounds, Might/Will/Fate, break point, turn, victory points, undo, resume), and work out fight odds (exact one-on-one, simulated squad vs squad) using the combat rules in your pack.

Targets: Windows and Linux desktop, and Android. See [PLAN.md](PLAN.md) for the roadmap and status.

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
| `packages/desktop` | Electron shell for Windows and Linux. Serves the built UI from a sandboxed `app://` protocol (no local server, no network), with a native Save-as-PDF. |

### Desktop app

```
npm run desktop          # build and run
npm run desktop:dist     # installers into release/ (AppImage + deb on Linux, NSIS .exe on Windows)
npm run e2e:desktop      # drives the real app; needs a display (xvfb-run on a headless box)
MUSTER_EXE=release/Muster-*.AppImage APPIMAGE_EXTRACT_AND_RUN=1 npx playwright test -c playwright.desktop.config.ts   # test the packaged build
```

Windows installers must be built on Windows; `.github/workflows/build.yml` does that (and smoke-tests the installed app) once the repo is on GitHub. If `npm run desktop` complains that Electron failed to install, run `node node_modules/electron/install.js` once.

MIT licensed.
