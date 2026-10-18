# 当前费用口径

适用：上游 v0.73.0 / `1190260afdcacd8998938de311e0435c306a18ed`，NAS v0.73.0-01；NAS 起点 `e99661a9`。检查时间：2026-10-18（Asia/Shanghai）。来源：既有费用验收、官方 v0.72→v0.73 差异及固定 parser 合成回归，以及 [usage.js](../app/src/shared/usage.js)、[collector](../app/src/shared/collector.js)、[自定价映射](../app/src/shared/tokscaleCustomPricing.js)。费用公式沿用既有规则；会话观察值纠正与日期分配需独立验证，不宣称真实账单验收。

## 数据、币种与单位

默认来源是只读 Hermes SQLite（主库及已存在 profiles），由仓库固定 Tokscale binary 解析，再经 shared 规范化、归档和 Hub 聚合。固定 pin 由 [manifest](../app/scripts/vendor/tokscale.json) 管理；当前 parser commit `0154445d978eb081ea70d5154d98aa8670a1f9a2`，不使用浮动上游。数据来源/模型识别、reported cost、价格缓存或显式自定价共同影响结果，不能只依据 Token 总数反推真实账单。

`costUsd`、clientCosts、modelCosts 是 USD。自定价 `inputPerM/outputPerM/cacheReadPerM/cacheWritePerM/cacheWrite1hPerM` 单位为 USD/百万 Token；0 是明确免费，缺省不是免费，非有限或负价格拒绝；至少 input/output 之一存在才接受映射。自定价写入 Tokscale 的 managed models，保留用户手工配置的其他模型。NAS 不额外把它换算成人民币或把 provider 额度统一当作费用。可选 MiniMax CNY/USD 余额是 provider 额度语义，不混入 Token 的 USD 费用账本；Notion 只产生额度窗口，不产生 Token/调用/费用。

## 缓存、推理与估算

估算按模型、时间和实际价格来源计算，概念公式是各独立 input/output/cache read/cache write（含有支持证据的长缓存规则）Token × 对应 USD/百万单价后求和。缓存不能机械套用普通 input 单价，缺价也不能当作免费：`costUsd` 是已知费用小计，缺价 Token 保留 `unpricedTokens` 等覆盖信息。须核实实际 parser 输出及价格策略，不把不同 provider 的累计 input/缓存包含关系统一叠加。

Hermes DB 的 output 已包含 reasoning。固定 parser 将它拆成 disjoint output/reasoning，公开归一化再合为一个 output-family；reasoning 只计价一次。合成契约 input1000/output400（含reasoning150）/cacheRead200/cacheWrite50，对外 output400、total1650；不能把推理再加150。reported actual cost 的合同样例 1.25 保持1.25，不能擅自对 reported cost 扣估算修正。

跨旧 v0.69 的估算/自定价重复 reasoning 修正，允许减少必须精确等于 reasoning 子集 × 实际 output 单价，不重复减 input/缓存。独立样例 1845 Token、120 reasoning、USD10/M：month/allTime USD0.007645→0.006445，减少0.001200；today0.006510→0.005510。125 Token 控制器样例 input100/output20（含reasoning8）/cacheRead5，单价2/10/1 USD/M：旧 `(100×2+(20+8)×10+5)/1e6=0.000485`，新 `(100×2+20×10+5)/1e6=0.000405`，仅减少0.000080。v0.70及之后来源已修正，相同冻结样例费用应严格相等。这些是合成 oracle，不能复制为真实价格或生产预期。

Goose 累计 Token/费用归会话创建日，cache 已在 input 内，推算 reasoning 不再加；Tokscale 估算不等于 Goose 原记录累计费用，每个累计会话的通用1 call不是真实调用数。其他来源边界见 [可选来源](../OPTIONAL_SOURCES.md)。Cursor included/prepaid/unknown 额度不代表 Token 费用，统一池不重复计 Grok Bot；OpenCode 仅补有证据的迁移遗漏，不叠加两份完整历史。

## 聚合、舍入与局限

