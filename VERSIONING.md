# NAS 版本规则

NAS 镜像和 GitHub Release 使用同一个版本号：`v<官方版本>-<两位 NAS 修订号>`。

- 官方基础版本取自 `app/package.json`，必须是完整的三段数字版本，例如 `0.63.1`。
- 每次引入一个新的官方版本，NAS 修订号从 `01` 开始：官方 `v0.63.1` → NAS `v0.63.1-01`；以后官方 `v0.64.1` → NAS `v0.64.1-01`。
- 官方基础不变、仅修改 NAS 封装或补丁时，修订号依次增加：`v0.63.1-02`、`v0.63.1-03`。不可覆盖已发布的固定镜像标签或 Release。
- `nas-version.txt` 是 NAS 发布号的唯一输入；`app/package.json` 保留官方源码版本。Dockerfile 默认构建号必须与 `nas-version.txt` 一致。
- Docker 固定镜像标签、OCI 版本标签、GitHub Release 标签必须完全一致。Hub 上报的 NAS Agent 版本省略开头的 `v`，例如 `0.67.0-01`，桌面端会添加显示前缀。`latest` 只指向最近通过双架构测试的镜像。
- 每次更新同时记录官方 tag 与提交 SHA、NAS 补丁和迁移说明，运行 `node scripts/check-nas-version.js` 与 NAS 测试，再发布。
- 早期 `0.54.1` 等旧标签是历史版本，保留回退用途，不沿用其编号规则。

源码升级时保留 NAS 专用 Docker、健康检查、超时、去重、权限和持久化边界；先在状态副本上验证归档迁移。GitHub 发布不会自动更新 NAS 容器。

Windows Adapter 使用独立仓库 `Gott-mit-Uns/token-monitor-adapter` 与 `adapter-v<版本>`。不要在本仓库提交 Adapter 源码或发布 Adapter EXE，也不要把 Adapter 的版本号用于 NAS 镜像。

历史已发布版本 `v0.69.0-02`，固定标签、Release 和 latest 已由双架构验收后的现有发布流程创建。后续仅文档更新不重建或覆盖这一固定版本；运行时代码变化须增加 NAS 修订号。PR 原生验证不发布镜像或改写已有标签。

`v0.69.0-02` 已正式发布自动 Release 与受控部署能力，源码提交为 `ec79dc7bff697ed5568b013578a8ec8d6261e67e`；生产接入和部署未执行。Release manifest 将版本、固定总/子摘要、OCI版本/源码 SHA、Git Tag 和来源迁移政策绑定。发布失败可恢复草稿，但不覆盖已有固定 Tag或清单。生产部署请求只能选择正式发布且有清单的版本，不将源码分支或 latest作为部署目标。

本轮正式版本为 `v0.70.0-01`，官方 SHA 和实际验收记录见 `upstream-lock.json` / `UPGRADE_0.70.md`。创建候选时已核实该 Tag/Release 未占用。发布仍须最终源码原生双架构验收及固定 digest 推广；正式发布已经原生双架构验证，source `02413928fef06abc99e181f253228e549fb4582f`。`compatibleFrom` 的 v0.69.0-01 与 v0.69.0-02 必须分别完成两架构的冻结数据及完整状态恢复演练，本轮两来源、两架构冻结/完整恢复全部通过；后续未通过的来源应删除，不能照抄旧政策。
