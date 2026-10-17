# NAS 专用补丁清单

## 已发布 v0.72.0-02：Hub 显示名称

正式 v0.72.0-02 增加可选 `TOKEN_MONITOR_HUB_DISPLAY_NAME`，仅通过鉴权 `/api/stats` 和普通/Windows SSE 完整快照返回 `hub.displayName`。不修改 Agent 身份、计费、持久化、同步来源、公开 health 或生产配置。旧客户端可忽略新增字段，旧 Hub 缺字段仍兼容。实际 Node 运行时 revision 8 按源码重新生成，shared core revision 84 不变。PR #11 已合并，正式 source/tag/OCI/manifest 为 `0f748427b7c75171d1c2fcaf40c0ef552bfb2f2d`；双架构镜像已发布，旧Release页面已清理，固定摘要见 [交接记录](HANDOFF.md)。所有者自行更新容器，本任务未部署或验收生产 NAS。

在本版保留下面 NAS-01～18 全部补丁。以下版本叙述是历史记录，不是当前发布状态。

## 历史 v0.72.0-01 补丁

正式发布源码/tag/OCI/manifest为 `8444a9b1f3aeb88e164fd20b9773a9984d3d33a0`，双架构原生验收与发布读回完成，五个旧固定标签保持。后补发布记录不改变补丁或重建固定镜像；生产NAS本轮均未部署。

官方固定 `v0.72.0` / `126e9a43dcc51d3d7b2609231eac9974ba73bed7`。NAS-01～17 全部保留，尤其实际 Agent strict store/capture/dry-run snapshot 及失败后完整用量保留；增加 snapshot read fault 入口测试。

新增 NAS-18：`app/src/hub/ingressOrdering.js` 与 server.js 接入。独立比较已知 usage/limits producer 时间，迟到旧快照不覆盖新用量/历史，额度单独上报保留完整历史与采集时间；重复上传不累加，重启继续使用持久化时间。无时间戳的旧客户端延续旧到达顺序，不能保证其乱序。保留标题撤销隐私 gate、持久化失败回滚；不引入计数/费用只增不减规则，不改变共享跨平台 core。`ingressOrdering.test.js` 验证迟到、重试、重复、重启、独立时钟、limits-only、合法降费和日界。

Cursor/OpenCode 三个 provider 与旧官方相同，无 NAS 冲突，按正式 tag 原样更新；不启用新源/额度/账户。Watcher 默认隔离、五分钟采集、60 秒防抖、Hermes 只读、512MiB、Windows 10/30 分钟 SSE 均保留。发布与生产状态见 [本轮交接](HANDOFF.md)，以下为历史。

NAS-18 的顺序时间必须有可信 Hub 接收时间，producer 最多超前5分钟；未来/缺失/异常时间不作为持久顺序水位，避免时钟纠正后永久拒绝统计。首份额度在完整用量之前保留 `limitsOnly` 标记且不建立用量时钟，标记可跨Hub重启；完整用量接受后清除。上述时间不可比较时保留旧到达顺序语义，不保证该异常区间的乱序。

历史已发布修订 `v0.71.0-02`，官方固定 `v0.71.0` / `a514e2063563e318ef73c2a17fad68057c4e300c` 不变。新增 NAS-01 入口保护：Agent archive store、capture、dry-run snapshot 均启用 strict；capture 失败在替换 archive、更新 DeviceState、采集健康及投递之前退出，limits-only 继续携带上次完整用量。入口级证据见 `app/tests/agent/archivePublication.test.js`；原生双架构及8组冻结恢复通过，DXP4800已升级并验收，DH4300Plus SSH阻塞。发布和部署结果见 [本修订交接](HANDOFF.md)。以下起点和版本叙述为历史。

官方目标基线：`v0.70.0` / `ac4eeb2c4aea239dd94b67f074c73f69aafc46f8`。已发布 NAS 版本：`v0.70.0-01`。接管起点为正式 `v0.69.0-02` / `ec79dc7bff697ed5568b013578a8ec8d6261e67e`，旧官方基线 `v0.69.0` / `3f106ae3d4712b26cced8272f0d488eaab0de1e6`。

此文件是维护契约，不是测试执行记录。每次升级须将官方新增能力与这些补丁三方合并，并在 `VALIDATION.md` 写明实际运行环境、结果与尚未完成的门槛。部署目录和设备名以实际现有配置为准，模板不是迁移工具。

## 必须保留的补丁

