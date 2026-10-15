# 自动发布、受控部署与回滚演练报告

最新完成为 `v0.71.0-02`：原生双架构运行与4来源×2架构冻结/恢复通过；版本/源码/双架构镜像摘要/清单读回一致。DXP4800 Hub→Agent已实际升级，完整私有一致性备份及旧镜像保留，3571归档会话/历史/Token/费用/日期/设备保护与新上传验收通过，停机37.67秒。DH4300Plus由所有者说明前版曾自行更新；本修订仍SSH拒绝，未由本任务部署。详见 [本修订交接](HANDOFF_0.71.0-02.md)。下面的“当前/最新”均属当时历史记录。

当前最新完成：2026-10-15，v0.71.0-01正式发布并独立读回，原生三来源×两架构冻结/完整恢复及独立含reasoning人工路径全部通过。DXP4800 Hub+Agent从实际0.70升级至固定0.71，完整私有备份、真实新上传、独立Watcher、API/SSE、实际core/adapter身份和3568归档会话/完整历史保持通过；最后成功切换段38.9秒。DH4300Plus SSH拒绝，尚未升级。当前保护、摘要、工作流与恢复条件见 [HANDOFF_0.71.md](HANDOFF_0.71.md)；生产费用变化路径仍须 [审阅手动方案](COST_VALIDATION_0.71.md)。以下v0.70及更早段落均为历史记录。

当前状态：`v0.70.0-01` 已正式发布，本轮生产部署未执行。原生两来源版本×两架构冻结与部署恢复演练通过，见 [UPGRADE_0.70.md](UPGRADE_0.70.md)。下列 v0.69.0-02 内容是保留的历史记录。

历史状态：`v0.69.0-02` 已正式发布，生产首次接入和部署未执行。原生双架构隔离部署演练已通过，原有全量回归与性能检查单独记录。

[原有全量回归 CI 38204021632](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38204021632) 的 amd64、arm64 作业均成功，对应部署实现提交 `558e148eee8d3c11b9f01c08b8461258f4ed01cc`。每架构 992 项 NAS 测试：990 通过、0 失败、2 项 Windows 平台条件跳过；Compose、固定 Tokscale 契约及合成固定数据性能对比均通过。后续仅补充 Agent-only/准确计数演练和报告，没有更改镜像内采集与 Hub 源码或控制器实现。性能检查通过不等于性能改善，也不代替 24 小时生产观察。

## 审查

2026-10-12 只读检查 main、公开 PR、当前发布流程、两台 NAS 的服务/版本、Compose 来源、持久化挂载和文件权限。没有开放 SSH/Docker API、安装调度器、写入 NAS 配置或授予权限。

现有双架构发布链完整保留；新增自动 GitHub Release 和不可变版本清单。独立手动部署请求是批准操作，没有额外 Environment 审批。DXP4800 具有本地 Hub+Agent，DH4300Plus 只有 Agent并使用远端 Hub。DH4300Plus 不安全的可写配置/状态权限在首次接入前必须经授权处理。

## 本地测试

Node 发布/请求测试 59 项通过，包括原有 31 项镜像推广测试以及新建草稿、上传失败恢复、清单不可覆盖、旧 Release 不改写、OCI/Tag/源码版本不符停止、手动事件与 main 限制、数字版本递增、请求积压及分页检查。

Python 控制程序测试 36 项通过，覆盖阶段顺序、Hub 失败阻止 Agent、冻结计数不符、凭据缺失、数据格式迁移未演练、过期/错误摘要/降级、陈旧回滚凭据、完整快照恢复、保留失败状态、历史和归档丢失、请求重放、崩溃日志阻塞、报告失败仅补报不扰动健康服务、标题策略合法代次、实际旧镜像绑定、跨日/月窗口及错误信息脱敏。

本地没有 Docker 引擎，真实容器演练由 GitHub 原生 Linux CI 执行。未执行的 CI 或生产检查不计为通过。

## GitHub 隔离演练

[隔离部署 CI 38205225968](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38205225968) 的原生 amd64 和 arm64 作业均成功，对应 PR 源码提交 `1bff0ac9ef7ba89259a02d7c1fa4810ac8843525`，测试构建使用 GitHub PR 合成合并提交 `f04eda77f3e6677d920f2f6ee074790482e45f79`。两架构均运行 Node 发布/请求测试 59 项、Python 控制器测试 36 项，并完成真实 Docker 演练。合成摘要保存在 [amd64-exercise.json](evidence/controlled-deployment/amd64-exercise.json) 与 [arm64-exercise.json](evidence/controlled-deployment/arm64-exercise.json)，只含版本、来源与合成验收结果。

