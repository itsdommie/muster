# Muster: a local-first companion for tabletop skirmish games

**End goal: one easy-to-install app for everything about a tabletop skirmish game, on Windows, Linux and Android.** Install and go, no account, no paywall, works offline. Army list building comes first, then a table-side game tracker, a rules reference, and a hobby tracker. (Working name: "Muster". Change freely.)

## Features (build order)

1. **Army list builder (the core feature).** Pick a force, add warbands, heroes, wargear and upgrades, with a live points total. Validation covers the usual rules: warband size and hero limits, bow/throwing weapon limits, army bonus and allies, break point and bow limit. Export to plain text, PDF and a share image. Import the text lists people post online.
2. **Profile and unit database.** Searchable and filterable by faction, cost, keyword and special rule. Each unit has its full stat line (M, F, S, D, A, W, C, I plus Might/Will/Fate), wargear options and special rules.
3. **Rules reference.** Offline search of special rules, magical powers, heroic actions, the glossary and FAQ/errata notes. Special rules link from the profile that uses them.
4. **Game tracker (table-side, phone-first).** Load a list, then track wounds, casualties, Might/Will/Fate spent, the 50% break point, the bow limit, priority and turn count, scenario objectives and victory points. Undo, and resume a game after the app is closed.
5. **Fight calculator and simulator.** Duel rolls, to-wound chart, Defence saves and Might usage. Gives an exact expected outcome for "X attacks vs Y", and a Monte Carlo run for multi-model fights. Tested against hand-computed probabilities.
6. **Scenarios and tournaments.** Scenario library, pairings, Swiss rounds, scoring and standings for a local club night.
7. **Collection and painting tracker.** Owned, built, primed, painted, wishlist, "which of my models cover this list?", "what do I still need to buy to field it?".
8. **Campaigns.** Battle company/campaign tracker with persistent heroes, injuries and progression.
9. **Sync and backup (optional).** Export/import a single file first. Later an optional self-hosted sync endpoint (self-hosted), not required for any feature.
10. **Claude advisor (optional).** Chat panel whose tool calls hit the local database and the list validator, so suggestions are real, legal and costed. It needs a key and is off by default.

## The decision that shapes everything: game data and IP

Unit profiles, points costs and rules text belong to a game's publisher, so they must not be baked into a public repo or a distributed app without permission. So:

- **The app ships as an engine plus an open data-pack format.** The schema, validator, calculator and UI are all ours. Data lives in versioned JSON "packs" (units, wargear, special rules, army lists, scenarios).
- **Ship a tiny original sample pack** (invented units) for tests and demos. Users load their own pack, enter their own profiles in a built-in editor, or import a pack from somewhere they are entitled to use.
- **No GW artwork or logos.** Original branding, a clear "unofficial fan project" notice, non-commercial, no model images re-hosted.
- This keeps the project safe to publish publicly under MIT, and the tool still works the day a points update lands (update the pack, not the app).

A private build with a fully populated database for personal use would be a different, simpler path, but it must never be published.

## Tech

TypeScript throughout, npm workspaces, same layout as `~/projects/mtg`:

| Package | Role |
|---|---|
| `shared` | Pure-TS rules engine: data schema, list validation, points maths, fight probability. No I/O, so it runs identically on every platform and is unit-tested heavily. |
| `web` | React + Vite UI, mobile-first responsive, the single UI for all platforms. |
| `desktop` | Electron + electron-builder: NSIS `.exe` for Windows, AppImage + `.deb` for Linux. |
| `mobile` | Capacitor 8 wrapper producing a signed Android APK/AAB. |

- **Storage:** SQLite everywhere. `node:sqlite` on desktop, `sqlite-wasm` on Android, same schema and queries. Lists, games and collection are stored locally in the per-user data directory.
- **No server required.** There is no card API to ingest, so the desktop app needs no server process. The UI talks to a small storage interface with two implementations (desktop, Android).
- **Testing:** Vitest for the engine, Playwright for desktop and mobile-viewport e2e.
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

- Non-commercial fan project; no publisher assets or bundled data; clear attribution and disclaimer.
- Never commit secrets or tokens. Advisor key goes in the OS keychain (`safeStorage`), never on disk in plain text.
- Windows and Linux desktop plus Android only. Users never install Node, Python or Docker.
- Don't push to GitHub until asked.
- The rules engine is the product: every rule it enforces gets a test.

## Status

Data path: **public engine, user-supplied packs**. Name: **Muster**.

