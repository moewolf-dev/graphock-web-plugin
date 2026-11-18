# Graphock Web Clipper — Privacy Policy

**Status:** draft for store submission (legal review pending). Effective date: TBD.

## Summary

The extension has no account, no server and no telemetry. It reads the page you are viewing only
after you click it, and the content stays on your device unless you explicitly export it or send
it to the Graphock desktop app.

## What we process

| Data | When | Where it goes |
| --- | --- | --- |
| Current page URL, title, metadata | After you click the extension | Memory; saved only if you export |
| Page text / selected content | After you click the extension | Saved to a local file or handed to the app via a custom protocol |
| Images (optional) | Only when you enable image embedding | Embedded in the exported file |
| Settings | When you change settings | `chrome.storage.local` in your browser |
| Recent clip metadata (title, URL, time, size) | After a successful clip | Local storage only; can be cleared in settings |

We do **not** collect: browsing history, keystrokes, form inputs, passwords, cookies, or any
content from tabs you did not act on.

## What we never do

- No account, login or cloud sync.
- No analytics, crash reporting or advertising identifiers.
- No sale or sharing of data with third parties.
- No remote code loading.

## Your controls

- Clear local history and settings at any time from the options page.
- Uninstalling the extension removes its local storage.
- Exported files are under your control in your download folder.

## Permissions

- `activeTab` / `scripting`: read the current page after a click.
- `storage`: remember your settings.
- `downloads`: save the exported file.
- Optional host permission: only if you ask the extension to embed cross-origin images.

## Contact

privacy@graphock.com
