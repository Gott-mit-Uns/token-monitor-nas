# NAS 专用补丁契约

适用：NAS v0.77.0-02；2026-10-22 与上游 v0.77.0 三方核对。这里维护长期行为，不记录发布/部署流水。升级时三方合并全部补丁，实际验收只更新 [VALIDATION](docs/VALIDATION.md)。当前交接见 [HANDOFF](docs/HANDOFF.md)。

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
| NAS-08 | `app/src/hub/store.js`、`server.js` | 文件不存在才初始化；空文件/损坏 JSON/无效结构/读失败保留原文件并拒绝启动。用量持久化失败回滚内存设备/savedAt 并返回 503。禁止用空库掩盖原数据损坏。v0.77可选批量保存默认0；同步模式保留回滚/503，显式批量模式有未落盘丢失窗口，正常退出限时排空并刷新，权限/设置/删除仍立即保存。 | `app/tests/hub/persistence.test.js`、`server.test.js` |
| NAS-09 | `app/src/hub/sse.js`、`server.js` | 每连接只保留最新待发完整快照和新鲜度事件，8 MiB 缓冲上限，30 秒阻塞断开；重连立即完整 snapshot。gzip 流逐事件刷新，dispose 释放连接/定时器/压缩器。普通客户端广播帧每种只编码一次并通过同一回压通道发送，Windows独立时段调度保留。 | `app/tests/hub/sse.test.js`、`windowsHttp.test.js`、`windowsStream.test.js` |
| NAS-10 | `app/src/hub/statsContentDigest.js`、`server.js` | 长期比较值为 SHA-256 digest，避免额外持有完整统计 JSON 字符串；不改变通知内容和判断字段。 | `app/tests/hub/statsContentDigest.test.js` |
| NAS-11 | `app/src/hub/windowsSchedule.js`、`calendars/2026.json`、`windowsStream.js`、`server.js` | 默认关闭 `/windows`；共用现有完整 API/存储/认证。北京时间中国法定工作日 07:00–17:00 十分钟，其他三十分钟，有变化才发完整统计；首连/重连立即 snapshot，手动读取不重置周期。缺年份回退周一至周五并报告。标题撤销、删除、共享/订阅即时通知。 | `app/tests/hub/windowsSchedule.test.js`、`windowsStream.test.js`、`windowsHttp.test.js` |
| NAS-12 | `app/src/hub/deviceFreshness.js`、`windowsMetrics.js`、`server.js` | 30 秒轻量在线信息只读取 receivedAt/年龄/过期元数据，不重聚合用量或更新时间；诊断仅进程计数，无凭据、URL 参数、标题或会话正文。请求数/编码正文大小不等于公网成功送达证据。 | `app/tests/hub/deviceFreshness.test.js`、`windowsDesktop.test.js`、`windowsHttp.test.js` |
| NAS-13 | `app/package.json`、`app/package-lock.json`、`Dockerfile` | NAS 精简 npm 清单，直接排除 Electron/桌面更新器/Discord/桌面构建依赖；保留固定摘要 Debian slim 与 Node SQLite 兼容性。依赖安装、固定 Tokscale 验证拆层，COPY --link 复用生产依赖，镜像只 COPY agent/shared/hub。官方新增客户端不意味着增加默认扫描。 | npm install/audit、Tokscale manifest/release/client 验证、原生双架构镜像 CI |
| NAS-14 | `docker-compose.yaml`、`docker-compose.4300.yaml`、`.env.example` | 两台 NAS 原有服务名、deviceId、Hermes 只读挂载、持久化位置、Asia/Shanghai、512 MiB 上限、只读根/最小 capabilities；五分钟周期、60 秒防抖、归档/完整明细开启，额度/项目默认关闭。现有 `.env` 不进仓库。真实部署已有 ID 即使与模板不同也必须原样保留。 | Compose config 校验与静态边界检查；真实 ID/目录保留须部署前单独核对 |
| NAS-15 | `nas-version.txt`、`scripts/check-nas-version.js`、`scripts/promote-nas-image.js`、`.github/workflows/validate.yml` | `v<官方>-<两位NAS>`，新上游从 -01；标签与 OCI 一致。两个架构测试同一不可变 digest 后推广；固定标签存在且 digest 不同必须拒绝覆盖，旧 main CI 不可改 latest。部分失败恢复沿用原摘要。 | `scripts/tests/promote-nas-image.test.js`、版本校验与 CI 原生 amd64/arm64 jobs |
| NAS-16 | `scripts/check-publication-safety.py`、`.gitignore`、`.dockerignore`、`SECURITY.md` | 扫描可达 Git 历史的常见秘密和运行数据路径；不提交 .env、凭据、Hermes DB、状态、日志或备份。发布检查不接触生产 NAS。模式扫描只是有限证明，不能称为全量安全审计。 | publication-safety 检查与镜像内容审阅 |
| NAS-17 | `app/scripts/test-nas.js`、NAS agent/hub/shared tests | 在 NAS 运行边界测试官方与自有补丁；Worker/Electron 专属依赖不进入 Docker。双架构须原生 runner，不能把 QEMU 进程身份或耗时当成真实 NAS 结果。增加上游新共享功能的测试清单，避免仅复制测试却不执行。 | 完整 NAS suite + upstream shared suite + PR CI artifacts |

