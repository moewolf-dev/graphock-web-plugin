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
