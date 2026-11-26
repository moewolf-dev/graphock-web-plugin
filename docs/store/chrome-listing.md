# Chrome Web Store listing — 0.2 desktop handoff candidate

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
- **Local first** — save to your browser's download folder or explicitly hand a clip to the
  desktop app. The extension does not upload clips to a server.
- **Settings and history stay local** — clear them at any time from the options page.
- **No account, no ads, no analytics.**

Optionally choose **Open in Graphock** to pass a clip to the installed desktop app.
For large clips, the extension saves a package and the app may ask you to select it.

Open source (Apache-2.0): https://github.com/moewolf-dev/graphock-web-plugin

## Single purpose

Save the current page locally or pass it to the installed Graphock desktop app at the user's request.


## 中文（简体）

**简短说明（≤132 字符）**

把当前网页保存为 Markdown、HTML、JSON、YAML 或带图片的 ZIP，全部保存在本地。无账号、无遥测。

**详细说明**

Graphock 网页剪藏把正在阅读的页面变成你自己的文件。

- **三种抓取方式**：正文、整页或仅选区。
- **五种格式**：Markdown、自包含 HTML、JSON、YAML、纯文本。
- **图片可选**：嵌入图片（需要时再授权跨域读取）或保留链接；含图片的剪藏会保存为 ZIP，内含文档、清单和 assets。
- **本地优先**：文件写入浏览器下载目录，也可由你选择交给桌面应用；扩展不会将剪藏上传到服务器。
- **设置与历史只在本机**：可随时在设置页清空。
- **无账号、无广告、无分析。**

也可以选择“在 Graphock 中打开”，将剪藏交给已安装的桌面应用。较大的剪藏会保存为文件包，应用可能提示你选择该文件。

开源（Apache-2.0）：https://github.com/moewolf-dev/graphock-web-plugin

**单一用途**

把当前网页保存为本地文件，或按用户选择交给已安装的 Graphock 桌面应用。

**审核说明**

1. 打开任意普通文章页。
2. 点击扩展图标。
3. 选择 Markdown 或 HTML，点击“保存文件”。
4. 在下载目录确认文件。
5. 选择“嵌入图片”保存 ZIP，确认包含 document.md、manifest.json 和 assets/。

不需要账号、后端或桌面应用。

## Permission justifications

| Permission | Why |
| --- | --- |
| `activeTab` | Read the current tab, only after you click the extension. |
| `scripting` | Inject the capture script into that tab. |
| `storage` | Remember settings and a local list of recent clip titles/URLs. |
| `downloads` | Save the exported file or ZIP to your download folder. |
| `offscreen` | MV3 service workers cannot create Blob URLs; a tiny offscreen page creates the download. |
| `contextMenus` | Offer page and selection clipping actions in the browser context menu. |
| Optional `host_permissions` (`<all_urls>`) | Only requested if you click “Allow cross-origin images”, so embedded images can be fetched. |

No host permissions are requested at install time. No remote code, no `eval`, no CDN.
The handoff-enabled manifest requests `contextMenus` and declares shortcuts for clipping.

## Data usage answers

- Does the extension upload user data? **The extension does not upload clips to a server.** The desktop app's settings apply after an explicit handoff.
- Page content: processed in memory and saved locally or passed to the installed desktop app only when the user asks.
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
- [x] Generate and review screenshots with `pnpm qa:store-handoff-assets` (`artifacts/store-assets-handoff/`).
- [ ] Attach the handoff screenshots and update the store listing.
- [ ] Upload the verified handoff-enabled ZIP after the matching desktop app is available.