| 演练项目 | amd64 | arm64 |
| --- | --- | --- |
| 正常部署并完整状态恢复演练 | 通过 | 通过 |
| Hub 失败阻止新版 Agent，凭据有效时恢复旧镜像和完整状态 | 通过 | 通过 |
| Hub 验收后再更新 Agent，采集/上传/独立 Watcher/历史验收 | 通过 | 通过 |
| 相同部署请求重放拒绝 | 通过 | 通过 |
| Agent-only 独立 Compose/状态，连接现有远端 Hub | 通过 | 通过 |
| Hermes 今日/月/累计 125 Token，output 20/cache-read 5，Hub 实际接收准确 | 通过 | 通过 |

演练揭示并修复了运行元数据、定价修订及正常标题策略代次变化被误判为数据丢失的问题。采集时间变化和合法窗口切换分别验证；实际 Token 减少、会话丢失、许可翻转及代次下降仍拒绝。回报网络失败只进入待补报状态，不扰动已健康的服务；旧镜像实际身份与配置也进入回滚证明。

演练仅使用合成数据和随机临时项目：真实 `v0.69.0-01` 基线镜像与本地构建的 `v0.69.0-02` 候选，验证完整备份、冻结统计、新 Hub 认证/API/gzip SSE重连、新 Agent 独立 Watcher和新鲜上传，以及旧归档会话/历史保持。正常部署后恢复旧状态生成绑定的隔离演练凭据；再次注入 Hub 验收失败，确认 Agent 新镜像从未启动、只在有效凭据下完整回滚；随后执行正常分阶段升级并拒绝请求重放。

隔离演练中的 Release 创建和 Deployment 状态提交通过注入的合成 GitHub API 验证，演练没有创建真实正式 Release或生产部署请求；真实 Docker 数据恢复结果通过 CI artifact 查验。这个区别避免把逻辑测试或容器测试误写为生产发布/部署。

## 正式合并与发布验收

2026-10-12 经所有者明确授权，[PR #5](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/5) 已合并。正式版本源码及 Git Tag 指向 `ec79dc7bff697ed5568b013578a8ec8d6261e67e`。合并前最终源码 `26e3b3816155eb5934f2569eb3166798a949d200` 的 [隔离部署检查](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38205511351) 和 [完整原生回归](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38205511347) 均成功。

合并后的 [正式发布流程 38207757130](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38207757130) 全部成功：amd64 构建及候选运行测试、原生 arm64 对同一候选摘要运行测试、不可覆盖标签推广和自动 Release 创建。正式 [v0.69.0-02 Release](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/tag/v0.69.0-02) 为非草稿、非预发行；发布流程上传并读回 `release-manifest.json`。独立匿名下载清单及 GHCR index、架构 manifest 和 OCI config 后再次核验，版本和源码 SHA 一致。

| 对象 | 已核验摘要 |
| --- | --- |
| v0.69.0-02 index / latest | `sha256:e35fa4c5f050b3944698a96a5ea48e7ee65b4e851ec49c5ddd1271dc02cca4b2` |
| linux/amd64 manifest | `sha256:8fb3e2df3b9e212c12b764d2f8c554d242a8b15f0b2d73da630fe79816622b68` |
| linux/arm64 manifest | `sha256:ea35946b9df0f67a9115c57e08d908279f338f041f07626a38ef4c77cad031ab` |
| Release 清单文件 | `sha256:3fbdf9de30f8e3561570e74c8831a8e939f73abc29b1422fdac73fcd180e6ef6` |

旧版 `v0.69.0-01` index `sha256:849ad058facfde01a7279efd88333f7461e3bffd3655f3d082913e957c30ed07` 和 `v0.68.0-05` index `sha256:3eb6fa177134a4a6089af3d3df643d391ed730f5de3e722aba07e2a0ec563cb3` 匿名复核均未改变。发布后文档状态单独更新，不重建或改写固定版本。没有发起生产 Deployment 请求、安装控制器或修改生产 NAS。

清单允许来源版本 `v0.69.0-01`，无强制状态格式迁移，但采集会更新状态元数据；回滚仍要求恢复停机前完整状态快照并使用旧镜像，自动回滚必须具有绑定实际目标摘要和配置的 NAS 本地恢复演练凭据。CI 隔离演练凭据不能用于生产。

## 未执行与首次接入

两台 NAS 控制器安装/权限授予、生产调度、真实首次受控部署、生产回滚演练、公网 Windows UI验收、24 小时持续运行均未执行。首次接入应先审阅 [DEPLOYMENT.md](DEPLOYMENT.md) 并获得明确授权。GitHub CI 的隔离恢复凭据不能用于生产。

## v0.70 candidate continuation — 2026-10-14

New native per-source exercises and frozen-data comparisons are required for v0.70.0-01; see [UPGRADE_0.70.md](UPGRADE_0.70.md). Earlier v0.69 test runs are historical evidence, not acceptance of this candidate. No production controller installation, permission change, deployment or production rollback rehearsal is included in the source upgrade. CI sandbox receipts remain invalid for production.

本轮 [38476097653](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38476097653) 四组合演练、[38476097610](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38476097610) 完整原生回归及 [38477243551](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38477243551) 正式发布已全部通过；结果和固定摘要已独立读回。生产未部署，DH4300Plus核查由所有者要求稍后进行。
