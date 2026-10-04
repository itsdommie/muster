# Muster: a local-first Middle-earth Strategy Battle Game companion

**End goal: one easy-to-install app for everything MESBG, on Windows, Linux and Android.** Install and go, no account, no paywall, works offline. Army list building comes first, then a table-side game tracker, a rules reference, and a hobby tracker. (Working name: "Muster". Change freely.)

## Features (build order)

1. **Army list builder (the core feature).** Pick a force, add warbands, heroes, wargear and upgrades, with a live points total. Validation covers the usual rules: warband size and hero limits, bow/throwing weapon limits, army bonus and allies, break point and bow limit. Export to plain text, PDF and a share image. Import the text lists people post online.
2. **Profile and unit database.** Searchable and filterable by faction, cost, keyword and special rule. Each unit has its full stat line (M, F, S, D, A, W, C, I plus Might/Will/Fate), wargear options and special rules.
3. **Rules reference.** Offline search of special rules, magical powers, heroic actions, the glossary and FAQ/errata notes. Special rules link from the profile that uses them.
4. **Game tracker (table-side, phone-first).** Load a list, then track wounds, casualties, Might/Will/Fate spent, the 50% break point, the bow limit, priority and turn count, scenario objectives and victory points. Undo, and resume a game after the app is closed.
5. **Fight calculator and simulator.** Duel rolls, to-wound chart, Defence saves and Might usage. Gives an exact expected outcome for "X attacks vs Y", and a Monte Carlo run for multi-model fights. Tested against hand-computed probabilities.
6. **Scenarios and tournaments.** Scenario library, pairings, Swiss rounds, scoring and standings for a local club night.
7. **Collection and painting tracker.** Owned, built, primed, painted, wishlist, "which of my models cover this list?", "what do I still need to buy to field it?".
8. **Campaigns.** Battle company/campaign tracker with persistent heroes, injuries and progression.
9. **Sync and backup (optional).** Export/import a single file first. Later an optional self-hosted sync endpoint (suits your Proxmox setup), not required for any feature.
10. **Claude advisor (optional).** Chat panel whose tool calls hit the local database and the list validator, so suggestions are real, legal and costed. It needs a key and is off by default, as in Grimoire.

## The decision that shapes everything: game data and IP

Unit profiles, points costs and rules text belong to Games Workshop. I should not bake that data into a public repo or a distributed app without permission, and GW is notably protective of it. So:

- **The app ships as an engine plus an open data-pack format.** The schema, validator, calculator and UI are all ours. Data lives in versioned JSON "packs" (units, wargear, special rules, army lists, scenarios).
- **Ship a tiny original sample pack** (invented units) for tests and demos. Users load their own pack, enter their own profiles in a built-in editor, or import a pack from somewhere they are entitled to use.
- **No GW artwork or logos.** Original branding, a clear "unofficial fan project" notice, non-commercial, no model images re-hosted.
- This keeps the project safe to publish publicly under MIT, and the tool still works the day a points update lands (update the pack, not the app).

If you'd prefer a private build with a fully populated database for personal use, that's a different and simpler path, but it must stay unpublished. Say which you want.

## Tech (reusing what Grimoire already proved)

TypeScript throughout, npm workspaces, same layout as `~/projects/mtg`:

| Package | Role |
|---|---|
| `shared` | Pure-TS rules engine: data schema, list validation, points maths, fight probability. No I/O, so it runs identically on every platform and is unit-tested heavily. |
| `web` | React + Vite UI, mobile-first responsive, the single UI for all platforms. |
| `desktop` | Electron + electron-builder: NSIS `.exe` for Windows, AppImage + `.deb` for Linux. |
| `mobile` | Capacitor 8 wrapper producing a signed Android APK/AAB. |

- **Storage:** SQLite everywhere. `node:sqlite` on desktop, `sqlite-wasm` on Android, same schema and queries. Lists, games and collection are stored locally in the per-user data directory.
- **No server required.** Unlike Grimoire there is no card API to ingest, so the desktop app needs no Fastify process. The UI talks to a small storage interface with two implementations (desktop, Android).
- **Testing:** Vitest for the engine, Playwright for desktop and mobile-viewport e2e, as in Grimoire.
- **CI:** GitHub Actions builds Windows on Windows, Linux on Linux, Android with the SDK. I can't test Windows installers locally on this Linux box.
- **Dev environment note:** Node 26 and .NET are installed here. There is no Android SDK or Java yet, so I'd install those for APK builds (Phase 5).

## Phases

| Phase | Result |
|---|---|
| 0 | Scaffold monorepo; data-pack schema; sample pack; loader and tests |
| 1 | Army list builder with validation, points, text/PDF export |
| 2 | Profile database and rules reference with search |
| 2.5 | **Desktop shell + installers** (Windows + Linux) early, to de-risk packaging |
| 3 | Game tracker, phone-first, persistent |
| 4 | Fight calculator and simulator |
| 5 | **Android APK** (Capacitor), touch polish, offline checks |
| 6 | Collection/painting tracker, scenarios and tournament mode |
| 7 | Campaigns, sync/backup, optional Claude advisor, auto-update |

