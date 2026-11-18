# Contributing

Thanks for helping. This project is a browser extension plus a shared protocol used by the
Graphock desktop app. Two rules matter more than style:

1. **Never widen permissions or add remote code without an explicit review.** The packaging
   script fails if the permission set changes without updating
   `tooling/package/permissions.snapshot.json`.
2. **Never add a second parsing pipeline.** All output formats are serialized from
   `ClipDocument` (see `docs/adr/0002-converter-stack.md`).

## Development

```bash
pnpm install
pnpm verify
```

Requirements: Node 24 (see `.nvmrc`), pnpm 10.

## Commit sign-off (DCO)

Every commit must contain:

```text
Signed-off-by: Your Name <you@example.com>
```

Use `git commit -s`. We do not require a CLA.

## Pull requests

- Keep changes focused; one concern per PR.
- Add or update tests. Protocol changes must update `tests/vectors/protocol/cases.json` and the
  spec document in the same PR.
- If your change touches any of these, say so in the PR description:
  - permissions or manifest fields
  - anything that transmits data off the device
  - the protocol schema, limits or checksum
  - captured HTML handling / sanitization
- No secrets, certificates, provisioning profiles or real user data in commits, fixtures or
  screenshots.

## Code style

- TypeScript strict mode; no `any` in new code unless justified in a comment.
- Prefer small modules with explicit inputs/outputs over shared mutable state.
- User-facing strings live in `_locales` or the UI layer; protocol code is English-only.
- Comments explain *why*, not *what*.

## Licensing of contributions

By contributing you agree your work is licensed under Apache-2.0. Third-party code must be
compatible; GPL/AGPL code must not be copied into this repository. Reference-only projects live
under `docs/reference-web-extensions/` with their original licenses.
