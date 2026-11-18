# ADR 0001: Capture strategy — readable extraction plus full-page snapshot

- Status: accepted (pending V-04 comparison)
- Date: 2026-11-18

## Context

Users want two different things: the article they are reading, and a faithful copy of the page.
Obsidian Web Clipper, MarkDownload and SingleFile show that mature products support both. A
single mode always fails one group: readable extraction drops layout; full-page capture keeps
navigation and ads.

## Options

1. **Readable only** (Readability/Defuddle). Small output, good Markdown, loses layout.
2. **Full page only**. Faithful, but noisy and much larger.
3. **Both, chosen per clip** (default readable, switch to full/selection). Slightly more code,
   but matches real usage and keeps one document model.

## Decision

Option 3. Capture produces the same `ClipDocument` regardless of mode; `mode` is part of the
document and the checksum input.

## Consequences

- One sanitizer and one serializer pipeline serve all modes.
- Full-page HTML fidelity becomes its own task (CSS inlining, images, shadow DOM).
- V-04 must still pick the readable engine (Readability vs Defuddle) with a 30-site sample.
