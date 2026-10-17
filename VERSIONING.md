# NAS 版本规则

适用：现有 NAS tag＋镜像＋仓库发布记录方式；核对时间2026-10-17，基线 `caa51169`。发布状态见 [HANDOFF](docs/HANDOFF.md)，本文件不维护版本流水。

NAS 镜像与 Git tag 同号：`v<官方版本>-<两位 NAS 修订号>`。

- 官方基础取 `app/package.json` 的完整三段数字版本；每次新官方基础从修订01起，例如官方0.63.1→NAS v0.63.1-01。
- 官方基础不变、运行时/封装补丁变化时修订递增；普通纯文档后补不重建镜像、不增加修订。固定 tag、镜像、manifest 和旧 Release 不覆盖、不改写。
- `nas-version.txt` 是 NAS 发布号唯一输入；Dockerfile 默认构建号一致，app/package 保留官方版本；上游锁定文件维持准确来源。
- 固定镜像、OCI version、Git tag 和仓库 manifest 版本完全一致；Agent上报省略v，客户端自行显示前缀。latest只能指向通过原生双架构验收并完整记录的镜像，不能充当来源身份。
- 本仓库现行不创建 NAS GitHub Release；历史 Release 保留。新发布要求明确版本 tag、固定镜像、源码政策/两平台OCI及仓库三份记录共同核验，通过后才推广latest，详见 [发布规范](NAS_PUBLICATION.md)。失败沿用已核验同一digest恢复，不能重建不同摘要覆盖固定版。
- 每次升级记录官方 tag/SHA、NAS补丁、迁移/恢复约束；执行 `node scripts/check-nas-version.js`、适用NAS测试，compatibleFrom每个来源都需两架构冻结/完整恢复的实际证据。不能照抄历史名单。
- 早期0.54.1等旧标签保留回退用途，不恢复旧编号。Windows Adapter在独立仓库维护adapter-v*，不得用于NAS镜像。

保持只读挂载、设备身份、持久化、超时、去重和权限边界；状态副本先验迁移与恢复。发布、审批请求、NAS实际部署是三个独立阶段；仅推送main不发布镜像，发布成功不自动更新容器。
