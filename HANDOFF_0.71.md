# v0.71.0 NAS 升级交接

后续修订：本文件保留 `v0.71.0-01` 的历史记录；实际 Agent 归档失败保护于 `v0.71.0-02` 补齐并完成DXP升级，见 [最新交接](HANDOFF_0.71.0-02.md)。DH4300Plus所有者后续说明曾自行更新，本轮新修订仍SSH拒绝，未由本任务部署，不能将下文当时“未操作”解读为用户没有更新。

日期：2026-10-15（Asia/Shanghai）。当前状态：代码对齐完成、原生双架构验收完成、v0.71.0-01 正式发布、DXP4800 Hub+Agent 已部署并验收；DH4300Plus 因 SSH 拒绝连接阻塞。下列基线和实施边界是审计记录，实际完成证据见末节，不将发布结果代替部署结果。

## 固定身份与审计

NAS分支 upgrade/upstream-v0.71.0，基线 cff3fe54847a01752a888b2109b0f7f0d4762bf2，官方固定tag v0.71.0 / a514e2063563e318ef73c2a17fad68057c4e300c；上一官方v0.70.0 / ac4eeb2c4aea239dd94b67f074c73f69aafc46f8。旧发布v0.70.0-01 / 02413928fef06abc99e181f253228e549fb4582f已独立读回；新v0.71.0-01起始Tag未占用。原工作区clean，独立worktree保护既有分支。148路径分类见 UPSTREAM_0.71_AUDIT.md，共享三方实现见 UPSTREAM_0.71_SHARED.md，费用边界见 COST_VALIDATION_0.71.md。

默认Hermes-only、独立Watcher=0、五分钟调度、上传取消/去重/心跳、只读挂载、持久化保护、标题隐私、有界SSE、512MiB限制均保留。Goose/Notion等不自动启用；真实认证、持久凭据及新source挂载未经本轮请求，不执行。Notion fixture是适配证据，非真实账户资格验收；WorkBuddy官方浏览器登录仍属桌面。

## 兼容性

Node Hub和Agent使用同一共享源码，旧Agent/Android既有字段仍兼容；新增client/provider、双额度窗口和明细需要支持这些字段的客户端。更新Hub只提供协议接收/归一化能力，新来源数据还需实际Agent支持、真实目录及显式启用。Goose不计推算reasoning为额外output、不虚构calls，Notion只为limits不入Token/费用账本；WorkBuddy展示合计不改历史。

NAS core/adapter hash对应真实源闭包（含NAS helper），不复制上游值冒充完整一致。Worker代码未在本仓库分发/部署，检查上游生成闭包但不宣称Worker已更新。旧客户端遇未知自有hash保留unknown，不伪装current。

## 本轮生产授权与现场

所有者已明确允许正式发布及生产部署，并批准每台最多5分钟停机、完整私有一致性备份、保留旧镜像及失败恢复，先DXP4800 Hub→Agent再DH4300Plus。

DXP已只读核实运行v0.70.0-01 Hub+Agent，旧index sha256:848d6c0b59c35be8e5d9f69d29d347404f2b2988964c8b4838579e24e8621e64，源码02413928fef06abc99e181f253228e549fb4582f，健康、独立Watcher、512MiB、Hermes只读。Docker现有管理路径支持状态读取与私有备份探测，恢复须独立演练；运行中拷贝不算一致性快照。不得更改root私有状态目录权限或安装控制器。私有状态/配置/证据均仓库外，公开报告不包含原始身份或凭据。

DH4300Plus SSH Connection refused；当前来源、角色、备份及权限未核实，停止该设备部署，不绕过访问限制。

费用生产控制器保持严格保护。DXP实际0.70起点应完全相等，跨0.69的reasoning修正有明确手动方案及独立含reasoning演练，但不能标记生产费用变化路径可自动部署。未解释差异停止。

## 完成记录

