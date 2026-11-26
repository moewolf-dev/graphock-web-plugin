# Graphock Web Clipper — Privacy Policy

**Effective date:** 2026-11-26

This policy covers the Chrome Web Store build of Graphock Web Clipper
(version 0.2.x, including optional desktop handoff).

## Summary

The extension has no account, no server and no telemetry. It reads the page you
are viewing only after you click it, and the content stays on your device. The
extension can save clips to your download folder. When you choose “Open in
Graphock”, it passes the clip to the installed Graphock desktop app using a
local protocol link or a file you select. The desktop app's own workspace and
privacy settings then apply.

## What we process

| Data | When | Where it goes |
| --- | --- | --- |
| Current page URL, title, metadata | After you click the extension | Memory; saved only if you export |
| Page text / selected content | After you click the extension | Saved locally or passed to the desktop app when you choose that action |
| Images (optional) | Only when you enable image embedding | Embedded in the exported file |
| Settings | When you change settings | `chrome.storage.local` in your browser |
| Recent clip metadata (title, URL, time, size) | After a successful clip | Local storage only; can be cleared in settings |

We do **not** collect: browsing history, keystrokes, form inputs, passwords,
cookies, or any content from tabs you did not act on.

## What we never do

- No account, login or cloud sync.
- No analytics, crash reporting or advertising identifiers.
- No sale or sharing of data with third parties.
- No remote code loading.
- The extension does not upload clips to a server. When you allow cross-origin
  images, it requests those image URLs to include them in your export.

## Your controls

- Clear local history and settings at any time from the options page.
- Uninstalling the extension removes its local storage.
- Exported files are under your control in your download folder.

## Permissions

- `activeTab` / `scripting`: read the current page after a click.
- `storage`: remember your settings and local clip history.
- `downloads`: save the exported file or ZIP.
- `offscreen`: create the Blob URL used for the download.
- `contextMenus`: offer clipping actions from the browser context menu.
- Optional host permission (`<all_urls>`): only requested if you click
  “Allow cross-origin images”, so images can be embedded in the export.

## Contact

privacy@graphock.com
