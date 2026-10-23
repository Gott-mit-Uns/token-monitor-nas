# 官方源码基线与升级规范

适用：NAS v0.77.0-02 候选（未发布）；2026-10-22 从 v0.76.0 三方合并核对。官方稳定基线 `v0.77.0` / `c83ee3aeb6d23505257113c29ef010040deb52f7`，唯一机器输入为 [upstream-lock.json](upstream-lock.json)。当前发布状态和未完成工作见 [HANDOFF](docs/HANDOFF.md)，实际验证见 [VALIDATION](docs/VALIDATION.md)，不在本文维护逐版发布日志。

## 源码范围

Node Hub、Agent 与 shared 使用同一稳定官方基线。源码映射为上游 `src/*` → 本仓库 `app/src/*`。仅按固定旧/新官方提交及 NAS 起点三方比较；不得浮动跟踪 main、混入预发布或整目录覆盖 NAS 补丁。`nas-version.txt` 决定当前 NAS 修订；lock 的 revisionBaseline 描述引入官方基线的操作，不代替最终发布清单。

容器排除 Electron 窗口、Dock、renderer/动画、桌面更新器、浏览器登录及独立 Windows Adapter。Worker 不在本仓库分发，不生成虚假 Worker 身份。共享本地详情能力不构成远端正文 API 或真实来源授权；默认 Hermes-only，不自动启用新的客户端、额度、挂载或账户。

## NAS 同步排除规则

机器读取的排除清单为 `scripts/nas-scope.json`，由 `scripts/report-upstream.py` 和 `scripts/check-nas-scope.js` 共用；前者在上游差异报告中单列排除项，后者检查源码、package/lock、静态引用与最终镜像。新增桌面功能不能因位于 shared 就直接复制；未识别路径仍须人工审查，不自动列为可同步。

- 永久排除当前 NAS 产品范围：Electron/renderer、托盘和字体显示、macOS Widget、桌面应用更新器、桌面打包/签名/安装器；Worker、独立 Windows Adapter、Android UI 留在各自产品，不恢复其构建发布流程。
- 必须继续评估：采集与 parser、Token/缓存/reasoning/费用口径、历史归档、额度和账号身份、Hub 协议/共享设置、实际运行依赖的安全修复。新来源和额度保持显式启用，默认配置不随同步变化。
- 适配后同步：collector/watcher、持久化与 SSE 优化；保留 NAS 独立 Watcher、严格持久化、历史守卫、只读来源、资源和隐私边界。`src/hub/windows*` 是 NAS 服务端能力，不属于桌面排除项。
- 本批只移除明确未接入的显示/更新模块和桌面构建链；登录辅助、其他来源、共享本地详情、诊断与导出模块保留，不能把静态不可达名单当作批量删除许可。
- 每次 PR 列出跟进、适配、排除和等待项；混合提交逐路径处理。删除文件的桌面专属测试随之排除，共享统计、历史、协议和 provider 测试必须保留；不能以排除 UI 为由删除共享数据字段。依赖裁剪后按实际清单重新计算 NAS 构建身份，不复制官方指纹。

PR 原生双架构构建和发布最终镜像均执行排除检查；恢复被排除的路径/依赖会失败。排除清单只能随明确的 NAS 产品需求和适用测试一起审阅修改，不能为通过检查临时移除规则。一般功能以正式版为基线，确实影响 NAS 的安全/数据正确性修复可独立评估，不自动发布或部署。

## 升级步骤

1. 读取 [AGENTS](AGENTS.md)、[当前交接](docs/HANDOFF.md)、[NAS 补丁](NAS_PATCHES.md)。核对正式 tag 解引用 SHA、旧 lock、NAS 实际起点与已发布身份；保护原工作区，用独立分支。
2. 比较全部上游差异，对 runtime、共享协议、tests/fixtures、桌面/Worker、依赖及文档逐项作决定；长期决定原位维护在本主题，PR保存本轮逐项清单。已有独有审计在 [有限归档](docs/archive/README.md)，不再逐版新增审计文件。
3. 将 collector 内嵌 watcher 改动映射到 NAS 独立轻量 watcherPolicy；保持 streaming archive、revision staged 原子性、strict 错误保护、安全字典、隐私、上传取消与独立进程健康。源码/实际闭包身份一致，不复制官方哈希冒充完整一致。
4. 同步固定 Tokscale pin、公开 reasoning 规范化及真实二进制契约；不能只改其中一侧。保持成本/缓存/会话/日期/设备/历史，费用差异须按 [COST_MODEL](docs/COST_MODEL.md) 精确解释；没有实际来源不得宣称采集成功。
5. 本机结果不能代替原生 amd64/arm64 Docker。每个 compatibleFrom 来源独立执行冻结与完整状态恢复，未通过不能列入政策。短合成性能不是生产改善/长期稳定证明；具体结果只更新 [VALIDATION](docs/VALIDATION.md)。
6. 按 [版本规则](VERSIONING.md) 及 [发布规范](NAS_PUBLICATION.md) 处理授权、最终源码和不可变产物。源码、测试、发布、生产部署分别核验，原位更新交接，不自动扩写 README。

## 长期兼容限制

