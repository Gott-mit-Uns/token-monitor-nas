# NAS 版本记录

NAS 不再新增 GitHub Release。版本的源码由 Git tag 固定，安装使用记录中的多架构镜像 tag/digest；升级和回退说明跟随清单保存在本仓库。流程见 [NAS_PUBLICATION.md](../NAS_PUBLICATION.md)。测试原始日志及 JSON 放在 CI，不列为下载附件。

## 已有版本迁入记录

以下六份 manifest 从已发布 Release 匿名下载，核验附件 SHA-256、Git tag/源码及源码迁移政策后按原字节保存。原有 Release、tag 和镜像不删除、不改写；这不是重新发布或生产验收。

| 版本 | 清单 | 升级 | 回退 |
| --- | --- | --- | --- |
| v0.72.0-02 | [manifest](v0.72.0-02/manifest.json) | [升级](v0.72.0-02/UPGRADE.md) | [回退](v0.72.0-02/ROLLBACK.md) |
| v0.72.0-01 | [manifest](v0.72.0-01/manifest.json) | [升级](v0.72.0-01/UPGRADE.md) | [回退](v0.72.0-01/ROLLBACK.md) |
| v0.71.0-02 | [manifest](v0.71.0-02/manifest.json) | [升级](v0.71.0-02/UPGRADE.md) | [回退](v0.71.0-02/ROLLBACK.md) |
| v0.71.0-01 | [manifest](v0.71.0-01/manifest.json) | [升级](v0.71.0-01/UPGRADE.md) | [回退](v0.71.0-01/ROLLBACK.md) |
| v0.70.0-01 | [manifest](v0.70.0-01/manifest.json) | [升级](v0.70.0-01/UPGRADE.md) | [回退](v0.70.0-01/ROLLBACK.md) |
| v0.69.0-02 | [manifest](v0.69.0-02/manifest.json) | [升级](v0.69.0-02/UPGRADE.md) | [回退](v0.69.0-02/ROLLBACK.md) |

## 后续版本

新版本在镜像通过原生双架构测试后，将 `manifest.json`、`UPGRADE.md` 和 `ROLLBACK.md` 一起写入 [本仓库 nas-publications 分支](https://github.com/Gott-mit-Uns/token-monitor-nas/tree/nas-publications/publications) 的 `publications/<版本>/`。该分支将在首次新发布时创建。读取和审批固定到记录 commit，不能仅把 main 文档、tag 存在或 latest 更新当成完整发布证明。
