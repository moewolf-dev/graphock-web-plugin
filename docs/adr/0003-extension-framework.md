# ADR 0003: Start with plain Vite + esbuild, evaluate WXT in V-01

- Status: accepted (plain Vite + esbuild)
- Date: 2026-11-18

## Context

We need cross-browser manifest generation, a fast popup build, and a content script that MV3 can
inject as a classic script. WXT is popular and handles targets/i18n, but Safari support and
long-term control matter for store compliance and a 5-year open-source project.

## Options

1. **WXT** — batteries included, less boilerplate, extra abstraction and upgrade risk.
2. **Plain Vite + esbuild** — full control, ~150 lines of build code, no framework lock-in.

## Decision

Ship `0.1.0` on option 2. V-01 is closed by implementation: the slice (MV3 popup/options,
service worker, content script, offscreen download helper, Safari classic bundle) builds and
passes E2E without a framework. WXT was not adopted because Safari requires a classic service
worker bundle and per-store manifests anyway, which is most of what a framework would provide.

## Consequences

- We own manifest generation and per-browser packaging (already needed for store review).
- If WXT wins later, the migration is mostly build config, not business code.