旧 JSON 归档迁移至 SQLite 后会移除旧 JSON，回退旧版需完整迁移前状态＋旧准确镜像。后续兼容字段不等于状态可随意倒退，详见 [部署/恢复](DEPLOYMENT.md#完整状态恢复)。Codex parser 缓存升级可能一次重解析，StepFun 身份绑定 refresh half；不要以此新增数据源或持久凭据。Hermes reasoning 包含关系、Goose 累计归创建日、额度与账本分离见费用/可选来源权威入口。

## v0.73 适用决策

shared/Agent、固定 Tokscale 4.19.1 fork、来源注册/路径、Cursor Included 周期、匹配计时、OMP 本地详情及会话零值纠正同步；不提供远端正文 API。Hermes agent.log 日期证据和 Claude Desktop 的监听过滤映射到独立 watcherPolicy，保持默认 Hermes-only。归档 strict 失败保护和逐行读取、安全字典及 Hub 时序/持久化/SSE 补丁保留；Agent 上传前移除内部 fullScan 提示。Node Hub 上游本轮无直接改动，共享用量与运行闭包身份按本仓库重算，不复制官方哈希。桌面 renderer、更新器、Electron 专用测试、Worker 和网站不分发；相应上游说明用于差异判断，不复制为 NAS 功能。完整路径决策见本次 PR。

## v0.74 适用决策

按解引用后的正式 tag 比较 15 个上游提交、全部 103 个变更路径（路径数以 GitHub compare 返回为准）。共享代码同步 Grok 独立 reasoning、history 显式零值分类来源、项目模型占比、Reasonix 本地项目元数据、Kilo 原生 VS Code 根及保留人工 pricing/provider_overrides。固定 Tokscale 4.20.0 fork `324d51362201b746fc35c2f2a3793c971f01d5aa`，依赖与全部平台摘要同步。Agent/Node Hub 入口和 watcherPolicy 本轮无直接上游差异；Kilo 根由现有轻量 watcher 闭包复用，不另建监听器。默认来源、额度、项目开关和只读挂载保持。

上游项目模型聚合使用 null-prototype 字典，保留保留字键测试。NAS registry 仅追加实际源码/依赖闭包身份，不复制官方或生成 Worker 身份。共享测试按 NAS 能力适配，Grok 计时验证传输字段，Reasonix 执行共享采集/归档/同步断言并跳过 Electron 展示断言；limitWindowText 的桌面集成不纳入 NAS suite。桌面 Liquid Glass、Top Notch、renderer、macOS 窗口、Worker 镜像和桌面发布说明不分发；上游文档用于接口与范围核对，不覆盖 NAS 文档。逐路径处理保留在 PR。

补充来源边界：OpenCodex 账本仅辅助物理模型归属，不增加 Token 行，没有专用 ledger watcher，依赖正常采集及完整期间复核。Claude compacted 历史可由 parser 缓存保留，删除源 transcript 不等于删除保留用量。Grok 旧归档与实际计时能力见 [费用与数据边界](docs/COST_MODEL.md#v074-数据与估价边界)。

## v0.75 适用决策

同步全部11个适用共享源码路径及版本清单：Antigravity新旧SQLite schema兼容、agent_name标题回退及parentSessionId；DSH从transcript cwd关联项目；Grok Bot只以明确turn或liveActivity判断运行；Claude探测使用独立cwd、禁止保存历史并排除探测活动。Windows子进程降优先级辅助在Linux不执行，不改变NAS调度。Agent/Hub入口、持久化格式、费用规则、依赖和Tokscale pin均无上游变化；NAS补丁原样保留。实际core/Node闭包身份重新计算，上游registry仅核对而不复制。7个上游shared测试变更纳入现有NAS suite；claude活动测试保留NAS自有修正并增补探测排除断言。桌面Notch、Electron/renderer、Worker及其测试/文档不分发；上游说明只作范围参考。完整路径分类见PR，当前结果见VALIDATION。

## v0.76 适用决策

三方合并3个Antigravity共享源码及3个共享测试：Gemini 4 Argon单独额度池、有限读数优先于未知值、真正零额度保留、同账户本地RPC合并时保留OAuth独有额度组。客户端兼容版本随官方更新；真实账户仍须单独验收，不启用默认关闭的额度。Agent/Hub入口、采集计费、持久化格式、Tokscale固定构建和依赖均无变化，仅同步app版本。新增3份额度测试到NAS执行清单。桌面Notch手势、窗口堆叠/遮罩优化、主页显示数量及图标不进入NAS；Worker版本和桌面测试/发布说明不分发。实际闭包身份由NAS脚本重新计算，不复制官方哈希。完整路径分类见PR。

## v0.77 适用决策

13个上游提交、53个路径逐项分类：8个运行源码路径（Hub server和7个shared）三方合并，NAS安全补丁保留；package与lock仅同步官方版本，依赖和Tokscale固定构建不变。Hub合入可选批量保存、紧凑JSON和限时退出刷新，默认仍同步保存；NAS严格启动读、同步失败回滚/503、即时隐私和共享写保留。SSE按广播预编码不同普通客户端帧，同时保留SHA256比较摘要、每连接回压/缓冲上限、gzip释放及Windows独立时段调度；shared fanout增加可注入预计算内容键供NAS摘要复用，默认官方语义不变。同步Cline凭据身份隔离/保存密钥配置、Cursor未知套餐及失效缓存处理、New API今日/滚动七天/月消费和有界可选查询。Agent/collector/watcher及历史守卫源码没有上游变更。

适用Hub/shared测试和Argon合成夹具同步；同名持久化测试保留NAS版，上游新增批量保存测试另名纳入自动扫描；shared limits/limitsRuntime/thirdPartyLimits明确进入NAS清单，Node Cline入口执行，Worker入口因不分发而跳过。Windows时序测试修正保留跨平台意图。桌面额度展示/实时速率/设置刷新/遮罩及对应测试、Worker与文档不分发；上游env/API配置说明只映射Hub可选保存到现有NAS入口。registry按实际闭包追加，不复制官方哈希。完整路径清单保留在本轮PR。