PR [#7](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/7) 已合并，正式源码 `e92d9add64efbb9985fb482880d9d95734354183`。最终候选 `db757817869dbec98ea604828da122b9483ea050` 的 PR 合并验证源码为 `e69c972531fd43a571c51dd30a260b4235c87b12`，它与正式源码的完整 Git tree 已比较相同；正式发布另行构建并验证真实 e92d9add 的 OCI 身份。文档后补不会重建或覆盖固定版本。

### 原生验收

- [完整 NAS、真实 Tokscale 与资源回归 38639265607](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38639265607)：原生 Linux amd64、arm64 各 1564 tests，1556 passed、0 failed、8 skipped。跳过为桌面和 Windows 平台边界，不计为通过；本机 darwin-arm64 为 1553 passed、0 failed、11 skipped。发布辅助 59/59、部署保护 Python 49/49。
- 两架构实际 Docker 中，39 个有效 client/alias ID 和 3 个 fork-only ID 验证通过，Goose 累计/创建日/first-existing 路径/WAL、DSH 和 Linux 10 个采集计费契约通过。新 provider、旧/坏状态、上传中断/取消/重试、重启、独立 Watcher、SQLite revision/错误及严格坏 row 防空上报已执行。
- [冻结及完整恢复矩阵 38639265655](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38639265655)：v0.69.0-01、v0.69.0-02、v0.70.0-01 × 原生 amd64/arm64，六组全部通过。每组分别保存无 reasoning 的 125 Token 控制器演练、1845 Token 的独立 reasoning 解析/实际 Hub 上传、含 reasoning 的 125 Token 人工控制器分支、完整恢复和失败阻止 Agent、Agent-only 连接远端 Hub的证据。
- 含 reasoning 的 v0.69 来源精确费用 0.000485→0.000405 USD，只对应 8 reasoning × 10 USD/M 的重复计价；v0.70 来源保持 0.000405 相等。生产控制器费用差异仍严格拒绝。已审阅手动方案见 COST_VALIDATION_0.71.md；合成 receipt 不作为生产自动恢复证明，compatibleFrom 不代表所有费用变化均可自动部署。
- 固定资源样本 1000 会话、三轮旧/新交替对照、每轮持续 60 秒：amd64 Agent/Watcher/Hub 持续阶段中位最大 RSS 为 167.5/56.2/121.2 MiB，arm64 为 175.1/54.0/123.3 MiB；均通过既有回归门槛。2000 会话归档投影性能断言也通过。该性能harness把三个进程放在同一测试容器，沿用既有1GiB合计护栏；真实Hermes冻结与生产每容器上限仍为512MiB，没有提高生产上限。短 CI soak、合成 parser 输出和 ps 采样不能作为 24 小时生产表现或性能改善证据。

### 正式镜像与发布

[正式发布工作流 38640590947](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38640590947) 的 amd64、arm64、promote 全部通过；[Release](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/tag/v0.71.0-01) 和 release-manifest 已匿名读回。

| 身份 | 摘要 |
|---|---|
| 固定 v0.71.0-01 / latest index | `sha256:209da1db610b38871eb9357f27b6d625c80441ec9853024256190fd4843b585a` |
| linux/amd64 | `sha256:645a432bd97fd1ef8150f386ed9fbe5f91ebfef07f5dc7f4f934dcce6b7d7e5d` |
| linux/arm64 | `sha256:545ffe338483a13acd7a93e833c3d6e784cece25b2ba2fef2dfd4bff394f65c3` |

OCI version/revision、运行环境版本、Git Tag、manifest、固定 index 和两个架构摘要一致；旧 v0.69.0-01、v0.69.0-02、v0.70.0-01 的固定摘要未变。Release 附加了两架构性能、六组冻结/恢复及独立 reasoning 材料。公开发布历史 1484 文件版本检查零发现；本地无关上游参考标签曾包含官方合成 DB，未因此放宽安全规则，而是在干净 NAS 发布历史上重新验证。

上游 v0.71.0 的 19 个 Worker 共享副本、registry 副本和官方声明 core/adapter 哈希均已静态验证一致。NAS 不分发或部署 Worker。NAS 自有 core 为 `sha256:ffd46170d61d827a3250addd283888c6a029f94837ba8c40c7e283b9007f0683`，Node adapter 为 `sha256:f8006cc89e42e5acacf092cf5df07947bffb45d21f9246309f87afaa12e92547`，对应实际 NAS 源闭包，已由 Docker 测试及真实 Hub API 验证。旧客户端可能报告自有 hash 未知或远端较新；协议兼容不以复制官方 hash 冒充 current。

### 实际生产部署

DXP4800 从实际 v0.70.0-01、旧 index `sha256:848d6c0b59c35be8e5d9f69d29d347404f2b2988964c8b4838579e24e8621e64` 升级到本轮固定 v0.71.0-01。真实 Hermes 主库及 profiles 用 backup API 冻结，旧/新在相同配置、network-none、512 MiB 下完整 Token/费用/会话/日期/设备严格相等。

停机一致性状态 tar、原 Compose/env 私有字节副本、旧准确镜像和失败现场已保留；JSON/SQLite、3568 个归档会话、完整历史、所有设备和既有策略保持验证通过。实际完整恢复旧状态和旧镜像的路径也执行并验证。最终成功切换段 38.9 秒，全部受控切换段累计约 104.5 秒，低于所有者批准的每台 5 分钟；原 Compose/env 字节、目录权限、deviceId、Hermes 只读挂载、独立 Watcher=0 与 512 MiB 保持。备份及恢复材料已移入仓库外长期私有目录，真实配置、原始账本和凭据不公开。

部署验证真实 Hub API、gzip SSE 与重连、实际 NAS core/adapter 身份、新 Agent 报告 0.71.0-01、fresh collection/upload 和 Hub receivedAt、独立 Watcher、归档与账本。没有将 running/health 或 release 成功代替业务证据。

两次前置拒绝均按保护流程处理：本机对无 WAL 边车的闭合 WAL-mode SQLite 快照只读校验失败，改为独立临时校验副本，原 tar/备份不改；另一设备的 promptCache.observedAt 实时观测时间刷新导致过度比较，现只排除此字段，Token/费用/会话创建日/持久历史保护全部保留并用反例验证。第二次实际还原旧状态，修正后旧恢复快照和新版快照均通过全部数据保护，再完成最终升级。

DH4300Plus 最终再次尝试 SSH 仍 Connection refused。其角色、版本、目录权限及备份未核实，本轮未停机或更换该设备镜像；访问恢复后先读实际来源再按相应已验证来源执行，不能假定为 0.70，也不能绕过访问限制。

### 剩余边界与停止点

Notion 的 fixture 通过不代表真实账户认证或资格通过；WorkBuddy 官方浏览器登录仍不属于容器能力。Goose/Notion 等来源和账号没有自动启用，真实新凭据、登录及新增挂载须另外确认。旧 Android/Agent 的既有协议保持，新增 provider/双窗口/Goose 展示还需要客户端支持及显式启用的 Agent 数据；Pi/CodeBuddy 共享本地明细不代表 Hub 已提供远端聊天正文接口。

生产跨 0.70 的合法费用修正继续使用审阅手动方案，不能标为自动费用变化路径。当前没有将私有恢复材料安装为生产控制器的 NAS 本地 receipt，也没有新增长期凭据或修改宿主权限。AGENTS.md 已记录所有者后续验收→发布→备份→分阶段部署的维护授权。本轮停止于 DXP 已验收、DH SSH 访问阻塞。
