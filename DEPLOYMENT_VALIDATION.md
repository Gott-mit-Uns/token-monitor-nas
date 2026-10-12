# 自动发布、受控部署与回滚演练报告

状态：开发候选 `v0.69.0-02`，生产首次接入和部署未执行。原生双架构隔离部署演练已通过，原有全量回归与性能检查单独记录。

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

测试 Release 创建和 Deployment 状态提交通过注入的合成 GitHub API 验证，没有创建真实正式 Release或生产部署请求；真实 Docker 数据恢复结果通过 CI artifact 查验。这个区别避免把逻辑测试或容器测试误写为生产发布/部署。

## 未执行与首次接入

新正式 Release、两台 NAS 控制器安装/权限授予、生产调度、真实首次受控部署、生产回滚演练、公网 Windows UI验收、24 小时持续运行均未执行。首次接入应先审阅 [DEPLOYMENT.md](DEPLOYMENT.md) 并获得明确授权。GitHub CI 的隔离恢复凭据不能用于生产。
