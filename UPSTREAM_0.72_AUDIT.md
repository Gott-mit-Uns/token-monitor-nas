# 上游 v0.72.0 逐项审计

核验日：2026-10-16（Asia/Shanghai）。正式稳定 Release v0.72.0 发布时间为 2026-10-15T19:00:09Z（北京时间 10-16 03:00:09）；tag object `3cbf2742a0aa63a4565ba8380ea3977f54c05d20` 解引用为 `126e9a43dcc51d3d7b2609231eac9974ba73bed7`。旧上游 v0.71.0 / `a514e2063563e318ef73c2a17fad68057c4e300c`。NAS 起点为远端 main `77e69040d6cf8e17bb04edbad5406dee20a3f11e`，实际发布源码 v0.71.0-02 / `9a06b658e75d96285ac98847ef5e6e67299a4085`。原目录及已有分支未重置。

实时 Release API 的 draft=false、prerelease=false、latest=true。main 另有 `a4e7ec49a952fc5c9c06ab8a244d877d092dfa47`（桌面 Atom 更新历史），不作为稳定基线。公开网页列表曾缓存 v0.71.0，以实时 API 与解引用 tag 为准。

## 提交与源码结论

- `631c25cb` / #1053：family activity metrics 只在 Electron renderer/sessionRows.js 聚合调用次数、缓存、速率和时间，不改变 shared 会话、计费或 Hub 聚合；容器不搬显示分组逻辑。
- `d21b0875` / #1059：Windows Edge Dock 的 Win32 mouse-activate 消息钩子；不在 Node 容器执行。
- `ddc45771` / #1056：移植 Cursor limits.js / probe.js。plan-info 优先、旧账户回退、proto3 整数/枚举、weekly/monthly included、prepaid、失败/未知额度处理；统一池不重复计 Grok Bot。既有 hashCursorAccountKey/auth 不改。默认 limits 关闭，没有新账户、凭据或登录。上游仅在真实旧方案验证过协议，新方案本轮仅合成契约验证。
- `e38c12c9` / #1060：移植 OpenCode session.js：只读 session_v2/session_message 优先、legacy 回退、seq 顺序、真实 activity/idle/compaction、迁移时仅补可证明遗漏的摘要/subtask usage；当前 ID 优先、不叠加两份完整历史；事务快照和 SQLite 投影/iterator 减少正文驻留。共享本地详情能力不新增远端逐轮正文 API。
- `bf2045b2` / #1065：shared/appUpdater.js 由 Electron 主进程消费，更新下载、重启、唤醒、更新历史与 UI 全部桌面专属。保留 NAS 原 Docker/Release 更新路径，不加载该 Electron 能力。
- `126e9a43`：官方版本和 Release 文档。NAS 精简 package/lock 只改版本，依赖图及固定 Tokscale pin 不变。

## NAS 适配与冲突

三个 provider 文件在 NAS 起点与旧官方逐字相同，使用已审阅的文件增量；未覆盖 shared 或 Agent/Hub 目录。官方 Agent、Hub、collector、usage/history、归档、protocol、Watcher、依赖及 parser pin 在两个正式 tag 间没有净变化。保留全部 NAS-01～17，见 NAS_PATCHES.md。

本轮验收发现原有 Node Hub 按到达顺序覆盖的缺口：新增 ingressOrdering.js，在现有隐私与持久化事务边界内按已知 producer updatedAt 拒绝迟到用量/额度，独立比较两者；limits-only 不重置完整历史与采集时钟。已持久化 producer 时间用于重启后判断，不靠 token/费用最大值。合法较新降费、日界归零仍接受。无时间戳的旧客户端保持原到达顺序语义；无法凭空保证此类客户端的消息顺序，升级方案明确此限制。

核心指纹从实际闭包计算，portable core 未改；Node adapter 包含新增入口保护及真实 package/lock。仅追加最终 NAS 自有身份，不复制官方 hash。

## 全部文件决策

下表由两个固定上游 commit 的完整文件差异生成，共 41 个文件。

| Status | Upstream file | Decision |
|---|---|---|
| M | `.github/RELEASE_TEMPLATE.md` | Read documentation contract; summarize relevant provider semantics above |
| M | `docs/architecture.md` | Read documentation contract; summarize relevant provider semantics above |
| M | `docs/providers/cursor.md` | Read documentation contract; summarize relevant provider semantics above |
| M | `docs/providers/opencode.md` | Read documentation contract; summarize relevant provider semantics above |
| M | `package-lock.json` | Version only; retain slim NAS dependency graph |
| M | `package.json` | Version only; retain slim NAS dependency graph |
| M | `src/electron/edgeDock/controller.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `src/electron/main.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `src/electron/renderer/app.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `src/electron/renderer/appUpdatePresentation.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `src/electron/renderer/i18n.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `src/electron/renderer/icons/THIRD_PARTY_NOTICES.md` | Desktop only; exclude from NAS runtime upgrade |
| A | `src/electron/renderer/icons/actions/check.svg` | Desktop only; exclude from NAS runtime upgrade |
| A | `src/electron/renderer/icons/actions/download.svg` | Desktop only; exclude from NAS runtime upgrade |
| A | `src/electron/renderer/icons/actions/external-link.svg` | Desktop only; exclude from NAS runtime upgrade |
| A | `src/electron/renderer/icons/actions/rotate-cw.svg` | Desktop only; exclude from NAS runtime upgrade |
| M | `src/electron/renderer/index.html` | Desktop only; exclude from NAS runtime upgrade |
| M | `src/electron/renderer/sessionRows.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `src/electron/renderer/styles.css` | Desktop only; exclude from NAS runtime upgrade |
| A | `src/electron/windowsNonActivatingInput.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `src/shared/appUpdater.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `src/shared/providers/cursor/limits.js` | Port shared provider verbatim; old official and NAS copies matched |
| M | `src/shared/providers/cursor/probe.js` | Port shared provider verbatim; old official and NAS copies matched |
| M | `src/shared/providers/opencode/session.js` | Port shared provider verbatim; old official and NAS copies matched |
| A | `tests/electron/appUpdateNotesRendering.test.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `tests/electron/appUpdatePresentation.test.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `tests/electron/appUpdateReleaseNotes.test.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `tests/electron/appUpdateState.test.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `tests/electron/edgeDockController.test.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `tests/electron/rendererCssBase.test.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `tests/electron/serviceStatusDom.test.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `tests/electron/sessionRows.test.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `tests/electron/syncDevicePanelLayout.test.js` | Desktop only; exclude from NAS runtime upgrade |
| A | `tests/electron/windowsNonActivatingInput.test.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `tests/shared/appUpdater.test.js` | Desktop only; exclude from NAS runtime upgrade |
| M | `tests/shared/cursorLimits.test.js` | Port and execute in test-nas.js |
| M | `tests/shared/cursorProbe.test.js` | Port and execute in test-nas.js |
| M | `tests/shared/opencodeSession.test.js` | Port and execute in test-nas.js |
| M | `tests/shared/sessionDetail.opencode.test.js` | Port and execute in test-nas.js |
| M | `worker/package-lock.json` | Worker not distributed; no generated Worker identity |
| M | `worker/package.json` | Worker not distributed; no generated Worker identity |
