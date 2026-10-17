# 官方 v0.69.0 差异审计与 NAS 引入决策

审计日期：2026-10-12。目标 NAS 候选版本：`v0.69.0-01`。本文件记录源码差异与接管边界；测试、CI、性能的实测结果另见 `VALIDATION.md`，不能从本审计推断生产 NAS 已部署或性能已改善。

## 接管结论与冻结输入

- NAS `main` 起点：`2fdfbc57dd11fd0838aff2820504da2d2d67fcf3`，已发布 `v0.68.0-05`；开始接管时工作树干净。
- 接管时远端仅 `main`，未合并 PR 为空。保留本地旧 `upgrade-official-0.63.1` 分支，不覆盖历史工作；独立 Adapter 仓库未合并 PR 也为空，不将 Adapter 源码重新导入 NAS 仓库。
- 原 NAS 发布工作流 `38121255462` 成功。这是旧版 CI 证据，不能视为本候选版通过。
- 官方旧 tag `v0.68.0` 对应 commit `5d2db368d8313415763860d594de00e46a663418`。
- 官方目标 tag `v0.69.0` 对应 commit `3f106ae3d4712b26cced8272f0d488eaab0de1e6`。
- 初始比较使用本地 `refs/upstream-lock/v0.68.0` 和 `refs/upstream-lock/v0.69.0`；最终清单以以上两个冻结 SHA 再次核对，后续同步也以 SHA 为准，不读取上游浮动 `main`。实现分支为 `upgrade/upstream-v0.69.0`。
- 两个 SHA 间有 16 个提交、141 个差异文件，14,070 行新增、727 行删除；覆盖上游整个仓库，包括不进入 NAS 镜像的 Electron 和 Worker。

NAS 不是完整桌面 fork。核心源码放在 `app/src/shared`、`app/src/agent`、`app/src/hub`，NAS 包装、部署模板和发布流程保留独立边界。上游 `src/hub`、`src/agent/agent.js`、`seedClients.js`、`shared/syncPayload.js`、SQLite archive store、Watcher host/worker 在此次官方比较中没有变更；不能据此跳过 shared 协议和 NAS 补丁回归。

## 引入范围与原因

