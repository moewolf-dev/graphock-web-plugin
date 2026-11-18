# MV3 lifecycle, limits and timeouts (V-02)

## Service worker

- Registered as an ES module on Chrome/Edge/Brave (`background.js`).
- Safari does not support `type: module` service workers, so the Safari build ships a classic
  IIFE bundle (see `safari-2026-11-18.md`).
- The worker can be suspended at any time. No in-memory state is required for correctness:
  settings live in `chrome.storage.local`, and the only in-memory map (`lastBuilds`) is a cache
  for the “Save .zip” action, limited to the three most recent clips.

## Offscreen document

Chrome MV3 service workers cannot call `URL.createObjectURL`, and Chrome interrupts `data:` URL
downloads. All file writes therefore go through `offscreen.html`:

1. background asks the offscreen page for a Blob URL;
2. background calls `chrome.downloads.download` with that URL;
3. offscreen revokes the URL after completion or a 5-minute guard.

Safari has neither `downloads` nor `offscreen`; it uses `save.html` + an anchor download instead.

## Budgets

| Stage | Limit | Behaviour |
| --- | --- | --- |
| Capture message | 20 s | `E_CAPTURE_TIMEOUT`, UI suggests Readable/Selection |
| Image fetch | 8 s per image | image marked `failed`, others continue |
| Image count | 100 | remaining images `skipped` |
| Single image | 10 MB | `skipped` |
| Image total | 16 MB | `skipped` |
| CSS assets | 20 files / 2 MB each / 8 MB total | remaining URLs left remote |
| Blocks | 800 | extraction stops |
| Text | 400k chars | extraction stops |
| Protocol URL | 24,000 chars | falls back to the file channel |
| Inline payload | 131,072 bytes (raw JSON) | file channel |
| File package | 12 MB (current download helper) | `E_PACKAGE_TOO_LARGE` |

## Message passing

- Content script → background: one structured `CollectedPage` per capture. Image bytes are
  **not** sent through this channel; the background fetches them with the optional host
  permission.
- Background → offscreen: either UTF-8 text or base64 bytes; one message per download.
- Messages are request/response with `return true`; no long-lived ports.

## Verification

- `tests/e2e/smoke.mjs` exercises capture, image embedding, HTML snapshot, selection, link
  policy, save and the file channel in a real Chrome for Testing instance.
- `tests/unit/hostile.test.ts` bounds a 10,000-paragraph DOM and a hanging image fetch.
- `tests/unit/css.test.ts` covers asset budget behaviour.
