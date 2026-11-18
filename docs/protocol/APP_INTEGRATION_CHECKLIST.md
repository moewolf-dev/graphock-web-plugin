# App 侧接入清单（网页剪藏导入协议 v1）

对应规格：[`CUSTOM_PROTOCOL_IMPORT.md`](./CUSTOM_PROTOCOL_IMPORT.md)
参考实现：[`packages/protocol-receiver`](../../packages/protocol-receiver/src/receiver.ts)
测试向量：[`tests/vectors/protocol/cases.json`](../../tests/vectors/protocol/cases.json)

> 目标：App 侧开发者只读规格与清单即可实现，不需要阅读插件源码。

## 0. 范围确认

- [ ] 只处理 `<scheme>://import`，**不触碰**登录回调路径。
- [ ] MAS 构建只实现内联与仅唤起；不实现文件路径通道。
- [ ] Direct（macOS / Windows）实现三条通道。

## 1. 协议层

- [ ] 在 `src/main/protocol/index.ts` 的 `handleProtocolUrl` 中，**在登录字段解析之前**加路由：

```ts
const parsed = new URL(url)
const scheme = getDesktopSchemeConfig().scheme.toLowerCase()
if (parsed.protocol !== `${scheme}:`) return
if (parsed.hostname.toLowerCase() === 'import') {
  void importClipFromProtocol(url) // 新模块
  return
}
// 原有 isAuthCallbackUrl 分支保持不变
```

- [ ] 未知 host / path 仍走原逻辑（`unrecognized callback URL`）。
- [ ] 日志不打印 fragment、query 中的载荷、文件内容。
- [ ] 冷启动（`open-url` / argv）与热启动（`second-instance`）都覆盖；冷启动排队不丢失。

## 2. 校验顺序（必须一致）

- [ ] URL 长度 ≤ 24,000
- [ ] `p` 前缀 `v1.` → base64url → DEFLATE raw → UTF-8 JSON
- [ ] JSON ≤ 262,144 字节（解压后）
- [ ] zod / 手写 schema 校验（字段、枚举、UUID、路径规则）
- [ ] 限额：文档 64MB、资产 500 个、单资产 20MB、内联资产合计 8MB
- [ ] handoff checksum
- [ ] 文件通道：绝对路径、`stat` 为普通文件、≤ 200MB、`clipId` 与文件一致
- [ ] `clipId + checksum` 去重

建议直接移植 `packages/protocol-receiver/src/receiver.ts` 与 `packages/handoff/src/{constants,errors,base64url,payload,url}.ts`。

## 3. 落盘

- [ ] `<导入容器>/<clipId>/document.<ext>`、`assets/…`、`manifest.json`
- [ ] 先写临时目录再 `rename`（原子替换）
- [ ] 资产路径解析后必须仍在目标目录内；拒绝 `..`、绝对路径、符号链接
- [ ] 同名冲突不覆盖，除非用户明确选择
- [ ] 失败清理半成品；返回 `code + traceId`

## 4. UI

- [ ] 导入前确认：来源站点、标题、大小、格式、目标工作区
- [ ] 成功：文件出现在工作区文件列表，可预览/解析/导出
- [ ] 失败：错误条显示 `code` 与 `traceId`，提供重试/另存
- [ ] MAS：仅唤起时提示“请选择要导入的文件”

## 5. 测试

- [ ] 复制 `cases.json` 到 App 测试资源，逐条断言
- [ ] 额外安全用例：篡改 base64、篡改 checksum、超长 URL、路径穿越、符号链接、重复 clip
- [ ] 端到端：插件复制链接 → App 导入 → 文件可见 → 解析成功
- [ ] 冷/热启动各一次（macOS 与 Windows）

## 6. 验收

- [ ] 一个未参与本项目的开发者，按本文能在 1 天内完成接入。
- [ ] 通过全部向量；故意破坏任一限制时被拒绝且错误码正确。
- [ ] 日志与遥测中没有任何页面内容。
