# v0.71.0-02 Agent 归档失败保护

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
