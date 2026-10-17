# 官方 v0.70.0 三方差异审计

审计日期：2026-10-14（Asia/Shanghai）。状态：完成上游源码范围与 NAS 补丁边界审阅，候选已适配且本地 NAS suite 通过；冻结数据回归、原生双架构 Docker、正式发布及生产部署分别验收。本文件的“适用/选择性合入”是处理决定，不是已通过的测试记录。

## 固定来源与真实起点

| 对象 | 固定身份 / 依据 |
| --- | --- |
| 上一官方基线 | `v0.69.0` / `3f106ae3d4712b26cced8272f0d488eaab0de1e6`，原 `upstream-lock.json` |
| 目标官方基线 | `v0.70.0` / `ac4eeb2c4aea239dd94b67f074c73f69aafc46f8`；annotated tag peeled commit 已核对，不误用 tag object `0d104c0b59c5739e4020eeb86bbc029b0b095345` |
| NAS 当前源码起点 | `9d23bed717ded9e850b2035ec55a511aaec9082c`，后于现有正式运行源码的 README 整理提交 |
| 现有正式发布记录 | `v0.69.0-02` / `ec79dc7bff697ed5568b013578a8ec8d6261e67e`；本地 tag、`VERSIONING.md` 和 `DEPLOYMENT_VALIDATION.md` 相符。发布平台的实时核验以本轮主报告为准 |
| 独立工作区 | `work/token-monitor-nas-070` / `upgrade/upstream-v0.70.0`；审计开始该隔离工作区无未提交修改 |
| 候选发布号 | `v0.70.0-01`，正式使用前仍须确认远端 tag/Release/固定镜像未占用 |

已阅读 `AGENTS.md`、`README.md`、`UPSTREAM.md`、`SECURITY.md`、旧 `upstream-lock.json`、`NAS_PATCHES.md`、`VERSIONING.md`、`UPGRADE_0.69.md`、`DEPLOYMENT_VALIDATION.md` 和 `UPSTREAM_0.69_AUDIT.md`。`UPSTREAM.md` 历史章节和 `UPGRADE_0.69.md` 标题较旧，不能据标题判断最新正式版本。`DEPLOYMENT_VALIDATION.md` 的正式 v0.69.0-02 记录是旧发布证据，不是本次 0.70 测试或 NAS 接入证明。生产角色/权限和控制器必须重新只读核查。

三方审阅使用：旧官方 v0.69 commit → 目标官方 v0.70 commit；旧官方 v0.69 `src/*` → NAS 起点 `app/src/*` 的已有补丁；最后检查新官方变化与 NAS 补丁交叉。官方两提交净差为 **116 个文件**，其中共享运行源码 29 个；`src/agent`、`src/hub` 本次上游净差均为零。Hub 与 Agent 从同一 `app/src/shared` 装载，不能给它们各自选择不同 Tokscale/history 基线。无需上游整个目录覆盖，也不从 Worker 副本移植 Node Hub。

## 关键行为决定与差异来源

### Hermes 推理 Token / 费用

目标 Tokscale 固定 fork 从 `4f17d6c6d85f5582949dcb0476c55518eafd7e23` 改为 `fa5f0c13324838d1a988fda317597f9b90da7ad0`，release `token-monitor-fa5f0c13`，npm baseVersion 仍为 4.18.0。官方 PR #1019 固定该运行时；PR #971 将 Hermes 加入 `history.js` 的 disjoint reasoning 客户端集合，`usage.js` 已通过 `hasDisjointReasoning()` 使用同一语义。两部分必须一起适配。

Hermes SQLite 的 `output_tokens` 已包含 `reasoning_tokens`。新 Tokscale 输出把 reasoning 从 output 中拆出，按该 disjoint bucket 计价一次；公开统计再将 reasoning 回并 output-family。合成官方契约：原始 DB input=1000、output=400、cacheRead=200、cacheWrite=50、reasoning=150；新 Tokscale raw output=250、reasoning=150；NAS 公共 output=400、total=1650、reasoning=150。公开 Token 不能少150，也不能多150。reported actual cost=1.25 的契约保持1.25；另用估算价/自定价 fixture 验证旧重复计费修正后的费用下降，并解释精确来源。不能把成本完全相等作为硬验收，也不能以费用下降豁免 Token/会话/历史丢失。

