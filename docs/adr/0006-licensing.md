# ADR 0006: Apache-2.0 project, reference-only GPL/AGPL study

- Status: accepted
- Date: 2026-11-18

## Context

The requirement asks us to download real code from mature extensions for reference. Some of the
best (SingleFile, Omnivore) are AGPL; copying their code would contaminate an Apache-2.0 product.

## Options

1. Vendor everything and rely on "it's just reference" — legally fragile.
2. Vendor only MIT/Apache sources; keep GPL/AGPL as notes + links at pinned commits.

## Decision

Option 2. `docs/reference-web-extensions/references.json` records repo, commit, license and
storage policy; the fetch script refuses to write source for copyleft projects.

## Consequences

- We still learn interaction and architecture from SingleFile, without copying code.
- License review is a CI-visible artifact rather than tribal knowledge.
