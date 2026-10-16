# NAS v0.72.0-01 交接

2026-10-16。当前阶段：代码、原生隔离验收、所有者明确确认后的PR #9合并及正式 v0.72.0-01 发布完成；固定镜像、Release/manifest/OCI及旧标签保持已独立读回。**本轮未部署任何生产NAS**，两台SSH预检均拒绝，生产部署仍待独立确认。下方早期候选/待发布段落保留过程，最终状态以“正式发布完成记录”为准。

上游正式 v0.72.0 / `126e9a43dcc51d3d7b2609231eac9974ba73bed7`，旧上游 v0.71.0 / `a514e2063563e318ef73c2a17fad68057c4e300c`；NAS 实际发布基线 v0.71.0-02 / `9a06b658e75d96285ac98847ef5e6e67299a4085`，最新文档 main `77e69040d6cf8e17bb04edbad5406dee20a3f11e`。独立分支 `upgrade/upstream-v0.72.0`，原工作区不重置。

## 移植和保护

Cursor 统一订阅池、预付余额与未知额度处理；OpenCode 2.x 只读元数据/本地详情与 legacy 迁移遗漏用量恢复。三文件及四套上游测试原样移植，纳入 NAS suite。桌面更新器、窗口、Edge Dock、动画和分组呈现不搬入容器。具体 41 文件与六提交决策见 UPSTREAM_0.72_AUDIT.md。

新增 NAS-18 迟到用量/额度独立时间保护，保持重复上传不累计，保留 limits-only 的完整历史和采集时钟。原入口测试中 2 项在旧实现失败、1 项通过；修复后通过。Agent 增加真实入口 dry-run snapshot 读取故障测试。无时间戳的旧客户端保持到达顺序语义，其乱序不可保证；有效 producer 时间的客户端须保持时钟正常。

保留全部 NAS 补丁：严格归档读/写/capture/snapshot 拒绝和恢复、心跳去重与上传取消、进程健康、Hub 持久化回滚、标题许可和隐私、有界 gzip SSE、Windows 北京时间 10/30 分钟分时推送、默认 Hermes-only、limits 关闭、独立 Watcher=0、只读源和每服务 512MiB。无新登录、来源、账户、敏感挂载、权限或凭据。

没有 parser pin、依赖图、计费口径、SQLite schema 或 Hub JSON 格式迁移。v0.71.0-02 到本版冻结 Hermes Token、缓存、reasoning、费用、会话、逐日和设备必须相等；v0.69 跨越的历史 reasoning 修正仍用精确旧/新费用 oracle，不放宽生产控制器。

## 验收边界

以下早期本机记录保留过程，最终结果以本文“完成记录”为准。

自动审查初版 `0050cac519b10e1965c33454c0052e497fb1a28b` 指出首次额度上报可能错误建立用量时钟。已红绿验证：新增 quota-first/restart 测试在初版失败，修复后通过。Hub 在首次完整用量之前持久化既有 `limitsOnly` 标记并保持用量时钟未设，首份完整用量到达后清除此标记；独立保留更新的额度。没有新 schema，旧版本可忽略同一现有 wire 字段。最终源码须重新跑全部原生门槛，初版十组恢复通过不能代替最终验收。

第二次审查指出未来 producer 时间可能成为永久水位。新增故障测试在前版失败；修复后用量和额度时钟只有在可信 Hub 接收时间存在、且不超前接收时间5分钟时才参与顺序比较。无时间、异常时间、超前值及无可信接收时间的旧记录沿用到达顺序，不把它们当成长期水位；不重写来源时间、不伪造采集时间，修正设备时钟后与Hub重启均可继续接收。旧新传输仍兼容。这是顺序比较的可信度边界，不是时间错误期间的数据准确性证明；设备时钟仍须正确。

本机 Node 24.19.0 / macOS arm64，新增上游四套 89 项通过；发布辅助 59 项、Python 部署 51 项通过。首次完整 NAS suite 因尚未接入隔离依赖失败，依赖接入后 1659 tests、1648 passed、0 failed、11 平台 skips；后续 Hub/入口新增测试后重新验收，最终结果另记。

本机没有可用 Docker，不把 macOS 单元测试当作 Linux 镜像验证。原生 linux/amd64、linux/arm64 CI、最终镜像复测、五来源十组冻结/完整状态恢复、合成持续性能、实际新旧 upload/Hub 模块交叉协议验证均为发布前门槛；结果待读回。所有测试仅合成/隔离数据，生产数据未访问或变更。