manifest 中 “Hermes public reasoning normalization must land” 是构建时的历史文字；目标官方 commit 已包含 #971。实际 `history.js` / `usage.js` 行为与 pin 才是验收依据。新 Codex parser version15 会一次重新解析相关缓存；暖/冷缓存都须验证，不能只比 JSON normalize 的结果。

### Codex 压缩与归档

共享 resolver 查 `sessions` 和 `archived_sessions`（分层/flat），兼容 `.jsonl.zst`。同 accounting ID 的 plain JSONL 比 compressed 优先，live 在同 spelling 中优先；native ID 用于本地用量去重。新的有限 Zstandard reader 接受完整多 frame，拒绝撕裂/损坏/过量帧，32 MiB compressed、64 MiB decoded、4096 frames、windowLogMax26、NOFOLLOW 和 finally 关闭 FD。目录枚举限制32层/100000 entries。压缩文件变化必须完整重读，不能当成普通 JSONL append-only。

metadata、identity、context、detail 均调用同一解码模块。合入解析兼容并保留内容边界：默认 NAS 只读 Hermes 数据，未授权不得新增 Codex 挂载；共享 session detail 支持并不授权上传消息正文。headless 的 `sessionActivityPolling:false` 保持不变。测试应含 plain/压缩/归档冲突、重复身份、完整多帧、损坏/超限、取消和 FD 清理、冷暖缓存、会话详情及 Token/历史一致性。

### 大量标题 / 近期会话 / SQLite

`t3SessionMetadata.js` 将 requested native IDs 以单 `json_each(?)` relation 绑定，每 store/schema 查询一次，减少历史会话每 chunk 重复 JSON/native identity 扫描。1201 IDs 测试保留 V2 优先、placeholder/tombstone 撤销、别名、legacy fallback；失败数据库不证明标题被撤销。此共享适配可合入，但 NAS 默认 Hermes 标题仍由专用 `hermesTitles.js` 只读叠加，不能把 T3 标题 benchmark 宣称为 Hermes NAS 改善。缺 SQLite JSON 支持的读取失败保留原失效边界，生产 Debian/Node组合须实测。

上游 #1006 的近期会话及分组优化主要在 `src/electron/renderer/sessionRows.js` 与 `edgeDock/presentation.js`：独立会话跳过 alias/parent walk，在分组/选取后才投影显示。属于桌面，不将显示 caps、投影或 timers 移入 Hub 统计，更不能截断完整历史。

NAS 已有 `iterateSessionRows`、full-load 暂存及异常 cursor cleanup；上游 #1031 是等价方向，不能重复两套逐行读取。**升级前 NAS 基线仍有增量缺口**：`loadRevisedRows` 每读一行立即改写现有 archive，读取中断会暴露半套 catch-up。上游新增 Map 暂存已解析 entries，完整读取后才应用，随后推进 revision。最终候选采用官方 v0.70 等价 store 实现，保留 NAS 已有和新官方 fault tests；本地 SQLite专项42/42通过。full load 保持 archive staging。异常 next()/中断、并发 WAL writer、重试、写入失败后 full reload仍需原生Docker验收。SQLite schema version1、状态目录和 legacy migration marker 不变；事务失败不提前提交或推进 revision。

### 其他 provider 的实际 NAS 路径

