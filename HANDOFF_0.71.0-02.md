# v0.71.0-02 Agent 归档失败保护

当前完成状态：代码与测试完成，正式 `v0.71.0-02` 已发布，DXP4800 Hub+Agent 已实际升级并验证；DH4300Plus SSH拒绝，未由本任务部署此修订。下列候选准备段落保留历史，最终结果以“完成记录”为准。

2026-10-15。所有者授权：修复实际 Agent 归档失败继续上报、补入口级回归及标题清理/可选来源文档；验证后正式发布新修订并按原一致性备份、每台最多5分钟维护及失败恢复条件部署。先 DXP4800 Hub→Agent，再 DH4300Plus Agent-only。WorkBuddy 多账户、真实登录/新凭据和远端逐轮正文不实施。

## 代码与回归

官方固定 v0.71.0 `a514e2063563e318ef73c2a17fad68057c4e300c`，本修订前版 `e92d9add64efbb9985fb482880d9d95734354183`。独立分支 `fix/agent-archive-publication-v07102`，保护原工作区及未提交的二次审计报告；版本起始核实未占用。归档schema、parser pin、Token/费用规则、默认Hermes-only、limits关闭、独立Watcher及512MiB不变。

Agent 创建 archive store、capture 和 dry-run snapshot 都启用 strict；capture 错误在接受 result.archive、投影及 collectedAt 前抛出，使 DeviceState 保留最后完整 usage。写失败产生的未提交内存也不能污染后续 limits-only 投递。上一轮对“共享归档保护已完整落地”的表述过宽，实际 Agent 入口此前未完整接入；本修订修复此边界，不据故障样本推断生产已损坏。

新增实际入口测试6项，执行原样 Agent 源码、真实 SQLite store、Agent runtime、DeviceState、ordered sink 与去重，仅替换采集调度和网络目标：首次读失败、首次写失败、已有完整用量的写失败/limits-only/重试、SQLite坏row及同revision修复、--once失败退出、dry-run坏legacy不输出不迁移。红绿对照：同6项使用v0.71.0-01入口0通过6失败；修复后6通过0失败。不会将fixture入口测试说成真实账户或物理NAS验收。

本机Node v24.19.0 / darwin-arm64；完整suite 1570 tests：1559 passed、0 failed、11 platform skips，32.78秒；原生CI和最终镜像结果待下方完成记录。发布辅助测试59通过，Python部署测试51通过。增加v0.71.0-01实际固定摘要来源，两架构四来源8组冻结/恢复保留v69 reasoning已知修正规则；v70/v71费用必须严格相等，未放宽生产控制器。