Token 规范化为非负整数（`Math.round`）；shared 汇总内部以数值累加，聚合输出的 period、client/model/project/session 费用采用 `Number(value.toFixed(6))`，即 USD 小数六位。不同采集/聚合路径保留其原精度，不能宣称所有中间字段或 parser 先统一四舍五入，也不为本次文档重算历史。验收采用现有精确 oracle/既有数值精度，不能增加任意 tolerance 掩盖差异。

按真实模型选择、会话创建/日期归属及 period/history 聚合，不以全库 SUM 或总价百分比代替逐项比较。prices/cache/custom pricing 修改触发 collector pricing fingerprint 并重放一致窗口，不能混用一次扫描前后两套价格。估算不是服务商发票；真实价格变化、缺价、累计源的日期分布及跨客户端重复采集需单独解释。Hub 可合法接收较新费用修正，不能用只增不减规则替代正确语义。

## 费用差异的部署保护

生产 `RealDocker.frozen_compare` 与 Engine 保持 fail-closed：冻结 costUsd/modelCosts 必须相等，归档和历史拒绝不明减少；没有费用例外开关。即使合法 v0.69 修正也可能被安全拒绝，不能标成可自动部署。`exercise.py --reasoning` 的 ManualReasoningSandbox 仅用于随机临时目录及固定合成设备，先确认真实 frozen guard 拒绝，再在人工 oracle 下演练；它不是生产放行功能或恢复凭据。

确需费用变化的生产升级时，取得当次授权并按 [部署规范](../DEPLOYMENT.md#数据迁移和回滚) 完整备份/恢复。用一致只读源、相同价格缓存/自定价/时区/ID/512MiB/network none 的旧新 dry-run，私下保存完整原 accounting（0600）及状态。逐会话/模型/日期核对 Token 桶、归属、会话ID/数、messageCount、history、deviceId；逐项重建真实 reasoning/output 包含关系、价格及 reported-cost 策略，独立审阅精确旧→新预期。来源、价格、reported cost 或任何差异无法解释即停止。

不得关闭 guard、用新值直接当 expected、全局替换旧快照费用或只比总计。原始冻结证据不改，公开仅放脱敏规则/合计/结论。已审阅且获生产授权后先 Hub 后 Agent，冻结核对后再验证真实增长与 fresh upload；失败保护新增状态并用本次完整快照＋旧准确镜像恢复。仅已知实时 `session.promptCache.observedAt` 可按已有现场比较规则排除，Token/模型费用/日期/设备/完整历史仍须核对；任何新忽略项须证明必要性。CI receipt 不代替生产回滚证明。

## v0.73 数据修正

完整扫描可以用权威会话统计替换旧归档观察值，包括合法零值；Today-only 监听或不完整预览不能抹去其他期间。匹配计时字段只影响生成速率，不改变 Token 费用公式。固定 parser 随官方升级；不得假设同 Token 总数证明逐日分配和费用一致，发布前以冻结 Hermes 输入逐项比较，生产以前后统计和真实同步单独验收。

新 fullScan 纠正后须与新 parser 同配置输出比较；现场观察和差异验收仅记录在 [VALIDATION](VALIDATION.md)。Hermes 调用日志重分配日期和固定 parser 的估价路径可改变月份和模型费用，但不应丢失累计 Token 桶或会话身份。诊断必须复用 scanner.bucketTimezone，不能仅设置容器 TZ 后与另一日期桶比较。历史保留账本继续按现有策略保留冻结观察值，不能声称其与新 parser 的全量分日重算完全相等；要验证的是归档投影和 Hub 读取的一致性。生产原始数据不提交仓库。

## v0.74 数据与估价边界

Grok parser 的 output 与 reasoning 为独立桶，公共输出及总量计入 reasoning 一次；其他来源不能按 Grok 规则重复加总。Tokscale 4.20.0 fork 引入 provider-scoped billing/pricing、Codex OpenCodex 物理模型与缓存代际迁移；完整人工模型单价仍是最终估价，保留人工 provider_overrides，覆盖不完整时保留来源成本。这些变化不保证旧新模型/日期/估价逐项不变。升级前以相同来源、日期桶及价格比较累计桶、会话、历史和费用；不明差异仍拒绝自动部署。项目模型占比只增加分类元数据，不新增消费。