- DSH：fork 修正精确 responseModel `keepalive` sentinel（trim/case-insensitive）时回退 source model 或 header model；`keepalive-v2` 和真实模型不可误判。六个真实 binary 合成契约验证input2885/output-family25/total2910不变，模型与费用归属重算有依据。`dsh/sessionFiles.js` 此轮只增加 zstd maxFrames 参数，不能把模型修复误记为该 JS 单独完成。
- Cursor：后台/source sync 仍150000ms；显式 force self-sync 才1830000ms（容纳Tokscale动态1800秒预算），指定timeout仍优先、共享AbortSignal/子进程终止边界保留。默认 NAS 没有Cursor客户端或账户访问。
- MiniMax：共享模块新增 token-plan/api 选择、api `available_amount` 余额与 CNY/USD；缺失/异常值为 unavailable，不能健康零余额。当前Agent options未暴露 `minimaxBillingMode`，保留共享能力并使用注入 options 测试；本次不增设CLI/env或账户访问，不宣称生产按量余额已配置。
- StepFun：仅已配置 quota provider 才在授权失败后刷新 access half 并重试一次；refresh half绑定account identity，plan lookup用effective token。Agent无续期持久化回调仍可用原refresh half下一轮续期；不把桌面保存凭据逻辑移入NAS，不创建长期凭据、不访问真实账户。刷新失败/取消/重试失败不写入新token。
- CatPaw：catalog `defaultTracked:false`、forkOnly；provider roots只支持darwin/win32，Linux为空。主共享能力及能力探测兼容可选择合入；NAS默认 `TOKEN_MONITOR_CLIENTS=hermes`、只读Hermes挂载和轻量Watcher不变。平台合成nonzero契约不在Linux执行，不能声称原生Linux CatPaw采集通过。新增数据源需另行确认。
- WSL提示与排除：Linux NAS不使用WSL；已有共享Windows纯解析可保留，Electron Windows界面不移植。

## NAS 补丁交叉与门槛

| NAS契约 | 上游交叉 / 合并要求 | 本轮验收证据要求 |
| --- | --- | --- |
| NAS-01/02 去重、心跳、上传总超时/取消/重试 | Agent/upstream本轮无变化；不得复制旧官方agent覆盖 | 失败请求不得推进去重；错误正文/取消清理；真实Docker上传失败恢复 |
| NAS-03 进程健康 | 上游无变化，进程身份和未来时间拒绝继续保留 | 重启旧health不能健康；采集停滞/远端Hub断开分别报告；两架构/proc |
| NAS-04 Hermes标题许可 | 新T3标题性能非替代品 | 标题默认关闭、双方主动启用、仅已采集ID标题、失败不中断统计、撤销即时通知 |
| NAS-05 独立轻量Watcher | collector新增CatPawwatch/filter/sidecar逻辑应合并到watcherPolicy | WATCH_IN_PROCESS=0；不载collector/Tokscale归档树；watch source不扩大 |
| NAS-06 SQLite流式 | 等价上游 full stage；合并增量Map stage、异常资源释放 | next失败无部分archive/提前revision；并发WAL/旧JSON恢复/坏DB/写盘失败 |
| NAS-07 安全字典/时间戳 | usage新catpaw normalization不覆盖NAS补丁 | __proto__/unknown/missing fields、Hub聚合和旧Android wire保持兼容 |
| NAS-08 Hub严格状态/回滚内存 | Node Hub上游无变，依赖新shared | 空/坏JSON拒绝启动并保留原文件；持久化失败503及内存回滚 |
| NAS-09～12 SSE/gzip/windows/digest/freshness | 上游仅桌面变化不可替换NASserver | 有界buffer、slow reader断开、重连完整snapshot、gzip flush、窗口节流及隐私撤销 |
| NAS-13～17 生产依赖/部署/发布/安全/测试 | 精简依赖/固定pin，原生双架构同digest发布 | Compose不变；公开安全检查；固定tag不可覆盖；全量与原生Docker证据 |

需使用完全同一合成脱敏输入运行旧固定版和新候选，保存比较Token各桶、费用、会话ID/计数、daily/month/alltime/history、deviceId和上传接收。费用差异按source/模型/推理解释；原有旧fixture没有reasoning不能代替专项修复证明。性能用同数据、限额、时间窗口，分别报告idle、collection peak、sustained；不用本地macOS或GitHub原生Docker数字声称生产NAS改进。`compatibleFrom`只在来源版本已实际验证后写入，旧名单及0.69历史记录不充当新目标迁移证明。

## 全部116个上游改动文件

路径为官方布局；对应运行/测试路径映射至 NAS `app/`。状态A为新增、M为修改。桌面专用/不适用表项可保留仓库历史文件，但本次不移植、不激活、不放入镜像。