Each phase ends with something usable.

## Ground rules

- Non-commercial fan project; no Games Workshop assets or bundled data; clear attribution and disclaimer.
- Never commit secrets or tokens. Advisor key goes in the OS keychain (`safeStorage`), never on disk in plain text.
- Windows and Linux desktop plus Android only. Users never install Node, Python or Docker.
- Don't push to GitHub until asked.
- The rules engine is the product: every rule it enforces gets a test.

## Open questions

1. **Data path:** public engine + user-supplied packs (recommended), or a private personal build with full data?
2. **Name:** keep "Muster" or pick another?
3. **Starting scope:** I'd begin with Phases 0 to 1 (list builder) and get you something to try quickly. OK?

## Status

Data path decided: **public engine, user-supplied packs**. Name: **Muster**.

- **Phase 0: done.** npm workspaces (`shared`, `web`). Zod-validated pack schema with cross-reference checks, invented sample pack, `npm run validate-pack`.
- **Phase 1: done.** Army list builder: warbands, options, allies, live points; validator covering warband size and leader rules, per-hero restrictions, option groups, unit caps, unique models, points limit, bow limit and ally caps; plain-text export and forgiving import; print/PDF sheet; local persistence; pack loading. Responsive (three-column desktop, tabbed phone), light and dark.
- Tests: 36 Vitest (engine + CLI), 8 Playwright e2e (including phone viewport).
- **Phase 2.5: done (Linux), Windows pending CI.** Electron shell: UI served from a sandboxed `app://` protocol with a strict CSP, no server, navigation locked to the app, native Save-as-PDF, single-instance. Linux AppImage and deb build here, and the desktop e2e suite passes against the packaged AppImage. The Windows NSIS installer is configured and has a CI workflow, but has never been built or run (no Windows machine or Wine here).
- **Phase 2: done.** Unit database with a query language (stat comparisons, rule/wargear/option/keyword/army/tier filters, `is:` flags, negation, `or`; bad filters are reported while the rest still applies), sortable results with a profile pane (sheet on phones), and a rules + wargear reference with category filter, full-text search and "used by" links. Views are hash-routed, so reload and the Android back button work, and rules/units cross-link both ways, including from the builder.
- Tests now: 57 Vitest, 21 browser e2e, 4 desktop e2e (also run against the packaged AppImage).
- **Phase 3: done.** Game tracker: start from any list; per-model wounds (casualty / wound / heal / restore), hero Might/Will/Fate, live force status with break point and "N more losses until broken", heroes and ranged models remaining, turn, priority, victory points for both sides, an opponent counter with its own break point, game log, notes, and a screen wake-lock while playing. Built as an event log over a frozen starting state, so unlimited undo/redo and resume after closing the app come for free; finished games are kept as a history. Phone layout puts the models right under the force status.
- Tests now: 77 Vitest, 30 browser e2e, 5 desktop e2e (also run against the packaged AppImage).
- **Phase 4: done.** Fight calculator. Combat rules live in an optional `ruleset.combat` section of the pack (die, tie rule, support bonus, wound formula or table, Fate, Might), so the engine stays rules-agnostic. One-on-one fights are solved exactly (a Markov chain over wounds, Fate and Might: win/lose odds, expected rounds, first-round breakdown, wounds left when winning). Squad-vs-squad fights are simulated dice by dice (seeded, 6,000 battles in batches that keep the page responsive, optional stop at break point). The exact solver is checked against hand-worked odds, and the simulator against the solver; mutation-testing confirmed the tests catch deliberately injected bugs.
- Tests now: 110 Vitest, 40 browser e2e, 6 desktop e2e (run against the packaged AppImage in CI on Linux and against the installed .exe on Windows), 9 Android emulator e2e.
- **Phase 5: done (debug APK).** Capacitor 8 Android app (4.4 MB, no permissions, not even INTERNET) around the unchanged UI. Native bridges: system print dialog for the list sheet (can save a PDF), share sheet for the list text, and a Back button that steps through views then backgrounds the app. Tested on a real emulator (Android 15) through the actual WebView: install, no-permission check, persistence across kills, Back, copy, Share, Print, a full game, and the fight calculator. Release signing is wired to environment variables; no keystore exists yet. Known limit: a hard process kill within ~2 s of an edit loses that edit (Android flushes web storage lazily); ordinary exits are safe.
- **GitHub + CI:** private repo `itsdommie/muster`. CI is green on all of: typecheck/unit/browser tests (Ubuntu), the Linux AppImage smoke test, the **Windows NSIS installer built, silently installed and smoke-tested on a Windows runner**, and the Android build + emulator suite.
- **Next: Phase 6** (collection/painting tracker, scenarios, tournament mode), then 7 (campaigns, sync/backup, auto-update).
