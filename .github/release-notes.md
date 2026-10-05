# Muster {{version}}

An unofficial, local-first army list builder and table companion for tabletop skirmish games. **It contains no game data**: you load your own data pack (a small invented sample is built in). Not affiliated with or endorsed by any publisher.

## Downloads

| Platform | File | Notes |
|---|---|---|
| Windows 10/11 (64-bit) | `Muster-Setup-{{version}}.exe` | Not code-signed yet, so Windows SmartScreen will warn: choose **More info**, then **Run anyway**. |
| Linux | `Muster-{{version}}-x86_64.AppImage` | `chmod +x` it and run it. No install needed. |
| Linux (Debian/Ubuntu) | `Muster-{{version}}-amd64.deb` | `sudo apt install ./Muster-{{version}}-amd64.deb` |
| Android 7+ | `Muster-{{version}}-android*.apk` | Allow "install unknown apps" for your browser or file manager. See the Android note below. |

`SHA256SUMS.txt` has a checksum for every file.

## Updates

The Windows installer and the Linux AppImage can update themselves, **but only if you allow it**: Muster asks once (and you can change it any time in About). Until you say yes, it makes no network requests at all. The `.deb` is updated by installing the new file, and the Android app by installing the new APK.

## Before you update

Everything you make is kept on your own device. **Open Backup (top right) and save a file first.** You can restore it on any platform.

**Android:** if the APK is named `…-android-debug.apk` it is signed with a temporary debug key that changes with every build, so Android will refuse to install it over an earlier version. Back up, uninstall the old app, install the new one, then restore.

## What is in it

Army list builder with legality checks, unit and rules reference with a search language, game tracker (wounds, Might/Will/Fate, break point, victory points, undo and resume), fight calculator (exact one-on-one, simulated squad fights), collection and painting tracker, campaigns, scenarios, Swiss tournaments, a data pack editor, and backup and restore. Works fully offline. The Android app asks for no permissions at all.
