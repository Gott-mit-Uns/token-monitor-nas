# Token 与费用口径

本文替代按版本分散的费用说明，长期维护统计定义、合法差异及人工复核边界。当前代码/镜像身份见 [HANDOFF.md](HANDOFF.md)，验收与CI见 [VALIDATION.md](VALIDATION.md)，操作顺序和完整恢复见 [DEPLOYMENT.md](DEPLOYMENT.md)。所有公开样例均为固定合成数据，不代表生产数据或真实账户。

## 统计不变量

比较升级前后必须固定同一Hermes主库和所有既有profile的只读SQLite快照、设备ID、时区、价格缓存/自定价、parser身份及资源限制。先验证输入字节不变，再分别比较input、output、cache read/write、reasoning包含关系、每个session ID及数量、messageCount、模型/客户端归属、每个日期、today/month/allTime和完整历史。不能只比较总量或让真实新增数据掩盖冻结数据减少。

当前目标版本的固定parser为 `fa5f0c13324838d1a988fda317597f9b90da7ad0`。当前公开用量协议没有独立的可相加reasoning桶：样例reasoning为现代会话100、legacy会话20，共120，是350 output的子集，不能再加120到总Token或费用。上传策略省略allTime会话明细不等于删除本地完整allTime归档；两者须独立验证。重试/重复上传不得使汇总翻倍。

## 固定样例与合法费用修正

| 指标 | v0.71.0-02→v0.72.0-01 | v0.72.0-01→v0.72.0-02 |
| --- | --- | --- |
| 当日Token | 1570→1570 | 名称修订不改变口径 |
| 月/全量Token，output | 1845→1845，350→350 | 不变 |
| cache read / write | 70 / 25，保持 | 不变 |
| 会话 / 调用，逐日行 / 设备 | 2 / 5，2 / 1，身份及日期保持 | 不变 |
| 当日/月及全量费用USD | 0.005510 / 0.006445，保持 | 不变 |
| 125 Token含reasoning控制器样例USD | 0.000405→0.000405 | 不变 |

输入SQLite fixture SHA256为 `6612960d7a715d90b650667b8f1806f1cac3e6ed3e34d79cb54ac147da425949`，固定价格且无公网定价请求。逐日2026-06-06为275 Token / USD0.000935，2026-06-07为1570 Token / USD0.005510。既有浮点精度oracle不等于允许任意差额的tolerance。

v0.69.0-01/02跨越v0.70的Hermes重复计价修正时，全量费用USD0.007645→0.006445，唯一解释的下降为 `120 reasoning × USD10/百万 = USD0.001200`；当日0.006510→0.005510。output已包含reasoning，旧版重复收费一次；修正不减少Token、缓存、会话、日期、设备或历史。

独立125 Token控制器样例为100 input + 20 output + 5 cache read，8 reasoning属于output子集；合成单价input USD2/M、output USD10/M、cache read USD1/M，无reported cost。旧费用 `(100×2+(20+8)×10+5)/1e6 = 0.000485`，修正后 `(100×2+20×10+5)/1e6 = 0.000405`，精确下降0.000080。v0.70及以后来源已经修正，费用必须相等。

这些数值只是上述固定样例的oracle，不能复制为生产预期，也不能把实际新费用直接当作expected。合法下降不应被“费用只能增加”规则阻止；无法解释的减少同样不能通过关闭保护放行。

## 控制器边界与独立证据

生产 `RealDocker` / `Engine` 的冻结费用相等门槛保留，没有任意费用例外开关。即使已知是合法修正，生产自动路径仍会拒绝费用差异，应走下方人工审阅。compatibleFrom表示已验证来源，不代表允许所有费用变化或免除本地恢复证明。

CI有三类独立证据：无reasoning的125 Token真实Docker控制器路径；1845 Token真实固定Rust parser/共享核心/HTTP Hub上传；`exercise.py --reasoning` 的125 Token人工费用场景及完整恢复。后者先确认生产frozen guard拒绝，再由仅存在于合成演练的 `ManualReasoningSandbox` 核对精确公式后继续。它要求sandbox=true、独立随机临时项目和固定合成deviceId；生产适配器不导入它。原快照不改，人工基准只调整已解释的精确费用，仍执行完整Token/会话/日期/设备/历史保护，且验证Hub新上传与持久化归档费用。

无reasoning和reasoning演练输出分开保存，不能互相替代，不能把构建、parser测试或CI合成恢复凭据当成现场恢复证明。

## 费用差异的人工复核

1. 按 [统一部署流程](DEPLOYMENT.md) 核实两端真实版本/digest、角色、架构、配置/挂载、既有来源和资源限制，确认旧来源已经单独通过相应原生矩阵。完整一致性备份和旧准确镜像必须可恢复，访问受阻即停止，不增加来源、权限或凭据。
2. 在独立副本用SQLite backup API固定主库及所有profile；旧新以相同时区、价格缓存/自定价、设备ID和只读输入运行dry-run，固定资源并隔离网络。私有原始accounting和状态副本以0600保存，不打印、不上传、不提交，也不能代替完整备份。
3. 先逐项核对所有Token桶、模型归属、session ID/数、messageCount、创建日期、每个逐日及period聚合、deviceId与完整历史。除有明确上游依据并单独验证的口径变化外，必须相同；不明减少拒绝。
4. 对每一项费用差异从原DB/model_usage、reasoning/output包含关系、实际选用价格及reported-cost策略独立重建。已知估算/自定价修正的预期差额是 `reasoningSubset × 实际output单价`，不重复减input/cache，不重复计reasoning。reported cost不自动套估算公式；来源不明、其他provider变化、价格不可追溯或包含关系不符时拒绝。必须重建session/model/client/日历史/period费用，不能用全库SUM或总额百分比替代。
5. 写私有审阅表，绑定来源/目标身份、每会话/模型/日期允许的精确旧→新值及上游修正规则，并独立审阅完整账本覆盖。公开材料仅含脱敏合计与结论。禁止全局替换旧快照费用、使用任意tolerance、复制合成oracle或关闭费用/Token/历史保护；解释不完整则保留旧服务与完整备份。
6. 获得明确生产授权后，按Hub→Agent顺序升级，先在同一冻结输入核对审阅表，再恢复真实采集并独立记录增长，验证真实fresh upload、Hub接收、SQLite/归档/历史和重启。第一台通过后才处理另一台Agent-only；有差异的生产路径不得标为可自动部署。
7. 任一差异、丢历史、SQLite/上传错误或资源回归即停止，保护失败现场与新增数据，按已验证方法恢复完整旧状态和旧准确镜像。没有现场正确绑定的恢复凭据不得自动回滚，CI receipt不能用于生产。

`session.promptCache.observedAt` 是已知实时缓存观测时间，可在受审阅的比较中单独排除；所有Token桶、模型费用、会话/创建日、设备和完整归档/历史仍比较，不能扩大为忽略其他时间或身份变化。

## 可选来源的边界

Cursor统一池不重复计Grok Bot，未知included使用率仍为未知，预付余额独立显示；这些是显式启用账户后的额度呈现，不改Token或估算费用，不默认启用账户。OpenCode 2.x仅恢复有证据的迁移遗漏compaction/subtask usage，当前消息优先，不把两份完整历史相加，不新增远端正文API；它不改变上述固定Hermes样例。真实账户/生产OpenCode数据未由本次合成验收覆盖。
