# v0.71 shared 三方范围审计

基线 v0.70.0 `ac4eeb2c4aea239dd94b67f074c73f69aafc46f8`；目标 v0.71.0 `a514e2063563e318ef73c2a17fad68057c4e300c`。逐路径以本地 NAS、官方旧版本和官方新版本比较；不整目录覆盖。版本/registry/Hub/Agent 由其他任务审阅。

| 路径 | 三方分类 |
|---|---|
| `src/shared/clientCatalog.js` | 上游直接更新（本地等于基线） |
| `src/shared/clientHealth.js` | 上游直接更新（本地等于基线） |
| `src/shared/clientSourceRegistration.js` | 上游直接更新（本地等于基线） |
| `src/shared/clientSources.js` | 上游直接更新（本地等于基线） |
| `src/shared/collector.js` | 三方合并（本地有 NAS 差异） |
| `src/shared/credentialStore.js` | 上游直接更新（本地等于基线） |
| `src/shared/customScanPaths.js` | 上游直接更新（本地等于基线） |
| `src/shared/limits/accounts.js` | 上游直接更新（本地等于基线） |
| `src/shared/limits/core.js` | 上游直接更新（本地等于基线） |
| `src/shared/limits/providers.js` | 上游直接更新（本地等于基线） |
| `src/shared/limits/runtime.js` | 上游直接更新（本地等于基线） |
| `src/shared/providers/codebuddy/paths.js` | 上游直接更新（本地等于基线） |
| `src/shared/providers/codebuddy/subagents.js` | 新增 |
| `src/shared/providers/codex/localExecutor.js` | 上游直接更新（本地等于基线） |
| `src/shared/providers/notion/account.js` | 新增 |
| `src/shared/providers/notion/limits.js` | 新增 |
| `src/shared/providers/pi/paths.js` | 新增 |
| `src/shared/providers/workbuddy/account.js` | 上游直接更新（本地等于基线） |
| `src/shared/providers/workbuddy/identity.js` | 新增 |
| `src/shared/providers/workbuddy/limits.js` | 上游直接更新（本地等于基线） |
| `src/shared/providers/workbuddy/oauth.js` | 新增 |
| `src/shared/sessionDetail.js` | 上游直接更新（本地等于基线） |
| `src/shared/sessionDetailResolver.js` | 上游直接更新（本地等于基线） |
| `src/shared/sessionFiles.js` | 上游直接更新（本地等于基线） |
| `src/shared/subscriptionDisplay.js` | 上游直接更新（本地等于基线） |
| `src/shared/usage.js` | 三方合并（本地有 NAS 差异） |
| `src/shared/usage/sessionUsageArchiveStore.js` | 上游直接更新（本地等于基线） |
| `src/shared/usage/usageTransform.js` | 上游直接更新（本地等于基线） |
| `src/shared/vendorPresentation.js` | 上游直接更新（本地等于基线） |
| `tests/fixtures/goose.js` | 新增 |
| `tests/fixtures/notionAllowance.json` | 新增 |
| `tests/fixtures/notionSpaces.json` | 新增 |
| `tests/helpers/sourceEnv.js` | 上游直接更新（本地等于基线） |
| `tests/shared/clientCatalog.test.js` | 三方合并（本地有 NAS 差异） |
| `tests/shared/clientRegistrationConsistency.test.js` | 上游直接更新（本地等于基线） |
| `tests/shared/clientTracking.test.js` | 三方合并（本地有 NAS 差异） |
| `tests/shared/codebuddySubagents.test.js` | 新增 |
| `tests/shared/codexCompressedTranscripts.test.js` | 上游直接更新（本地等于基线） |
| `tests/shared/codexLocalUsage.test.js` | 上游直接更新（本地等于基线） |
| `tests/shared/collectorLoadGuards.test.js` | 上游直接更新（本地等于基线） |
| `tests/shared/gooseSources.test.js` | 新增 |
| `tests/shared/notionLimits.test.js` | 新增 |
| `tests/shared/piSessionDetail.test.js` | 新增 |
| `tests/shared/sessionDetail.codebuddy.test.js` | 上游直接更新（本地等于基线） |
| `tests/shared/sessionDetailResolver.test.js` | 上游直接更新（本地等于基线） |
| `tests/shared/sessionFiles.test.js` | 上游直接更新（本地等于基线） |
| `tests/shared/sessionUsageArchiveStore.test.js` | 三方合并（本地有 NAS 差异） |
| `tests/shared/subscriptionDisplay.test.js` | 上游直接更新（本地等于基线） |
| `tests/shared/usageTransform.test.js` | 上游直接更新（本地等于基线） |
| `tests/shared/workbuddyAccountAggregation.test.js` | 新增 |
| `tests/shared/workbuddyConcurrency.test.js` | 新增 |
| `tests/shared/workbuddyCredentialStore.test.js` | 新增 |
| `tests/shared/workbuddyLimits.test.js` | 上游直接更新（本地等于基线） |
| `tests/shared/workbuddyOAuth.test.js` | 新增 |
| `tests/shared/wslUsage.test.js` | 上游直接更新（本地等于基线） |

