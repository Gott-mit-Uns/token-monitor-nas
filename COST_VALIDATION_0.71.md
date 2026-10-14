# v0.71.0 NAS 费用差异验收与手动升级方案

日期：2026-10-15（Asia/Shanghai）。本方案待主任务代码审阅；它不自动授权任何费用变化，不把合成数据当作生产数据。最终原生 CI 和生产结果由最终交接补录。

## 已核实的控制器边界

`deployment/nas_pull.py` 仍以旧、候选镜像冻结输出完全相等为上线门槛，归档和历史采用保持检查；费用下降会拒绝。v0.69→v0.71 跨越 Hermes reasoning 重复计价修正，因此合法下降仍可能被安全拒绝。v0.70→v0.71 不预设生产版本，应先读实际旧镜像版本、固定 digest、运行角色和配置。

本轮保留生产 fail-closed 行为，仅在私有一致性快照中保存冻结旧、新 accounting（0600），便于人工复核。该私有文件含真实会话身份时不得提交、日志打印、加入 Release 或公开验收报告。它没有 Cookie、账户凭据，也不能代替完整备份。生产 `RealDocker`、`Engine` 无费用例外开关。控制器对存在费用差异的生产路径 **不可标记为可自动部署**；先执行下述人工审阅方案。

## 三份独立证据

1. 无 reasoning 的原有真实 Docker 控制器演练：125 Token，100 input + 20 output + 5 cache read，严格 frozen equality、Hub/Agent 顺序、完整状态恢复、Hub 失败阻止 Agent、重放拒绝、Agent-only 连接远端 Hub。费用没有合法下降，因此只证明严格路径。
2. 原有独立冻结解析器/共享核心/Hub 真实上传：1845 Token、两个日期和两个会话、120 reasoning，固定价格。v0.69 的 today 0.00651→0.00551、month/allTime 0.007645→0.006445；v0.70 来源必须已经是修正后费用、保持相等。该证据不能代替控制器演练。
3. 新增 `exercise.py --reasoning` 真实控制器人工分支演练：仍为 125 Token，额外存在 output 子集 reasoning 8；固定 synthetic 模型价格 input USD 2/M、output USD 10/M、cache read USD 1/M，无 reported cost。旧 v0.69 费用 `(100×2+(20+8)×10+5)/1e6 = 0.000485`，候选 `(100×2+20×10+5)/1e6 = 0.000405`，唯一允许下降为 0.000080。旧 v0.70 来源保持 0.000405 相等。

第三项先实际调用生产 frozen guard 并确认拒绝，再在单独的 `ManualReasoningSandbox` 中人工复核精确公式并继续 Engine 的阶段、业务检查与恢复。该类只存在合成演练文件，要求 sandbox=true、随机生成的 `/tmp/token-monitor-deployment-exercise-*` 根目录和固定合成 deviceId；生产适配器没有导入它。原始快照不修改，人工费用基准副本只调整上述精确数字，Token、会话、日期、设备、原历史保持逻辑继续执行。最终真实 Hub 收到的新上传必须为精确新费用；归档、历史持久费用也验证。未解释费用、非有限值、不同设备/会话/日期、Token 减少仍拒绝。

CI 使用固定旧镜像 v0.69.0-01、v0.69.0-02、v0.70.0-01 × 原生 amd64/arm64，分别执行三份证据。reasoning 演练与无 reasoning 演练输出不同文件。构建成功、解析器测试成功或创建合成恢复凭据不能代替任一原生 Docker 作业，也不能代替生产恢复演练。

## 生产手动验收步骤（费用差异路径）

1. 先核实真实来源/目标 version、digest、配置、挂载、角色、deviceId、Hermes-only、独立 Watcher 和 512 MiB 限额。检查已存在的数据源，不增加来源、挂载或凭据。旧实际版本不在本轮已完成原生矩阵的来源中时停止升级，先补该来源验证。确认本次停机范围、私有备份位置和旧镜像保留。SSH 不通即报告，不改权限或绕过限制。
2. 在可用维护窗口停止写入者，备份完整 Hub JSON、Agent 配置/历史/归档 SQLite（完整 DB/WAL/SHM）、原 Compose/env 和旧固定镜像。验证备份 integrity_check 和完整副本可读；恢复需要同时恢复完整状态与旧镜像。私有路径、原始用户/工作区标识、会话正文和凭据不进入公开验收。
3. 通过 SQLite backup API 固定 Hermes DB 和所有既有 profile；旧、新同样只读 mounts、定价缓存、自定价、时区、设备 ID、512 MiB、network none，各跑一次 dry-run。保存完整私有原始 accounting 与状态副本，不因错误发布空数据。先比较 Token 每桶、客户端/模型归属、每个会话 ID/数、messageCount、每个日期、today/month/allTime/history、deviceId；除上游有明文解释且单独验证的差异外必须相同。
4. 对 **每一个** 费用变化用冻结原 DB/model_usage 的 reasoning、output 包含关系、实际采用的价格和 reported-cost 策略独立计算预期。Hermes 重复计价修正的估算/自定价预期减少为 `reasoningSubset × 实际 output 单价`；不得重复减缓存/input，不把 reasoning 计两遍。对应 raw 输出包含关系不满足、价格不可追溯、存在其他 provider、reported cost 不符或成本来源无法确定时拒绝解释。保留 reported cost 路径（它不自动套用估算差额）。按实际采集器文件/模型选择与日期归属重建 session、model、client、日历史及 period 聚合费用，不用简单全库 SUM 或总费用百分比代替。
5. 写私有审阅表：来源/目标固定身份、会话/模型/日期的允许旧→新精确数值和具体上游修正规则；独立审阅确认完整账本/历史覆盖及无其他差异。公开材料只发布脱敏合计、规则和结论。不能用任意 tolerance、关闭 cost guard、直接把新费用当 expected、把旧快照费用全局替换或复制合成 oracle 到生产。无法解释即保留旧服务和完整备份并停止。
6. 已审阅且已获本轮生产授权时，由人工编排先升级 Hub，保持旧 Agent 上报兼容，验完整设备/历史/隐私策略/API/SSE；再升级同设备 Agent，在同一冻结输入初次采集后逐项核对审阅表。然后恢复真实采集，确认真实 fresh upload 和 Hub 接收、deviceId、时间、每 Token 桶、会话/历史保持及独立 Watcher/重启。真实采集增长另记，不把增长掩盖冻结减少。第一台通过后才处理第二台 Agent-only。
7. 任一无法解释的差异、历史缺失、SQLite 错误、上传失败或资源回归都停止；按已验证恢复方法同时恢复完整旧状态和旧固定镜像。无 NAS 本地正确 digest/配置绑定恢复凭据时不能自动回滚。合成 sandbox receipt 不得带入生产。

## 当前结果与收口

本地 Python 控制器/冻结/人工规则测试 46 项通过、0 失败（44.193 秒）；语法检查和 diff 空白检查通过。原生三来源×两架构作业尚待主任务执行和读回。本文件描述的是方案及候选演练代码，不宣称已运行 Docker、已正式发布、已生产部署或自动费用变化路径已可用。`release-policy.json` 的候选 compatibleFrom 仅在最终对应原生验证通过后才保留，由主任务收口。生产跨 0.70 的费用变化使用审阅手动路径；生产费用相等路径沿用严格控制器。
