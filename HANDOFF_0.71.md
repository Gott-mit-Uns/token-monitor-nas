# v0.71.0 NAS 升级交接

日期：2026-10-15（Asia/Shanghai）。当前候选源码已适配，本地/原生验收、镜像发布与生产部署结果分别在后续完成记录补录；文档存在不代表完成。

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

待后续实际结果补录源码commit、测试数量/跳过、原生工作流、冻结/恢复/性能artifact、固定镜像index/子digest、OCI/tag/manifest、真实生产备份恢复与fresh upload结果。