| ID | 补丁路径 | 目的与不得改变的行为 | 核心回归证据位置 |
| --- | --- | --- | --- |
| NAS-01 | `app/src/agent/agent.js`、`deliveryPolicy.js` | 未变化内容去重但定期心跳；周期以成功请求开始时间为基准，失败不推进去重状态。NAS 上报版本去掉 v；不把上传目的地写入普通启动日志。归档应用使用 canonicalSummary 复用已规范化周期，保留 detached snapshot 防御复制。 | `app/tests/agent/deliveryPolicy.test.js`、`runtime.test.js`、shared archive tests |
| NAS-02 | `app/src/agent/upload.js`、`app/src/shared/syncPayload.js` | 上传总时限与 AbortSignal；压缩重试仍受同一取消范围和明细策略控制；错误响应未消费完也应中止，不记录错误正文。可选择只在上传副本省略今天/月明细，不清本地归档/汇总。默认完整明细。 | `app/tests/agent/upload.test.js`、`app/tests/shared/syncPayload.test.js` |
| NAS-03 | `app/src/agent/nasHealth.js`、`agent.js`、`runtime.js` | 健康状态绑定本次进程身份；重启不继承旧健康，未来时间戳不合法。collection 停滞失败，Hub 离线上传状态单独报告；单次运行最终上传失败退出错误。 | `app/tests/agent/nasHealth.test.js`、`runtime.test.js` |
| NAS-04 | `app/src/agent/hermesTitles.js`、`agent.js` | 仅已采集 Hermes 会话 ID 的主库/profile 标题只读叠加；失败不阻断统计，不读取 Hermes 消息正文。默认标题同步关闭，服务器/发送设备各自 opt-in。官方 titleSync.js 保持来源，不新增另一套许可协议。 | `app/tests/agent/hermesTitles.test.js`、`syncContent.test.js`、`titleSync.test.js` |
| NAS-05 | `app/src/shared/watcherPolicy.js`、`collector.js`、`watcherHost.js`、`watcherWorker.js` | 抽离轻量监听策略，独立 Watcher 不加载完整 collector/Tokscale/归档树；保留官方监听过滤、描述符降级、polling 上限、最大等待和自循环防护。默认 `TOKEN_MONITOR_WATCH_IN_PROCESS=0`；不得用降低隔离换取内存数字。 | `app/tests/shared/watcherDependencies.test.js`、`watcherHost.test.js`、`collectorLoadGuards.test.js`、native event/scope tests |
| NAS-06 | `app/src/shared/usage/sessionUsageArchiveStore.js` | SQLite 逐行读取全量和增量会话，减少同时保留 JSON 字符串数组；iterator 异常/中断释放 statement，不能提交半成品 archive 或提前推进 revision。SQLite schema/现有目录不变。 | `app/tests/shared/sessionUsageArchiveStore.test.js`、`sessionUsageArchive.test.js` |
| NAS-07 | `app/src/shared/usage.js`、`recordTimestamp.js` | 客户端/模型/会话键都是不可信数据；读取自有属性，特殊 `__proto__` 等保留为正常 JSON 键，不能访问或更改原型。设备时间只接收原标量类型，不能保存异常对象阻断后续聚合。升级新增字段必须使用相同安全字典边界。 | `app/tests/shared/usageMapSafety.test.js`、usage tests、Hub tests |
| NAS-08 | `app/src/hub/store.js`、`server.js` | 文件不存在才初始化；空文件/损坏 JSON/无效结构/读失败保留原文件并拒绝启动。用量持久化失败回滚内存设备/savedAt 并返回 503。禁止用空库掩盖原数据损坏。 | `app/tests/hub/persistence.test.js`、`server.test.js` |
| NAS-09 | `app/src/hub/sse.js`、`server.js` | 每连接只保留最新待发完整快照和新鲜度事件，8 MiB 缓冲上限，30 秒阻塞断开；重连立即完整 snapshot。gzip 流逐事件刷新，dispose 释放连接/定时器/压缩器。 | `app/tests/hub/sse.test.js`、`windowsHttp.test.js`、`windowsStream.test.js` |
| NAS-10 | `app/src/hub/statsContentDigest.js`、`server.js` | 长期比较值为 SHA-256 digest，避免额外持有完整统计 JSON 字符串；不改变通知内容和判断字段。 | `app/tests/hub/statsContentDigest.test.js` |
| NAS-11 | `app/src/hub/windowsSchedule.js`、`calendars/2026.json`、`windowsStream.js`、`server.js` | 默认关闭 `/windows`；共用现有完整 API/存储/认证。北京时间中国法定工作日 07:00–17:00 十分钟，其他三十分钟，有变化才发完整统计；首连/重连立即 snapshot，手动读取不重置周期。缺年份回退周一至周五并报告。标题撤销、删除、共享/订阅即时通知。 | `app/tests/hub/windowsSchedule.test.js`、`windowsStream.test.js`、`windowsHttp.test.js` |
| NAS-12 | `app/src/hub/deviceFreshness.js`、`windowsMetrics.js`、`server.js` | 30 秒轻量在线信息只读取 receivedAt/年龄/过期元数据，不重聚合用量或更新时间；诊断仅进程计数，无凭据、URL 参数、标题或会话正文。请求数/编码正文大小不等于公网成功送达证据。 | `app/tests/hub/deviceFreshness.test.js`、`windowsDesktop.test.js`、`windowsHttp.test.js` |
| NAS-13 | `app/package.json`、`app/package-lock.json`、`Dockerfile` | NAS 精简 npm 清单，不安装 Electron/dev 构建依赖；保留固定摘要 Debian slim 与 Node SQLite 兼容性。依赖安装、固定 Tokscale 验证拆层，COPY --link 复用生产依赖，镜像只 COPY agent/shared/hub。官方新增客户端不意味着增加默认扫描。 | npm install/audit、Tokscale manifest/release/client 验证、原生双架构镜像 CI |
| NAS-14 | `docker-compose.yaml`、`docker-compose.4300.yaml`、`.env.example` | 两台 NAS 原有服务名、deviceId、Hermes 只读挂载、持久化位置、Asia/Shanghai、512 MiB 上限、只读根/最小 capabilities；五分钟周期、60 秒防抖、归档/完整明细开启，额度/项目默认关闭。现有 `.env` 不进仓库。真实部署已有 ID 即使与模板不同也必须原样保留。 | Compose config 校验与静态边界检查；真实 ID/目录保留须部署前单独核对 |
| NAS-15 | `nas-version.txt`、`scripts/check-nas-version.js`、`scripts/promote-nas-image.js`、`.github/workflows/validate.yml` | `v<官方>-<两位NAS>`，新上游从 -01；标签与 OCI 一致。两个架构测试同一不可变 digest 后推广；固定标签存在且 digest 不同必须拒绝覆盖，旧 main CI 不可改 latest。部分失败恢复沿用原摘要。 | `scripts/tests/promote-nas-image.test.js`、版本校验与 CI 原生 amd64/arm64 jobs |
| NAS-16 | `scripts/check-publication-safety.py`、`.gitignore`、`.dockerignore`、`SECURITY.md` | 扫描可达 Git 历史的常见秘密和运行数据路径；不提交 .env、凭据、Hermes DB、状态、日志或备份。发布检查不接触生产 NAS。模式扫描只是有限证明，不能称为全量安全审计。 | publication-safety 检查与镜像内容审阅 |
| NAS-17 | `app/scripts/test-nas.js`、NAS agent/hub/shared tests | 在 NAS 运行边界测试官方与自有补丁；Worker/Electron 专属依赖不进入 Docker。双架构须原生 runner，不能把 QEMU 进程身份或耗时当成真实 NAS 结果。增加上游新共享功能的测试清单，避免仅复制测试却不执行。 | 完整 NAS suite + upstream shared suite + PR CI artifacts |

