# Graphock 网页剪藏导入协议（Custom Protocol Import）

- **版本**：`1`（载荷 `schema: graphock.clip.handoff/1`）
- **状态**：Draft for App integration（2026-11-18）
- **权威实现**：`packages/handoff`、`packages/clip-model`、`packages/protocol-receiver`
- **适用范围**：`graphock-web-plugin` 浏览器插件 → `graphock-console-app` 桌面端
- **不适用**：登录回调（`<scheme>://callback`）。导入协议与登录回调**必须完全隔离**，见第 10 节。

> 这份文档的目标是：**App 侧不需要读插件源码，只读本文就能实现对接收端**。所有数值都来自代码常量，`tests/unit/protocol-constants.test.ts` 会守住“文档与代码一致”。

---

## 1. 背景与设计约束

插件要把当前网页交给本机安装的 Graphock。可选实现有三种，分别受不同限制：

| 通道 | 载体 | 限制 |
| --- | --- | --- |
| A 内联载荷 | URL fragment | Windows 命令行上限 32,767 字符；插件统一按 24,000 字符截断 |
| B 文件路径 | URL query + 已下载文件 | 需要 App 有权限读取该路径；MAS 沙盒读不到任意下载目录 |
| C 仅唤起 | 无载荷 | 只负责打开 App，文件由用户手动选择 |

因此协议定义**三种通道**，发送端必须按能力与大小自动选择，并在 UI 上明示。

## 2. 术语

| 术语 | 含义 |
| --- | --- |
| scheme | 桌面端注册的自定义协议前缀，见第 3 节 |
| clip | 一次网页抓取产生的完整内容（文档 + 资产） |
| payload | 交给接收端的 JSON 对象 |
| 内联载荷 | 压缩后用 base64url 放进 URL fragment 的 payload |
| 接收端 | 桌面 App 中处理 `import` 路由的代码 |

## 3. Scheme 与分发渠道

App 已按分发渠道使用不同 scheme（来源：`graphock-console-app/config/editions.json` 与 `src/main/services/auth.ts`）：

| 渠道 | scheme | 说明 |
| --- | --- | --- |
| Mac App Store | `graphock` | 沙盒；默认不能读取下载目录 |
| 官网 Direct（macOS / Windows） | `graphock-direct` | 非沙盒；可读取用户授权路径 |
| 未打包开发 | `graphock-dev` | 只用于本地开发，避免抢占已安装版本的回调 |

**接收端必须只接受自己渠道注册的 scheme。** 例如 MAS 构建不应处理 `graphock-direct://import`。插件在设置中让用户选择目标渠道，默认 `graphock-direct`。

## 4. URL 形态

统一路由：`<scheme>://import`。路径必须为空或 `/`；其它 host/path 一律拒绝。

### 4.1 通道 A：内联载荷

```text
graphock-direct://import#p=v1.<base64url(deflateRaw(utf8(json)))>
```

- fragment 只有一个参数 `p`；
- 值必须以 `v1.` 开头（前缀版本，与 JSON 内的 `protocolVersion` 双重校验）；
- 整个 URL 长度 ≤ **24,000** 字符。

### 4.2 通道 B：文件路径

```text
graphock-direct://import?file=<percent-encoded absolute path>&v=1&clipId=<uuid>
```

