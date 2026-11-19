# Changelog

All notable changes are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Readable extraction (Readability) with structured blocks (headings, lists, quotes, code,
  tables, figures), full-page and selection modes.
- Image collection (same-origin/CORS, budgets, dedupe) with embed/link/skip policies.
- Self-contained HTML export (inline + same-origin CSS, data-URI images) and JSON/YAML output.
- File handoff channel for large clips (Direct builds) with automatic MAS degradation.
- Reference snapshots of Obsidian Web Clipper, MarkDownload and Defuddle at pinned commits,
  plus notes-only records for SingleFile and Omnivore.
- Optional cross-origin image access, background image fetching, shadow DOM flattening,
  iframe placeholders, CSS background/font inlining, 20 s capture timeout and cancellation.
- Deterministic zip export (document + manifest + assets).
- Recent clips, diagnostics, settings export/import, clear-all, English/Chinese UI, context menu
  and keyboard shortcuts.
- ESLint, coverage thresholds, DCO and licence gates, e2e CI workflow.
- Store listing drafts, rollback runbook, release/compat templates, Safari icon and privacy
  manifest, unsigned Safari archive.
- Safari container project generated from the Safari build variant (classic service worker,
  no downloads/offscreen APIs, save-page fallback), with an idempotent regeneration script.
- Audit fixes: cancel now aborts background work and leaves no downloads/history; channel-aware
  protocol limits shared with the receiver; full-page HTML honours embed/link/skip and allows
  inlined fonts; duplicate image URLs keep every reference; atomic receiver writes; explicit
  zip-preview expiry; DOM/stream size guards before allocation; TXT export and validated
  settings import.
- Runtime feedback fixes: longer staged capture budgets with parallel image/CSS fetching,
  stage-aware timeout errors, structured logs in the popup/options/content script, and the
  save/open button order swapped.
- Playwright user-flow suite with real clicks/keyboard, failure screenshots/trace/logs,
  `pnpm qa` entry and a merge gate; UI fixes for stale results while recapturing, keyboard
  settings import, and 320px Chinese layout.
- CI moves to organization-bound free runners (Sengi/Avrea Linux, self-hosted macOS) with
  repository-variable overrides and a fork guard.
- Release hardening: Chrome-only tag workflow, manual Safari archive with an Xcode runner
  guard, Safari build validation in CI, Linux functional e2e as the required gate, filtered
  failure artifacts with extension logs, stronger cancel/URL assertions, scheduled nightly.
- Protocol v1 spec (`docs/protocol/CUSTOM_PROTOCOL_IMPORT.md`) with inline/file/wake channels.
- `@graphock/clip-model`: document model, zod schema, canonical JSON, checksums.
- `@graphock/handoff`: URL builder/parser, DEFLATE + base64url encoding, limits, error codes.
- `@graphock/protocol-receiver`: reference receiver, CLI, manifest writing, duplicate detection.
- `@graphock/converters`: filename rules (Windows-safe), Markdown/JSON/YAML/HTML/text serializers.
- `@graphock/capture`: metadata extraction, DOM sanitization, asset deduplication.
- Chrome MV3 extension (developer preview): popup, options, background capture, Markdown save.
- Protocol test vectors and doc/code consistency tests.

## [0.1.0] - 2026-11-18

- Initial developer preview.
