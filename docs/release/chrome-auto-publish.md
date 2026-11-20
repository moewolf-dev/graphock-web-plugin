# Chrome 自动发布（push → 递增 z → 上传 → 提审）

目标：合并代码到 `main` 后，自动生成下一个 **patch** 版本（只加 z），构建
本地下载版 ZIP，调用 Chrome Web Store API 上传并提交发布。Google 仍会审核，
自动化不能跳过审核。

## 1. 行为

触发条件：`push` 到 `main`，且改动涉及以下路径之一：

- `apps/extension/**`
- `packages/**`
- `tooling/package/**`
- `tooling/release/**`
- `package.json` / `pnpm-lock.yaml`
- `.github/workflows/auto-release-chrome.yml`

纯文档/截图提交不会发版。

每个版本：

1. `lint` + `typecheck` + 单元测试
2. 计算版本
3. 本地下载版 E2E（4 项：无 App 入口、Markdown、HTML、ZIP）
4. 构建 `dist/chrome` 和商店 ZIP
5. 用 `GRAPHOCK_RELEASE_VERSION` 覆盖 manifest 版本
6. 校验 ZIP 无 `contextMenus` / `commands` / 安装时 host 权限
7. 创建 `v<version>` tag（不向受保护的 main 推提交）
8. 服务账号换 token
9. CWS API `upload → fetchStatus → publish`
10. 上传 ZIP 到 Actions artifact 并写 summary

## 2. 版本规则：只递增 z

版本来源：

- x.y 来自 `apps/extension/package.json`（当前 `0.1.0`）
- z = `max(package 的 z, 同 x.y 的 tag 的最大 z) + 1`
- 其他 x.y 的 tag 会被忽略

示例：

| package | 已有 tag | 下一个 |
| --- | --- | --- |
| 0.1.0 | 无 | 0.1.1 |
| 0.1.0 | v0.1.1 | 0.1.2 |
| 0.1.0 | v0.2.9 | 0.1.1（忽略 0.2） |
| 0.2.0 | v0.2.3 | 0.2.4 |

因此：

- 日常 push **永远不会**把 0.1 变成 0.2。
- 只有你手动把 `apps/extension/package.json` 改成 `0.2.0`，并合并后，自动化才会进入 0.2.x。
- 本地可检查下一个版本：

```bash
pnpm release:version:next
```

## 3. 一次性配置

### 3.1 记录 extensionId

你已经有。它也在条目页/地址栏里，格式为 32 位小写字母。

### 3.2 找到 publisherId

打开 Developer Dashboard，看地址栏：

```text
https://chrome.google.com/webstore/devconsole/<publisherId>/...
```

`/devconsole/` 后面那段就是 `publisherId`。也可以在 Account / Publisher
页面找。

### 3.3 建 Google Cloud 服务账号

1. 打开 <https://console.cloud.google.com/>
2. 新建项目，例如 `graphock-cws`
3. APIs & Services → Library → 搜索 **Chrome Web Store API** → Enable
4. IAM & Admin → Service Accounts → Create service account
   - 名称：`graphock-cws-publisher`
   - 不需要项目角色
5. 进入该服务账号 → Keys → Add key → Create new key → **JSON** → 下载
6. 回到 Developer Dashboard → Account / Publisher → Service accounts
   - 添加这个服务账号的邮箱
   - 保存

> 服务账号必须先绑定到发布者账号，否则 API 会返回 401/403。

### 3.4 GitHub environment 与 secrets

仓库 → Settings → Environments → 新建 `chrome-web-store`：

| 名称 | 类型 | 内容 |
| --- | --- | --- |
| `CWS_SERVICE_ACCOUNT_JSON` | Secret | 上一步下载的 JSON 全文 |
| `CWS_PUBLISHER_ID` | Secret | 3.2 的 publisherId |
| `CWS_EXTENSION_ID` | Secret | 3.1 的 extensionId |

可选 Repository variable：

| 名称 | 值 |
| --- | --- |
| `CWS_PUBLISH_TYPE` | `DEFAULT_PUBLISH`（默认）或 `STAGED_PUBLISH` |

**关于 required reviewers**：如果给 `chrome-web-store` 环境加了“需要人工批准”，
自动工作流会在发布前停下来等人点批准，不再是无人工。想要真正 push 即发布，
不要给这个环境加 required reviewers；Google 审核本身就是安全门。
如果既要手动发布的安全、又要自动，另建一个无审批的同名 secrets 环境并改
workflow 的 `environment`。

### 3.5 先跑一次 dry run

Actions → **auto-release-chrome** → Run workflow：

- `dry_run` 勾选 `true`
- 运行

它会完成版本计算、构建、E2E、ZIP 校验，但**不会**认证、上传或打 tag。
确认日志里出现：

```text
[cws] dry run: no network calls
```

## 4. 日常流程

1. 开 PR，改代码
2. 通过 `verify` / `functional` / `sign-off`，合并到 `main`
3. `auto-release-chrome` 自动运行
4. Actions summary 会显示：
   - version（例如 `0.1.1`）
   - tag（`v0.1.1`）
   - ZIP 路径
   - SHA-256
5. Google 审核（几小时到几天）
6. 审核通过后按 `CWS_PUBLISH_TYPE` 上线：
   - `DEFAULT_PUBLISH`：通过即发布
   - `STAGED_PUBLISH`：通过后到 Dashboard 手动点 Publish

> `DEFAULT_PUBLISH` 也只是“审核通过后自动上线”，不是“提交即上线”。

## 5. 失败与重试

- **认证/ID 检查失败**：发生在打 tag 之前，不会消耗版本，修好 secrets 后重跑同一提交。
- **上传/发布失败**：tag 已创建，版本视为已占用；下次 push 会递增到下一个 z。
- **重复跑同一版本**：不会覆盖已有 tag；工作流会拒绝。
- **需要跳过某次发版**：提交信息包含 `[skip release]`，或只改文档。
- **想手动补发**：Actions → `publish-chrome-store`，指定已有 release run 和 SHA。

## 6. 手动命令

```bash
# 下一个 patch 版本（不修改文件）
pnpm release:version:next

# 本地构建指定版本
GRAPHOCK_RELEASE_VERSION=0.1.1 pnpm package:chrome:store

# 只校验 ZIP，不发网络请求
node tooling/release/cws-publish.mjs \
  --zip artifacts/graphock-web-plugin-0.1.1-chrome.zip --dry-run

# 本地直接调用 API（需要 CWS_ACCESS_TOKEN 等环境变量）
CWS_ACCESS_TOKEN=... CWS_PUBLISHER_ID=... CWS_EXTENSION_ID=... \
  pnpm release:publish:cws --zip artifacts/graphock-web-plugin-0.1.1-chrome.zip
```

## 7. 安全

- 商店凭据只放在受保护 environment；PR/fork 不接触。
- 工作流不打印 token 或 service account JSON。
- `publish-chrome-store` 仍然是手动备份入口。
- 不要给 `chrome-web-store` 环境加不受控的 `pull_request` 触发。

## 8. 还需要你确认

- `CWS_PUBLISHER_ID` 是否已拿到
- 服务账号是否已在 Dashboard 绑定
- `chrome-web-store` 环境是否已加三个 secrets
- 是否要无审批自动发布（不加 required reviewers）

配置完成后，先 dry run，再合并一次小改动验证 `0.1.1`。
