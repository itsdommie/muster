# Changelog

Newest first. Each release's notes on GitHub include its section from here.

## 0.2.0

- **Campaigns.** Keep a company of named models from game to game: experience and level, fit/injured/dead, advancements, injuries and notes. Make a list from the company, play it in the game tracker, then record the result back (scores, who was hurt, experience), and undo it if needed. Progression rules come from the data pack.
- **Data pack editor (More → Pack).** Write or change a data pack in the app: forms for units, wargear, rules, armies, scenarios and the pack's own rules, plus paste-in import of units from a spreadsheet table. Ids never change when you rename, deleting something removes everything that pointed at it, and the app tells you what is still missing before a pack can be used.
- **Company lists warn** when they break the usual list-building limits (for example too many bows), instead of leaving you to find out in the Builder.
- Backup and restore now include campaigns.
- Browser tests now run against the production build.
- Fixed: a loaded pack never showed as "in use" in the editor; the More tab row was clipped on a phone.

## 0.1.0

First release: army list builder with legality checks; unit and rules reference with a search language; game tracker with unlimited undo and resume; fight calculator (exact one-on-one, simulated squads); collection and painting tracker; scenarios; Swiss tournaments; backup and restore; data packs. Windows installer, Linux AppImage and deb, and an Android APK that asks for no permissions.
