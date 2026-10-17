# 官方源码基线

## 最新 NAS v0.72.0-02

官方稳定基线仍为 `v0.72.0` / `126e9a43dcc51d3d7b2609231eac9974ba73bed7`，没有改用 main 或预发布。基于已发布 v0.72.0-01 增加可选鉴权 Hub 显示名称，shared core revision 84 保持，Node runtime revision 8 按真实源码生成。PR #11 已合并，2026-10-16 21:35:40（北京时间）正式发布；source/tag/OCI/manifest 为 `0f748427b7c75171d1c2fcaf40c0ef552bfb2f2d`，固定 index 与 latest 同为 `sha256:81413b1a4fcb30757f906bc732dcfbfe6883cb27683dffaaad98ea7ced9b8715`。六个旧固定标签不变。发布、原生双架构与恢复证据见 [本修订交接](HANDOFF_0.72.0-02.md)。所有者自行更新容器，本任务未部署或验收生产 NAS。`upstream-lock.json` 的 tag/commit 继续锁定同一官方稳定版，其中 nasRevision/revisionBaseline 记录引入官方 0.72 的 -01 对齐操作；本次仅 NAS 修订的发布号以 nas-version.txt 为准，正式源码由 Release manifest 锁定。以下为历史记录。

## 历史 NAS v0.72.0-01

已于北京时间2026-10-16 06:45:31正式发布，NAS源码 `8444a9b1f3aeb88e164fd20b9773a9984d3d33a0`。原生amd64/arm64最终镜像测试、固定标签/Release/OCI清单及匿名Registry读回通过；本轮两台生产NAS均未部署，访问阻塞与独立部署确认计划见交接。后补文档不改写固定镜像。

官方稳定 `v0.72.0` / `126e9a43dcc51d3d7b2609231eac9974ba73bed7`，由 v0.71.0-02 最小增量对齐。Cursor 新统一方案额度与 OpenCode 2.x 元数据/本地详情移植，桌面更新器、窗口和显示分组排除。补 Node Hub 迟到上传保护；无 schema、parser pin 或计费口径迁移，NAS 默认配置不变。逐文件决策见 [审计](UPSTREAM_0.72_AUDIT.md)，实际验证/发布/生产状态见 [交接](HANDOFF_0.72.md)。

## NAS v0.71.0-02

官方仍固定 `v0.71.0` / `a514e2063563e318ef73c2a17fad68057c4e300c`。基于已发布 `v0.71.0-01` / `e92d9add64efbb9985fb482880d9d95734354183` 补齐 Agent 实际入口的归档错误发布保护。无 parser pin、计费或格式迁移；Hub 共享源码与闭包哈希保持实际一致，不虚增 Hub 身份。新入口测试、标题清理、可选来源配置与本次验收见 [HANDOFF_0.71.0-02.md](HANDOFF_0.71.0-02.md)。下面记录前版发布时状态；DH4300Plus 后由所有者说明自行更新，本修订只读预检仍 SSH 拒绝，不能推断其当前版本。

## NAS v0.71.0-01

固定官方 v0.71.0 `a514e2063563e318ef73c2a17fad68057c4e300c`，上一基线 v0.70.0 `ac4eeb2c4aea239dd94b67f074c73f69aafc46f8`。逐文件差异见 UPSTREAM_0.71_AUDIT.md，共享三方合并见 UPSTREAM_0.71_SHARED.md。Agent与Node Hub无上游本体净差，加载同一app/src/shared。Tokscale固定二进制pin没有变化，既有fork的Goose解析通过新增真实binary契约验收后才可宣称支持。桌面登录、托盘、界面和Electron内存管理不入容器。

NAS core/Node adapter使用实际闭包hash，Worker未分发；旧客户端的unknown身份提示不能靠复制官方注册值消除。上游19个Worker共享副本、registry及声明哈希已静态核对一致。正式源码为e92d9add64efbb9985fb482880d9d95734354183，原生双架构与六组冻结/恢复通过，v0.71.0-01已发布并读回；DXP4800 Hub+Agent已实际升级，DH4300Plus SSH拒绝连接。完整证据及剩余边界见 HANDOFF_0.71.md。以下保留历史。

## NAS v0.70.0-01

Official `v0.70.0` is frozen at `ac4eeb2c4aea239dd94b67f074c73f69aafc46f8`; previous official baseline is `3f106ae3d4712b26cced8272f0d488eaab0de1e6`. NAS runtime baseline is released `v0.69.0-02` / `ec79dc7bff697ed5568b013578a8ec8d6261e67e`, with the latest documentation-only main `9d23bed717ded9e850b2035ec55a511aaec9082c`. Hub, Agent and shared keep one baseline.