- **Phase 0: done.** npm workspaces (`shared`, `web`). Zod-validated pack schema with cross-reference checks, invented sample pack, `npm run validate-pack`.
- **Phase 1: done.** Army list builder: warbands, options, allies, live points; validator covering warband size and leader rules, per-hero restrictions, option groups, unit caps, unique models, points limit, bow limit and ally caps; plain-text export and forgiving import; print/PDF sheet; local persistence; pack loading. Responsive (three-column desktop, tabbed phone), light and dark.
- Tests: 36 Vitest (engine + CLI), 8 Playwright e2e (including phone viewport).
- **Phase 2.5: done (Linux), Windows pending CI.** Electron shell: UI served from a sandboxed `app://` protocol with a strict CSP, no server, navigation locked to the app, native Save-as-PDF, single-instance. Linux AppImage and deb build here, and the desktop e2e suite passes against the packaged AppImage. The Windows NSIS installer is configured and has a CI workflow, but has never been built or run (no Windows machine or Wine here).
- **Phase 2: done.** Unit database with a query language (stat comparisons, rule/wargear/option/keyword/army/tier filters, `is:` flags, negation, `or`; bad filters are reported while the rest still applies), sortable results with a profile pane (sheet on phones), and a rules + wargear reference with category filter, full-text search and "used by" links. Views are hash-routed, so reload and the Android back button work, and rules/units cross-link both ways, including from the builder.
- Tests now: 57 Vitest, 21 browser e2e, 4 desktop e2e (also run against the packaged AppImage).
- **Phase 3: done.** Game tracker: start from any list; per-model wounds (casualty / wound / heal / restore), hero Might/Will/Fate, live force status with break point and "N more losses until broken", heroes and ranged models remaining, turn, priority, victory points for both sides, an opponent counter with its own break point, game log, notes, and a screen wake-lock while playing. Built as an event log over a frozen starting state, so unlimited undo/redo and resume after closing the app come for free; finished games are kept as a history. Phone layout puts the models right under the force status.
- Tests now: 77 Vitest, 30 browser e2e, 5 desktop e2e (also run against the packaged AppImage).
- **Phase 4: done.** Fight calculator. Combat rules live in an optional `ruleset.combat` section of the pack (die, tie rule, support bonus, wound formula or table, Fate, Might), so the engine stays rules-agnostic. One-on-one fights are solved exactly (a Markov chain over wounds, Fate and Might: win/lose odds, expected rounds, first-round breakdown, wounds left when winning). Squad-vs-squad fights are simulated dice by dice (seeded, 6,000 battles in batches that keep the page responsive, optional stop at break point). The exact solver is checked against hand-worked odds, and the simulator against the solver; mutation-testing confirmed the tests catch deliberately injected bugs.
- Tests at the end of Phase 5: 110 Vitest, 40 browser e2e, 6 desktop e2e (run against the packaged AppImage in CI on Linux and against the installed .exe on Windows), 9 Android emulator e2e.
- **Phase 5: done (debug APK).** Capacitor 8 Android app (4.4 MB, no permissions, not even INTERNET) around the unchanged UI. Native bridges: system print dialog for the list sheet (can save a PDF), share sheet for the list text, and a Back button that steps through views then backgrounds the app. Tested on a real emulator (Android 15) through the actual WebView: install, no-permission check, persistence across kills, Back, copy, Share, Print, a full game, and the fight calculator. Release signing is wired to environment variables; no keystore exists yet. Known limit: a hard process kill within ~2 s of an edit loses that edit (Android flushes web storage lazily); ordinary exits are safe.
- **GitHub + CI:** private repo `itsdommie/muster`. CI is green on all of: typecheck/unit/browser tests (Ubuntu), the Linux AppImage smoke test, the **Windows NSIS installer built, silently installed and smoke-tested on a Windows runner**, and the Android build + emulator suite.
- **Phase 6: done.** A **More** tab (remembers its section) with:
  - **Collection:** models per unit through In the box → Built → Primed → Painted, plus a wishlist (buying moves a model into the box); a per-pack collection; "Can I field this list?" for any saved list, saying what to buy and what to paint, with a copyable shopping list; filters (owned, to paint, wishlist, army, search).
  - **Scenarios:** an optional `scenarios` section of the pack; search, tags, random pick, copy as text, and "Play this scenario", which preselects it when starting a game. The tracker shows it, and the game history keeps it.
  - **Tournament:** Swiss pairings with no rematches (backtracking search), byes to the lowest-ranked player who has not had one, standings by points then strength of schedule then VP difference then VP, late players, dropping, undoing a round, extra rounds, copyable standings.
