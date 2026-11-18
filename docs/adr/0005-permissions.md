# ADR 0005: Least-privilege permissions

- Status: accepted
- Date: 2026-11-18

## Context

Chrome Web Store review scrutinizes host permissions and "reads your data" claims. The extension
only needs the current tab, and only after a user gesture.

## Options

1. `<all_urls>` + content script on every page — simplest image fetching, worst review outcome.
2. `activeTab` + `scripting`, optional host permission only when embedding cross-origin images.

## Decision

Option 2. No `host_permissions` by default. If cross-origin image embedding is enabled, request
`optional_host_permissions` at runtime with a plain-language explanation. A snapshot test fails
the build when the permission set changes.

## Consequences

- Some images stay as links; the UI must say so instead of silently dropping them.
- Single-purpose statement stays honest: "save the current page".
