# 本地开发者加载指南（V-06）

结论：**开发期不需要任何商店凭据或“开发者证书”。**

- Chrome / Edge / Brave：加载已解压目录，零配置。
- Safari：Xcode 本地运行容器 App + Safari“允许未签名扩展”，零账号也可跑通；只有上传
  Mac App Store 时才需要 App ID、描述文件与证书。

## 1. Chrome / Edge / Brave

```bash
pnpm install
pnpm build
```

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）。
2. 打开右上角 **Developer mode / 开发者模式**。
3. 点击 **Load unpacked / 加载已解压的扩展程序**，选择 `apps/extension/dist/chrome`。
4. 修改代码后重新执行 `pnpm build`，在扩展卡片上点 **Reload / 重新加载**。

验证清单：

- 工具栏出现图标，点击后弹窗显示当前页标题。
- 切换 Readable / Full page / Selection 不报错。
- 点 **Copy import link** 后剪贴板得到 `graphock-direct://import#p=v1.…`。
- 点 **Save .md** 后下载目录出现 `Graphock/…md`。
- 扩展详情页的 **Errors** 为空。

常见问题：

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 弹窗显示 `E_INJECTION_FAILED` | 当前页是 `chrome://`、扩展商店或 PDF 查看器 | 换一个普通网页 |
| `E_EMPTY_CONTENT` | 页面没有可读文本（或未选中内容） | 切换模式 |
| 点 Open 没反应 | 浏览器拦截了外部协议 | 点 Copy import link，粘贴到地址栏；或先安装 App |
| Service worker 报错 | 构建产物过期 | 重新 `pnpm build` 并 Reload |

## 2. Safari（macOS）

前置：Xcode（App Store 安装即可）、Safari 16.4+、macOS 13.3+。

```bash
# 生成 Xcode 容器工程（首次或 manifest 变化时；会先构建 dist/safari）
pnpm safari:project
```

生成结果与验证记录见 [`safari-2026-11-18.md`](./safari-2026-11-18.md)。

然后在 Xcode 中：

1. 打开 `apps/safari/Graphock Web Clipper/Graphock Web Clipper.xcodeproj`。
2. 选择容器 App target → Signing & Capabilities → Team 选 **None**（或自己的个人团队），
   Signing Certificate 选 **Sign to Run Locally**。
3. 运行容器 App（⌘R）。首次运行后关闭。
4. Safari → 设置 → 高级 → 勾选 **显示网页开发者功能**。
5. 菜单栏 **开发** → **允许未签名扩展**（每次启动 Safari 后可能需要重新勾选）。
6. Safari → 设置 → 扩展 → 启用 **Graphock Web Clipper**。

验证清单：

- Safari 工具栏出现扩展按钮，弹窗可打开。
- 抓取普通网页成功；`E_INJECTION_FAILED` 只应出现在 Safari 内置页面。
- 保存文件走浏览器默认下载位置（Safari 没有 `downloads` 子目录能力）。
- 自定义协议唤起会被 Safari 拦截并询问，属预期行为。

## 3. 上传阶段才需要的凭据（现在不配置）

| 用途 | 变量（与 App 仓库同一套命名） |
| --- | --- |
| Chrome 首次上传 | 手动在后台完成，产生 item ID；自动化再加 OAuth client id/secret/refresh token |
| Safari Development 签名 | `GRAPHOCK_MAS_DEV_APP_CSC_LINK`、`GRAPHOCK_MAS_DEV_APP_CSC_PASSWORD`、`GRAPHOCK_MAS_DEV_PROFILE` |
| Safari Distribution 签名 | `GRAPHOCK_MAS_APP_CSC_LINK`、`GRAPHOCK_MAS_INSTALLER_CSC_LINK` 及对应密码 |
| 上传 App Store Connect | `GRAPHOCK_ASC_KEY`、`GRAPHOCK_ASC_KEY_ID`、`GRAPHOCK_ASC_ISSUER_ID` |

Team ID：`XMZJ99258B`（来自 `graphock-console-app/config/editions.json`）。**不要把任何
`.p12`、`.mobileprovision`、`.p8`、`.base64` 文件复制进本仓库**；`.gitignore` 已排除。
