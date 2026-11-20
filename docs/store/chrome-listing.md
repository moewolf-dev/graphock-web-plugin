# Chrome Web Store listing — local-save release

- Product: Graphock Web Clipper
- Category: Productivity
- Languages: English, 中文（简体）
- Website: https://graphock.com
- Support: https://github.com/moewolf-dev/graphock-web-plugin/issues
- Privacy policy: https://github.com/moewolf-dev/graphock-web-plugin/blob/main/docs/legal/privacy-policy.md
  (interim; replace with https://graphock.com/privacy once that page is deployed)

## Short description (≤132 chars)

Save the page you are reading as Markdown, HTML, JSON, YAML or a ZIP — locally. No account, no
telemetry.

## Detailed description

Graphock Web Clipper turns the page you are reading into a file you own.

- **Three capture modes** — readable article, full page, or just the selection.
- **Four document formats** — Markdown, self-contained HTML, JSON and YAML from one document model.
- **Images included or linked** — embed images (with optional cross-origin access) or keep URLs;
  clips with assets save as a ZIP containing the document, manifest and asset files.
- **Local first** — everything is written to your browser's download folder. Page content never
  goes to a server.
- **Settings and history stay local** — clear them at any time from the options page.
- **No account, no ads, no analytics.**

This release is download-only. It does not open or send data to the Graphock desktop app.

Open source (Apache-2.0): https://github.com/moewolf-dev/graphock-web-plugin

## Single purpose

Save the current page to a local file in the user's download folder.

## Permission justifications

| Permission | Why |
| --- | --- |
| `activeTab` | Read the current tab, only after you click the extension. |
| `scripting` | Inject the capture script into that tab. |
| `storage` | Remember settings and a local list of recent clip titles/URLs. |
| `downloads` | Save the exported file or ZIP to your download folder. |
| `offscreen` | MV3 service workers cannot create Blob URLs; a tiny offscreen page creates the download. |
| Optional `host_permissions` (`<all_urls>`) | Only requested if you click “Allow cross-origin images”, so embedded images can be fetched. |

No host permissions are requested at install time. No remote code, no `eval`, no CDN.
The local-save manifest does not request `contextMenus` and declares no App shortcuts.

## Data usage answers

- Does the extension collect user data? **No data leaves the device.**
- Page content: processed transiently in memory and written to a local file only when the user asks.
- Personally identifiable information: not collected.
- Authentication information: not collected (no login).
- Financial / health / personal communications: not collected.
- Sale to third parties: no.

## Reviewer notes

1. Open any normal article page.
2. Click the extension icon.
3. Choose Markdown (or HTML) and click **Save file**.
4. Confirm the file appears in the browser's download folder.
5. For assets, choose Embedded images and save the resulting ZIP; it contains
   `document.md`, `manifest.json` and `assets/`.

No account, backend or desktop app is required.

## Assets

- [x] 128×128 icon (`apps/extension/public/icons/icon-128.png`)
- [ ] 440×280 promo tile
- [x] Store screenshots generated from the candidate build:
      `pnpm qa:store-assets` → `artifacts/store-assets/`
- [x] Listing text en + zh-CN
- [x] Source is readable; no minified source archive needed (confirm before submit)

## Before submitting

- [ ] Confirm the privacy URL serves the policy (GitHub URL works today; the
      website page was not live on 2026-11-20).
- [ ] Attach the screenshots from `artifacts/store-assets/`.
- [ ] Upload the ZIP recorded in `artifacts/chrome-local-release.json`.
- [ ] Do not claim desktop-app import in this release.
