# 官方源码基线

- 仓库：<https://github.com/Javis603/token-monitor>
- 官方 tag：`v0.66.0`
- 官方提交：`cb2ff6b15761557422246f2ec4d265212c301a0f`
- NAS 发布号：`v0.66.0-01`
- 源码范围：`app/src/shared`、官方 `app/src/agent/agent.js`、`runtime.js`、`seedClients.js`、相关构建脚本和依赖清单；NAS 专用代码在 Agent 包装、Docker、Compose 和发布检查中。

迁移重点：官方新版将 `session-usage-archive.json` 迁至 `session-usage-archive.sqlite`，成功后会移除旧 JSON。部署前须备份整个状态目录；回退到旧镜像时也必须恢复迁移前的状态副本，不能只切换镜像标签。

本次 v0.66.0 升级沿用 SQLite 会话归档；保留 NAS 上传中止信号、去重和健康检查。Tokscale 改为官方 Token Monitor v0.66.0 固定的 fork 构建，按清单校验 SHA256，确保会话/工作区能力与采集器一致。

恢复官方 Tokscale 验证脚本，验证固定构建、客户端能力及 DSH 合成数据解析；验证只读取合成测试数据。

NAS 修订 02：仅在构造上传副本时支持省略逐会话明细，保留汇总及本地归档；上传重试沿用该策略。当时的 DXP4800 模板启用汇总模式，其他部署默认兼容。没有归档迁移。

NAS 修订 03：两个 Compose 模板显式开启会话明细同步，文档与实际部署一致；分离 npm 安装与 Tokscale 验证缓存，限制构建脚本复制范围，并使用命名运行阶段和 `COPY --link`。采集、上传、权限和归档格式不变。

NAS v0.66.0-01：跟进官方采集、定价及依赖更新，恢复官方固定 Tokscale 构建；两个 NAS 模板继续上报完整会话明细，运行设置不变。
