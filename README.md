# Graphock Web Clipper

A browser extension that saves the page you are reading as a clean local file, or hands it
straight to the [Graphock](https://graphock.com) desktop app.

- **Chrome / Edge / Brave** (Manifest V3)
- **Safari** (macOS 13.3+, Safari 16.4+) — in progress
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

- captures page metadata + readable text and produces a Markdown handoff payload;
- builds an inline `graphock-direct://import#p=v1.…` link (or falls back to wake-only when the
  content is too large);
- saves Markdown through the browser download API;
- settings page for target app channel, default mode and download subdirectory;
- reference protocol receiver (`packages/protocol-receiver`) + test vectors for the desktop app.

Not yet implemented (tracked in the plan): full-page HTML with inlined assets, image embedding,
JSON/YAML exports from the extension UI, Safari packaging, store submission.

## Quick start

```bash
pnpm install
pnpm verify            # typecheck + 59 unit tests + build
pnpm test:e2e          # real Chrome: load extension, capture a page, build a handoff URL
pnpm build             # → apps/extension/dist/chrome
pnpm package:chrome    # → artifacts/graphock-web-plugin-0.1.0-chrome.zip
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
- **Least privilege.** `activeTab` + `scripting`; no `<all_urls>` by default, no remote code,
  no `eval`, no CDN at runtime.
- **Page content is untrusted.** Sanitize, never inject, never execute.
- **Fail closed.** Every protocol limit is enforced by both sender and receiver.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Commits must be signed off (DCO). Security issues:
[SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
