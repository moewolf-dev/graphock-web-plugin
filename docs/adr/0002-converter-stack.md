# ADR 0002: One document model, thin serializers

- Status: accepted
- Date: 2026-11-18

## Context

The desktop app already suffered from four parallel parse implementations returning different
shapes. The extension risks the same with HTML/Markdown/JSON/YAML/TXT if each format gets its own
extraction path.

## Options

1. Convert HTML → Markdown directly, JSON/YAML from a separate scraper.
2. Define `clip-model` once; all serializers are pure functions over it.

## Decision

Option 2. JSON and YAML are the **same** object serialized two ways; YAML never introduces fields.
`canonicalize()` defines stable key order so JSON output and checksums are reproducible.

## Consequences

- Adding a format is a small, testable function.
- Some HTML fidelity is lost when going through the model; full-page HTML export therefore
  keeps a separate raw snapshot path, but still reports through the same asset list.
- Schema changes require a version bump and both sides updating.