| 上游变更组 | NAS 决策 | 影响与保留边界 |
| --- | --- | --- |
| `collector.js`、`clientSources.js` | 引入并三方合并 | 同步目录元数据来源、锚点身份升级、按周期父子关系、Cursor/Antigravity 精确监听和重叠目录计数。保留 NAS `watcherPolicy.js` 抽离；需将上游原内嵌 watch policy 变更映射到抽离模块，不能直接整文件覆盖。Hermes-only 的默认 CSV、只读挂载和五分钟周期不变。 |
| `sessionActivity*`、Claude/Codex/T3 活动模块、进程身份模块 | 引入共享能力，默认不启用额外采集 | `sessionActivityProviders.js` 是 portable wire 白名单；registry 对适配器惰性加载。Hermes 不属于活动 provider，默认不读取 Claude/Codex 注册表或开启活动来源。保留上游能力便于 Hub 接收官方桌面记录；禁止为 NAS 节省内存切换同进程 Watcher。 |
| `agent/runtime.js`、usage runtime/host/worker | 引入并保留 NAS 错误传播 | 上游明确对 headless 设置 `sessionActivityPolling:false`，防止桌面活动心跳触发归档/上传。NAS 单次最终上传失败必须继续抛错；IPC `activity` 与计费用量 `update` 分离，避免复制整个统计树。 |
| `usage.js`、`sessionLive.js` | 引入并保留安全补丁 | 归一化新增身份、父子关系、等待和活动字段。会话 accounting key 不变，父子关系不增加或转移 Tokens；跨设备冲突身份舍弃。保留 NAS 特殊字典键的自有属性读写和标量时间戳验证。 |
| `sessionMetadata.js`、Codex/T3 身份和父子关系 | 引入 | 原生 UUID 来自验证过的 header，不替换 sessionId；T3 关系必须显式证明归属，人工 fork 不视为 subagent。metadata-only 的锚点更新不应重置 Token 增量基线。 |
| Cursor metadata/native watch | 引入，可选客户端才执行 | 只读查询 scalar turn state，最近会话才增加状态读取；仅 desktop `state.vscdb`/WAL 触发 cloud sync，SHM 和自身缓存不触发反馈循环。默认 Hermes-only 不增加 Cursor 扫描。 |
| Antigravity metadata/history/throughput | 引入，可选客户端才执行 | summary catalog 提供标题/项目，保留 native 来源优先和移除恢复语义；独立 reasoning 纳入计数且归一化 client 名。固定 Tokscale 支持原生持续时间；默认不扫描 Antigravity。 |
| `sessionUsageArchive.js` | 引入瞬时字段排除 | `liveActivity`、`waitingForInput` 从历史归档删除；身份和父子关系属于稳定 metadata 可保留。不改变 SQLite 表结构。继续保留 NAS archive store 逐行读取与异常不提交半成品补丁。 |
| Node Hub/API/SSE | 保留 NAS 实现，共享层升级 | 官方 Hub 源码无差异；shared usage 对新字段的 admission、merge、delta 是兼容关键。保留严格数据加载、写盘失败回滚、有界 SSE、Windows 10/30 分钟、gzip 和 30 秒轻量元数据。 |
| Tokscale pinned fork | 引入固定 manifest 与所有平台校验值 | 从 `d5e8ad9b25bfafb43b5b6804940929b728a6f48a` 到 `4f17d6c6d85f5582949dcb0476c55518eafd7e23`；base npm `4.18.0` 不变。新增 Antigravity duration、CatPaw parser 和 Codex parent metadata；未注册 CatPaw，因此不会开启它。Codex parser 版本 12 可能造成首次重解析；Hermes 默认不会扩大范围。 |
| 官方 npm 清单 | 合入官方版本元数据，保留 NAS 精简依赖 | 唯一依赖版本变更为开发依赖 Electron `43.4.0→43.7.9`；NAS 清单未包含 Electron，不引入其桌面依赖。生产依赖本身没有此次版本提升；这不等于已经完成当前安全数据库核查。仍须 npm audit 和基础镜像审阅。 |
| Hub build manifest/registry | 引入 | worker shared 声明加入 portable sessionLive/activity provider，registry 更新构建来源。NAS 不构建或部署 Worker；保留声明用于官方来源和兼容门槛。 |
| Electron、Edge Dock、桌面展示、图标 | 排除生产代码 | 父子会话折叠、Grok Bot 分组、设备名称、额度条、Windows topmost 和图标属于展示。NAS 提供 wire metadata，不移植 UI。桌面 SSE 消费契约可用测试摘录验证，不能因此纳入完整 Electron。 |
| Worker 副本与 Worker npm 清单 | 排除 | 本仓库运行 Node Hub，直接复用主 shared 模块；引入第二套 Worker 拷贝增加维护漂移。本次 Worker diff 的 portable 语义已经由主 shared 覆盖。 |
| 官方文档、Release 模板 | 参考并更新 NAS 文档 | 官方 headless 指南确认 headless 的安装、状态和退出行为；安装/卸载步骤不能替换保留 NAS 数据的 Compose 升级步骤。API 新字段语义记录于本文和兼容测试；不照搬桌面 Release 或删除状态指南。 |
| 官方 shared/agent tests 与 fixture/helper | 按运行边界选择合入 | 保留 Node 核心的父子 wire、活动 TTL、锚点、watch scope、历史和元数据断言；部分 shared 测试也混入桌面/Worker 断言，需剥离。`antigravityThroughput.test.js` 仅依赖桌面 rate，完全排除。没有 Electron 测试文件进入 NAS 仓库。NAS 原有测试继续保留。 |

## 16 个提交的业务覆盖