## v0.70 三方合并结果

- NAS-06 的全量/增量逐行读取与异常 cursor 释放由官方等价实现承接。只保留一套 iterator；新增 staged Map 在完整 catch-up 后才写共享 archive。全量加载同样读完才替换 archive/推进 revision。保留所有 NAS fault-injection 测试，再运行官方全量/增量 capture/refresh/retry 测试。
- `collector.js` 新 CatPaw 来源指纹、账户变化时的原子重扫及 Cursor 显式长同步标志合入；CatPaw 的 watch matcher 移至轻量 `watcherPolicy.js`。默认 Hermes-only/独立 Watcher 不变，不新增生产账户或源。
- Hermes `history.js` disjoint reasoning 与新版固定 parser 配套；Token 不因 reasoning cost 修正而减少。
- Codex 压缩读取与会话详情仅共享模块，plain/zst 同 ID 不重复；provider 更新只访问合成 fixtures 或显式启用的配置。
- StepFun 续期回调异常只打印固定文本，避免异常 message 泄露凭据；失败、超时和取消测试保留。
- 新共享测试加入实际 `test-nas.js` 执行清单，桌面 UI/Worker 断言明确排除。测试范围以 [UPGRADE_0.70.md](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/da59a50dbc648baa28312d7bd418a545d0bbd20e/UPGRADE_0.70.md) 当前证据为准。

## 历史 v0.69 三方合并重点

