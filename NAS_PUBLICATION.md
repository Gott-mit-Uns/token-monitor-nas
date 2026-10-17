# NAS Git tag 与镜像发布

NAS 今后只发布版本 Git tag 与 `ghcr.io/gott-mit-uns/token-monitor-hermes` 多架构镜像，不创建 GitHub Release，不上传 Release 附件。Android 的 Release/APK 发布保持原样。本次流程调整不增加版本号，不重新发布 v0.72.0-02，也不部署生产 NAS。

## 版本记录保存位置

- 已有六个版本的清单按原字节迁入 main 的 `publications/<版本>/manifest.json`，这些机器清单仍供审批与兼容校验使用，保留原字节；迁移和恢复政策已在 manifest 内，不重复生成逐版本说明。统一操作步骤见 [DEPLOYMENT.md](DEPLOYMENT.md)。2026-10-17 已按所有者授权清理 21 个 NAS Release，21 个 Git tag 对象保持不变，镜像未修改。
- 今后的记录由发布流水线写入同一仓库的专用 `nas-publications` 分支，路径仍为 `publications/<版本>/`。该分支在第一份新记录完成时创建，不在本 PR 创建。入口：https://github.com/Gott-mit-Uns/token-monitor-nas/tree/nas-publications/publications 。
- 镜像 digest 在构建后产生，源码 commit 与镜像相互绑定，故不能把包含最终 digest 的文件写回该同一个源码 commit。专用分支保留构建后的记录提交；版本 tag 始终指向实际构建源码，不指向文档提交。
- 每版只追加一份 manifest，通过单个 tree/commit 和非强制 ref 更新保存。脚本拒绝修改任何已记录版本；遇到并发冲突停止，重新读取后安全重试。读者先解析分支为 commit，再从该 commit 读取清单。Git commit 固定内容，仓库权限仍由 GitHub 管理，不宣称拥有权限的管理员无法手动改写分支。

## 发布顺序

1. 按现有规则更新源码、`nas-version.txt`、Docker 默认版本、`deployment/release-policy.json`、补丁与迁移记录；通过 PR 的原生回归、六来源恢复演练及自动审查。
2. 获得发布授权后，在已批准的 main 源码提交创建并推送匹配的版本 tag（`v<上游版本>-<两位修订号>`）。tag push 触发发布，普通 main 或发布记录分支 push 不触发镜像构建。手动重试必须选同一版本 tag；main/manual 无 tag 会在构建前拒绝。
3. CI 保留源码安全检查、发布与控制程序单元测试、amd64 验证；构建多架构候选后，在 amd64 与原生 arm64 上分别执行最终镜像的原生依赖和 NAS 测试。QEMU 只用于候选构建，不能替代原生运行。
4. 按已核验的 index digest 创建固定镜像 tag；不同摘要的已有固定版本拒绝覆盖。此阶段不更新 latest。
5. 校验 Git tag、源码版本/政策、固定 index、两个平台子摘要与 OCI 版本/源码；将该版本 manifest 原子提交到发布记录分支，并完整读回。清单保留版本对应的迁移、允许来源及恢复政策；统一备份、设备身份、Hub→Agent 顺序和逐台验收步骤维护在 DEPLOYMENT.md，不为每版复制。不保存生产状态、凭据或运行数据。
6. 记录成功后才推广 latest，并继续保留“远端 main 已前进时旧任务不得回退 latest”的保护。记录失败时固定镜像可能已存在，但 latest 不变；这属于未完成发布，不能认定可部署。使用同一 tag、源码和已验证 digest 恢复，不能移动 tag、改写固定镜像或降低验收标准。若候选重建生成不同 digest，应停止调查，不能覆盖旧固定版本。

完整发布要求 tag、仓库记录与固定镜像共同核验通过；单独存在的 tag 或镜像不能充当完成证明。既有源码/镜像固定版本不被本次流程变更重建。

## 测试记录与升级

单元日志保存在 Actions 日志/`publication-gate-tests` artifact；既有原生性能、混合版本与冻结/恢复 JSON 保存在各验证工作流的 artifacts。测试原始数据不写入发布记录分支或 GitHub Release。CI artifact 受仓库保留期约束；长期维护所需的简短验收结论和 CI 链接可留在交接文档，不把完整测试输出提交到 Git。

受控部署的审批程序不再访问 NAS Release API：它校验仓库清单、固定镜像、源码政策和 tag 后，把记录提交/分支固定进请求。NAS 消费者验证记录提交的分支历史、读取固定提交文件并重验 tag/源码政策，再沿用原有停写备份、冻结比较、升级和回退保护。旧控制程序需要另行审阅更新才可消费新版本，本 PR 不在 NAS 安装它。

当前所有者自行更新容器；生产仍应逐台确认版本、架构、完整一致性备份与旧准确镜像，先 DXP4800 Hub→Agent，再单独验收 DH4300Plus Agent。不得删卷、清空状态、重建设备身份、自动启用新来源或创建凭据。发布、部署批准、NAS 实际部署是三个独立状态。


## 历史资料清理

旧 GitHub Release 及其附件已删除，Git tag 和镜像保留。机器校验仍依赖的六份 manifest 保留；12 份重复逐版本升级/回退文本、两份过期部署计划、两份旧升级报告及已结束的流程交接删除。历史源码、完整旧文档和旧发布行为可通过 Git 历史查询；仍有维护价值的上游审计、补丁与统计口径记录保留。原始 CI 证据仍受 Actions 保留期限制，不能把已经清理的 Release 附件描述成可下载。
