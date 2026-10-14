# v0.70 → v0.71 NAS 三方差异审计

固定上游 v0.70.0 `ac4eeb2c4aea239dd94b67f074c73f69aafc46f8` → v0.71.0 `a514e2063563e318ef73c2a17fad68057c4e300c`；NAS 基线 `cff3fe54847a01752a888b2109b0f7f0d4762bf2`。源工作区clean，独立upgrade/upstream-v0.71.0分支，保留原工作区。

148文件变化；src/agent及src/hub无上游净差；Tokscale pin没有净差（现有fork包含本次启用的Goose parser），不是未核实的新binary。共享合并冲突及实现见 UPSTREAM_0.71_SHARED.md。

- 采集器：Goose opt-in，first-existing数据库选择、goose-db health，DB/WAL监听、排除自身SHM；累计归创建日，推算reasoning不重复加总，不虚构calls。Pi详情定位、CodeBuddy子代理、Codex executor/config覆盖按共享实现移植。
- 共享额度：Notion注册、user/workspace稳定脱敏组合身份和双窗口；只作为limits，未知响应unavailable；fixture不等于真实资格认证。WorkBuddy身份、失败/占位/过期兄弟账户规则对齐；桌面浏览器登录及managed account UI不入容器，不迁移binding凭邮箱或唯一账户。
- Hub协议：兼容扩展新的client/provider及detail，不改历史计费；旧客户端可以继续读既有字段，新展示依赖客户端支持，来源数据依赖显式启用的Agent。
- 归档：共享SQLite streaming/revision/error改动保留NAS完整stage和failure契约；失败不能覆盖上次完整设备数据。
- 桌面：tray、Electron login、renderer、内存宿主策略不移植；Worker副本不在本仓库分发，不宣称Worker已更新。

