# Self-audit for code review (2026-11-18)

This page is the reviewer's entry point. It maps the plan (`TODO_GRAPHOCK_WEB_PLUGIN_2026-11-18.md`
in the main repository) to the code that now exists, lists the verification evidence, and states
what can only be finished by a human or with external credentials.

## 1. What is implemented

| Area | Code | Tests / evidence |
| --- | --- | --- |
| Document model + checksums | `packages/clip-model` | `tests/unit/clip-model.test.ts`, `tests/unit/protocol-vectors.test.ts` |
| Handoff protocol (3 channels) | `packages/handoff`, `docs/protocol/CUSTOM_PROTOCOL_IMPORT.md` | `tests/unit/handoff.test.ts`, doc/code consistency test |
| Reference receiver + CLI | `packages/protocol-receiver` | `tests/unit/protocol-receiver.test.ts`, CLI smoke in evidence |
| Extractors (readable / full / selection) | `packages/capture`, `apps/extension/src/content` | `blocks.test.ts`, `capture.test.ts`, `dom.test.ts` |
| Images and assets | `packages/capture/src/images.ts`, `assets.ts` | `images.test.ts`, `build.test.ts` |
| Serializers (MD / HTML / JSON / YAML / TXT) | `packages/converters` | `converters.test.ts` |
| Alternative engine evaluation | `tooling/bench/compare-extraction.mjs` | `docs/qa/readable-comparison.md` |
| Extension UI (popup/options/save/offscreen) | `apps/extension` | E2E + axe |
| Packaging | `tooling/package`, `tooling/build` | reproducible zip, Safari archive |
| Protocol receiver for the App | receiver + `APP_INTEGRATION_CHECKLIST.md` | vectors ready to copy |
| Safari container | `apps/safari` (generated) | `xcodebuild` + archive succeed |

## 2. Where to look first (suggested review order)

1. **Protocol and security** — `docs/protocol/CUSTOM_PROTOCOL_IMPORT.md`,
   `packages/handoff/src/*`, `packages/protocol-receiver/src/receiver.ts`.
   Check limits, path handling, checksum definition and the auth-callback isolation warning.
2. **Capture correctness** — `packages/capture/src/{readable,blocks,sanitize,dom,images}.ts`.
   Check that page content is never executed and that failures are visible to the user.
3. **Background policy** — `apps/extension/src/background/{index,build}.ts`.
   Channel selection, MAS degradation, timeouts, downloads via offscreen, history.
4. **UI boundaries** — `apps/extension/src/{popup,options,save,offscreen}`.
   Optional host permission, cancel/stale-response handling, settings import.
5. **Supply chain and build** — `.github/workflows`, `tooling/ci`, `tooling/package`,
   `apps/extension/manifest.json`, `tooling/package/permissions.snapshot.json`.

## 3. Verification (re-runnable)

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test:coverage     # 119 tests, ~90% lines
pnpm test:e2e          # Chrome for Testing, capture + save + file channel + axe
pnpm lint:licenses     # production tree only
pnpm build && pnpm package:chrome
pnpm safari:project && pnpm package:safari   # requires Xcode
```

A clean clone (`git clone --depth 1`) was used to confirm that everything needed is tracked.

Remote CI: `verify` and `e2e` are green on `main`; `main` is protected (verify + dco, one review,
conversation resolution, no force push/delete).

## 4. Explicit trade-offs / known risks

- **Readability stays the default engine.** Defuddle wins coverage on article/docs fixtures but
  drops forum content to 0.34; the adapter is `capture/readable` if we revisit this.
- **Inline protocol payload is text-oriented.** Images almost always force the file channel
  (`graphock-direct://import?file=…`) on Direct builds; MAS degrades to links instead of pretending
  images were included.
- **Safari** has no `downloads`/`offscreen`: saves go through `save.html`, and the file handoff
  channel is intentionally unavailable.
- **Offscreen download helper** exists because Chrome interrupts `data:` URL downloads from MV3
  service workers; it adds the `offscreen` permission (justified in the store draft).
- **Capture and delivery are split.** Capture is a preview with no side effects; cancelling it
  aborts network work and writes nothing. Delivery (open/save) is explicit and history is only
  written then. Zip saves require the preview to still exist (10-minute TTL).
- **Channel limits are enforced by both ends.** Inline assets are capped at 8 MB; the file channel
  allows up to 200 MB with 20 MB per asset. The sender validates with the receiver's rules before
  writing a package.
- **Cross-origin images** require the optional `<all_urls>` permission; without it images are
  linked and the popup offers a one-click grant.
- **Reference snapshots** (≈20 MB) are pinned source for MIT/Apache projects and notes only for
  AGPL projects. They are excluded from builds and licence checks by design.
- **Local save size cap** is 2 MB for text files and 5 MB on Safari’s page fallback; larger
  content should use “Open in Graphock” or a smaller format. This is a deliberate MVP limit.
- **DOM and response guards** run before cloning/allocating (100k nodes / 600 depth; streamed
  image and CSS reads), so a hostile page fails with `E_TOO_LARGE` instead of exhausting memory.

## 5. What only a human / external party can finish

| Item | Why |
| --- | --- |
| Toolbar click → activeTab grant → OS protocol dialog | Requires a real user gesture and installed app |
| Safari: enable extension, capture, protocol prompt | Manual Safari UI work |
| Chrome/Safari store upload and review | Accounts/credentials intentionally not configured |
| App-side protocol import (A-01…A-05) | Separate repository, scheduled by the owner |
| 30-site real-world sample, 200% zoom, screen-reader walkthrough | Human judgement and live network |
| Signed/notarized Safari build, TestFlight | Certificates and Apple account |
| Store screenshots/promo tile | Visual approval |

## 6. Audit checklist

- [ ] No network requests except the user-triggered image/CSS fetches
- [ ] No `eval`, no remote code, CSP unchanged
- [ ] Permissions match `permissions.snapshot.json`
- [ ] Protocol limits identical in sender/receiver
- [ ] Path traversal, symlink and zip-bomb assumptions documented for the App
- [ ] Errors surface `code` (and `traceId` on the App side)
- [ ] No page content in logs or history (history stores title/URL only)
- [ ] `THIRD_PARTY_NOTICES.md` matches the production tree
- [ ] Safari bundle ids and Team ID are correct and no secrets are committed