上一个官方基线相对 NAS 起点，核心 shared 改动恰为：`collector.js`、`syncPayload.js`、`usage.js`、`usage/sessionUsageArchiveStore.js`、`watcherHost.js`、`watcherWorker.js`，新增 `watcherPolicy.js`、`recordTimestamp.js`。官方 v0.69.0 与这些路径的交叉为 `collector.js` 和 `usage.js`；Agent 的交叉为 `runtime.js`。不得通过整目录覆盖抹掉补丁。

- `collector.js`：上游内嵌 Watch policy 需移入 NAS 抽离模块；Cursor/Antigravity 新 watch 源、activity-only 源、polling overlap 去重、配置传递必须同时合并。保持 Watcher 只加载轻量策略和必要 path 模块。
- `usage.js`：新增 identities/relationship/activity normalization、merge、delta 时保留 NAS 自有字典读写和 `recordTimestamp`。新 parent namespace 不能拼接不同快照的数据。
- `runtime.js`：保留 NAS `lastDeliveryError`，同时遵守官方 headless 的 `sessionActivityPolling:false`。
- `sessionUsageArchive.js` 新增瞬时字段排除，与 NAS store streaming rows 是不同层，二者都保留。
- Node Hub `server.js` 官方无改动，仍受 shared usage 新字段影响；保留 NAS server，不把 Worker/Electron 的新呈现层引入。

`app/scripts` 中已有 macOS/widget 打包与 Worker 同步辅助脚本的历史差异不属于 NAS 运行补丁：本次不激活、不再次扩展它们。它们不 COPY 进运行镜像，未来可在单独维护任务中审阅去留，避免把无关删除混入本次升级。

## 长期维护方式

每次升级固定旧 tag、新 tag 和 SHA，生成全仓库文件差异，再按 `UPSTREAM_0.70_AUDIT.md` 的决策表分成共享/Agent、NAS 包装、桌面、Worker、文档与测试。自动检查应报告差异，不能自动覆盖代码或部署 NAS。

`app/src/agent` 与 `app/src/hub` 的 NAS 能力继续模块化，官方 shared 补丁尽量限于列出的接入点。后续若上游接受 streaming archive、轻量 Watcher 或字典安全修复，先对行为与测试确认等价，再从清单删除对应补丁；不能仅因代码看起来相似取消安全边界。

自动新 Release 发现与范围报告使用独立工作流，只创建维护报告/候选范围，不发布镜像、不使用生产凭据。协议、NAS 回归和固定数据集内存/耗时门槛在 PR CI 运行；结果文件应记录 fixture、Node/OS/架构、进程角色、采样时长和阈值。性能异常先定位模块加载、重复扫描或 SSE 缓冲，不能自动扩大 Compose 内存上限。

旧固定镜像、旧 Tag 与状态备份全部保留。真正升级部署必须备份状态及 Compose/.env，保持设备 ID、持久化目录和只读数据源，再在副本验证；本候选开发与 PR 不授权生产部署。

## v0.69 container prerequisites

Runtime procps supplies the official POSIX process-start reader and the test RSS sampler. CI and release test containers use `--init`, matching existing Compose `init: true`, to reap terminated children. Linux registry tests use a synthetic machine-id while preserving actual `/proc` identity checks; no machine-id is baked into the image. Hermes-only remains the default.

## v0.71 三方合并与真实构建身份

Goose DB/WAL事件与SHM自循环过滤纳入轻量watcherPolicy，独立Watcher默认值保留。SQLite官方streaming/revision修复与NAS完整stage/fault tests同时保留；Notion和WorkBuddy共享身份、双额度窗口、占位/失败账户规则见 UPSTREAM_0.71_SHARED.md。既有安全字典、上传取消/去重/心跳、Hub持久化、有界SSE不变。

NAS自有core/node adapter与官方不同，不能复制上游最新注册hash冒充一致。app/scripts/nas-hub-build.js从实际portable共享依赖和完整Node本地依赖闭包（含NAS Hub helper与日历、package/lock）计算SHA-256，排除注册表避免自引用；继承上游历史后只追加本次NAS core/node记录。旧客户端遇到未知构建应保持unknown提示，不伪装current。本仓库不分发或部署Worker副本，不为不存在的Worker生成新身份。

v0.71额外NAS严格publication保护：坏SQLite单row JSON、无效session及legacy row在读取/迁移/增量capture前拒绝，错误不覆盖完整设备数据、不提交半成品、不提前推进revision；合法prune tombstone及非严格历史读取行为保留。上游与NAS测试均执行。生产费用保护不放宽，仅保存私有旧/新冻结证据、补齐稳定会话日期与periodWindows；跨0.70使用已审阅手动方案与独立含reasoning原生演练。正式发布和真实DXP部署验收、DH访问阻塞见HANDOFF.md。