- Tests at the end of Phase 6: 146 Vitest, 59 browser e2e, 7 desktop e2e, 10 Android emulator e2e.
- Tests now: 233 Vitest, 98 browser e2e, 10 desktop e2e (also against the packaged AppImage on Linux and the installed .exe on Windows in CI), 13 Android emulator e2e. The tournament and combat engines were mutation-tested (a deliberately injected bug must make a test fail); that found one weak test, now fixed.
- **Phase 7, part 1: backup and restore, and GitHub releases.**
  - **Backup:** one JSON file holds lists, games (with undo history), collections, tournaments and a loaded data pack. A Backup button sits in the top bar, with a quiet dot when there is data and no backup in 30 days. Restoring previews the file first, then either *adds to* what is on the device (nothing lost; the newer list or further-along game or tournament wins; a unit in both collections takes the backup's counts) or *replaces* everything (confirmed). Damaged parts of a file are skipped and counted, never trusted, and a restore that would leave two games running files the lesser one in the history. A fuzz test checks the parser never throws. Android hands the file to the share sheet, because a web view cannot save files; desktop uses the system Save dialog; the browser downloads it.
  - **Releases:** pushing a `v*` tag builds everything and publishes a GitHub release (Windows installer, Linux AppImage and deb, Android APK, SHA256SUMS). The tag must match the apps' versions. Releases under 1.0 are pre-releases. Android uses a signed release APK only if a signing key is added as repository secrets; otherwise the debug APK ships, with a note that it cannot update an install signed by a different key.
- **v0.1.0 published** (pre-release, private repo): https://github.com/itsdommie/muster/releases/tag/v0.1.0 with the Windows installer, Linux AppImage and deb, a debug-signed Android APK and SHA256SUMS. Getting there found and fixed real problems: desktop saves now go through the main process and are written atomically (a Windows download can be cancelled if the app closes just after saving), and the Android CI emulator needed more memory (the low-memory killer was ending the app).
- **Phase 7, part 2: campaigns.** A new **Campaign** section under More: a company of named models (a unit plus equipment) that carries over from game to game, each with experience and level, condition (fit, injured, dead), advancements, injuries and notes. An optional `ruleset.campaign` in the pack gives the levels, default experience awards and the advancement and injury lists. "Make a list from this company" turns the roster into a normal list (heroes lead, warriors fill warbands within each hero's size and who they may lead; the dead and, optionally, the injured are left out), refreshes the same list each time and warns plainly if it breaks the usual list-building limits. A game started from that list remembers which roster member each model is, so afterwards "Record in <campaign>" opens a form prefilled with the score and with models that ended down marked injured, with default experience; recording is undoable. Everything is in backup and restore. Engine mutation-tested.
- **Also this round:** the browser tests now run against the production build (the Vite dev server became unreliable under repeated reloads; the previous commit failed the same way), which also made them about twice as fast.
- **Phase 7, part 3: the data pack editor** (the built-in editor the plan promised, and what makes the app usable with real data). **More → Pack:**
  - **Where to start.** Begin a new pack (from a pasted table of units, or from scratch) or edit a copy of the pack in use. Nothing changes until "Use this pack". A draft is kept across reloads.
  - **Structured editors.** Units (profile, keywords, wargear, rules, paid options with their wargear and groups, a hero's warband size and who they may lead, which armies take them and the most per list), wargear (with bow/throwing flags), special rules, armies (bonus, units, allies), scenarios, and the pack's own rules: list-building limits, ally levels, fight rules (formula, Fate, Might) and campaign rules.
  - **Import and JSON.** Import units from a table (CSV or spreadsheet paste; understands M F Sh S D A W C headers and "5/4+"; creates the rules, wargear and armies it names; updates units by name; reports bad rows by number and still imports the rest). Export units to a table. A whole-pack JSON box for anything else, which warns if the draft changed under unsaved edits.
  - **Safety.** Ids come from names once and never change, so renaming never breaks anything; deleting a unit, wargear, rule or army removes every reference to it (property-tested across the whole sample pack). The draft shows plain-language problems ("an army has no hero"), "Use this pack" is only offered when it loads, and the app warns before applying a pack that would break saved lists. "Save as a file" shares via the system sheet on Android. The pack dialog links straight to the editor.
  - Engine mutation-tested (10 injected bugs caught; the testing found a real bug where kind "wizard" was accepted as a warrior).
- **Next:** all that remains needs the network, so each is a decision for you: optional self-hosted sync (would add INTERNET permission to the Android app), auto-update (needs the repo public or a feed the app can read), and the optional Claude advisor (an API key and network).
