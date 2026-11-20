# Privacy — CyberNotes

CyberNotes runs on your PC and keeps your data on your PC. It has **no account, no telemetry, no analytics SDK and no ads**. It never sends your notes, folders or settings to its author or to anyone else.

Everything it knows (notes, folders or settings) stays in `%APPDATA%\CyberNotes\` (`cybernotes.db`, `images\`, `backups\`, logs and dictionaries). The `CYBERNOTES_USER_DATA_DIR` variable can move this folder; older `%APPDATA%\cyber-notes` data is left in place. The installer does not define `deleteAppDataOnUninstall`, so app data is kept.

## When CyberNotes goes online

These are all the connections CyberNotes makes by itself. None of them sends your notes, folders or settings. Like any request on the internet, the server sees your IP address.

| When | Where | What for | How to turn it off |
|---|---|---|---|
| 8 seconds after launch and every 6 hours | `github.com` (update feed), with release notes from `api.github.com` | Check for a newer version | `auto_check_updates` (on by default) |
| When spellcheck is enabled | Chromium's own dictionary service | Download spelling dictionaries | `spellcheck_enabled` |

Embedded video previews and links you open are user-initiated.

## What CyberNotes reads on your PC

CyberNotes reads display geometry, system language, keyboard lock states and the list of available spellcheck languages. That information stays on your screen. Anything that changes the system asks for confirmation first and, where possible, is backed up so it can be undone.

## Questions

Open an issue: https://github.com/CyberGems/CyberNotes/issues

For a privacy-specific question, use the [contact page](https://cybergems.org/contact). The suite-wide statement is at [cybergems.org/privacy](https://cybergems.org/privacy).
