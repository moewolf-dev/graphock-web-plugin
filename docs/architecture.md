# Architecture

```text
popup (Vue)                      options (Vue)
   │  chrome.runtime message          │ chrome.storage.local
   ▼                                  ▼
background service worker  ──────►  settings
   │  chrome.scripting.executeScript
   ▼
content script (classic, IIFE)
   │  collected page snapshot (metadata + text, HTML length)
   ▼
background
   │  clip-model: ClipDocument (blocks, assets, stats)
   │  converters: Markdown / JSON / YAML / HTML / text
   │  handoff: HandoffPayload → channel selection → URL
   ▼
chrome.downloads (file)   or   custom protocol (app)
```

## Packages

| Package | Responsibility | Must not |
| --- | --- | --- |
| `clip-model` | types, zod schema, canonical JSON, checksums, stats | know about browsers or Node |
| `handoff` | URL forms, compression, limits, error codes | read files or DOM |
| `protocol-receiver` | validate + materialize a clip, CLI | depend on Electron |
| `converters` | model → HTML/MD/JSON/YAML/TXT, filename rules | extract from live DOM |
| `capture` | DOM sanitize, metadata, asset dedupe | write files or fetch network |
| `apps/extension` | UI, messaging, permissions | reimplement protocol rules |

## Invariants

1. Every output format derives from `ClipDocument`.
2. Protocol limits are duplicated in sender and receiver; neither trusts the other.
3. Page content is data, never code: no injection, no execution.
4. The extension only reads the active tab after a user gesture.
5. No remote code, no CDN, no `eval`.
6. Checksums are computed over canonical JSON; `createdAt` is excluded.

## Data flow for a handoff

1. `capture()` in the popup triggers `GRAPHOCK_CAPTURE`.
2. Background injects `content.js`, asks for `GRAPHOCK_COLLECT`.
3. Background builds `ClipDocument` → `toMarkdown()` → `HandoffPayload`.
4. `buildInlineUrl()` decides inline vs wake-only; if too large, the popup shows the fallback.
5. The popup opens the custom scheme (user gesture) or saves the Markdown.

## Failure surfaces

| Surface | Behaviour |
| --- | --- |
| Restricted page (`chrome://`) | `E_INJECTION_FAILED`, actionable message |
| No text / empty selection | `E_EMPTY_CONTENT`, suggests another mode |
| Payload too large | wake-only fallback + "save as file" guidance |
| Download blocked | error surfaced in popup; link can be copied |
| App missing | browser prompt; user can copy the link |