Hermes reasoning normalization and the fixed Tokscale `fa5f0c13324838d1a988fda317597f9b90da7ad0` are upgraded together; corrected estimated costs may decrease while token buckets and histories must remain. Codex `.jsonl.zst` active/archive compatibility, DSH model attribution and shared T3 title lookup are included. SQLite uses the official equivalent streaming implementation, plus staged revision catch-up, retaining NAS fault-injection tests. No Electron, Dock, Windows Adapter or Worker code enters the image. CatPaw remains opt-in and has no Linux source; NAS defaults remain Hermes-only. Optional quota providers are adapted without enabling accounts.

No mandatory SQLite schema or Hub JSON format migration. Codex parser caches advance from version 12 to 15 and may reparse once; StepFun's optional account identity becomes stable across access-token refresh. Existing unknown/optional fields remain handled by the unchanged shared normalization and Hub protocol. Full pre-deployment state backup and closed restore verification remain necessary.

Audit: [UPSTREAM_0.70_AUDIT.md](UPSTREAM_0.70_AUDIT.md). Validation, release and deployment are distinct gates in [UPGRADE_0.70.md](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/da59a50dbc648baa28312d7bd418a545d0bbd20e/UPGRADE_0.70.md). Formal v0.70.0-01 is published at NAS commit `02413928fef06abc99e181f253228e549fb4582f`; native tests, immutable digest/manifest evidence and the separate pending production gate are recorded there. The records below describe earlier versions.

## NAS v0.69.0-01

官方 Tag `v0.69.0`，提交 `3f106ae3d4712b26cced8272f0d488eaab0de1e6`，上一官方基线 `5d2db368d8313415763860d594de00e46a663418`。NAS 基线为 `2fdfbc57dd11fd0838aff2820504da2d2d67fcf3`（v0.68.0-05）。本次同步 shared、Agent runtime、依赖清单和固定 Tokscale manifest；Node Hub 与 Agent 使用同一共享基线，NAS 数据保护、Windows SSE/gzip/日历、Hermes 标题隐私与轻量独立 Watcher 补丁保留。

新会话身份和父子字段不改变 accounting key；瞬时活动不归档。SQLite schema 与 Hub 文件格式无强制迁移，但首轮采集会更新已有锚点和附加元数据，因此仍须停机完整备份并保留旧状态副本。默认 Hermes-only；headless 活动轮询关闭，不开启额外客户端扫描。

完整上游逐项决策：[UPSTREAM_0.69_AUDIT.md](UPSTREAM_0.69_AUDIT.md)。维护补丁：[NAS_PATCHES.md](NAS_PATCHES.md)。验证与发布状态：[UPGRADE_0.69.md](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/da59a50dbc648baa28312d7bd418a545d0bbd20e/UPGRADE_0.69.md)。本版已通过原生双架构发布验收，正式 Release 和固定镜像见升级报告。以下章节是历史版本记录。

## NAS v0.68.0-05

两个 NAS Compose 模板默认使用 `TOKEN_MONITOR_WATCH_IN_PROCESS: "0"`，优先保留文件监听与采集进程的故障隔离。本修订将这一默认值纳入正式版本的源码标签、部署模板和发布说明，保留 v0.68.0-04 的轻量监听依赖、归档及 Hub 优化和同步修复；程序逻辑、官方 0.68.0 基线与持久化格式不变。

已有部署须在实际 Compose 中选择监听模式，并重建 Agent；仅拉取镜像不会覆盖宿主机的配置。本版仍支持通过 `"1"` 主动选择同进程模式。原有固定版本保留，不覆盖 v0.68.0-04 的镜像或 Release。

## NAS v0.68.0-04

本修订优化 Agent 与 Hub 内存使用，并修复采集同步和镜像发布恢复边界。官方基线仍为 0.68.0，没有归档或 Hub 持久化格式迁移。GitHub 发布与实际 NAS 部署分别验收。

- Hub/Agent 共用的用量映射按自有属性读写，特殊客户端、模型和会话键不会访问或改写原型；保留 JSON 字段、正常汇总和会话明细，不引入数据迁移。
- Agent 心跳以成功上传所对应的请求开始时间为周期基准，避免上传耗时让空闲设备跳过一整轮心跳；成功健康时间仍记录完成时间，失败不推进去重状态。
- 上传失败时中止尚未结束的响应，确保错误正文不能在超时器清除后继续占用连接；不读取或记录错误正文。
- Windows 轻量在线事件只读取设备元数据，不重新聚合会话、历史及额度；完整统计周期、标题许可通知、普通入口和实际离线判定保持原行为。
- 双架构测试和标签推广使用同一不可变镜像摘要。固定标签相同摘要可继续恢复 `latest`，不同摘要拒绝覆盖；远端主分支已经前进时旧任务不能改写 `latest`。恢复部分发布失败应只重跑失败的 `promote` 任务并沿用原摘要；重新构建生成的新摘要不能覆盖已有固定版本。