本地共享 Git 库历史扫描会包含以前导入的官方 tags，其合成 qoder 数据库触发运行文件路径规则；不降低检查标准。待发布分支另用只含 NAS 可达历史的干净副本执行同一检查，CI 也检查完整 NAS 历史。官方源码只取指定 commit，不推送上游 refs。

## 生产升级计划（需要另行确认）

逐台确认清单见 [DEPLOYMENT_PLAN_0.72.md](DEPLOYMENT_PLAN_0.72.md)。本轮通过现有安全SSH配置只读连接 DXP4800 与 DH4300Plus，二者均 Connection refused；当前实际版本/摘要/架构/备份未核实。没有绕过限制或改变任一设备。

本轮发布不授权生产部署。每台设备须重新只读核实当前固定版本、源码与 digest、架构、服务形态、实际 ID、状态目录和只读挂载。历史交接的 DXP4800 v0.71.0-02 不能代替本轮核实；DH4300Plus 曾被用户手工更新，当前版本须独立读取，SSH 拒绝不得绕过。

顺序为 DXP4800 新 Hub 先行、验证鉴权 API/完整数据/gzip SSE 后更新其 Agent；再次通过真实新上传与逐日/设备核对后，单独处理 DH4300Plus Agent-only。新旧组合的协议可兼容不代表旧 Hub 获得新乱序保护，应先更新 Hub。

部署前冻结一致 Hermes 输入在隔离副本做旧新统计比较；保留原 Compose/私有配置字节、owner/mode、Agent 全状态、Hub 全数据、SQLite WAL/SHM 和旧准确镜像，停写后完整备份并验证恢复。预计各设备仅在停写备份、换容器和 gate 时短暂停采/同步，窗口以当次清单确认；不沿用历史自动停机授权。失败保留新状态，停止对应服务，还原本次完整一致性快照与旧准确镜像；不得仅切镜像、叠加恢复或用旧备份覆盖新增数据。不删卷、不清状态、不重建设备身份、不执行 down -v、不安装控制器。

## 完成记录：代码与原生验收

运行源码为 `c37cd3c7d50380aac756bf3f78eb6d1c43981458`，CI 合并态为 `57034f385612baf1870f6f1de544dab43f4ae398`，二者完整 tree 均为 `7a7c90f3dc6011ce69677be85e1e83f44f923829`。后补验收/部署计划文档不改变运行源码。PR：[9](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/9)。自动审查两项有效发现均红绿验证并修复，最终运行提交审查 completed、has_any_findings=false、has_unresolved_findings=false。

- 本机完整 suite：1666 tests，1655 passed、0 failed、11平台跳过；Agent归档/快照与Hub顺序入口共13项；发布辅助59项、Python部署51项通过。
- [原生双架构构建、运行、协议和性能](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38812672809)：amd64/arm64各1666 tests，1658 passed、0 failed、8平台/桌面跳过。固定Tokscale native binary、客户端契约、Compose与实际Hub/Agent运行通过；不是仅构建或模拟运行。原生旧/新Hub×旧/新Agent四组合、旧/新读取额度窗口共8种组合每架构通过，断网重试、重复和Hub重启均验证。
- [五来源×两架构冻结/完整恢复](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38812672835)：10组共30份合成摘要全部读回。独立Rust解析1845Token/2会话/2天/1设备、125Token控制器、含reasoning精确费用、Hub故障回滚、重放拒绝、分阶段Hub→Agent与Agent-only全部通过。详见 [费用对照](COST_VALIDATION_0.72.md)。
- 合成资源测试固定1000会话、三轮旧/新交替、每次60秒持续负载；现有RSS/耗时阈值不变，全部通过。测试合计1GiB资源是既有基准配置，生产每服务512MiB不变。持续阶段三轮maxRSS中位数（MiB）：amd64 Agent168.20→168.12 / Watcher56.39→56.32 / Hub119.72→115.66；arm64 Agent171.80→181.24 / Watcher53.96→54.04 / Hub120.20→123.22。不宣称总体性能改善或24小时生产观察完成。
- 干净NAS可达历史检查1560文件版本、0发现；最终文档提交后再做同一检查。原工作区均干净保持，未推送上游refs或提交运行数据/凭据。

