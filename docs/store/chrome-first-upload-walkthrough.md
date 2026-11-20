# Chrome Web Store 首次上传：逐步操作（小白版）

这份文档只做一件事：把已经验证过的本地下载版 ZIP 提交到 Chrome Web Store。
不需要命令行经验，也不需要配置服务器。

---

## 0. 开始前准备

### 0.1 你需要一个 Google 账号

- 能正常登录 Chrome Web Store Developer Dashboard
- 建议开启两步验证（2FA）
- 首次注册开发者需要支付 **一次性 5 美元**（Google 收，不是订阅）

### 0.2 你要上传的文件

在项目目录 `graphock-web-plugin/` 下：

| 用途 | 文件 |
| --- | --- |
| 扩展安装包（必须上传这个） | `artifacts/graphock-web-plugin-0.1.0-chrome.zip` |
| 图标 128×128 | `apps/extension/public/icons/icon-128.png` |
| 截图 1 | `artifacts/store-assets/01-popup-result.png` |
| 截图 2 | `artifacts/store-assets/02-options.png` |
| 隐私政策 | `https://github.com/moewolf-dev/graphock-web-plugin/blob/main/docs/legal/privacy-policy.md` |
| 官网 | `https://graphock.com` |
| 支持链接 | `https://github.com/moewolf-dev/graphock-web-plugin/issues` |

**不要上传**：

- `.zip.sha256` 文件（那只是校验值）
- `dist/` 文件夹（商店只收 ZIP）
- 任何 `.env`、密钥、证书

### 0.3 先核对 ZIP 没拿错

在终端执行：

```bash
cd /Volumes/13EjectionPlug/code/graphock/graphock-web-plugin
shasum -a 256 artifacts/graphock-web-plugin-0.1.0-chrome.zip
```

应该看到：

```text
c8ca1c10839e8abed2983f6631ca2d77b88bea2ddc621e37a4d66495aa8087e8
```

如果不一样，**停下来不要上传**，先重新运行：

```bash
pnpm qa:chrome:local
```

---

## 1. 注册开发者账号（只需一次）

1. 打开 <https://chrome.google.com/webstore/devconsole>
2. 用你的 Google 账号登录
3. 第一次会看到开发者协议：
   - 勾选同意
   - 填写开发者名称（可以写 `Graphock` 或你的名字）
   - 支付 5 美元注册费
4. 按提示验证邮箱/手机号
5. 开启两步验证（如果账号还没开）

完成后会进入 Developer Dashboard。

> 如果这个账号以前注册过开发者，直接跳到第 2 步。

---

## 2. 新建扩展条目

1. 在 Dashboard 右上角找 **“New item”** 或 **“Add new item”**
2. 选择上传 ZIP
3. 选中：

   `artifacts/graphock-web-plugin-0.1.0-chrome.zip`

4. 点上传，等待页面显示 package 已上传、版本为 `0.1.0`

### 常见错误

- **“Manifest file is missing or invalid”**
  说明传错了文件。必须传 `artifacts/......-chrome.zip`，不要传 `.sha256`，也不要传整个文件夹。
- **“Version already exists”**
  这个条目已经有 0.1.0 了。首次上传正常不会出现；如果出现，说明你在重复建条目，回到已有条目继续。

上传成功后，左侧/顶部通常会出现这些标签页：

- Store listing（商店信息）
- Privacy practices（隐私与权限）
- Distribution（发布范围）
- Test instructions / Reviewer notes（审核说明，位置可能略有不同）

不同年份的界面文字可能略有差异，按功能找即可。

---

## 3. Store listing（商店信息）

这一页是用户和审核员看到的内容。

### 3.1 基本信息

- **Product name**：`Graphock Web Clipper`
- **Summary / Short description**：

```text
Save the page you are reading as Markdown, HTML, JSON, YAML or a ZIP — locally. No account, no telemetry.
```

- **Category**：`Productivity`
- **Language**：`English`
  - 如果页面有 “Add language”，再添加 `Chinese (Simplified)`，填中文文案
- **Detailed description**：直接复制 `docs/store/chrome-listing.md` 里的英文详细说明；中文版在同一文件下半部分

### 3.2 图片素材

- **Store icon 128×128**：
  `apps/extension/public/icons/icon-128.png`
- **Screenshots**（至少 1 张，建议 2 张，尺寸都是 1280×800）：
  - `artifacts/store-assets/01-popup-result.png`
  - `artifacts/store-assets/02-options.png`
- **Promo tile 440×280**：可选，暂时没有可以先跳过；如果页面强制要求，再先生成

### 3.3 链接

- **Homepage URL**：`https://graphock.com`
- **Support URL**：`https://github.com/moewolf-dev/graphock-web-plugin/issues`

填完先点 **Save draft**。不要急着提审。

---

## 4. Privacy practices（隐私与权限）

这一页最容易卡审核，按下面填。

### 4.1 Single purpose（单一用途）

```text
Save the current page to a local file in the user's download folder.
```

### 4.2 权限说明

把下面内容分别填到对应权限的说明框：

| 权限 | 填写内容 |
| --- | --- |
| `activeTab` | Read the current tab only after the user clicks the extension. |
| `scripting` | Inject the capture script into that tab. |
| `storage` | Remember settings and a local list of recent clip titles/URLs. |
| `downloads` | Save the exported file or ZIP to the user's download folder. |
| `offscreen` | MV3 service workers cannot create Blob URLs; a tiny offscreen page creates the download. |
| Optional host permission `<all_urls>` | Only requested when the user clicks “Allow cross-origin images”, so images can be embedded. |

