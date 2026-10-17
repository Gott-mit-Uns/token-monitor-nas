# 当前交接

适用：NAS `v0.72.0-02`；文档治理基线 `caa51169`。检查时间：2026-10-17（Asia/Shanghai）。来源：该提交的历次交接、验收及部署计划；本次仅核对仓库资料，未重新访问生产设备或核验 Registry。实际测试范围见 [VALIDATION](VALIDATION.md)。

## 当前状态与下一步

- 上游稳定基线为 v0.72.0 / `126e9a43dcc51d3d7b2609231eac9974ba73bed7`；正式 NAS v0.72.0-02 源码为 `0f748427b7c75171d1c2fcaf40c0ef552bfb2f2d`。旧记录确认 2026-10-16 21:35:40（北京时间）发布完成；不可变身份以 [仓库清单](../publications/v0.72.0-02/manifest.json) 为准。该历史结论不代表本次重新核验 latest。
- 后续发布采用 Git tag＋多架构镜像＋仓库三份发布记录，详见 [发布规范](../NAS_PUBLICATION.md)。六版迁入记录保留原字节；不覆盖固定 tag/镜像/清单，不删除旧 Release。新流程首次实际 tag 发布、专用 `nas-publications` 分支写入及 GHCR 推广未在本次执行，不能把模拟验收写成真实发布。
- 所有者最后决定自行更新 NAS 容器。助手此前部署授权已撤回；本次只整理文件并交付 PR，不合并、不发布、不部署。两台 NAS 的当前版本、摘要、架构、手工更新结果均未重新验收。旧 SSH 拒绝只是上次观察，不代表当前连接状态。
- 上次确认的历史生产结果是 2026-10-15 DXP4800 v0.71.0-02：3571 个归档会话、完整历史及费用保持，停机 37.67 秒，真实新上传、API/gzip SSE、独立 Watcher 通过；这不是当前运行证明。DH4300Plus 曾由所有者手工更新，其实际版本不能推断。

## 必须保持的工程边界

默认 Hermes-only、limits 关闭、五分钟兜底、独立 Watcher=0、只读来源、每服务 512MiB、设备身份与持久化路径保持。标题默认关闭，迁移/卸载前完成旧 Hub 的撤销清理，见 [部署规范](../DEPLOYMENT.md#标题关闭迁移与卸载)。Node Hub 与 Agent 使用同一共享基线；真实闭包指纹不复制上游值冒充一致，Worker 未在本仓库分发。

当前 core revision 84；Node runtime revision 8 的旧验收指纹为 `sha256:21b76f9f6e1eaf24d634dd0d1b120ddf42f5fe90a9cecfebbc52c842b487cdd5`。本次不重生成构建身份。可选 Hub 名称只在鉴权 stats/完整 SSE 公开，未配置省略，匿名 health 不返回；仅在 Hub 服务显式配置，不能改 Agent ID 代替，见 [合同](../HUB_DISPLAY_NAME.md)。

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
