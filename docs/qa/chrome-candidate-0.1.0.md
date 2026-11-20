# Chrome candidate 0.1.0 — verification sheet

Status: **pre-candidate** (no tag created). Use this sheet before creating `v0.1.0`.

## Artifact

| Item | Value |
| --- | --- |
| Plugin code commit | `98004d6` (later commits are docs/CI only; `baf45f2` made the ZIP TZ-independent) |
| Plugin docs/HEAD at recording | `9a3219a` |
| App receiver commit | `c957c872` on `feat/web-clip-protocol-import` (PR #3 draft, **not merged**) |
| Chrome ZIP | `artifacts/graphock-web-plugin-0.1.0-chrome.zip` |
| SHA-256 | `d231add6…` (reproducible; packager re-execs with `TZ=UTC`) |
| Remote evidence | release run `44468767283` (source `d676f3d`) matched the local repack |
| Build | `pnpm build && pnpm package:chrome` |

The same SHA is produced by the free Linux release workflow (`release-chrome`, manual dispatch).

## Load and smoke (5 minutes)

1. `chrome://extensions` → Developer mode → Load unpacked →
   `graphock-web-plugin/apps/extension/dist/chrome`.
2. Open a normal article with images, click the icon.
3. Check: Readable / Full page / Selection switch without stale results.
4. Check: Markdown / HTML / JSON / YAML / TXT produce files; embedded images produce `.zip`
   with `document.*`, `manifest.json`, `assets/`.
5. Check: Links and Text-only policies do not fetch image/font resources (DevTools Network).
6. Check: Cancel during a slow capture creates **no** download and **no** history entry.
7. Settings: import/export, logs copy/download/clear, 320px Chinese layout, `lang=zh-CN`.

## App protocol (requires App PR #3)

App-side unit coverage is in place (43 protocol tests, including all 11 plugin
vectors and a real mount/SQLite integration lane); the steps below are the
remaining system-level checks that need a packaged build and real clicks.
Use the generated links and checklists in
[`system-e2e-2026-11-20.md`](./system-e2e-2026-11-20.md).

1. Run the App build with the PR (dev or packaged).
2. Click **Open in Graphock** from the popup.
3. Expect: system protocol prompt → App confirmation dialog (title/source/size) → file appears
   in the workspace file list.
4. Repeat with a large clip (file channel) and a MAS build (inline/wake-only).
5. Duplicate import must show `E_DUPLICATE_CLIP`, not create a second file.

## Exit criteria before tagging

- [ ] `verify`, `functional` green on the candidate commit; `visual` green on trusted macOS.
- [ ] App PR #3 merged and the packaged App imports a browser clip.
- [ ] No console errors in the service worker during the checklist.
- [ ] Chrome ZIP SHA recorded in the release evidence.
- [ ] Safari local archive regenerated from the same plugin commit.

## Do not

- Do not tag before the App path is verified; the plugin alone is ready, the import path is not.
- Do not run Xcode archive in remote CI; use `pnpm release:safari:local`.
