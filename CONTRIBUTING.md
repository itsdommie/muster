# Contributing to Muster

Thanks for helping. Muster is a small, local-first app, so the bar for a good change is: it works on all three platforms, it is tested, and it keeps the promises in the README (no game data, no network unless the user agrees).

## The one firm rule: no publisher data

Muster ships **no game data**. Please do not open an issue or pull request that contains:

- points costs, stat lines, army lists or rules text copied from a rulebook, codex, app or website,
- publisher artwork, logos or scans,
- a data pack built from any of the above, even "just for testing".

The bundled `packs/sample.json` is invented (CC0) and is all the tests and screenshots use. If you need more test data, invent it. See [NOTICE.md](NOTICE.md). Pull requests that add publisher content will be closed, and the content removed from the history if it was pushed.

## Setting up

```
npm install
npm run dev:web        # http://127.0.0.1:5173
npm run typecheck
npm test               # engine unit tests (Vitest)
npm run e2e            # browser tests (Playwright, against the production build)
npm run e2e:desktop    # the real Electron app (needs a display; xvfb-run on a headless box)
npm run e2e:android    # the real APK on an emulator or phone adb can see
```

Browser tests need a Chromium: Playwright's own, or point `CHROMIUM_PATH` at a system one. You only need Electron and Android tooling for changes in those packages; CI runs everything on every push.

## Where things live

| Path | What |
|---|---|
| `packages/shared` | The rules engine: pure TypeScript, no DOM, no Node APIs. Everything with logic in it goes here, with unit tests. |
| `packages/web` | The React UI, shared by every platform. |
| `packages/desktop` | Electron shell and the opt-in updater. |
| `packages/mobile` | Capacitor Android shell and its two native bridges. |
| `docs/pack-format.md` | The data pack format. Changing the schema means changing this too. |

## What a good change looks like

- **Logic lives in `shared`, with tests.** If you fix a bug, add the test that would have caught it. Engines are mutation-tested by hand now and then; a test that still passes when you break the code is not testing it.
- **Tests drive the real thing.** UI behaviour is covered by Playwright against a production build, not by mocking components. Don't hard-code the app version in a test; read it from `package.json`.
- **Accessibility is checked automatically** (`e2e/a11y.spec.ts` runs axe over every screen and dialog, light and dark, desktop and phone). New screens and dialogs need adding to that tour.
- **Mind the phone.** Every screen must fit a 360 px wide viewport without sideways page scrolling.
- **Keep the promises.** No analytics, no network requests the user has not agreed to, no new Android permissions. If a change needs the network, say so in the pull request and make it opt-in.
- **Match the surrounding code.** Short comments that say why, not what; no reformatting of code you are not changing.

## Pull requests

1. Open an issue first for anything bigger than a bug fix, so we can agree the shape of it.
2. Keep a pull request to one change. Add a line to `CHANGELOG.md` under *Unreleased* for anything a user would notice.
3. Make sure `npm run typecheck`, `npm test` and `npm run e2e` pass; CI will run the rest.

By contributing you agree that your work is released under the [MIT licence](LICENSE).