| 官方提交 | 变更 | NAS 处理 |
| --- | --- | --- |
| `ad3f9aae` | Electron 43.7.9 | 排除运行依赖；NAS 不安装 Electron。 |
| `945a23fc` | Cursor desktop activity 触发 cloud usage | 引入 collector/native watch，默认客户端范围不变。 |
| `88916086` | headless 安装文档 | 参考退出/安装语义，NAS 文档保留数据保护。 |
| `c62544e7` | 设备列表/TPS 显示名称一致 | 排除 Electron 展示；deviceId 不变。 |
| `80fc3012` | Antigravity 原生生成速度 | 引入 history reasoning、固定 Tokscale、shared 测试；排除 UI。 |
| `891ac799` | Antigravity 单 quota group 显示两周期 | 排除 renderer，额度协议源无变更。 |
| `bb6ec574` | Claude/Codex waiting 活动状态 | 引入共享状态、身份验证、archive 瞬时字段排除；headless polling 关闭。 |
| `eac58372` | Cursor turn completion | 引入只读 metadata 与缓存/近期查询控制。 |
| `3e98bff8` | Grok Bot Sessions 分组 | 排除 renderer/grouping benchmark；不修改计费协议。 |
| `4129b5e1` | Lucide 导航图标 | 排除 Electron 图标资源。 |
| `050f9837` | Windows Edge Dock 睡眠后 topmost | 排除桌面进程代码，不影响 Node Hub/Adapter。 |
| `22ff2bae` | 缩短 T3 polling 测试等待 | 随 shared 测试引入，不改变 NAS 调度。 |
| `2c927c54` | Antigravity 标题读取/rename | 引入 source-aware metadata/cache/watch，标题上传仍双侧许可且默认关闭。 |
| `12ec5223` | subagent parent relationship | 引入 Tokscale parent metadata、usage/collector 与 wire 测试，排除呈现层。 |
| `6d36168f` | T3 conversations/delegation | 引入身份绑定与跨 provider parent 事实；不会合并或更名设备。 |
| `3f106ae3` | 0.69 release metadata | 官方源码版本 0.69.0，NAS 修订从 -01 开始。 |

## 协议、迁移与性能风险

1. 新增 wire 字段为可选扩展：`nativeSessionId`、`t3ThreadId`、`parentSessionId`、`parentClient`、`waitingForInput` 和 `liveActivity`。旧生产端缺字段仍合法；新 Hub 必须保留旧计数并通过真实 ingress/aggregate/SSE 路径验证。分组消费者只能每个 accounting session 加一次；不能把 parent 的 Tokens 再加到 child。`parentSessionId` 和 `parentClient` 是一个关系事实，delta 不能从不同快照各取一半。
2. `liveActivity.observedAt` 有独立时钟，未来值不应成为更新依据；状态有效期 30 秒，过期回落到 transcript 活动。`waitingForInput` 同时间戳清除优先，只有 boolean 与状态时间跨 wire，不上传问答或 call id。历史归档去除两种瞬时状态，归档会话不得显示运行中。
3. 本次官方 `sessionUsageArchiveStore.js` 无差异，不新增 SQLite schema 迁移；会话 JSON 内可增加稳定 metadata，锚点加 `sessionIdentityVersion:2` 和按周期 catalog provenance。旧锚点接受/拒绝行为和首次身份补齐必须测试，完整 Token 基线不能被元数据升级重写。旧 0.54 JSON→SQLite 的历史迁移仍需完整备份；它不是本次新迁移。
4. Tokscale fork commit 和 sha256 全量同步，保持 `baseVersion:4.18.0`；官方清单说明 Codex cache 会重解析一次。Hermes Token 准确性要用固定合成 DB 比较 today/month/allTime、cache/output 与历史，不能拿一个 Hub 健康响应代替计数证明。
5. 默认 Hermes-only 不触发 Claude/Codex 活动读者；新增 portable 模块仍可能有固定加载成本。保留 NAS Watcher 轻量依赖边界、SQLite streaming rows、canonicalSummary 归档复用与 Hub digest/SSE 缓冲限制。性能必须分别测 Agent/Watcher/Hub 的冷启动、稳定空闲、采集峰值和持续窗口；短时合成数据测试不能称为生产长期稳定或改善。
6. Windows 0.69 官方 UI 更丰富的会话状态不要求 Hub 提高完整快照频率。保留现有轻量在线信息和实际 usage 时间戳分离、首次与重连完整快照、即时标题撤销通知。独立 Adapter 的发布/真实 Windows 和公网 gzip 流验证属于单独验收，不能从本地 Linux 测试推断。
7. 本机未提供 Docker daemon，原生 amd64/arm64 候选运行必须由 PR CI 或对应原生 Linux 完成；本机 Node 测试不是双架构 Docker 通过证据。此次本地 NAS suite 实测 992 项，其中 987 通过、5 项平台条件跳过，没有失败；两架构 CI 此刻仍等待结果，不得描述为通过。最新 CI 状态和结果以 `VALIDATION.md` 为准。发布 Tag/镜像与生产部署都不得越过这些门槛。