- `file` 必须是绝对路径（POSIX `/` 开头，或 Windows `C:\` / `C:/`）；
- 路径必须经 `encodeURIComponent` 编码；
- `clipId` 可选；提供时必须与文件内 payload 的 `clipId` 一致；
- 文件内容为**未压缩的** payload JSON（UTF-8），最大 **200MB**。

### 4.3 通道 C：仅唤起

```text
graphock://import
```

- 不携带任何内容；
- 接收端只负责激活窗口并提示用户“选择要导入的文件”。

## 5. 内联载荷编码

编码步骤（发送端）：

1. 生成 payload 对象（第 6 节）。
2. 用**键排序的确定性 JSON** 序列化（见第 7 节）。
3. UTF-8 编码为字节。
4. 原始 JSON 字节数必须 ≤ **131,072**。
5. 使用 **raw DEFLATE**（RFC 1951，无 zlib/gzip 头）压缩。
6. 对压缩结果做 **base64url 无填充** 编码（`+`→`-`，`/`→`_`，去掉 `=`）。
7. 拼接为 `p=v1.<encoded>` 放入 fragment。

解码步骤（接收端）必须按相反顺序，并在每一步做上限检查（第 8 节）。任何一步失败都返回第 9 节的错误码，**不得静默回退到登录分支**。

## 6. 载荷结构

```jsonc
{
  "schema": "graphock.clip.handoff/1",
  "protocolVersion": 1,
  "clipId": "11111111-1111-4111-8111-111111111111",
  "createdAt": "2026-11-18T06:00:00.000Z",
  "source": {
    "url": "https://example.com/article",
    "title": "示例文章",
    "canonicalUrl": "https://example.com/article",
    "lang": "zh-CN",
    "author": "Ada",
    "publishedAt": "2026-11-01T00:00:00.000Z",
    "siteName": "Example",
    "faviconUrl": "https://example.com/favicon.ico"
  },
  "document": {
    "format": "markdown",
    "content": "---\ntitle: ...\n---\n\n# ..."
  },
  "assets": [
    {
      "path": "assets/a1-1a2b3c4d.png",
      "mimeType": "image/png",
      "sha256": "…64 hex…",
      "data": "iVBORw0KGgo…",
      "sourceUrl": "https://example.com/x.png"
    }
  ],
  "generator": { "name": "graphock-web-plugin", "version": "1.0.0", "browser": "chrome/140" },
  "checksum": "…64 hex…"
}
```

### 字段规则

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `schema` | string | 是 | 恒为 `graphock.clip.handoff/1` |
| `protocolVersion` | number | 是 | 恒为 `1`；不认识时返回 `E_SCHEMA_VERSION` |
| `clipId` | string | 是 | 小写 UUID v4；同时用于落盘目录名与去重 |
| `createdAt` | string | 是 | ISO-8601 UTC |
| `source.url` | string | 是 | 绝对 URL（http/https）；`file:`、`javascript:` 拒绝 |
| `source.title` | string | 是 | 允许空串，但接收端应回退为 URL |
| `source.canonicalUrl` / `lang` / `author` / `publishedAt` / `siteName` / `faviconUrl` | string | 否 | 仅作展示 |
| `document.format` | enum | 是 | `html` \| `markdown` \| `json` \| `yaml` \| `txt` |
| `document.content` | string | 是 | UTF-8，≤ 64MB |
| `assets[].path` | string | 是 | 相对 posix 路径；禁止 `..`、`\`、绝对路径 |
| `assets[].mimeType` | string | 是 | 建议 `image/*`；接收端不执行任何内容 |
| `assets[].sha256` | string | 是 | 64 位小写 hex |
| `assets[].data` | string | 否 | 标准 base64（非 url 变体）；单张 ≤ 20MB；内联总和 ≤ 8MB |
| `assets[].sourceUrl` | string | 否 | 仅作溯源 |
| `generator.name` / `generator.version` | string | 是 | 发送端标识 |
| `generator.browser` | string | 否 | UA 摘要 |
| `checksum` | string | 是 | 见第 7 节 |

## 7. 校验和定义

`checksum` 用于**传输完整性**，算法必须跨实现一致：

```text
checksum = sha256( UTF-8( canonicalize({
  clipId: string,
  document: { format: string, content: string },
  assets: [ { path: string, sha256: string } ]   // 按 path 升序排序
}) ) )
```

`canonicalize` 规则：

- 对象键按字典序升序；值为 `undefined` 的键省略；
- 数组保持原顺序（`assets` 在计算前显式按 `path` 排序）；
- 字符串使用标准 JSON 转义；数字只允许有限值；布尔/null 用 JSON 字面量；
- 无空格、无换行。

**注意**：`createdAt`、`generator`、`stats`、资产字节本身**不参与** handoff checksum。资产完整性由 `assets[].sha256` 单独校验，两者都通过才可落盘。

插件另有“文档 checksum”（`graphock.clip.document/1`），用于导出内容去重；App 接入时**只要求 handoff checksum**，可以把文档 checksum 当作附加字段忽略。

## 8. 强制限制

| 项目 | 上限 | 超出时 |
| --- | --- | --- |
| 整个协议 URL | 24,000 字符 | 发送端改用文件通道；接收端返回 `E_URL_TOO_LONG` |
| 内联 JSON（压缩前） | 131,072 字节 | 发送端改用文件通道；接收端不适用 |
| 内联 JSON（解压后） | 262,144 字节 | `E_PAYLOAD_TOO_LARGE` |
| 文档内容 | 64MB | `E_LIMIT_EXCEEDED` |
| 资产数量 | 500 | `E_LIMIT_EXCEEDED` |
| 单张资产 | 20MB | `E_LIMIT_EXCEEDED` |
| 内联资产合计 | 8MB | `E_LIMIT_EXCEEDED` |
| 文件通道文件大小 | 200MB | `E_FILE_TOO_LARGE` |

接收端必须**独立重复**这些检查，不得信任发送端。

## 9. 错误码

| 错误码 | 含义 | 建议 UI |
| --- | --- | --- |
| `E_SCHEME` | scheme 不匹配/URL 无法解析 | 提示“协议链接无效” |
| `E_ROUTE` | host 或 path 不是 `import` | 提示“不是导入链接” |
| `E_URL_TOO_LONG` | URL 超长 | 提示改用文件 |
| `E_PAYLOAD_MISSING` | 内联载荷为空 | 提示重新剪藏 |
| `E_PAYLOAD_ENCODING` | base64/JSON 非法 | 提示内容损坏 |
| `E_PAYLOAD_COMPRESSION` | DEFLATE 解压失败 | 提示内容损坏 |
| `E_PAYLOAD_TOO_LARGE` | 解压后超限 | 提示内容过大 |
| `E_SCHEMA_VERSION` | schema/protocolVersion 不认识 | 提示升级 App |
| `E_SCHEMA_INVALID` | 字段缺失/类型错误 | 提示内容损坏 |
| `E_LIMIT_EXCEEDED` | 数量/大小超限 | 提示内容过大 |
| `E_CHECKSUM_MISMATCH` | checksum 或资产摘要不一致 | 提示内容被篡改或损坏 |
| `E_PATH_NOT_ALLOWED` | 路径越界/非普通文件 | 提示选择合法文件 |
| `E_FILE_NOT_FOUND` | 文件通道文件不存在 | 提示重新保存 |
| `E_FILE_TOO_LARGE` | 文件超过 200MB | 提示文件过大 |
| `E_UNSUPPORTED_FORMAT` | 文档格式不支持 | 提示换一种格式 |
| `E_DUPLICATE_CLIP` | 已导入过（同 clipId） | 询问是否覆盖/跳过 |

## 10. 与登录回调的隔离（必读）

当前 App 的 `src/main/protocol/index.ts:179-190` 只接受：

- `<scheme>://callback`
- `<scheme>://auth/callback`

其它 URL 会打印 `unrecognized callback URL` 并返回。**接入导入协议时，绝不能让 `import` 落入登录分支**，否则可能出现“把剪藏内容当 OAuth 回调解析”的错误路径。要求：

1. 路由分发放在 scheme 校验之后、任何登录字段解析之前；
2. `import` 分支只处理第 4–8 节内容，不读取 `access_token`/`state` 等字段；
3. 未知 host/path 仍然按现有逻辑拒绝；
4. 日志中**不得**出现 payload 内容、base64、文件路径以外的隐私信息。

## 11. 接收端处理流程（App 实现顺序）

```text
收到 URL
 → 1. scheme == 本渠道 scheme ?            否 → 忽略（不报错，不记录内容）
 → 2. host == "import" && path 为空或 "/" ? 否 → 走原有回调逻辑（保持现状）
 → 3. 读取 fragment p / query file
      ├─ 有 p    → 解码 → 解压 → JSON 解析 → schema 校验 → 限额校验 → checksum 校验
      ├─ 有 file → 读取文件（≤200MB）→ JSON 解析 → schema/限额/checksum 校验 → clipId 一致性
      └─ 都没有  → 仅唤起：打开导入选择器，结束
 → 4. clipId 去重检查（已存在 → 询问或跳过）
 → 5. 用户确认（来源站点、标题、大小、目标工作区）——必须显式确认
 → 6. 写入导入容器（原子写；先写临时目录再 rename）
 → 7. 解包资产：逐个校验 sha256，拒绝 `..`/绝对路径/符号链接
 → 8. 生成清单（manifest.json），登记到工作区文件列表
 → 9. 失败回滚：删除临时目录；返回 code + traceId
```

**不要做的事**：

- 不要自动把剪藏内容送进解析引擎（应先让用户确认并出现在文件列表）；
- 不要把 `document.content` 当 HTML 直接注入任何 `webContents`；
- 不要把内联载荷写进日志或崩溃报告。

## 12. 安全要求

| 威胁 | 要求 |
| --- | --- |
| 恶意页面伪造链接 | 载荷只当数据；必须用户确认；不得自动执行 |
| 路径穿越 | 资产路径必须是相对 posix 路径；解析后 `realpath` 必须仍在目标目录内 |
| 符号链接逃逸 | 写入前检查目标父目录不是符号链接；拒绝已有链接 |
| TOCTOU | 先写临时目录，完成校验后 `rename`；读取文件通道时先 `stat` 再读，大小以读取结果为准 |
| Zip 炸弹 | 若导出物为 zip，限制条目数、解压后总大小、嵌套深度 |
| 内容注入 | HTML/Markdown 仅作为文件保存；如需预览，必须走现有富文本清洗 |
| 重复/重放 | `clipId + checksum` 去重；不覆盖已有文件，除非用户确认 |
| 信息泄露 | 日志与遥测不含 URL 查询串、payload、文件内容 |

## 13. App 接入清单

| 步骤 | 位置 | 说明 |
| --- | --- | --- |
| 1 | `src/main/protocol/index.ts` | 在 `handleProtocolUrl` 中按第 10 节插入 `import` 分支；保持 `isAuthCallbackUrl` 逻辑不变 |
| 2 | 新模块 `src/main/protocol/importClip.ts` | 实现第 11 节流程；可直接移植 `packages/protocol-receiver/src/receiver.ts` |
| 3 | 复用校验 | 复制 `packages/handoff` 的常量、base64url、压缩、checksum；或直接依赖同一份源码 |
| 4 | 导入容器 | 复用 `src/main/services/importContainer.ts`；每个 clip 一个目录 |
| 5 | IPC/UI | 确认对话框、进度、错误条（带 `code + traceId`） |
| 6 | 测试 | 直接使用 `tests/vectors/protocol/cases.json`；至少覆盖：合法内联、合法文件、篡改 checksum、超限、路径穿越、重复 clip、未知 host |
| 7 | 渠道差异 | MAS 不实现文件路径通道；Windows 覆盖 `second-instance` 与冷启动 argv |

**验收标准**：一个没有读过插件代码的开发者，只读本文 + 参考接收器，能在一天内完成 App 侧接入并通过全部测试向量。

## 14. 测试向量

- 目录：`tests/vectors/protocol/`
- 文件：`cases.json`（由 `tests/unit/protocol-vectors.test.ts` 生成并校验）
- 内容：合法内联 URL、合法文件 URL、仅唤起、以及各类非法输入与预期错误码
- App 侧应把该文件复制进自己的测试资源，**不要修改**；如需新增，先更新插件侧向量并升版本

## 15. 版本演进

| 变更类型 | 做法 |
| --- | --- |
| 新增可选字段 | 保持 `protocolVersion: 1`；接收端忽略未知字段 |
| 新增必填字段 | 升 `protocolVersion` 与 `schema`，保留旧解析器 |
| 修改 checksum 算法 | 必须升版本；不接受“同版本双算法” |
| 新增通道 | 通过新的 host（例如 `import2`）或 query 参数区分，不复用 `p` 的语义 |

## 16. 兼容性矩阵

| 客户端 | 通道 A 内联 | 通道 B 文件 | 通道 C 仅唤起 |
| --- | --- | --- | --- |
| Graphock Direct（macOS） | ✅ | ✅ | ✅ |
| Graphock Direct（Windows） | ✅ | ✅ | ✅ |
| Graphock MAS（macOS） | ✅ | ❌（沙盒） | ✅ |
| 未打包开发 | ✅ | ✅ | ✅ |

## 17. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| 1 (draft) | 2026-11-18 | 初版：三通道、载荷 schema、checksum、限额、错误码、App 接入清单 |