如果页面问 “Does your extension use remote code?”：选 **No**。

### 4.3 数据使用

- 是否收集用户数据：选 **No**
- 页面内容只在本地处理，不上传
- 不卖给第三方
- 不用于广告
- 不用于与单一用途无关的目的

如果页面有多个勾选确认，全部按“不收集 / 不出售 / 不共享”勾选。

### 4.4 隐私政策 URL

填：

```text
https://github.com/moewolf-dev/graphock-web-plugin/blob/main/docs/legal/privacy-policy.md
```

> `https://graphock.com/privacy` 目前返回的是官网首页，不是隐私政策，所以先用 GitHub 这个链接。等网站页面正式上线后再替换。
>
> 提审前用“无痕窗口”打开这个链接，确认不登录也能看到政策全文。

### 4.5 审核说明 / Test instructions

找到 **Test instructions**、**Reviewer notes** 或 **Notes for review**，填：

```text
No account or backend is required.

1. Open any normal article page.
2. Click the Graphock toolbar icon.
3. Choose Markdown (or HTML) and click "Save file".
4. Check the browser download folder for the exported file.
5. To test assets, choose "Images" and save the ZIP; it contains document.md,
   manifest.json and assets/.

This release saves files locally only. It does not open or send data to a
desktop app.
```

填完点 **Save draft**。

---

## 5. Distribution（发布范围）

- **Visibility**：`Public`
- **Regions**：`All regions`（除非你有明确的法律/业务限制）
- **Pricing**：`Free`
- **Mature content**：`No`
- 如果问是否使用远程代码/托管代码：`No`

保存。

---

## 6. 提交审核

1. 检查四个页面都已保存，没有红色报错
2. 右上角点 **Submit for review**
3. 如果出现发布选项：
   - **建议第一次不要勾选“审核通过后自动发布”**
   - 选择“审核通过后手动发布”/“Deferred publish”
   - 这样通过后你还能再检查一遍商店页面，再点 Publish
4. 确认提交

提交后状态会变成：

```text
Pending review
```

审核通常需要几小时到几天，期间不用重复提交。

---

## 7. 审核通过后

### 如果选择了手动发布

1. 回到 Developer Dashboard
2. 条目状态会变成 **Ready to publish** 或类似文字
3. 点 **Publish**
4. 商店页面正式上线

### 如果选择了自动发布

审核通过后会直接上线。

上线后自己从商店安装一次：

1. 打开商店条目
2. 点 **Add to Chrome**
3. 按第 4.5 节的步骤抓一个网页
4. 确认 Markdown/HTML/ZIP 都能下载
5. 确认弹窗里**没有**“在 Graphock 中打开”

---

## 8. 记录两个 ID（以后自动化要用）

### extensionId

在条目页面或地址栏里找 32 位字符串，例如：

```text
abcdefghijklmnopabcdefghijklmnop
```

也可以上传后在 `chrome://extensions` 里看到。

### publisherId

看 Dashboard 地址栏：

```text
https://chrome.google.com/webstore/devconsole/<publisherId>/...
```

`/devconsole/` 后面那一段就是 publisherId。也可以在 Account/Publisher 页面找。

把这两个 ID 记到安全的地方。**不要**把服务账号 JSON 发到聊天、Issue 或提交到仓库。

---

## 9. 后续版本自动化（第一次不用做）

等第一次审核通过、拿到两个 ID 后，再做：

1. Google Cloud Console 建项目
2. 启用 **Chrome Web Store API**
3. 建服务账号，下载 JSON key
4. 回 Developer Dashboard，把服务账号邮箱加入发布者账号
5. GitHub 仓库 → Settings → Environments → 新建 `chrome-web-store`
6. 添加 secrets：
   - `CWS_SERVICE_ACCOUNT_JSON`
   - `CWS_PUBLISHER_ID`
   - `CWS_EXTENSION_ID`
7. 设置 required reviewers
8. 以后跑 `publish-chrome-store` 工作流即可

---

## 10. 常见被拒原因与处理

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| Privacy policy 无效 | 链接打不开/不是政策 | 用 GitHub 链接，无痕窗口确认可访问 |
| 权限说明太模糊 | 只写“需要权限” | 用第 4.2 节原文 |
| 截图尺寸不对 | 不是 1280×800 或 640×400 | 重新用 `pnpm qa:store-assets` 生成 |
| 单一用途不清楚 | 描述里混入 App/云功能 | 只写“保存当前网页到本地文件” |
| 提到桌面 App | 本版本没有该功能 | 商店文案不要提 App 导入 |
| 远程代码 | 审核认为加载了远程脚本 | 说明无远程代码；构建是本地打包 |
| 找不到 128 图标 | 没上传 | 用 `apps/extension/public/icons/icon-128.png` |

---

## 11. 最短检查清单

提交前逐项打勾：

- [ ] ZIP SHA = `c8ca1c10…`
- [ ] 上传的是 ZIP，不是 `.sha256`
- [ ] 名称/简介/详细说明已填
- [ ] 128 图标 + 2 张 1280×800 截图
- [ ] 单一用途 = 本地保存
- [ ] 5 个权限说明已填
- [ ] 不收集数据、无远程代码
- [ ] 隐私政策 URL 无痕可打开
- [ ] 审核说明是本地下载步骤
- [ ] Public / Free / All regions
- [ ] 第一次选择“审核后手动发布”