## 最终 NAS 适配与测试边界

- 固定 Node slim 镜像增加 `procps`，为官方 `processStarts.js` 使用的 `ps` 以及按进程采样 benchmark 提供运行依赖；不能依赖开发机预装命令。本变更不引入 Electron。进程性能采样分别标识 Agent、独立 Watcher 和 Hub，统计短时 fixture 数据，不代替生产持续运行观察。
- 容器验证使用 `--init` 与既有 Compose `init:true` 对齐，确保退出/子进程回收的测试前提一致；默认独立 Watcher `TOKEN_MONITOR_WATCH_IN_PROCESS=0` 不变。
- Linux 活动身份测试使用临时合成 machine-id 和真实 `/proc` 进程身份，不读取主机 machine-id 后写入报告；macOS 无 Linux `/proc` 的相关分支明确按平台条件跳过。
- 新增 `app/tests/agent/hermesTokenContract.test.js`，以真实 checksum 锁定 Tokscale 读取合成 root/profile SQLite，验证输入/输出/cache、跨库去重、multi-model/task、session-totals fallback、单日/月度/全量与冷/热缓存、共享历史归一化以及源 DB SHA256 与无 sidecar 写入。全量/月度预期 1,828 Tokens、单日 1,701 Tokens；不接触生产 Hermes 数据。
- `claudeSessionActivity`、`codexSessionActivity`、`codexWaiting`、`sessionActivityProjection`、`t3SessionParents`、`sessionActivityRegistry`、`collectorAnchorPersistence`、`tokscaleSessionMetadata` 保留 Node 核心断言，去除混入的 Electron 展示/集成断言；`sessionRelationshipWire` 保留 Node Hub/shared 断言，去除 Cloudflare Worker 专属断言。`antigravityThroughput` 完全排除，因为它验证桌面 rate 呈现；NAS 的 Hermes/历史/throughput 核心覆盖不依赖它。

初始 67 项核心/清单/测试导入决定经过上述边界审阅后，最终文件分类见下表。“选择合入”包括精简依赖清单与混合环境测试文件；排除某个环境的断言不表示该环境的功能已验收。真实 Windows 客户端、公网 SSE/gzip 和生产 NAS 持续运行仍需单独证据。

## 全部 141 个文件的逐项处理表

以下路径使用官方仓库布局。引入时主目录映射到 NAS 的 `app/`，保留已登记 NAS 补丁。A 为新增，M 为修改；“引入”是源码处理决策，不代表测试已经运行。

