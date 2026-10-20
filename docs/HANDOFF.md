# 当前交接

## 2026-10-20 v0.76.0-02 历史守卫修复已发布并部署

[PR #25](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/25) 已合并，正式源码`219ab704fdfcde81e889840c3cae13649b792c94`。修复Hub历史核验对费用浮点尾差、行重排/正常增量、派生强度和已证明370自然日窗口到期的误报；仅精确重算证明允许窗口摘要下降，真实日期/计数/累计/月份损失继续拦截，通用归档和冻结会计保持严格。最终26项CI、自动复审及正式发布通过，固定tag/镜像/记录和两平台身份已独立核验。桌面基线仍为v0.76.0，app/依赖/parser/持久化格式不变。

按本次授权仅升级DXP4800，先完成新鲜完整项目备份、独立解包逐文件内容/权限/属主和SQLite校验，再冻结来源核对旧新统计精确相等，按Hub→Agent切换。配置、身份、来源只读挂载、隐私和资源限制保留；修复模块持久保存于NAS私有备份并用于本次直接核验，未安装后台控制器。认证API、普通/Windows gzip SSE及重连、Watcher和修复后的归档/历史/许可守卫通过；启动和下一轮五分钟周期上传均已确认，Hub接收时间推进；两服务healthy、0重启，启动日志错误指标为0。备份与旧镜像保留，不删卷/状态，不仅切旧镜像回滚。发布及现场证据见[VALIDATION](VALIDATION.md)。

未操作DH4300plus，未观察到新增Hermes消费；未执行生产回滚、24小时观察、物理客户端UI或公网代理验收。本收尾仅更新现有文档，不再次发布版本。

## 2026-10-20 v0.76.0-01 已发布并部署DXP4800

官方正式基线v0.76.0 / `fbbe4c1cb04e3277b73499016d432338c1d2ab4e`；[PR #23](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/23) 已合并，正式源码/tag为`9700023b94f366623359cedc59d64c9600b9279b`。Antigravity额度共享差异和测试已同步，固定parser、采集计费、持久化格式及默认开关保持。原生双架构产品/性能、十来源×双架构冻结/完整恢复和自动审查均通过；[正式发布](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39435315763)成功，固定镜像/三份记录/latest及两平台OCI身份已独立核验。index为`sha256:072c1d1bb4f8eda509269d6d7b9e06d56fbaaf66fc97b1f4241988831baa4174`，以[固定清单](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/e17136182b0064360449cf57d4fca7ff14aa0940/publications/v0.76.0-01/manifest.json)为准。

所有者本次明确授权对齐、验证、合并、发布与DXP4800升级，并要求完整备份、不动DH4300plus。现场从v0.74.0-01升级：先停写并完成整个项目备份/元数据及SQLite校验，在冻结只读来源与独立状态副本验证旧/新统计和历史相等，再Hub→Agent升级。实际Compose两处镜像固定到index，配置、设备、挂载、隐私和资源限制保留；两服务healthy、0重启，启动后采集/上传、Hub新鲜接收、独立Watcher、API/SSE/gzip/重连、归档/历史及共享/标题许可通过。下一轮五分钟正常采集上传已观察到，Hub receivedAt由1792505514036推进至1792505816421。备份与旧准确镜像留在NAS私有位置，禁止删卷、清状态或仅切旧镜像回退。最终其他设备活跃历史更新及4处费用浮点尾数触发原严格守卫，已独立只读核对无日期/Token损失，DXP自身历史相等；未放宽守卫或改数据。细项、严格检查边界及首次备份副本校验失败的处理见[VALIDATION](VALIDATION.md)。

本次没有访问或更新DH4300plus；没有观察到新增Hermes消费，24小时、生产回滚、物理客户端和公网代理未验收。此次收尾只更新现有验收与交接，不再发布软件版本。以下旧版本授权和结果仅属历史，不替代本次现场证据，也不自动授权其他设备。

## 2026-10-20 v0.75.0-01 已发布

桌面正式基线为 v0.75.0 / `877fef6002a5fee84aa502fc3454b4f700b55813`。NAS 对齐已由 [PR #21](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/21) 合入 main，正式源码与 annotated tag `v0.75.0-01` 均指向 `23e63652806921a74d7c4f0945ea56ad16cbd44a`。Antigravity 父子关系、DSH 项目归属、Grok 活动证据及 Claude 探测隔离已同步；原有来源/隐私/项目/额度默认开关、固定 parser、费用口径及持久化格式保持。修改范围见 [UPSTREAM](../UPSTREAM.md) 与 [NAS_PATCHES](../NAS_PATCHES.md)。

PR 最终提交的21项检查及自动审查已完成，原生双架构产品/性能与九来源×双架构冻结/完整状态恢复通过；合并树与已验收 PR 一致。[正式发布运行](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39288665611) 三个 job 均成功，固定多架构镜像、仓库三份记录及 latest 推广完成。固定镜像为 `ghcr.io/gott-mit-uns/token-monitor-hermes:v0.75.0-01`，index `sha256:c92f1ad9ad1e7d6b6f7e6302bcfde64ad4e3b5f2583b2dea0d8821f76e3328e3`；[固定发布清单](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/e00128282eeed4755ccb5cc9214a0c35675f3bfa/publications/v0.75.0-01/manifest.json) 记录两个平台身份及恢复政策。已独立匿名读取 GHCR，固定版本与 latest 指向同一 index，两个平台的 digest、源码和版本标签一致；latest 仍是可变指针。完整证据及本机首轮失败范围见 [VALIDATION](VALIDATION.md)。

所有者于 2026-10-20 明确授权实现、测试、PR、审查修复、合并与发布；本次收尾仅更新现有两份交接/验收文档，不再创建软件版本。发布沿用 Git tag、多架构镜像、仓库三份发布记录及 latest 机制，不新建 GitHub Release。生产安装、重启、迁移及部署不在本次授权范围；没有访问生产设备，实际部署/恢复、真实增量及24小时观察仍未验收。下方各旧版本的现场结果只适用于其原提交与范围。

## 2026-10-19 当前状态

官方基线为 v0.74.0 / `cbed5915e294abb4a210f7ebb385e9415f706821`；NAS v0.74.0-01 已由 [PR #19](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/19) 合入 main，正式源码/tag 为 `14a590313c3e655cca7eac88d7ac18ac0f250042`。原生双架构产品/性能及八来源×双架构冻结/完整状态恢复已通过；[正式发布运行](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39182258253) 成功，固定镜像、仓库三份发布记录及 latest 推广已完成。具体证据与边界见 [VALIDATION](VALIDATION.md)。

固定镜像为 `ghcr.io/gott-mit-uns/token-monitor-hermes:v0.74.0-01`，index 为 `sha256:f928d90e8c697d7e872ed1e19f20a93490e378444cfbea0d5b7cb4453ca104d7`；两平台摘要及迁移/恢复政策以 [发布清单](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/8719db4f95e550f268f97c9fc47cbe12bcf2ebf8/publications/v0.74.0-01/manifest.json) 为准。latest 是可变指针，不能代替固定身份；本次核对 GitHub 发布证据，未独立拉取 Registry 镜像。

发布成功不代表两台 NAS 已运行本版；本次没有访问、更新或验收生产 NAS，v0.74 的实际部署/恢复、真实增量和24小时观察仍未知。下节 v0.73 的 DXP4800 结果保留原范围，不能移记到 v0.74；DH4300Plus 仍须单独核实。所有者随后明确授权将本次文档修复在检查/审查通过后合入 main；此次发布仅指文档进入主分支，不创建新软件版本、Release或镜像。未来版本发布及逐台生产操作仍须取得当次授权，并按下方门槛执行。

旧 [PR #15](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/15) 的文档收敛已由现有固定入口及治理覆盖，独有历史记录与审查结论见 [VALIDATION](VALIDATION.md#旧-pr-15-的保留与替代)。其仅保留 manifest 的发布器/消费者改造及删除12份 UPGRADE/ROLLBACK 与当前 [AGENTS](../AGENTS.md) 冲突，不合并该方案；保留现有三份发布/恢复记录及原字节。未来若明确启用可选控制器，须审阅同一提交的完整配套依赖；备份/恢复与后续重建须包含私有 `image-override.json` 及相同 Compose `-f` 组合，保持固定镜像身份，详见 [DEPLOYMENT](../DEPLOYMENT.md)。

## 2026-10-18 当前交付

官方 v0.73.0 已对齐，NAS v0.73.0-01 源码为 `61d43212bea55db685e1d52e8346b0d4b253e5c0`；PR #17 已审阅合并，正式镜像、仓库清单与本次明确要求的 GitHub Release 已完成。版本、CI、摘要及实际边界以 [VALIDATION](VALIDATION.md) 为准。

DXP4800 Hub→Agent 已升级并验证两轮采集上传、归档、历史/API/SSE/gzip/重连和资源/挂载。所有者本次明确跳过备份；不得声称有本次生产恢复快照。旧月归档偏大值已按新版完整扫描纠正，parser 日期分配和模型估价变化已用同源/同价格/同 scanner 配置复核，不能写成全部金额和日期保持不变。现有分日保留账本继续保留冻结历史，不擅自全量重算。

DH4300plus 没有由助手更新，由所有者手动使用同一固定版本镜像；该设备升级结果必须另行核实。观察期没有新增 Hermes 消费用量、没有 24 小时生产持续验收，也没有验证物理客户端 UI 或公网反向代理。下文旧授权撤回及旧未验收描述仅属于历史范围，不覆盖本次已明确授权并完成的 DXP4800 操作。

## 历史交接（v0.72.0-02）

适用：NAS `v0.72.0-02`；文档治理基线 `caa51169`。检查时间：2026-10-17（Asia/Shanghai）。来源：该提交的历次交接、验收及部署计划；本次仅核对仓库资料，未重新访问生产设备或核验 Registry。实际测试范围见 [VALIDATION](VALIDATION.md)。

### v0.72.0-02 当时状态与下一步

- 上游稳定基线为 v0.72.0 / `126e9a43dcc51d3d7b2609231eac9974ba73bed7`；正式 NAS v0.72.0-02 源码为 `0f748427b7c75171d1c2fcaf40c0ef552bfb2f2d`。旧记录确认 2026-10-16 21:35:40（北京时间）发布完成；不可变身份以 [仓库清单](../publications/v0.72.0-02/manifest.json) 为准。该历史结论不代表本次重新核验 latest。
- 后续发布采用 Git tag＋多架构镜像＋仓库三份发布记录，详见 [发布规范](../NAS_PUBLICATION.md)。六版迁入记录保留原字节；不覆盖固定 tag/镜像/清单，不删除旧 Release。新流程首次实际 tag 发布、专用 `nas-publications` 分支写入及 GHCR 推广未在本次执行，不能把模拟验收写成真实发布。
- 所有者最后决定自行更新 NAS 容器。助手此前部署授权已撤回；本次只整理文件并交付 PR，不合并、不发布、不部署。两台 NAS 的当前版本、摘要、架构、手工更新结果均未重新验收。旧 SSH 拒绝只是上次观察，不代表当前连接状态。
- 上次确认的历史生产结果是 2026-10-15 DXP4800 v0.71.0-02：3571 个归档会话、完整历史及费用保持，停机 37.67 秒，真实新上传、API/gzip SSE、独立 Watcher 通过；这不是当前运行证明。DH4300Plus 曾由所有者手工更新，其实际版本不能推断。

## 必须保持的工程边界

默认 Hermes-only、limits 关闭、五分钟兜底、独立 Watcher=0、只读来源、每服务 512MiB、设备身份与持久化路径保持。标题默认关闭，迁移/卸载前完成旧 Hub 的撤销清理，见 [部署规范](../DEPLOYMENT.md#标题关闭迁移与卸载)。Node Hub 与 Agent 使用同一共享基线；真实闭包指纹不复制上游值冒充一致，Worker 未在本仓库分发。

v0.72.0-02 的 core revision 84、Node runtime revision 8 旧验收指纹为 `sha256:21b76f9f6e1eaf24d634dd0d1b120ddf42f5fe90a9cecfebbc52c842b487cdd5`。本次不重生成构建身份。可选 Hub 名称只在鉴权 stats/完整 SSE 公开，未配置省略，匿名 health 不返回；仅在 Hub 服务显式配置，不能改 Agent ID 代替，见 [合同](../HUB_DISPLAY_NAME.md)。

Hub 迟到保护分别处理 usage/limits：只有可信 Hub receivedAt 且 producer 最多超前 5 分钟时比较顺序；异常/缺失时间沿用到达顺序，不能保证该区间乱序。首次 limits-only 不建立 usage 水位，持久化标记在首份完整用量后清除。合法降费和日界归零仍可接受，不用只增不减假设。

## 未完成事项与限制

- 生产来源只读核查、私有一致性备份、物理 NAS 运行/恢复和 24 小时持续观察；不能用容器 running、health 成功、Release 成功或用户更新计划代替业务验收。
- 真实 Cursor 新方案账户、生产 OpenCode 数据、真实 Notion Business/Enterprise 资格、WorkBuddy 多账户/浏览器登录和新认证未验收。fixture 适配不等于账户可用；共享本地详情不提供远端逐轮正文 API。
- 真机 Android、公网 Windows/反向代理 HTTPS/gzip 客户端验收仍独立进行，本仓库合成协议测试不能代替。
- 可选控制器没有安装生产；旧控制器若未来启用必须先单独审阅更新；不为消除访问阻碍安装控制器、改权限或创建凭据。
- 费用变化路径继续按 [费用口径及人工审阅](COST_MODEL.md) 与 [部署规范](../DEPLOYMENT.md) 执行。自动控制器拒绝冻结费用差异；不得因已知 reasoning 修正放宽 Token/历史保护。

## 未来生产操作前的逐台门槛

先取得当次明确授权，逐台只读核实真实旧/目标版本、源码、digest、平台、服务、设备 ID、配置、挂载和资源限制。DXP4800 为 Hub→本机 Agent，完成后才处理 DH4300Plus Agent-only；预期角色不能代替现场核查。每台维护窗口、私有备份位置和恢复方案须当次确认，旧“最多 5 分钟”记录不自动授权新停机。

对一致 Hermes 只读源和独立状态副本比较旧/新 Token、缓存、reasoning、费用、会话、日期、历史及设备。已知跨 v0.70 计费修正须独立精确解释；其他不明变化停止。停写后备份全量 Hub/Agent 状态、配置原字节/owner/mode、DB/WAL/SHM，验证副本可读并保留旧准确镜像。Hub 验证鉴权数据、历史/共享设置/标题、SSE/重连后才启动 Agent，确认启动后的新采集、fresh receivedAt、完整归档和独立 Watcher。DH 必须独立验证远端 Hub 接收。

失败先保护失败后的新增状态，停止后续步骤；只在确认新增数据处理及可恢复性后还原本次完整一致性快照＋旧准确镜像。不能仅切镜像、叠加恢复、删卷、清状态、重建设备身份或用前版旧备份覆盖新增用量。CI sandbox receipt 不是生产恢复凭据。具体步骤的唯一权威入口为 [DEPLOYMENT](../DEPLOYMENT.md)。

## 继续工作

开始任务读取 [AGENTS](../AGENTS.md) 与本文件；验收更新 [VALIDATION](VALIDATION.md)，费用规则更新 [COST_MODEL](COST_MODEL.md)。旧版过程和独有审计见 [有限历史索引](archive/README.md)。任务总结放 PR/回复，不新增版本交接或仓库报告。当前记录的唯一入口约束也覆盖其他目录的大小写变体，不能用新主题声明建立第二套记录；未完成验收继续在固定入口保留。
