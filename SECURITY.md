# Security

## Reporting a problem

Please report security problems privately, not in a public issue: use **Security → Report a vulnerability** on this repository's GitHub page. Include what you did, what you expected and what happened, and the platform and Muster version (About, in the footer).

This is a hobby project run by one person, so there is no fixed response time, but a report is read and answered.

## What is in scope

Muster is local-first. It keeps your lists, games and collection on your own device and makes no network requests unless you turn on update checks (desktop only). The things most worth reporting:

- a data pack, list file or backup that can make the app run code, read or write files it should not, or crash it so badly that data is lost,
- anything that makes the app contact the network without your agreement,
- a way to tamper with the desktop update (the update is verified against the checksum in the release's `latest*.yml`),
- the Android app gaining a permission it should not have (it declares none).

## Verifying a download

Every release carries `SHA256SUMS.txt`. Check your download against it before installing. The Windows installer is not code-signed yet, so Windows may warn you about an unknown publisher; the Android APK is signed with a debug key (see the release notes).