## 保留条件

保留 usage 安全字典与 recordTimestamp、archive 流式及 revision 原子性、独立轻量 watcherPolicy（新增 Goose 匹配移入此处）、默认 Hermes-only。OAuth 仅共享 provider 接口；不引入桌面浏览器登录、不执行真实认证。Notion fixtures 仅适配证据。新共享测试加入 NAS 执行清单，Electron 专属测试不运行。

## 实施结果

- 源码只有 `collector.js` 遇到文本冲突：官方内嵌 watch policy 与 NAS 已抽离的同一策略交叉。保留 NAS 轻量模块，在 `watcherPolicy.js` 精确加入 Goose DB/WAL/SHM basename 限制及自触发 SHM 排除；保留 Antigravity/Reasonix 按需加载，独立 Watcher 不加载 collector。`usage.js` clean 三方合并仅新增 Goose 客户端规范化，安全字典和时间标量补丁不变。
- 上游 Goose 识别与 `goose-db` 健康源、固定路径优先级、环境清理接入；真实 parser 由既有固定 Tokscale fork 实现（本轮 manifest 无净变化），不叠加不同数据库。NAS 默认客户端仍为 Hermes-only，catalog 的 desktop defaultTracked 不改变 NAS 配置。
- Notion 注册为 limits provider，严格响应解析和双窗口、`hashKey(userId + workspaceId)`身份去重。账户与 workspace UUID 仅用于本地认证请求，provider/Hub wire 只保留协议稳定 hash/固定计划标签。未知响应不可用。fixtures 不代表真实资格/登录验收。
- WorkBuddy 共享身份、managed/local去重、placeholder抑制、失败和stale独立账户保留及精确目标id/key绑定接入。OAuth shared模块只提供已配置凭据的安全刷新与协议工具；Electron官方浏览器登录及managedAccounts controller不引入容器，本轮不写真实持久凭据。
- Pi/CodeBuddy/Codex明细和执行器修复使用上游共享实现；明细计费与仪表盘总计保持不同口径，不改历史。SQLite strict snapshot/read错误在usageTransform失败退出，流式cursor释放和revision staged原子性保持。
- 新测试实际加入 `test-nas.js`。上游 `workbuddyAccountAggregation`、`codexLocalUsage`、`piSessionDetail`混有Worker/Electron renderer依赖；NAS版本保留全部Node共享账本、去重、日期、身份、计费断言，排除Worker聚合和desktop row/label/fixed-range渲染断言，直接检查独立quota windows而非UI合计。新增NAS Notion实际syncPayload wire隐私与账本不变断言。

## 当前运行证据（2026-10-15）

最终本机完整NAS suite：Node v24.19.0 / darwin-arm64，1561 tests，1550 passed，0 failed，11 skipped，52.85秒。使用独立071 checkout及070相同lock的node_modules（临时symlink；不提交）。日志 `/tmp/nas071-suite-complete.log`。这不是Linux Docker双架构证据，原生amd64/arm64 Docker与冻结费用控制器由主任务另行记录。

独立聚焦轻量Watcher、Goose、Notion、安全字典36 passed；syncPayload22 passed；Codex/Pi47 passed；WorkBuddy NAS聚合6 passed。早期测试缺依赖及desktop/Worker import失败均已修复，早期输出不作为最终通过证据。完整suite已覆盖本轮新增provider与strict archive tests、NAS既有安全回归。
