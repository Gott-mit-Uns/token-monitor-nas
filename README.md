# Token Monitor NAS

基于 [Token Monitor 官方项目](https://github.com/Javis603/token-monitor) 的 NAS Docker Agent，采集 Hermes 用量并同步到自己配置的桌面 Hub。当前官方源码基线是 `v0.68.0`，NAS 发布版本是 `v0.68.0-04`。官方提交及源码范围见 [UPSTREAM.md](UPSTREAM.md)。

Windows EXE Adapter 已迁移到独立公开仓库 [token-monitor-adapter](https://github.com/Gott-mit-Uns/token-monitor-adapter)，包括源码、Windows 构建工作流与历史 `adapter-v*` Release。本仓库维护 NAS Docker Agent 与 Node Hub；Adapter 更新与下载请使用新仓库。

## 镜像、版本与更新

镜像继续使用现有公开的 GHCR 包名，以免已有 NAS 部署的拉取地址失效：

```yaml
image: ghcr.io/gott-mit-uns/token-monitor-hermes:latest
```

`latest` 指向最近一次通过双架构构建和测试的版本；也可以固定到 `ghcr.io/gott-mit-uns/token-monitor-hermes:v0.68.0-04`。支持 `linux/amd64` 与 `linux/arm64`。完整版本规则写在 [VERSIONING.md](VERSIONING.md)：官方版本作为前缀，每次引入新官方版本时 NAS 修订号从 `-01` 开始；同一官方版本上的 NAS 修改递增为 `-02`、`-03`。发布检查会校验版本号、Dockerfile 与官方 `app/package.json` 一致。固定镜像标签不覆盖，GitHub Release 保留 `v` 前缀；Agent 上报省略 `v`，避免桌面显示 `vv`。

仅部署 Agent 时，拉取并重新创建当前服务：

```sh
docker compose pull
docker compose up -d token-monitor-nas
```

同一个 Compose 同时部署 Hub 和 Agent 时，必须一并更新两个服务：

```sh
docker compose pull token-monitor-hub token-monitor-nas
docker compose up -d token-monitor-hub token-monitor-nas
```

GitHub 上发布代码和镜像不会自动替 NAS 拉取镜像。旧的固定标签与提交 SHA 标签保留作回退用途。

## Compose 与设备名称

仓库提供 [DXP4800 模板](docker-compose.yaml) 和 [DH4300plus 模板](docker-compose.4300.yaml)。Compose 项目、服务与容器均名为 `token-monitor-nas`；两个模板继续使用各自原有的状态目录、Hermes 只读挂载和设备 ID。按实际路径调整后，将模板放到 NAS 上的项目目录，`.env` 留在该目录。首次部署可参考 [.env.example](.env.example)，不要提交实际 `.env`。

桌面 Hub 显示的名称由 `TOKEN_MONITOR_DEVICE_ID` 决定。DXP4800 模板为 `DXP4800`，DH4300plus 模板为 `DH4300Plus`。改动设备 ID 后须 `docker compose up -d --force-recreate token-monitor-nas`；Hub 会将新 ID 当成另一台设备，旧记录不会自动合并。普通版本升级不要改这个值。

默认每 5 分钟采集一次，也监听 Hermes 文件变化；文件事件防抖 60 秒。Compose 为 `Asia/Shanghai` 时区，保留 512 MiB 内存上限、只读根文件系统、Hermes 只读挂载、最小能力以及独立状态目录。额度和项目统计默认关闭，历史和会话归档开启。Agent 对未变化的记录去重，并保留心跳；上传总时限默认 30 秒。

NAS 模板启用 `TOKEN_MONITOR_WATCH_IN_PROCESS: "1"`，将少量固定 Hermes 路径的原生文件监听放到采集进程，避免第二个 Node 的固定内存开销；仍保留事件防抖和五分钟周期采集。需要独立监听进程隔离时可设为 `"0"`，该模式同样只加载轻量监听依赖。历史归档、会话明细和标题策略保持原设置。

健康检查按本次 Agent 进程启动标识验证采集与上传时间。重启后首次采集成功前不会沿用旧健康状态，未来时间戳也不会判为正常。

健康检查：

```sh
docker exec token-monitor-nas node src/agent/nasHealth.js
```

输出会分别报告采集和上传状态。Hub 暂时离线时上传状态可能过期；采集停滞才使 Docker 健康检查失败。Docker 不会因健康检查失败自行重启。

## 状态迁移与回退

从 `0.54.1` 升级到本版时，官方会将 `session-usage-archive.json` 迁移到 SQLite，迁移成功后删除旧 JSON。**升级前停止 Agent，备份整个状态目录和 Compose、`.env`，并保留旧镜像。** 回退旧镜像时必须一并恢复迁移前的状态目录，单纯切换镜像标签不足以恢复旧版归档。不要执行 `docker compose down -v`。镜像升级不需要变更现有设备 ID 或移动状态目录。

## 数据与发布边界

GitHub Actions 只构建仓库源码和测试数据，不连接 NAS、不读取本地 `.env`、Hermes 数据库或状态目录。实际运行的 Agent 会读取 NAS 上的 Hermes 只读挂载，并向 `TOKEN_MONITOR_HUB_URL` 指定的 Hub 上传统计。发布前脚本检查常见密钥和运行数据路径；详情见 [SECURITY.md](SECURITY.md)。不要提交凭据和个人运行数据。

许可证：[MIT](LICENSE)。

## 汇总同步模式

`TOKEN_MONITOR_SYNC_SESSION_DETAILS_ENABLED` 默认开启（`1`）。两个 NAS 模板均明确设置为 `1`，同步完整会话明细。仅当用户主动设置为 `0` 时，上传副本才会清空今天、本月逐会话明细，并通过 `sessionDetailsOmitted` 上报省略数量；用量汇总、历史、模型统计及本地会话归档继续保留。上传仍为完整快照，首次新快照会替换 Hub 的旧会话明细。更改后须重建容器；将变量设回 `1` 即可恢复明细同步。

## 构建策略

依赖安装层只依赖 npm 清单；Tokscale 验证层仅复制其入口、辅助模块及固定清单，修改其他脚本不会触发依赖重装。运行阶段通过 `COPY --link` 复制生产依赖。GitHub Actions 使用 GHA 层缓存；不额外引入需要跨临时 runner 持久化的 npm 缓存挂载。继续使用固定摘要的 Debian slim 基础以保持双架构原生依赖兼容。候选镜像分别在原生 amd64 和原生 arm64 Linux 运行器执行完整测试；两者都通过后才发布固定标签及更新 latest。QEMU 仅用于跨架构构建，不用于进程身份或耗时验证。

## NAS Node Hub

镜像也包含同一官方基线的 Node Hub。Hub 服务使用同一镜像，设置 `command: ["node", "src/hub/server.js"]`，保留独立 `/data` 持久化目录和现有 Hub 环境配置。Agent 的默认启动命令不变。可选会话标题同步默认关闭，不上传消息正文。

## 会话标题与 Hub 数据保护

服务器和上传设备分别设置 `TOKEN_MONITOR_SYNC_SESSION_TITLES: "1"` 后，NAS Agent 会按已采集的 Hermes 会话 ID，只读查询主库和已发现的 profile 数据库，补充今天和本月的标题。标题读取失败不阻断用量采集；消息正文不读取或上传。标题只叠加到同步结果，用量计数、采集锚点和本地归档不变。默认仍关闭标题上传。

Hub 只有在数据文件不存在时才初始化空库；文件无法读取、为空、JSON 损坏或结构无效时会保留原文件并拒绝启动，应从验证过的备份恢复。用量写盘失败会回滚内存记录，并向发送端返回 503。

SSE 为每个连接保留最新待发快照及后续的新鲜度事件，缓冲总量上限 8 MiB；阻塞 30 秒仍不能发送时断开连接。客户端重连后获取最新完整快照，不积压中间版本。

## Windows 按工作时段接收

Hub 环境变量 `TOKEN_MONITOR_WINDOWS_STREAM_ENABLED: "1"` 启用 `/windows` 入口，默认关闭。Windows 官方客户端的 Hub 地址填写 `https://YOUR_HUB_HOST:13245/windows`，使用原 Hub 密钥。反向代理保留 `/windows` 路径、认证头和 `Accept-Encoding`，上游仍是原 NAS Hub 端口。完整 SSE 事件需要及时传递，代理不可累计缓冲；Hub 返回 `X-Accel-Buffering: no`。实际公网链路是否支持 gzip 和流式输出，须从客户端验证。

`/windows/api/...` 是现有完整 API 的别名，不重定向、不复制设备库。普通 `/api/...` 继续实时。Windows 完整统计 SSE 按 `Asia/Shanghai` 判断：中国法定工作日（包含调休上班日）的 07:00（含）至 17:00（不含）每 10 分钟，其他时间每 30 分钟；首次连接和重连立即发送最新快照。周期以最近一次完整推送为基准，时间边界重新计算。中间变化合并，有变化才推送。

官方日历在 `app/src/hub/calendars/2026.json`，包含通知来源、假期和调休上班日期。添加下一年文件后，在 `windowsSchedule.js` 的 `CALENDARS` 中登记并验证；每年公布安排后随正常版本更新。运行时不访问日历 API。缺少当年日历时回退为周一至周五工作周，日志和诊断的 `calendarStatus: weekday_fallback` 明确提示；节假日无法准确判断时不停止同步。

每 30 秒发送官方客户端可处理的轻量连接状态和设备在线元数据，防止五分钟兜底完整下载及把正常上报设备误判为过期。在线元数据只更新 Hub 实际接收时间、年龄和过期状态，不修改旧用量时间戳、统计、会话或历史版本。新增设备等待完整快照进入客户端。标题撤销、设备删除、共享设置及订阅修改即时通知，不等待统计周期。接受 gzip 的连接使用持续压缩并逐事件刷新；不接受 gzip 时正常返回未压缩 SSE。

手动 `/windows/api/stats` 读取立即返回最新统计，不重置 SSE 周期；历史、设备详情及其他按需请求保持官方行为。10/30 分钟限制自动完整 SSE，不保证所有下载均遵守同一周期。Windows 本机采集和上传由官方客户端继续控制。

`GET /windows/api/stream/status` 受现有密钥保护，提供当前周期、日历状态、连接压缩状态、完整事件/保活计数、编码后正文大小和按接口类别的请求数。仅在进程内累计，重启归零，不保存 URL 参数、认证头、标题或会话内容。字节数表示交给 HTTP 响应的正文，不含 HTTP/TLS、重传，不作为每字节成功送达的证明。

只更新 Hub 时，先备份实际 Compose、Hub 数据及原镜像，设置开关后只重建 Hub 服务。两台 Agent 无需因此重建。Windows 先备份客户端配置；若有 Adapter，确认待上报已送达后暂停。更换 Hub 地址会改变客户端同步目标身份，需要重新核对标题许可、模型别名、自定义价格和订阅，勿用空的本地配置覆盖远端。直连验收通过后再关闭 Adapter 登录启动，保留原程序和数据作回退。回退可恢复旧 Windows 地址/Adapter，或切回 `v0.68.0-02` Hub 镜像及旧 Compose，保留当前 Hub 数据。
