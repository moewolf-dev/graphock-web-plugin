# Chrome Web Store listing (draft)

- Product: Graphock Web Clipper
- Category: Productivity
- Languages: English, 中文（简体）
- Website: https://graphock.com
- Support: https://github.com/moewolf-dev/graphock-web-plugin/issues
- Privacy policy: https://graphock.com/privacy (verify live before submit)

## Short description (≤132 chars)

Save the page you are reading as Markdown, HTML, JSON or YAML — or send it straight to the
Graphock desktop app. No account, no telemetry.

## Detailed description

Graphock Web Clipper turns the page you are reading into a file you own.

- **Three capture modes** — readable article, full page, or just the selection.
- **Four formats** — Markdown, self-contained HTML, JSON and YAML from one document model.
- **Images included or linked** — embed images (with optional cross-origin access) or keep URLs.
- **Local first** — files are saved to your download folder. Page content never goes to a server.
- **Send to Graphock** — a custom protocol hands the clip to the desktop app, which asks you to
  confirm the import.
- **No account, no ads, no analytics.**

Open source (Apache-2.0): https://github.com/moewolf-dev/graphock-web-plugin

## Single purpose

Save the current page to a local file or hand it to the Graphock desktop app.

## Permission justifications

| Permission | Why |
| --- | --- |
| `activeTab` | Read the current tab, only after you click the extension. |
| `scripting` | Inject the capture script into that tab. |
| `storage` | Remember settings and a local list of recent clip titles/URLs. |
| `downloads` | Save the exported file or clip package to your download folder. |
| `offscreen` | MV3 service workers cannot create Blob URLs; a tiny offscreen page creates the download. |
| `contextMenus` | Right-click “Clip page / Clip selection”. |
| Optional `host_permissions` (`<all_urls>`) | Only requested if you click “Allow cross-origin images”, so embedded images can be fetched. |

No host permissions are requested at install time. No remote code, no `eval`, no CDN.

## Data usage answers

- Does the extension collect user data? **No data leaves the device.** Page content is processed
  locally and written to a file or handed to a local app.
- Website content: processed transiently in memory and saved only when the user asks.
- Personally identifiable information: not collected.
- Authentication information: not collected (no login).
- Financial / health / personal communications: not collected.
- Sale to third parties: no.

## Assets to produce before submitting

- [ ] 128×128 icon, 440×280 promo tile
- [ ] 3–5 screenshots at 1280×800 showing popup, format/image options, settings, history
- [ ] Store listing text in en + zh-CN
- [ ] Source code archive if the build is minified (we ship readable output)
