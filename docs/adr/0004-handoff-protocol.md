# ADR 0004: Three handoff channels, not one

- Status: accepted
- Date: 2026-11-18

## Context

A custom protocol cannot carry a whole page: Windows command lines cap at 32,767 characters, and
the MAS sandbox cannot read arbitrary downloads. A single "put everything in the URL" design
would work in demos and fail for real pages.

## Options

1. Inline payload only — simple, breaks above ~24 KB of compressed content.
2. File path only — good for large clips, impossible on MAS.
3. **Three channels** (inline / file path / wake-only) with explicit UI and a capability matrix.

## Decision

Option 3. The extension selects the channel before the user clicks, shows which one will be used,
and degrades without losing the user's content.

## Consequences

- The desktop app must confirm imports and validate paths.
- Two checksums exist (document dedupe vs transport integrity); only the handoff checksum is
  required by the app.
- A future localhost bridge could replace the file channel, but only after a security review.
