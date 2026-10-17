# NAS 机器版本清单

NAS 只发布 Git tag 和多架构镜像；历史 21 个 GitHub Release 及附件已按所有者要求清理，21 个 Git tag 对象保持不变，镜像未修改。流程见 [NAS_PUBLICATION.md](../NAS_PUBLICATION.md)。

这里只保留审批、源码/镜像绑定及兼容校验仍需的六份 manifest，内容与原发布清单逐字节相同。每份已有 migration、rollback 和 compatibleFrom，不再复制逐版本升级和回退文字；统一操作说明见 [DEPLOYMENT.md](../DEPLOYMENT.md)。删除清单会中断现有校验路径，因此不把仍在使用的文件当成无用资料清空。

| 版本 | 机器清单 |
| --- | --- |
| v0.72.0-02 | [manifest](v0.72.0-02/manifest.json) |
| v0.72.0-01 | [manifest](v0.72.0-01/manifest.json) |
| v0.71.0-02 | [manifest](v0.71.0-02/manifest.json) |
| v0.71.0-01 | [manifest](v0.71.0-01/manifest.json) |
| v0.70.0-01 | [manifest](v0.70.0-01/manifest.json) |
| v0.69.0-02 | [manifest](v0.69.0-02/manifest.json) |

后续版本在原生双架构验证通过后，只追加 `publications/<版本>/manifest.json` 到 [本仓库 nas-publications 分支](https://github.com/Gott-mit-Uns/token-monitor-nas/tree/nas-publications/publications)。该分支仍在首次新发布时创建；读取与审批固定到记录 commit，再核对 Git tag、源码政策和镜像。测试原始记录留在 CI，不作为 Release 附件或提交到该目录。
