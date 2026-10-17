# Token Monitor NAS

基于 [Token Monitor](https://github.com/Javis603/token-monitor) 的 NAS Docker Agent，采集 Hermes 用量并同步到你配置的 Hub。镜像同时提供 Node Hub，支持 `linux/amd64` 和 `linux/arm64`。

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

生产部署建议使用 [仓库发布记录](publications/README.md) 中已核验的固定镜像标签或 digest。Git tag 单独存在不表示镜像发布已完成；仓库记录与镜像核验通过后才可作为目标。发布不会自动更新 NAS。

检查运行状态：

```bash
docker exec token-monitor-nas node src/agent/nasHealth.js
```

## 可选配置

- **仅同步汇总**：设置 `TOKEN_MONITOR_SYNC_SESSION_DETAILS_ENABLED=0`，保留汇总、历史和本地归档，省略上传的逐会话明细。
- **同步会话标题**：Hub 和上传设备均设置 `TOKEN_MONITOR_SYNC_SESSION_TITLES=1`。
- **标题关闭、迁移或卸载**：删除状态或改变 Hub、凭据、设备 ID 前，先保留原身份与原状态完成旧 Hub 的标题撤销，见 [标题清理步骤](DEPLOYMENT.md#身份迁移与标题撤销)。只删除本地状态不会清除旧 Hub 标题。
- **Goose 与可选额度来源**：默认仍为 Hermes-only、limits 关闭。仅对真实存在且明确启用的来源配置只读挂载和 provider 白名单，见 [可选来源配置](OPTIONAL_SOURCES.md)。Compose 的 `environment` 优先于 `env_file`，仅向 `.env` 添加同名变量不会覆盖模板中的关闭开关。
- **启用 NAS Hub**：同一镜像使用 `command: ["node", "src/hub/server.js"]`，配置独立的 `/data` 持久化目录及 Hub 环境变量。
- **Hub 显示名称**：在 Hub 服务设置 `TOKEN_MONITOR_HUB_DISPLAY_NAME=DXP4800`，客户端可从鉴权统计/SSE 快照的 `hub.displayName` 读取。Agent-only 服务无需设置；这不改变设备 ID。名称最长 80 个 Unicode 码点，拒绝控制/格式字符；未配置时省略字段，不猜测容器或采集设备名称。公开健康接口不返回此名称。
- **Windows 分时接收**：Hub 设置 `TOKEN_MONITOR_WINDOWS_STREAM_ENABLED=1`，客户端 Hub 地址使用 `/windows` 路径。时段按上海时区和中国工作日历判断，工作日 07:00–17:00 使用 10 分钟周期。

修改环境配置后需重建对应服务。Windows EXE Adapter 在独立仓库 [token-monitor-adapter](https://github.com/Gott-mit-Uns/token-monitor-adapter) 维护。

## 更新与数据保护

升级前备份状态目录、Compose 和 `.env`，保留旧镜像；升级时保持设备 ID 和持久化路径。旧 JSON 归档迁移到 SQLite 后，回退旧版需同时恢复迁移前的状态，不能只切换镜像。不要执行 `docker compose down -v`，也不要提交真实密钥或运行数据。

- [统一部署与回退](DEPLOYMENT.md)
- [上游来源](UPSTREAM.md) · [NAS 补丁](NAS_PATCHES.md) · [版本规则](VERSIONING.md)
- [数据安全](SECURITY.md)

## 长期维护记录

| 文档 | 用途 |
| --- | --- |
| [当前验收](VALIDATION.md) | 当前镜像/代码的实际结果、CI和未覆盖项 |
| [费用口径](COST_ACCOUNTING.md) | Token/reasoning/费用定义、合法差异及人工复核 |
| [当前交接](HANDOFF.md) | 源码、发布与生产的当前状态及后续边界 |
| [统一部署与回退](DEPLOYMENT.md) | 逐台核对、备份、升级顺序及完整恢复 |

以上四类直接更新原文件，不按版本增加一套记录；历史过程从Git查询，原始测试记录留在CI。上游审计、配置说明和机器校验清单仍按各自用途维护。

许可证：[MIT](LICENSE)。
