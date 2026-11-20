# Chrome 0.1.0 candidate — local-save scope

Status: **Chrome-only candidate**. App handoff and Safari are out of scope for
this tag.

## Scope

First release: capture the current page and save it locally.

- Readable / full page / selection capture
- Markdown, HTML, JSON, YAML, TXT
- Embedded images → ZIP (`document.*`, `manifest.json`, `assets/`)
- Local settings and recent-clip history
- No account, no telemetry, no server

The store build compiles with `GRAPHOCK_APP_HANDOFF=0`, so the popup has no
“Open in Graphock” / copy-link buttons, the options page has no desktop-app
section, and the manifest requests no `contextMenus` and declares no commands.
The background also rejects delivery/package messages in this mode.

Not in this release: App import, protocol prompts, MAS, Safari.

## Artifact

| Item | Value |
| --- | --- |
| Candidate commit | commit containing this sheet (local-save build) |
| Chrome ZIP | `artifacts/graphock-web-plugin-0.1.0-chrome.zip` |
| SHA-256 | `c8ca1c10839e8abed2983f6631ca2d77b88bea2ddc621e37a4d66495aa8087e8` |
| Manifest | MV3, version `0.1.0`, permissions `activeTab,scripting,storage,downloads,offscreen` |
| Install-time host permissions | none |
| Build | `pnpm qa:chrome:local` (= `build:e2e:local` → Playwright → `package:chrome:store`) |
| Record | `artifacts/chrome-local-release.json` (local); remote artifact carries the ZIP + `.sha256` |
| Remote evidence | `release-chrome` run `44679547142`, success, same SHA |

The packager re-execs with `TZ=UTC`, so the ZIP is reproducible across machines
and the free Linux release runner.

## Automated verification

`pnpm qa:chrome:local` performs:

1. Local-save E2E build.
2. Playwright `tests/e2e/local-store.spec.ts`:
   - no `open-app`, `copy-link` or protocol footer in the popup;
   - no desktop-app section in options;
   - Markdown download reads back;
   - self-contained HTML download reads back;
   - embedded-image ZIP contains `document.md`, `manifest.json`, `assets/`.
3. `package:chrome:store` and a manifest check: no `contextMenus`, no commands,
   no install-time host permissions, version matches.
4. Writes `artifacts/chrome-local-release.json` with the SHA-256.

Screenshots for the listing:

```bash
pnpm qa:store-assets
# artifacts/store-assets/01-popup-result.png (1280×800)
# artifacts/store-assets/02-options.png       (1280×800)
```

## Manual smoke (one browser session)

1. Fresh Chrome profile → `chrome://extensions` → Developer mode → Load unpacked
   `apps/extension/dist/chrome` (the local-save build).
2. Open a normal article with images.
3. Click the toolbar icon (not a context menu); confirm no permission error.
4. Choose Markdown → **Save file**; confirm the file in Downloads.
5. Switch to HTML → save; open it offline and confirm it is self-contained.
6. Choose embedded images → **Save .zip**; confirm `document.md`,
   `manifest.json`, `assets/`.
7. Check the popup has no App button and Settings has no desktop-app section.
8. Cancel a slow capture and confirm no download/history entry.

This is the only manual gate: the store reviewer sees the same flow.

## Exit criteria before tagging `v0.1.0`

- [ ] `verify`, `functional` green on the candidate commit.
- [ ] `pnpm qa:chrome:local` PASS with the recorded ZIP SHA.
- [ ] Manual smoke above passed on the exact ZIP contents.
- [ ] Store listing/screenshots match local-save scope.
- [ ] Privacy policy URL resolves to the local-save policy.
- [ ] App PR #3, MAS and Safari are **not** tag gates.

## Release workflow

- Merges to `main` run `auto-release-chrome`: it increments only the patch
  version, builds the local-save ZIP, uploads/publishes through the store API and
  tags `v<version>` (no bot commit to protected main).
- `release-chrome` remains a manual/tag build; `publish-chrome-store` remains the
  manual fallback.
- Store credentials live only in the `chrome-web-store` environment.

## Do not

- Do not ship the default dev build as the store package; it still contains the
  App handoff surface.
- Do not claim desktop-app import in the 0.1.0 listing.
- Do not run Xcode/Safari work in this tag.
