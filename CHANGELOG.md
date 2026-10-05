# Changelog

Newest first. Each release's notes on GitHub include its section from here.

## 0.3.0

- **Accessibility audit.** An automated check (axe, WCAG 2.1 A and AA) now runs over every screen and dialog, light and dark, desktop and phone. It found and fixed: low-contrast text and status colours in the light theme, and wide tables that a keyboard user could not scroll (they can now be focused and scrolled with the arrow keys).
- **Big data packs stay quick.** The Units table, the Builder's unit library and the Collection list now show 200 rows at a time with Show more / Show all, so a pack with thousands of units opens and searches in a fraction of a second instead of drawing everything at once.

- **Updates for the desktop apps, off until you allow it.** The Windows installer and the Linux AppImage can look for new versions on GitHub, download them when you choose, and install them when you close the app. Muster asks once; until you say yes it makes no network requests at all. Control it any time in **About** (the footer, or Help → About). Downloads are checked against the checksum in the release.
- New **About** dialog: version, licence, links, and the update controls.
- Releases now include the metadata the updater needs (`latest.yml`, `latest-linux.yml`, block maps). Versions before this one cannot update themselves: install this one by hand once.

## 0.2.0

- **Campaigns.** Keep a company of named models from game to game: experience and level, fit/injured/dead, advancements, injuries and notes. Make a list from the company, play it in the game tracker, then record the result back (scores, who was hurt, experience), and undo it if needed. Progression rules come from the data pack.
- **Data pack editor (More → Pack).** Write or change a data pack in the app: forms for units, wargear, rules, armies, scenarios and the pack's own rules, plus paste-in import of units from a spreadsheet table. Ids never change when you rename, deleting something removes everything that pointed at it, and the app tells you what is still missing before a pack can be used.
- **Company lists warn** when they break the usual list-building limits (for example too many bows), instead of leaving you to find out in the Builder.
- Backup and restore now include campaigns.
- Browser tests now run against the production build.
- Fixed: a loaded pack never showed as "in use" in the editor; the More tab row was clipped on a phone.

## 0.1.0

First release: army list builder with legality checks; unit and rules reference with a search language; game tracker with unlimited undo and resume; fight calculator (exact one-on-one, simulated squads); collection and painting tracker; scenarios; Swiss tournaments; backup and restore; data packs. Windows installer, Linux AppImage and deb, and an Android APK that asks for no permissions.