| 状态 | 上游路径 | 决策 |
|---|---|---|
| M | `.env.example` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `.github/RELEASE_TEMPLATE.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| A | `.github/assets/tools-icon/goose.png` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| A | `.github/assets/tools-icon/notion.png` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `.github/workflows/pages.yml` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `AGENTS.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `README.ja.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `README.ko.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `README.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `README.pt-BR.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `README.zh-CN.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `README.zh-TW.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| A | `assets/icons/goose.svg` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| A | `assets/icons/notion.svg` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `docs/API.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `docs/architecture.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `docs/headless-agent.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `docs/headless-agent.zh-CN.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `docs/headless-agent.zh-TW.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `docs/providers/README.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `docs/providers/codebuddy.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `docs/providers/codex.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| A | `docs/providers/goose.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| A | `docs/providers/notion.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| A | `docs/providers/pi.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `docs/providers/workbuddy.md` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `package-lock.json` | 仅版本变化；NAS锁定依赖保留 |
| M | `package.json` | 仅版本变化；NAS锁定依赖保留 |
| M | `scripts/hub-build-manifest.js` | 按NAS实际源闭包计算身份；禁止复制上游hash冒充一致 |
| M | `scripts/verify-vendored-tokscale.js` | 移植真实Goose binary累计/日期/优先级/WAL契约 |
| A | `site/assets/icons/catpaw.svg` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| A | `site/assets/icons/fx.svg` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| A | `site/assets/icons/stepfun.svg` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `site/build.mjs` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `site/index.html` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `site/scripts/i18n.js` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `site/scripts/islands.jsx` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `site/styles/components.css` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `site/styles/sections.css` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `src/electron/main.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/preload.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/providers/workbuddy/localAuth.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| A | `src/electron/providers/workbuddy/managedAccounts.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| A | `src/electron/providers/workbuddy/oauthLogin.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/renderer/app.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/renderer/edgeDock/index.html` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/renderer/i18n.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/renderer/index.html` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/renderer/limits/providerPresentation.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/renderer/limits/windowsView.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/renderer/sessionDetail.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/renderer/sessionRows.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/renderer/styles.css` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/runtimeConfig.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/tray.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/electron/trayModeSettings.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `src/shared/clientCatalog.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/clientHealth.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/clientSourceRegistration.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/clientSources.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/collector.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/credentialStore.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/customScanPaths.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/hubBuildRegistry.json` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/limits/accounts.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/limits/core.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/limits/providers.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/limits/runtime.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/providers/codebuddy/paths.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `src/shared/providers/codebuddy/subagents.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/providers/codex/localExecutor.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `src/shared/providers/notion/account.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `src/shared/providers/notion/limits.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `src/shared/providers/pi/paths.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/providers/workbuddy/account.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `src/shared/providers/workbuddy/identity.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/providers/workbuddy/limits.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `src/shared/providers/workbuddy/oauth.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/sessionDetail.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/sessionDetailResolver.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/sessionFiles.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/subscriptionDisplay.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/usage.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/usage/sessionUsageArchiveStore.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/usage/usageTransform.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `src/shared/vendorPresentation.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/docs/providerGuidance.test.js` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `tests/docs/readmeConsistency.test.js` | 文档/站点/桌面资产不直接入容器；相关语义人工核对 |
| M | `tests/electron/cursorSettingsLayout.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/edgeDockLimitCard.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/homeLimitBars.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/homeOverview.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/limitAccountPanels.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/limitProviderOrder.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/limitProviderPresentation.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/limitProviderWiring.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| A | `tests/electron/notionIntegration.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/overflowText.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/runtimeConfig.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/sessionDetail.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/statsRenderScheduler.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/thirdPartySettings.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/tray.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/trayModeSettings.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| A | `tests/electron/trayPopoverToggle.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/usageHostWiring.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| A | `tests/electron/workbuddyCombinedQuota.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| M | `tests/electron/workbuddyLocalAuth.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| A | `tests/electron/workbuddyMainIntegration.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| A | `tests/electron/workbuddyManagedAccounts.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| A | `tests/electron/workbuddyManagedAccountsUi.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| A | `tests/electron/workbuddyOAuthLogin.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| A | `tests/electron/workbuddySubscriptionBinding.test.js` | 桌面专属；不复制或在容器执行；共享能力另行合并 |
| A | `tests/fixtures/goose.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `tests/fixtures/notionAllowance.json` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `tests/fixtures/notionSpaces.json` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/helpers/sourceEnv.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/clientCatalog.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/clientRegistrationConsistency.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/clientTracking.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `tests/shared/codebuddySubagents.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/codexCompressedTranscripts.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/codexLocalUsage.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/collectorLoadGuards.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `tests/shared/gooseSources.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `tests/shared/notionLimits.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `tests/shared/piSessionDetail.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/sessionDetail.codebuddy.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/sessionDetailResolver.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/sessionFiles.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/sessionUsageArchiveStore.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/subscriptionDisplay.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/usageTransform.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `tests/shared/workbuddyAccountAggregation.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `tests/shared/workbuddyConcurrency.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `tests/shared/workbuddyCredentialStore.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/workbuddyLimits.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| A | `tests/shared/workbuddyOAuth.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `tests/shared/wslUsage.test.js` | 共享核心增量三方合并；保留NAS补丁；测试纳入NAS suite |
| M | `worker/package-lock.json` | Worker未在NAS仓库分发或部署；核对共享源闭包和身份，不能声称已发布Worker |
| M | `worker/package.json` | Worker未在NAS仓库分发或部署；核对共享源闭包和身份，不能声称已发布Worker |
| M | `worker/src/shared/clientHealth.js` | Worker未在NAS仓库分发或部署；核对共享源闭包和身份，不能声称已发布Worker |
| M | `worker/src/shared/hubBuildRegistry.json` | Worker未在NAS仓库分发或部署；核对共享源闭包和身份，不能声称已发布Worker |
| M | `worker/src/shared/limits/core.js` | Worker未在NAS仓库分发或部署；核对共享源闭包和身份，不能声称已发布Worker |
| M | `worker/src/shared/limits/providers.js` | Worker未在NAS仓库分发或部署；核对共享源闭包和身份，不能声称已发布Worker |
| A | `worker/src/shared/providers/workbuddy/identity.js` | Worker未在NAS仓库分发或部署；核对共享源闭包和身份，不能声称已发布Worker |
| M | `worker/src/shared/subscriptionDisplay.js` | Worker未在NAS仓库分发或部署；核对共享源闭包和身份，不能声称已发布Worker |
| M | `worker/src/shared/usage.js` | Worker未在NAS仓库分发或部署；核对共享源闭包和身份，不能声称已发布Worker |
