# NAS 专用补丁清单

官方目标基线：`v0.69.0` / `3f106ae3d4712b26cced8272f0d488eaab0de1e6`。候选 NAS 版本：`v0.69.0-01`。接管起点为 `v0.68.0-05` / `2fdfbc57dd11fd0838aff2820504da2d2d67fcf3`。此清单根据起点相对官方 `v0.68.0` 的真实文件差异整理，升级后保留这些功能边界。

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

## 三方合并重点

上一个官方基线相对 NAS 起点，核心 shared 改动恰为：`collector.js`、`syncPayload.js`、`usage.js`、`usage/sessionUsageArchiveStore.js`、`watcherHost.js`、`watcherWorker.js`，新增 `watcherPolicy.js`、`recordTimestamp.js`。官方 v0.69.0 与这些路径的交叉为 `collector.js` 和 `usage.js`；Agent 的交叉为 `runtime.js`。不得通过整目录覆盖抹掉补丁。

- `collector.js`：上游内嵌 Watch policy 需移入 NAS 抽离模块；Cursor/Antigravity 新 watch 源、activity-only 源、polling overlap 去重、配置传递必须同时合并。保持 Watcher 只加载轻量策略和必要 path 模块。
- `usage.js`：新增 identities/relationship/activity normalization、merge、delta 时保留 NAS 自有字典读写和 `recordTimestamp`。新 parent namespace 不能拼接不同快照的数据。
- `runtime.js`：保留 NAS `lastDeliveryError`，同时遵守官方 headless 的 `sessionActivityPolling:false`。
- `sessionUsageArchive.js` 新增瞬时字段排除，与 NAS store streaming rows 是不同层，二者都保留。
- Node Hub `server.js` 官方无改动，仍受 shared usage 新字段影响；保留 NAS server，不把 Worker/Electron 的新呈现层引入。

`app/scripts` 中已有 macOS/widget 打包与 Worker 同步辅助脚本的历史差异不属于 NAS 运行补丁：本次不激活、不再次扩展它们。它们不 COPY 进运行镜像，未来可在单独维护任务中审阅去留，避免把无关删除混入本次升级。

## 长期维护方式

每次升级固定旧 tag、新 tag 和 SHA，生成全仓库文件差异，再按 `UPSTREAM_0.69_AUDIT.md` 的决策表分成共享/Agent、NAS 包装、桌面、Worker、文档与测试。自动检查应报告差异，不能自动覆盖代码或部署 NAS。

`app/src/agent` 与 `app/src/hub` 的 NAS 能力继续模块化，官方 shared 补丁尽量限于列出的接入点。后续若上游接受 streaming archive、轻量 Watcher 或字典安全修复，先对行为与测试确认等价，再从清单删除对应补丁；不能仅因代码看起来相似取消安全边界。

自动新 Release 发现与范围报告使用独立工作流，只创建维护报告/候选范围，不发布镜像、不使用生产凭据。协议、NAS 回归和固定数据集内存/耗时门槛在 PR CI 运行；结果文件应记录 fixture、Node/OS/架构、进程角色、采样时长和阈值。性能异常先定位模块加载、重复扫描或 SSE 缓冲，不能自动扩大 Compose 内存上限。

旧固定镜像、旧 Tag 与状态备份全部保留。真正升级部署必须备份状态及 Compose/.env，保持设备 ID、持久化目录和只读数据源，再在副本验证；本候选开发与 PR 不授权生产部署。