实际portable core revision84 / `sha256:ffd46170d61d827a3250addd283888c6a029f94837ba8c40c7e283b9007f0683` 未变；Node adapter revision7 / `sha256:0890ce50bb4f6030409e52bae6fdce40b0fe84ac6313d894d834a710c4bd5b62` 绑定新增入口模块和真实package/lock；不新增Worker身份。新Agent代码由NAS版本、源码SHA、最终OCI及digest绑定。

未覆盖：真实新Cursor方案账户、生产OpenCode数据/远端逐轮正文、物理NAS运行/生产统计/备份恢复和24小时运行。两台当前均SSH拒绝。本轮未创建新凭据或安装控制器，生产保护不放宽。

尚待：按所有者既有PR规则确认合并，正式发布流程在最终合并源码上重跑原生镜像验收，推广固定tag/latest并创建Release；随后独立读回manifest、Tag、OCI、平台摘要与旧固定版本不变，再补本节发布结果。仅审批发布仍不授权生产部署。

## 正式发布完成记录

所有者在本会话明确确认“合并并正式发布”，不授权生产部署。PR #9已合并为 `8444a9b1f3aeb88e164fd20b9773a9984d3d33a0`；获批分支 `f81b39438b25cd38a5a7160ec11dcd7f9465e071`、最终PR合并态 `147ffaa69979b66e624da849b4aca5fe56d8bfd3` 与正式合并源码的完整tree均为 `c148174a052f88034579f8f4a9b1bf906a3800de`。运行源码与上节c37验收一致，差别仅后补文档。

- [获批最终PR原生验证](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38813996822) 与 [最终十组恢复](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38813996890) 全部成功，最终分支自动复审无发现；重复push验证因与PR同代码而取消，不是被跳过的失败门槛。
- 最终PR持续maxRSS中位数（MiB）：amd64 Agent165.80→167.72 / Watcher56.35→55.82 / Hub119.06→118.99；arm64 Agent173.36→174.36 / Watcher53.97→53.99 / Hub117.71→118.50。三轮固定负载、既有阈值全部通过；结果不表示普遍性能改善或24小时生产观察。
- [正式发布工作流38818647520](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38818647520)：amd64构建/候选实际运行复测、原生arm64对同一摘要复测、固定标签推广和Release创建全部成功。最终镜像两架构各1666 tests：1658 passed、0 failed、8平台/桌面skips。

正式 [Release v0.72.0-01](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/tag/v0.72.0-01) 于北京时间2026-10-16 06:45:31发布，非草稿/非预发布。固定镜像 `ghcr.io/gott-mit-uns/token-monitor-hermes:v0.72.0-01`。

| 来源 | 已核验固定摘要 |
|---|---|
| multiarch index / latest | `sha256:2830d40ea72b99084417ad415dcf6adea7f911959a5c3bfd48cc9b418ffd5810` |
| linux/amd64 | `sha256:ca6ff0dd482595cd9e0b8823235b4d8aca2d13105f539ae6db3e394f60521191` |
| linux/arm64 | `sha256:34d65bfe98dd94980894f2ec22c28f7b8b7c3119d7d2a863b3e9f669e98ba5b0` |
| release-manifest.json文件 | `sha256:c1b76308bf2b0b1e1c9e7e19db813ce344c6c47afbef6a7d458a5ab865b0eec5` |

独立匿名Registry读回验证index、两个平台manifest和config字节摘要，OCI版本/源码均为本版和正式合并源码；Git Tag解引用相同，latest与固定index相同。Release manifest原字节/资产digest一致，迁移政策和compatibleFrom与tag源码一致。v69-01/v69-02/v70-01/v71-01/v71-02五个旧固定摘要前后完全相同。

Release补充最终PR的30份冻结/完整恢复摘要、双架构资源/混合协议共4份证据、独立发布读回JSON与可读验收/升级说明；原release-manifest.json资产不覆盖。后补交接文档通过独立分支/PR提交，不增加NAS修订、不重建固定镜像。

生产状态：本轮没有停机、拉镜像、改配置、改身份、触碰状态或部署任何NAS。DXP4800与DH4300Plus当前实际版本/架构/摘要仍以访问恢复后的独立核实为准；上次DXP v71-02记录不等于本轮已验收。部署确认清单已填入本版固定digest，但备份/恢复位置及维护窗口须另行确认。