| 状态 | 官方路径 | 决策 | 原因 |
| --- | --- | --- | --- |
| M | `.github/RELEASE_TEMPLATE.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `README.ja.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `README.ko.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `README.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `README.pt-BR.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `README.zh-CN.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `README.zh-TW.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `docs/API.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `docs/architecture.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| A | `docs/headless-agent.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| A | `docs/headless-agent.zh-CN.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| A | `docs/headless-agent.zh-TW.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `docs/providers/README.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `docs/providers/antigravity.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `docs/providers/claude.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `docs/providers/codex.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `docs/providers/cursor.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `docs/providers/devin.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `docs/wsl-sqlite-setup.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `docs/wsl-sqlite-setup.zh-CN.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| A | `docs/wsl-sqlite-setup.zh-TW.md` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `package-lock.json` | 选择合入 | 官方版本 0.69.0；保留 NAS 精简依赖，不引入 Electron |
| M | `package.json` | 选择合入 | 官方版本 0.69.0；保留 NAS 精简依赖，不引入 Electron |
| A | `scripts/benchmark-grok-bot-grouping.js` | 排除 | Electron Grok Bot 展示分组 benchmark |
| M | `scripts/hub-build-manifest.js` | 引入 | 记录 portable shared 声明；NAS 不部署 Worker |
| M | `scripts/vendor/tokscale.json` | 引入 | 冻结 fork commit 和所有平台 SHA256 |
| M | `src/agent/runtime.js` | 引入 | 合并 headless polling 关闭与 NAS 最终上传错误传播 |
| M | `src/electron/edgeDock/controller.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/main.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/modelAliasPresentation.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/app.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/deviceBreakdown.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/edgeDock/dock.css` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/edgeDock/dock.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/edgeDock/index.html` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/edgeDock/presentation.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/i18n.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/icons/THIRD_PARTY_NOTICES.md` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| A | `src/electron/renderer/icons/actions/attention.svg` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/icons/views/model.svg` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/icons/views/session.svg` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/icons/views/status.svg` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/icons/views/tool.svg` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/icons/views/trends.svg` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/index.html` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/limits/providerPresentation.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/sessionRows.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/styles.css` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/syncDevicePanel.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/renderer/tokenRatePresentation.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/statsPublisher.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/electron/syncDisplayStats.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `src/shared/clientSources.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/collector.js` | 引入 | 三方合并；保留 watcherPolicy 抽离与默认扫描边界 |
| M | `src/shared/history.js` | 引入 | Antigravity reasoning 与 client 名归一化 |
| M | `src/shared/hubBuildRegistry.json` | 引入 | 冻结官方构建来源注册信息 |
| A | `src/shared/processStarts.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `src/shared/providers/antigravity/sessionMetadata.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `src/shared/providers/claude/linuxProcessIdentity.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `src/shared/providers/claude/sessionActivity.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `src/shared/providers/codex/sessionActivity.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/providers/codex/sessionContext.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `src/shared/providers/codex/sessionIdentity.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/providers/codex/sessionMetadata.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/providers/cursor/desktopState.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/providers/cursor/sessionMetadata.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/selfSyncThrottle.js` | 引入 | 仅注释调整，同步上游源码避免漂移 |
| A | `src/shared/sessionActivityProjection.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `src/shared/sessionActivityProviders.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `src/shared/sessionActivityRegistry.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `src/shared/sessionActivityScheduler.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `src/shared/sessionActivityWatch.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/sessionLive.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/sessionMetadata.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `src/shared/t3SessionActivity.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `src/shared/t3SessionIdentity.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/t3SessionMetadata.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/usage.js` | 引入 | 三方合并新字段；保留安全字典与时间戳补丁 |
| M | `src/shared/usage/deviceRuntime.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/usage/deviceState.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/usage/sessionUsageArchive.js` | 引入 | 排除瞬时活动/等待字段，稳定 metadata 可归档 |
| M | `src/shared/usage/usageHost.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `src/shared/usage/usageWorker.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `src/shared/windowsProcessStarts.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `tests/agent/runtime.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `tests/docs/readmeConsistency.test.js` | 参考 | 更新 NAS 对应说明，不复制桌面发布/安装和卸载流程 |
| M | `tests/electron/deviceBreakdown.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/edgeDock.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/edgeDockController.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| A | `tests/electron/grokBotIdentity.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/homeLimitBars.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/homeSessionRepaint.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/limitProviderPresentation.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/limitStatsPresentation.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/modelAliasPresentation.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/overflowText.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| A | `tests/electron/recentSessionGroups.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| A | `tests/electron/sessionActivity.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/sessionDetail.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| A | `tests/electron/sessionGroups.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/sessionHoverRepaint.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/sessionRows.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/sessionTitleDisplay.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/syncConnection.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/electron/tokenRate.test.js` | 排除 | 桌面/Edge Dock 展示或其专属测试，不进入 NAS 运行范围 |
| M | `tests/fixtures/usageWorkerScriptedCollector.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `tests/helpers/sourceEnv.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `tests/shared/antigravitySessionMetadata.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `tests/shared/antigravityThroughput.test.js` | 排除 | 仅验证桌面 rate 展示、依赖 Electron；共享 Token/history 由独立核心测试覆盖 |
| A | `tests/shared/claudeSessionActivity.test.js` | 选择合入 | 保留 Node 核心状态、元数据或身份断言；排除 Electron 展示/集成断言 |
| A | `tests/shared/codexSessionActivity.test.js` | 选择合入 | 保留 Node 核心状态、元数据或身份断言；排除 Electron 展示/集成断言 |
| A | `tests/shared/codexSessionIdentity.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `tests/shared/codexWaiting.test.js` | 选择合入 | 保留 Node 核心状态、元数据或身份断言；排除 Electron 展示/集成断言 |
| M | `tests/shared/collectorAnchorPersistence.test.js` | 选择合入 | 保留 Node 核心状态、元数据或身份断言；排除 Electron 展示/集成断言 |
| M | `tests/shared/collectorLoadGuards.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `tests/shared/collectorParentLinks.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `tests/shared/cursorSessionMetadata.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `tests/shared/cursorSourceWatch.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `tests/shared/history.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `tests/shared/processStarts.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `tests/shared/releaseArtifactNames.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `tests/shared/sessionActivityProjection.test.js` | 选择合入 | 保留 Node 核心状态、元数据或身份断言；排除 Electron 展示/集成断言 |
| A | `tests/shared/sessionActivityRegistry.test.js` | 选择合入 | 保留 Node 核心状态、元数据或身份断言；排除 Electron 展示/集成断言 |
| A | `tests/shared/sessionActivityScheduler.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `tests/shared/sessionActivityWatch.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `tests/shared/sessionRelationshipWire.test.js` | 选择合入 | 保留 Node Hub/shared wire 断言；排除 Cloudflare Worker 副本断言 |
| A | `tests/shared/t3SessionIdentity.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `tests/shared/t3SessionMetadata.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| A | `tests/shared/t3SessionParents.test.js` | 选择合入 | 保留 Node 核心状态、元数据或身份断言；排除 Electron 展示/集成断言 |
| M | `tests/shared/tokscaleSessionMetadata.test.js` | 选择合入 | 保留 Node 核心状态、元数据或身份断言；排除 Electron 展示/集成断言 |
| M | `tests/shared/usage.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `tests/shared/usageDelta.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `tests/shared/usageHost.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `tests/shared/watcherNativeEvents.test.js` | 引入 | 共享源码或匹配回归测试；可选客户端不自动启用 |
| M | `worker/package-lock.json` | 排除 | Cloudflare Worker 副本；Node Hub 直接使用主 shared |
| M | `worker/package.json` | 排除 | Cloudflare Worker 副本；Node Hub 直接使用主 shared |
| M | `worker/src/shared/history.js` | 排除 | Cloudflare Worker 副本；Node Hub 直接使用主 shared |
| M | `worker/src/shared/hubBuildRegistry.json` | 排除 | Cloudflare Worker 副本；Node Hub 直接使用主 shared |
| A | `worker/src/shared/sessionActivityProviders.js` | 排除 | Cloudflare Worker 副本；Node Hub 直接使用主 shared |
| A | `worker/src/shared/sessionLive.js` | 排除 | Cloudflare Worker 副本；Node Hub 直接使用主 shared |
| M | `worker/src/shared/usage.js` | 排除 | Cloudflare Worker 副本；Node Hub 直接使用主 shared |

核对：参考 22 项，选择合入 11 项，排除 53 项，引入 55 项；合计 141 项。

最终原生验收：CI [38195738924](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38195738924)，源码提交 `acdad0e7d1e368a515bc67aad94e5ac0e500d421`，两架构各 992 项/990 通过/0 失败/2 个 Windows 原生平台跳过，各 15 项固定数据性能门禁通过。完整数值和限制见 [UPGRADE_0.69.md](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/da59a50dbc648baa28312d7bd418a545d0bbd20e/UPGRADE_0.69.md)；不代表生产 NAS 或真实 Windows 公网验收。
