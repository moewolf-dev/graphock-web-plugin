# Graphock Web Clipper

A browser extension that saves the page you are reading as a clean local file, or hands it
straight to the [Graphock](https://graphock.com) desktop app.

- **Chrome / Edge / Brave** (Manifest V3)
- **Safari** (macOS 13.3+, Safari 16.4+) — container project builds; store submission pending
- **No account, no telemetry, no server**: the page never leaves your device.

> Status: `0.1.0` — developer preview. See [docs/TODO](../docs) in the main repository for the
> task plan, and [`docs/protocol/CUSTOM_PROTOCOL_IMPORT.md`](docs/protocol/CUSTOM_PROTOCOL_IMPORT.md)
> for the desktop handoff contract.

## What it does

| Step | What happens |
| --- | --- |
| 1 | Click the toolbar icon. The extension reads **only the current tab**, only after your click. |
| 2 | Pick a mode: readable main content, full page text, or the current selection. |
| 3 | Choose an output: HTML, Markdown, JSON, YAML or plain text (format support is landing incrementally). |
| 4 | Save locally, or hand the clip to the Graphock desktop app through a custom protocol. |

Current `0.1.0` slice:

- readable extraction (Readability) with a full-page / selection fallback, converted into a
  structured block model (headings, lists, quotes, code, tables, figures);
- image collection with content-hash dedupe; embedded images, linked images, or text-only;
- output formats: Markdown, self-contained HTML (styles + data-URI images), JSON and YAML;
- handoff channels: inline `graphock-direct://import#p=v1.…`, a saved package file for large
  clips (Direct builds), and wake-only for the Mac App Store build;
- local save through the browser download API;
- settings page for target app channel, default mode/format, image policy, download subdirectory;
- reference protocol receiver (`packages/protocol-receiver`) + test vectors for the desktop app.

Not yet implemented (tracked in the plan): cross-origin image permission flow, zip packages for
local saves, CSS background images and webfont inlining, Safari packaging, store submission.

## Quick start

```bash
pnpm install
pnpm verify            # lint + typecheck + 119 unit tests + build
pnpm qa               # build + Playwright extension suite (real clicks, keyboard, downloads)
pnpm qa:ui            # Playwright UI mode for debugging
pnpm qa:nightly       # 20-run stability + large-page guard
pnpm build             # → apps/extension/dist/chrome
pnpm package:chrome    # → artifacts/graphock-web-plugin-0.1.0-chrome.zip
pnpm safari:project    # → apps/safari (Xcode container, requires Xcode)
```

Load it in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `apps/extension/dist/chrome`

No certificate or store account is needed for local development. See
[`docs/qa/local-dev.md`](docs/qa/local-dev.md) for Safari.

## Repository layout

```text
apps/extension          MV3 extension (Vue 3 + Vite, esbuild for the content script)
packages/clip-model     Shared document model, JSON schema, canonical JSON, checksums
packages/handoff        Protocol URL builder/parser, compression, limits, error codes
packages/protocol-receiver  Reference receiver + CLI for the desktop app
packages/converters     HTML / Markdown / JSON / YAML / text serializers, filename rules
packages/capture        DOM sanitization, metadata extraction, asset storage
tooling/                Build, packaging, reference fetching, release scripts
docs/                   ADRs, protocol spec, legal, store, QA
tests/                  Unit tests, protocol vectors
```

## Protocol at a glance

```text
# small clips (compressed, ≤ 24,000 characters)
graphock-direct://import#p=v1.<base64url(deflateRaw(JSON))>

# large clips on the Direct build (app reads the file, user confirms)
graphock-direct://import?file=/Users/me/Downloads/Graphock/clip.json&v=1

# Mac App Store build: wake the app, the user picks the file
graphock://import
```

Full field tables, checksum algorithm, limits and the App integration checklist live in
[`docs/protocol/CUSTOM_PROTOCOL_IMPORT.md`](docs/protocol/CUSTOM_PROTOCOL_IMPORT.md).

Try the reference receiver:

```bash
pnpm protocol:receive --out ./tmp/clips --url 'graphock-direct://import#p=v1....'
```

## Development principles

- **One model, many formats.** Every serializer reads `ClipDocument`; no second extraction
  pipeline (see [ADR 0002](docs/adr/0002-converter-stack.md)).
- **Least privilege.** `activeTab` + `scripting`; no `<all_urls>` at install time (only an
  optional permission you can grant for cross-origin images), no remote code, no `eval`, no CDN
  at runtime. `offscreen` is used only to turn captured text into a Blob URL for local downloads.
- **Page content is untrusted.** Sanitize, never inject, never execute.
- **Fail closed.** Every protocol limit is enforced by both sender and receiver.

## Reference products

`docs/reference-web-extensions/` contains pinned, read-only snapshots of mature clippers
(Obsidian Web Clipper, MarkDownload, Defuddle) and notes-only records for AGPL projects
(SingleFile, Omnivore). Nothing there is bundled. See each `NOTES.md` for what we borrow.

## CI

CI uses the organization-bound free Linux runners (Sengi/Avrea) and the free macOS runner
instead of billed hosted runners. See [docs/ci-runners.md](docs/ci-runners.md).

## Troubleshooting

If a page fails to capture, open the popup and click **Copy diagnostics**, or open
`chrome://extensions` → Graphock → **service worker** for live logs. See
[`docs/qa/logs.md`](docs/qa/logs.md) for stages, budgets and what to report.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Commits must be signed off (DCO). Security issues:
[SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
