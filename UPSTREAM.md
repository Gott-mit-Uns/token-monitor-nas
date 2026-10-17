# 官方源码基线与升级规范

适用：NAS v0.73.0-01；2026-10-18 从 v0.72.0 三方合并核对。官方稳定基线 `v0.73.0` / `1190260afdcacd8998938de311e0435c306a18ed`，唯一机器输入为 [upstream-lock.json](upstream-lock.json)。当前发布状态和未完成工作见 [HANDOFF](docs/HANDOFF.md)，实际验证见 [VALIDATION](docs/VALIDATION.md)，不在本文维护逐版发布日志。

## 源码范围

Node Hub、Agent 与 shared 使用同一稳定官方基线。源码映射为上游 `src/*` → 本仓库 `app/src/*`。仅按固定旧/新官方提交及 NAS 起点三方比较；不得浮动跟踪 main、混入预发布或整目录覆盖 NAS 补丁。`nas-version.txt` 决定当前 NAS 修订；lock 的 revisionBaseline 描述引入官方基线的操作，不代替最终发布清单。

容器排除 Electron 窗口、Dock、renderer/动画、桌面更新器、浏览器登录及独立 Windows Adapter。Worker 不在本仓库分发，不生成虚假 Worker 身份。共享本地详情能力不构成远端正文 API 或真实来源授权；默认 Hermes-only，不自动启用新的客户端、额度、挂载或账户。

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