新增 [可选来源说明](OPTIONAL_SOURCES.md) 与 [标题清理](DEPLOYMENT.md#标题关闭迁移与卸载)。Compose environment覆盖env_file、Goose优先级/只读目录/WAL、Notion显式limits白名单及fixture边界都有明确说明。新增来源不自动启用。

Hub实际portable core与Node闭包未改变；Agent运行变化由版本、Git源码SHA和OCI/镜像摘要绑定，不虚增Hub共享hash。

## 发布与部署进度

本节当前为候选准备记录，正式发布前不计已交付。DXP预检确认Hub/Agent均为v0.71.0-01/source e92d9add，512MiB，Hermes只读及独立Watcher，鉴权API、gzip SSE/重连与实际新上传健康。前版index为`sha256:209da1db610b38871eb9357f27b6d625c80441ec9853024256190fd4843b585a`。后续须重新生成完整私有一致性快照，不能用前版备份覆盖新增数据。

DH4300Plus所有者已说明自行更新；本修订预检SSH仍Connection refused。未读取当前来源/状态/备份、未变更该设备，访问不通不绕过。不将前版“未由我们升级”误写成用户没有更新。

本次生产0.71-01→02不允许Token/费用/会话/日期/设备/完整历史出现差异。跨v0.70修正仍用既有精确审阅方案，不开启任意费用例外。完整恢复旧镜像及本次一致性状态，保留失败新状态和旧镜像。

## 完成记录

代码PR：[8](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/8)。分支源码 `43a268411354b28b5bde24b5d894860d3deee006`；原生CI使用PR合并态 `e839e1dbd3d61621637cb64ce6e1b2fb5c911795`；最终正式Git Tag、OCI和manifest源码 `9a06b658e75d96285ac98847ef5e6e67299a4085`。三者完整Git tree相同，已实际比较；后补文档不重建固定镜像。

- [原生测试和性能 38659249529](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38659249529)：amd64/arm64各1570 tests，1562 passed，0 failed，8平台跳过；固定Tokscale与实际Docker运行通过。性能基线为已发布v0.71.0-01，1000会话、3轮交替旧/新、每轮60秒持续负载；合成基准共用1GiB资源，实际生产仍每服务512MiB。持续阶段Agent/Watcher/Hub的中位maxRSS：amd64旧168.1/56.0/118.9MiB，新167.2/56.3/118.9MiB；arm64旧175.7/54.0/122.6MiB，新180.5/54.0/121.7MiB，现有阈值全部通过，不宣称内存改善或24小时观察完成。
- [8组冻结及恢复 38659249366](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38659249366)：v0.69.0-01、v0.69.0-02、v0.70.0-01、v0.71.0-01 × 原生amd64/arm64全部通过。分别保存无reasoning控制器、1845Token独立Rust解析+Hub上传、125Token含reasoning控制器和完整恢复证据。v71→02含reasoning的1845Token/2会话/2日期与费用保持；125Token控制器费用0.000405→0.000405。旧v69的精确重复reasoning修正仍独立证明，不放宽生产保护。
- [正式发布 38660022767](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38660022767)：amd64构建/测试、原生arm64复测、promotion和Release全部通过。最终发布镜像也重复通过NAS suite。
- 干净公开历史扫描1511文件版本、0发现；本机发布辅助59项、Python部署51项通过。真实配置、Cookie、原始用户/工作区身份、数据库和运行日志未进入公开材料。

正式[Release](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/tag/v0.71.0-02)及镜像 `ghcr.io/gott-mit-uns/token-monitor-hermes:v0.71.0-02` 已匿名读回。Release包含不可变manifest和28份合成测试/性能/发布读回材料。

| 镜像 | 固定摘要 |
|---|---|
| multiarch index / latest | `sha256:37b72cad44c0410e0acd7c28c29d37f41228e4152cd4236352db8a39079da5ae` |
| linux/amd64 | `sha256:c71681abe5e9aa55c13df3738de1e09f1aa3ae3bc525a7f3ddfbd636fd98bc5f` |
| linux/arm64 | `sha256:b5241801e81075860f7cf2e46759eceea043c94414c862cd036071aa5ec3226d` |

旧v69-01/v69-02/v70-01/v71-01固定摘要保持。Hub core revision84/hash `ffd46170d61d827a3250addd283888c6a029f94837ba8c40c7e283b9007f0683`，Node revision6/hash `f8006cc89e42e5acacf092cf5df07947bffb45d21f9246309f87afaa12e92547`。本轮只改Agent入口，Hub闭包哈希不变是实际来源结果，不改注册值伪造新身份。旧Android/Agent既有协议仍兼容。

## 实际生产结果与恢复条件

DXP4800从实际v0.71.0-01升级至上述固定index，运行image ID `sha256:50e551e968f603cb6bee699816b91046b6293877fb669d674772bc46f366b419`。先在隔离状态/一致Hermes源副本中比较真实旧/新dry-run，冻结Token、费用、会话、日期和设备严格相等后才停机。完整停止后备份Agent及Hub状态、配置原字节，保留owner/mode与WAL/SHM；先Hub gate再启动Agent。

一次成功，停机窗口37.67秒。3571归档会话→3571，旧会话键、完整历史、设备、共享设置、订阅和标题策略保护通过。原Compose/.env字节不变，Hermes只读、默认Hermes-only/limits关闭、独立Watcher=0、每服务512MiB保持。独立后验确认Hub健康/鉴权API/gzip SSE/重连、实际core/runtime身份；Agent collection/upload=ok、reportedVersion0.71.0-02、receivedAt晚于本次启动，验证了真实新上传而非仅容器running。

私有一致性备份、原配置、冻结材料、阶段记录、最终验证和工具保存在本机仓库外 `~/.codex/private-backups/token-monitor-nas/2026-10-15-v0.71.0-02`，目录0700/文件0600，不上传GitHub。保留旧准确镜像及私有rollback标签。恢复必须先停止对应服务并保留失败后状态，再还原本次完整一致性快照与旧准确镜像；不能仅切镜像、叠加恢复或用前版旧备份覆盖当前数据。未来恢复前须核对新增数据和既有维护授权，不能自动丢弃本次升级后的新增用量。

本轮未触发生产回滚。真实恢复路径上一轮已实际执行，本轮原生8组完整恢复与私有恢复健康时间预算5项离线测试通过；不将其称为本轮生产回滚已执行，也没有安装常驻NAS控制器或新凭据。

DH4300Plus最终再次SSH连接拒绝，未停机、未拉镜像、未改权限或替换服务。其前次由用户手动更新的事实保留；本轮v0.71.0-02部署和真实上传未验收。连接恢复后先读实际来源再备份部署，不假定其当前版本。

本任务停止于代码/验证/正式发布与DXP升级已完成，DH访问阻塞。WorkBuddy多账户、远端逐轮正文、真实Notion资格及新认证均未实施；默认来源和长期运行内存限制保持。