- 独立监听模式抽离为轻量模块，避免加载完整采集器依赖。此版本发布时的 NAS 模板启用同进程监听；v0.68.0-05 模板恢复独立监听默认值，事件触发和周期采集继续开启。
- SQLite 会话归档逐行装载，保留完整历史与增量修订语义；Agent 归档应用复用已规范化周期，保留快照防御复制。
- Hub 长期保存的统计比较值改为 SHA-256 摘要，正文及比较字段不变；普通与 Windows SSE 均沿用现有通知和调度语义。
- 设备时间戳只接受原有标量类型，防止异常对象被持久化后阻断统计与在线状态读取。

## 历史 v0.68 发布记录

- 仓库：<https://github.com/Javis603/token-monitor>
- 官方 tag：`v0.68.0`
- 官方提交：`5d2db368d8313415763860d594de00e46a663418`
- NAS 发布号：`v0.68.0-05`
- 源码范围：`app/src/shared`、官方 `app/src/agent/agent.js`、`runtime.js`、`seedClients.js`、官方 `app/src/hub`、相关构建脚本和依赖清单；NAS 专用代码在 Agent 包装、Docker、Compose 和发布检查中。

迁移重点：官方新版将 `session-usage-archive.json` 迁至 `session-usage-archive.sqlite`，成功后会移除旧 JSON。部署前须备份整个状态目录；回退到旧镜像时也必须恢复迁移前的状态副本，不能只切换镜像标签。

本次 v0.67.0 升级沿用 SQLite 会话归档；保留 NAS 上传中止信号、去重和健康检查。Tokscale 改为官方 Token Monitor v0.67.0 固定的 fork 构建，按清单校验 SHA256，确保会话/工作区能力与采集器一致。

恢复官方 Tokscale 验证脚本，验证固定构建、客户端能力及 DSH 合成数据解析；验证只读取合成测试数据。

NAS 修订 02：仅在构造上传副本时支持省略逐会话明细，保留汇总及本地归档；上传重试沿用该策略。当时的 DXP4800 模板启用汇总模式，其他部署默认兼容。没有归档迁移。

NAS 修订 03：两个 Compose 模板显式开启会话明细同步，文档与实际部署一致；分离 npm 安装与 Tokscale 验证缓存，限制构建脚本复制范围，并使用命名运行阶段和 `COPY --link`。采集、上传、权限和归档格式不变。

NAS v0.67.0-01：跟进官方采集、定价及依赖更新，恢复官方固定 Tokscale 构建；两个 NAS 模板继续上报完整会话明细，运行设置不变。

NAS v0.67.0-01 同步升级官方 Node Hub、Agent 和共享协议，保留 NAS 超时、去重和健康检查补丁。新增标题同步遵守官方协商和默认关闭策略。Agent 上报版本移除 v 前缀；发布标签仍保留。

NAS v0.68.0-01：跟进官方 0.68 共享采集、归档及同步脱敏更新，Node Hub 与 Agent 使用同一基线。Codex Dots 实验采集默认关闭，Hermes NAS 配置不变。沿用 SQLite 归档，未引入新的 NAS 状态格式迁移；保留标题协商、上传超时、去重、健康检查及无 v 前缀上报。

NAS v0.68.0-02：补充 Hermes 主库/profile 只读标题叠加；Node Hub 严格加载数据文件、用量写盘失败回滚及有界 SSE；健康状态绑定本次进程启动；单次运行最终上传失败会返回错误。官方基础仍为 0.68.0。归档格式和持久化目录不变，健康状态会在启动时重新生成。新增回归测试全部使用合成数据。

发布验证改为原生 amd64 与原生 arm64 Linux；模拟器对跨进程 /proc 启动时间的视图不一致，不能用于验证进程身份。两架构完整测试（含性能断言）均通过后才推广固定标签和 latest。

NAS v0.68.0-03：新增默认关闭的 `/windows` Hub 入口，复用完整官方 API、现有数据和认证。Windows SSE 按北京时间和中国官方工作日历在 07:00–17:00 使用 10 分钟周期，其他时间 30 分钟；缺失年份回退为普通工作周并提示。保留首次/重连快照、手动读取与共享设置/标题撤销即时通知。gzip 流式压缩、有界背压、轻量状态与纯设备在线元数据均在 Node Hub 实现。新增诊断只提供内存聚合计数，不包含凭据或会话内容。官方 0.68 桌面事件读取与计时的测试摘录仅用于兼容性测试，不进入镜像；实际 Windows 接入仍需独立验收。没有归档或 Hub 持久化格式迁移。