| 状态 | 官方路径 | 分类 | 处理 / 理由 |
| --- | --- | --- | --- |
| M | `.env.example` | 需要额外配置 | 仅参考 CatPaw opt-in 注释；保留 NAS Hermes-only 模板及现有环境值 |
| M | `.github/RELEASE_TEMPLATE.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| A | `.github/assets/tools-icon/catpaw.png` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `README.ja.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `README.ko.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `README.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `README.pt-BR.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `README.zh-CN.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `README.zh-TW.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| A | `assets/icons/catpaw.svg` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `docs/architecture.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| A | `docs/providers/catpaw.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `docs/providers/codex.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `docs/providers/cursor.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `docs/providers/minimax.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `docs/providers/stepfun.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `docs/wsl-sqlite-setup.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `docs/wsl-sqlite-setup.zh-CN.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `docs/wsl-sqlite-setup.zh-TW.md` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| M | `package-lock.json` | 适用于 NAS | 保持 NAS 精简依赖锁；不可引入 Electron/桌面打包依赖 |
| M | `package.json` | 适用于 NAS | 只同步官方 0.70.0 版本；保留 NAS 精简生产依赖和启动入口 |
| M | `scripts/vendor/tokscale.json` | 适用于 NAS | 固定 fa5f0c13 fork、releaseTag 和所有平台 SHA256；与 Hermes normalization 原子对齐 |
| M | `scripts/verify-vendored-tokscale.js` | 适用于 NAS | 真实二进制 Hermes reasoning、DSH model 合成契约；CatPaw 非零仅 darwin/win32 |
| M | `src/electron/edgeDock/controller.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/limits/accountSettings.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/main.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/app.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/breakdownRenderPolicy.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/edgeDock/dock.css` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/edgeDock/dock.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/edgeDock/index.html` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/edgeDock/presentation.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| A | `src/electron/renderer/edgeDock/railNumberRoll.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/i18n.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/index.html` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/limits/accountPanels.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/limits/providerPresentation.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/limits/windowsView.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/sessionRows.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/electron/renderer/styles.css` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| A | `src/electron/tokenNumberAnimation.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `src/shared/anchorSeed.js` | 适用于 NAS | 种子信任指纹传入真实 sourcePlatform；不改变已有 deviceId |
| M | `src/shared/clientCatalog.js` | 需要额外配置 | 注册 CatPaw defaultTracked:false/forkOnly；默认 NAS 仍只 Hermes |
| M | `src/shared/clientHealth.js` | 需要额外配置 | CatPaw 来源诊断 ID 仅随显式启用客户端生效 |
| M | `src/shared/clientSources.js` | 需要额外配置 | 仅 enabled CatPaw 查询源；Linux 返回空根，不扩展默认扫描 |
| M | `src/shared/collector.js` | 适用于 NAS | 三方合并 CatPaw 源指纹/重放与 Cursor 显式预算；watch policy 继续抽离轻量模块 |
| M | `src/shared/history.js` | 适用于 NAS | Hermes raw disjoint reasoning 回并公共 output/total；必须与新 Tokscale pin 同步 |
| M | `src/shared/hubBuildRegistry.json` | 适用于 NAS | 保留官方来源注册信息；新增 Worker build 条目不代表部署 Worker |
| A | `src/shared/providers/catpaw/paths.js` | 需要额外配置 | 可选 darwin/win32 只读源解析；Linux 无来源；Windows native API 不在 Linux 调用 |
| M | `src/shared/providers/codex/localUsage.js` | 适用于 NAS | nativeSessionId 去重，避免压缩/原生身份别名重复计数 |
| M | `src/shared/providers/codex/sessionActivity.js` | 适用于 NAS | 兼容 jsonl.zst 文件、确定性 plain 优先；headless 活动轮询保持关闭 |
| M | `src/shared/providers/codex/sessionContext.js` | 适用于 NAS | 压缩内容完整有限解码，不能视作 append-only；保留上下文/等待缓存边界 |
| M | `src/shared/providers/codex/sessionIdentity.js` | 适用于 NAS | 有限压缩 header 读取；只缓存文件 fingerprint 和 native ID |
| M | `src/shared/providers/codex/sessionMetadata.js` | 适用于 NAS | 活跃/归档、plain/compressed resolver 统一且不改变 accounting key |
| A | `src/shared/providers/codex/transcript.js` | 适用于 NAS | 32 MiB 输入/64 MiB 输出/4096 frames 硬界限、NOFOLLOW 与 finally 关闭 FD |
| M | `src/shared/providers/cursor/auth.js` | 适用于 NAS | 后台 150000ms 与显式 1830000ms 分开；不无条件延长自动同步 |
| M | `src/shared/providers/cursor/selfSync.js` | 适用于 NAS | 仅 explicit:true 使用长预算；显式 timeout/AbortSignal/终止检查保留 |
| M | `src/shared/providers/dsh/sessionFiles.js` | 适用于 NAS | scanZstdFrames 增加 maxFrames 支持；DSH keepalive 模型修复由固定 fork 提供 |
| M | `src/shared/providers/minimax/account.js` | 需要额外配置 | 共享账户声明新增 token-plan/api；不导入桌面设置 UI，不新增 NAS 账户访问 |
| M | `src/shared/providers/minimax/limits.js` | 需要额外配置 | 可测试 options.minimaxBillingMode=api；Agent 当前未暴露该选择，不宣称已启用 |
| M | `src/shared/providers/stepfun/limits.js` | 需要额外配置 | 已配置 provider 才刷新；401/403 后一次续期重试，刷新身份稳定，不写日志凭据 |
| A | `src/shared/providers/stepfun/refresh.js` | 需要额外配置 | 续期传输保持取消/超时；Agent 无持久化回调时下次按旧 refresh half 再刷新 |
| M | `src/shared/sessionDetail.js` | 适用于 NAS | 共享详情兼容压缩日志；不新增 Hub 消息正文上传或 NAS Hermes 正文读取 |
| M | `src/shared/sessionFiles.js` | 适用于 NAS | 活跃/归档 plain 优先、深度/entry 限制和 safe ID；避免压缩副本重复会话 |
| M | `src/shared/sessionMetadata.js` | 适用于 NAS | 项目/尾部时间支持压缩；损坏解码不能给出伪 metadata |
| M | `src/shared/t3SessionMetadata.js` | 适用于 NAS | json_each 单 relation 取标题，保留 tombstone、别名、旧库优先级与失效语义 |
| M | `src/shared/usage.js` | 适用于 NAS | 仅新增 CatPaw 归一化；保留 NAS safe dictionary/recordTimestamp 和既有 wire 格式 |
| M | `src/shared/usage/sessionUsageArchiveStore.js` | 本项目已实现 | 已有逐行/完整 load staging；合并上游增量 Map staging 与 cursor cleanup 回归，不能重复补丁 |
| M | `src/shared/vendorPresentation.js` | 需要额外配置 | CatPaw 映射 Zhipu 厂商标签；无账户访问或新扫描 |
| M | `src/shared/wslUsage.js` | 不适用 | Linux NAS 无 WSL；共享实现保留 CatPaw WSL 排除，绝不启用 WSL 扫描 |
| M | `tests/docs/readmeConsistency.test.js` | 不适用 | 参考上游说明更新 NAS 文档；不整体复制桌面发布/安装/账户界面内容 |
| A | `tests/electron/breakdownNumberMotion.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/breakdownRenderPolicy.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/credentialCommands.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/cursorSettingsLayout.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/edgeDock.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/edgeDockController.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/edgeDockLimitCard.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| A | `tests/electron/edgeDockRailNumberRoll.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/edgeDockResetMotion.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/i18n.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/limitAccountPanels.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/limitProviderPresentation.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/limitProviderWiring.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/overflowText.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/rendererMotion.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/sessionDetail.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/sessionGroups.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| A | `tests/electron/tokenNumberAnimation.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/totalTokenCompact.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| M | `tests/electron/wslStatusPresentation.test.js` | 桌面专用 | Electron/窗口/Dock/动画/桌面呈现及其测试，不进入 NAS 镜像或运行测试 |
| A | `tests/shared/catpawSources.test.js` | 适用于 NAS | 选择性合入 core source/fingerprint/watch/privacy；排除 Electron IPC/renderer 断言 |
| M | `tests/shared/clientCatalog.test.js` | 适用于 NAS | 选择性合入 catalog/defaultTracked；排除 Electron HTML 读取断言 |
| M | `tests/shared/clientHealth.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| M | `tests/shared/clientTracking.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| A | `tests/shared/codexCompressedTranscripts.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| M | `tests/shared/collectorCapabilityFallback.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| A | `tests/shared/collectorCursorSyncBudget.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| M | `tests/shared/cursorAuth.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| M | `tests/shared/history.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| M | `tests/shared/minimaxLimits.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| M | `tests/shared/sessionUsageArchiveStore.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| M | `tests/shared/stepfunLimits.test.js` | 适用于 NAS | 选择性合入 shared limits/renewal；排除 Electron credentialCommands 断言 |
| A | `tests/shared/stepfunRefresh.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| M | `tests/shared/t3SessionMetadata.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| A | `tests/shared/tokscaleCompatibilityFixtures.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| M | `tests/shared/tokscaleTokenContracts.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| M | `tests/shared/usage.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| M | `tests/shared/verifyVendoredTokscaleClients.test.js` | 适用于 NAS | 纳入对应共享核心回归；真实 provider 访问只使用合成数据/注入传输 |
| M | `tests/shared/wslUsage.test.js` | 不适用 | 保留共享纯解析平台契约可运行；真实 WSL 行为不属于 Linux NAS 验收 |
| M | `worker/package-lock.json` | 不适用 | Cloudflare Worker 副本不部署；Node Hub 直接复用 app/src/shared |
| M | `worker/package.json` | 不适用 | Cloudflare Worker 副本不部署；Node Hub 直接复用 app/src/shared |
| M | `worker/src/shared/clientHealth.js` | 不适用 | Cloudflare Worker 副本不部署；Node Hub 直接复用 app/src/shared |
| M | `worker/src/shared/history.js` | 不适用 | Cloudflare Worker 副本不部署；Node Hub 直接复用 app/src/shared |
| M | `worker/src/shared/hubBuildRegistry.json` | 不适用 | Cloudflare Worker 副本不部署；Node Hub 直接复用 app/src/shared |
| M | `worker/src/shared/usage.js` | 不适用 | Cloudflare Worker 副本不部署；Node Hub 直接复用 app/src/shared |

分类核对：适用于 NAS 40项；本项目已实现 1项；桌面专用 40项；不适用 25项；需要额外配置 10项；总计116项。每个官方净差路径恰好出现一次。

## 当前证据限制

本地本轮 NAS suite 共1296项：1285通过、0失败、11跳过（5项桌面断言、1项Windows roots、3项仅Linux本机行为、2项Windows PID行为）；SQLite store专项42/42通过。跳过不能算通过，本地结果不替代原生amd64/arm64、冻结双版本Docker或生产验证；最终提交的完整结果以 [UPGRADE_0.70.md](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/caa511690e827db518c401b54bf663b4132e04e2/UPGRADE_0.70.md)、[VALIDATION.md](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/caa511690e827db518c401b54bf663b4132e04e2/VALIDATION.md) 及CI artifact为准。StepFun候选的续期持久化失败日志已使用固定文本，不输出异常message可能携带的敏感值。

本审计子任务未执行生产NAS登录、容器变更、外部账户访问、Git提交或镜像发布。主任务本轮只读核验DXP4800仍为v0.69.0-01，Hub+Agent健康，未检测到控制器；DH4300Plus SSH拒绝，真实角色/权限未核实。来源实际镜像摘要、完整部署配置和挂载身份应以主任务私有只读记录为准，不在公开仓库记录生产私有路径。原生CI、正式发布和生产部署当前pending。发布后必须先生成本轮部署报告并等待所有者明确确认，然后才可备份和依次升级。
