# How to get plugin logs

The extension writes structured logs with a `[graphock:<scope>]` prefix. Nothing is sent
off-device; logs stay in the browser profile.

## 1. Background (service worker) — most useful

1. Open `chrome://extensions`.
2. Find **Graphock Web Clipper** and click **service worker** (under “Inspect views”).
3. Reproduce the problem (open the page → click the icon → try the button).
4. Copy the console output. Expected entries:

```text
[graphock:background] capture-start { mode, format } req=…
[graphock:background] collect { blocks, images, nodes, readable, timings } 1234ms
[graphock:background] images { total, fetched, failed } 2100ms
[graphock:background] snapshot { bytes, policy } 320ms
[graphock:background] build { format, blocks, assets, inline } 12ms
```

A failure logs `capture-failed` with `stage` and `code`:

| `stage` | Meaning |
| --- | --- |
| `tab` | no active tab / injection failed |
| `collect` | content script did not finish (Readability/clone/blocks) |
| `images` | image phase hit its 15s budget (clip continues with links) |
| `snapshot` | full-page HTML / CSS inlining |
| `build` | document model or serialization |

## 2. From the popup (one click)

When capture fails, the popup shows **Copy diagnostics**. It copies:

- extension version, UA, permissions
- the last 200 background log entries
- persisted warnings/errors (survive service worker restarts)

## 3. From the options page

Settings → **Diagnostics → Logs**:

- **Copy logs** — clipboard
- **Download logs** — `graphock-web-plugin-logs-YYYY-MM-DD.txt`
- **Clear logs** — clears the in-memory ring and persisted errors

## 4. Content script

Open the page’s own DevTools console. Entries are prefixed `[graphock:content]` and include
`measure` and `readable-skipped` (for very large pages).

## 5. What to send for a bug report

1. The copied diagnostics text.
2. The URL (redact anything private).
3. Which button was clicked and what happened.
4. For timeouts: the `stage` value from `capture-failed`.

## Timeouts and budgets (current)

| Stage | Budget |
| --- | --- |
| Whole capture | 45 s |
| Content script collect | 30 s |
| Image phase | 15 s (partial results are kept) |
| Per image | 6 s |
| Per CSS asset | 5 s |
| Per stylesheet (content) | 3 s |

Images/CSS are fetched with bounded concurrency (images 6, CSS 4), so a slow host cannot
serialize the whole capture.
