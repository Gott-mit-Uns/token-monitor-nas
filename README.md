# Token Monitor NAS

基于 [Token Monitor](https://github.com/Javis603/token-monitor) 的 NAS Docker Agent，采集 Hermes 用量并同步到你配置的 Hub。镜像同时提供 Node Hub，支持 `linux/amd64` 和 `linux/arm64`。

当前已发布 [`v0.70.0-01`](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/tag/v0.70.0-01)，对齐官方 v0.70.0。生产可固定 `ghcr.io/gott-mit-uns/token-monitor-hermes:v0.70.0-01`；源码、双架构验收及镜像摘要见 [升级记录](UPGRADE_0.70.md)。发布不会自动升级 NAS。

## 主要功能

- **Hermes 用量采集**：同步用量汇总、模型统计、历史和会话明细，保留本地会话归档。
- **自动同步**：默认每 5 分钟采集，监听文件变化加快更新；对未变化的记录去重，并保留设备心跳。
- **多设备汇总**：通过 Hub 集中接收设备数据，供 Token Monitor 客户端查看。
- **可选标题同步**：默认关闭，开启后同步会话标题，不读取或上传消息正文。
- **Windows 分时推送**：可选 `/windows` 入口，工作时段按 10 分钟、其他时段按 30 分钟推送变化的完整统计；首次连接、重连和手动读取立即获取最新数据。
- **NAS 部署与健康检查**：Hermes 目录只读挂载，状态独立持久化，分别报告采集和上传状态。

## 快速开始

1. 选择 Compose 模板：[DXP4800](docker-compose.yaml) 或 [DH4300 Plus](docker-compose.4300.yaml)，按实际环境调整 Hermes 挂载路径、状态目录和设备 ID。
2. 参考 [.env.example](.env.example) 创建项目目录内的 `.env`，填写 Hub 地址和共享密钥。
3. 启动 Agent：

   ```bash
   docker compose up -d
   ```

模板使用的镜像：

```yaml
image: ghcr.io/gott-mit-uns/token-monitor-hermes:latest
```

生产部署建议使用 [Releases](https://github.com/Gott-mit-Uns/token-monitor-nas/releases) 中的固定版本标签。GitHub 发布不会自动更新 NAS。

检查运行状态：

```bash
docker exec token-monitor-nas node src/agent/nasHealth.js
```

## 可选配置

- **仅同步汇总**：设置 `TOKEN_MONITOR_SYNC_SESSION_DETAILS_ENABLED=0`，保留汇总、历史和本地归档，省略上传的逐会话明细。
- **同步会话标题**：Hub 和上传设备均设置 `TOKEN_MONITOR_SYNC_SESSION_TITLES=1`。
- **启用 NAS Hub**：同一镜像使用 `command: ["node", "src/hub/server.js"]`，配置独立的 `/data` 持久化目录及 Hub 环境变量。
- **Windows 分时接收**：Hub 设置 `TOKEN_MONITOR_WINDOWS_STREAM_ENABLED=1`，客户端 Hub 地址使用 `/windows` 路径。时段按上海时区和中国工作日历判断，工作日 07:00–17:00 使用 10 分钟周期。

修改环境配置后需重建对应服务。Windows EXE Adapter 在独立仓库 [token-monitor-adapter](https://github.com/Gott-mit-Uns/token-monitor-adapter) 维护。

## 更新与数据保护

升级前备份状态目录、Compose 和 `.env`，保留旧镜像；升级时保持设备 ID 和持久化路径。旧 JSON 归档迁移到 SQLite 后，回退旧版需同时恢复迁移前的状态，不能只切换镜像。不要执行 `docker compose down -v`，也不要提交真实密钥或运行数据。

- [部署与更新](DEPLOYMENT.md)
- [升级与回退](UPGRADE_0.70.md)
- [上游来源](UPSTREAM.md) · [NAS 补丁](NAS_PATCHES.md) · [版本规则](VERSIONING.md)
- [数据安全](SECURITY.md)

许可证：[MIT](LICENSE)。