## 后续合并必须保持的行为

- 归档 store 只保留一套全量/增量 iterator，解析后的 Map 全读成功才提交和推进 revision；坏 SQLite row/legacy JSON 在 strict publication 下拒绝，合法 tombstone/prune 与 best-effort 历史读者仍保留。Agent store/capture/dry-run snapshot 实际入口均启用 strict，失败不能覆盖 DeviceState，也不能污染后续 limits-only。
- collector 内嵌 watch 策略的上游变更映射到轻量 watcherPolicy；Goose DB/WAL 与自身 SHM 抑制、CatPaw matcher、Cursor/Antigravity scope/去重保留。默认 Hermes-only，独立 Watcher 不加载 collector/Tokscale/archive 树。
- usage 字典/标量时间、父子关系成对事实与 accounting key 保持；归档排除瞬时 liveActivity/waitingForInput；Agent runtime 保持 lastDeliveryError，headless activity polling 关闭。
- Hermes reasoning 公开桶与固定 parser 配套；费用变化按 [费用规则](docs/COST_MODEL.md) 精确解释。Codex plain/zst 同身份不重复，StepFun 刷新异常只打印固定文本。可选来源/真实账户不因模块存在自动启用。
- NAS 自有 core/node 指纹由 `app/scripts/nas-hub-build.js` 按实际源闭包、Hub helper/日历及 package/lock 计算，排除自引用注册表；只追加真实身份，旧客户端 unknown 不伪装 current。Worker 不在本仓库分发。
- Node Hub usage/limits 独立顺序保护仅使用可信 receivedAt 且 producer 最多超前5分钟；异常/缺失时间沿用到达顺序，不保证该区间乱序。首份 limits-only 不建立 usage 时钟，标记持久化直到完整用量；迟到旧快照不覆盖新历史，合法降费/日界仍接受。入口回归见 [ingressOrdering.test.js](app/tests/hub/ingressOrdering.test.js)。
- 可选 Hub 显示名称的鉴权、Unicode及空值合同见 [HUB_DISPLAY_NAME](HUB_DISPLAY_NAME.md)；不得改变设备 ID、匿名health或持久化格式。

## 部署历史核验

`deployment/nas_pull.py`的Hub历史比较按日期/月唯一键保留旧行与嵌套统计，仅费用叶值接受8 ULP且不超过1e-12美元的尾差。除已证明跨日且月份/累计保留的完整370日窗口到期外，真实日期、记录、Token/消息/缓存/推理回退和实质费用下降继续拒绝；派生强度/当前连胜/常用模型允许有效值重算。契约和范围见[部署规范](DEPLOYMENT.md#hub-历史保留核验)，合成正反例见`deployment/tests/test_history_preservation.py`。通用归档和冻结会计比较不变，不自动安装控制器。

## 维护与验证

完整上游差异按 shared/Agent、NAS封装、桌面、Worker、文档/测试分类，PR保存当次处理决定；已有独有历史逐路径表见 [有限归档](docs/archive/README.md)，不再逐版新增文件。上游若接纳某补丁，先验证行为/测试等价再缩减本清单，不能凭代码相似移除安全边界。

运行容器 procps 提供 POSIX 进程启动/RSS采样；测试用 --init 对齐 Compose init，合成 machine-id 不烘焙进镜像。原生 amd64/arm64分别验证，短合成基准不等于生产速度、内存或长期稳定改善。性能异常先查模块/扫描/SSE，不能自动扩大资源限额。上游发现报告只进 CI artifacts，不自动覆盖代码、发布或部署。

已移除未接入的托盘、字体、macOS Widget、桌面更新模块及对应打包/签名脚本；排除清单与源码/镜像检查见 [上游规范](UPSTREAM.md#nas-同步排除规则)。保留 NAS 构建身份、固定 parser、共享 provider 和数据兼容测试；其他尚未清理的上游辅助模块不因此获得删除授权。实际验收只更新 [VALIDATION](docs/VALIDATION.md)，继续工作与授权只更新 [HANDOFF](docs/HANDOFF.md)。
