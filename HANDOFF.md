# 当前交接

维护日期：2026-10-17。后续直接更新本文件，不按版本新增交接。验收见 [VALIDATION.md](VALIDATION.md)，费用口径见 [COST_ACCOUNTING.md](COST_ACCOUNTING.md)，部署与回退见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 代码与已发布镜像

当前固定 NAS 版本为 `v0.72.0-02`，上游锁定 `v0.72.0` / `126e9a43dcc51d3d7b2609231eac9974ba73bed7`。镜像对应源码 `0f748427b7c75171d1c2fcaf40c0ef552bfb2f2d`，不是随后维护文档或发布脚本的提交。共享核心 revision 84、Node 运行时 revision 8；实际闭包指纹由源码生成，不复制官方 hash。

固定镜像为 `ghcr.io/gott-mit-uns/token-monitor-hermes:v0.72.0-02`，index 为 `sha256:81413b1a4fcb30757f906bc732dcfbfe6883cb27683dffaaad98ea7ced9b8715`。子摘要和迁移政策以 [机器清单](publications/v0.72.0-02/manifest.json) 为准；latest 是可变指针，不是生产目标身份。

已保留 Agent 真实入口的归档失败停止上报、失败后额度/心跳保留最后完整用量、Hub producer 时间排序/去重、SQLite/历史保护、独立 Watcher、资源限制、默认 Hermes-only/额度关闭和 Windows 分时推送。上游移植决策及补丁边界分别维护在 UPSTREAM.md、上游审计和 NAS_PATCHES.md。

## 发布方式与清理状态

[PR #13](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/13) 已合并，NAS 今后只发 Git tag 和多架构镜像。版本 tag 触发发布，固定镜像和仓库记录校验完成后才更新 latest；普通 main 更新不发布。详细流程见 [NAS_PUBLICATION.md](NAS_PUBLICATION.md)。专用发布记录分支在首次新发布时创建，本次未执行新发布或远端记录写入。

按所有者授权，旧 NAS GitHub Release 及附件已清理：删除前后核对21个Git tag ref/对象SHA完全一致，六个保留固定镜像的摘要与原清单一致。六份仍供审批/兼容校验使用的 manifest 原字节保留；升级和回退说明统一维护，不再逐版本复制。原始测试记录留在CI；旧文档可从Git历史查询。

[PR #15](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/15) 包含仓库文件清理及四份文档收敛。收敛前代码提交 `5df2b2bb492bc09bc105865228c4ef491cf55222` 的14项CI和自动审查通过；文档更新后的提交以PR当前检查和审查为准，不能把旧提交通过改称新提交已实跑。本次工作范围到PR测试/审查，不包含合并、发布新版本或生产操作。

## 生产与 Android 边界

所有者明确选择自行更新 NAS 容器，本任务未部署或验收 DXP4800、DH4300Plus 的当前版本、架构、备份或业务状态。此前既有SSH预检均被拒绝；不重试绕过、不安装控制器、不创建凭据，不以一台设备的结果替代另一台。

Hub 名称需在实际 DXP4800 Hub 服务显式配置 `TOKEN_MONITOR_HUB_DISPLAY_NAME=DXP4800`；Agent-only不需要，也不能改设备ID代替。名称只出现在鉴权统计和完整SSE，匿名health不公开；未配置字段省略。Android型号识别及名称缓存已随其独立版本发布，但本任务没有证明Xiaomi真机安装或实际网络显示结果。

未来生产更新须另行明确授权并逐台核实、完整备份、按Hub→Agent顺序操作及验收；回退使用旧准确镜像与完整一致性状态。发布、CI成功和容器running均不能代替真实新上传、历史保留及重启恢复。真机/真实账号、公网及蜂窝网络、24小时生产持续运行和现场恢复仍不在本任务验收范围。
