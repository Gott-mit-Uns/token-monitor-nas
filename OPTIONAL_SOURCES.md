# NAS 可选来源配置

两个 NAS Compose 模板默认 `TOKEN_MONITOR_CLIENTS=hermes`、`TOKEN_MONITOR_LIMITS_ENABLED=0`、`TOKEN_MONITOR_WATCH_IN_PROCESS=0`。升级镜像不会自动启用 Goose、Notion 或其他来源；不要因为共享模块已注册某个 provider 就开启全量扫描。仅配置真实存在、由用户明确选择的来源，保留现有调度、独立 Watcher 和内存限制。新增持久凭据或真实登录验证需另行确认。

## 配置生效与隐私

Compose 服务中的 `environment` 优先于 `env_file`。模板已经显式设置的 `TOKEN_MONITOR_CLIENTS` 和 `TOKEN_MONITOR_LIMITS_ENABLED`，必须在实际服务的 `environment` 或经过审阅的 Compose override 中修改；只向 `.env` 添加同名变量不会覆盖它们。`.env` 也不会自动使任意变量进入容器，仍由 `env_file` 或显式 `environment` 传入。修改后需重建对应 Agent；普通 restart 不更新环境配置。

先核对实际固定镜像、设备 ID、完整状态路径和只读源挂载，再修改单一来源。不要用整个桌面 home 或应用配置目录的挂载代替所需文件，也不要将桌面浏览器登录视为 headless 能力。源目录只读，Agent 状态独立可写。SQLite 应挂载包含 DB 及现有 WAL/SHM 的最小目录，不能只挂载 `sessions.db` 漏掉尚未 checkpoint 的记录。只读访问失败时调查来源和 SQLite 状态，不改宿主权限、不开放源目录写入、不把读失败解释成没有历史。

私有配置中保存的认证不得写入命令行、Git、构建参数、公共日志或验收材料。不要直接粘贴完整 `docker compose config`、环境列表或私有状态文件，它们可能展开认证信息。运行核验只报告开关、来源是否存在、健康及脱敏结果。原始用户/工作区标识也不应出现在设备上报或公开材料中。

## Goose 用量

Goose 是用量客户端 `goose`，不是 limits provider。保留 Hermes 并显式增加 Goose 的最小示例如下；将宿主目录改为用户选定的真实 Goose sessions 目录，合并到已有服务，保留原有其他环境、挂载与安全限制：

```yaml
services:
  token-monitor-nas:
    environment:
      TOKEN_MONITOR_CLIENTS: hermes,goose
      GOOSE_PATH_ROOT: /sources/goose
    volumes:
      - /path/to/goose/sessions:/sources/goose/data/sessions:ro
```

`GOOSE_PATH_ROOT` 指容器内路径。此例只暴露 sessions 目录，扫描目标为 `/sources/goose/data/sessions/sessions.db`。不要新建空数据库来制造“已配置”信号，健康状态 `goose-db` 检查的是实际数据库文件。`TOKSCALE_EXTRA_DIRS` 和自定义扫描目录不能代替 Goose 的固定路径规则。

固定扫描器按以下顺序只选择第一份**已存在的文件**，不合并多份数据库，也不会在更早文件为空或解析失败后回退到后面的文件：

1. 非空 `GOOSE_PATH_ROOT` 下的 `data/sessions/sessions.db`。
2. `XDG_DATA_HOME/goose/sessions/sessions.db`；未设置或空白时回退到 `~/.local/share/goose/sessions/sessions.db`。
3. `~/Library/Application Support/goose/sessions/sessions.db`。
4. `~/Library/Application Support/Block/goose/sessions/sessions.db`。
5. `~/.local/share/Block/goose/sessions/sessions.db`。

以上 `~` 是容器的有效 home，模板 `HOME=/config`。NAS 应优先使用明确的绝对 `GOOSE_PATH_ROOT`，避免相对路径和其他目录的同名文件遮蔽目标。不要为原生 Windows 默认目录或旧 macOS 的额外 `data/` 路径添加“已采集”承诺，固定扫描器不直接读取它们。

Watcher 监听选定候选的 DB/WAL 变化；读取 SQLite 自身造成的 SHM 事件被抑制，避免自触发循环。5 分钟兜底采集继续保留。

Goose 当前是累计会话计数，全部用量归属会话创建日；继续旧会话不会获得准确的后续每日调用分布。Token 使用 input + output，cache 已含在 input，推算 reasoning 不能再加一次；费用是固定 Tokscale 的估算，不等于 Goose 保存的累计费用。每个累计会话产生一条记录，界面通用的 `1 call` 不能作为真实调用次数。通过 Goose ACP 同时驱动 Claude Code/Codex 时可能与另一个客户端的采集范围重叠，应选择需要的来源，不能依靠将两份账本叠加来核对。Goose 的远端服务、额度、正文读取不在当前接入范围。

## Notion AI 额度

Notion 使用 limits provider ID `notion`，不加入 `TOKEN_MONITOR_CLIENTS`。它只产生额度窗口，不产生 Token、调用次数或费用。保持已有 Hermes 用量采集，仅在用户明确启用时修改服务：

```yaml
services:
  token-monitor-nas:
    environment:
      TOKEN_MONITOR_LIMITS_ENABLED: "1"
      TOKEN_MONITOR_LIMIT_PROVIDERS: notion
```

`TOKEN_MONITOR_LIMIT_PROVIDERS` 必须使用明确的 provider 白名单；逗号分隔可选择多个，显式空字符串表示不启用任何 provider。省略该变量会采用注册表的所有 provider 默认值，因此不适合作为 NAS 最小启用配置。用量客户端列表与额度白名单相互独立。

Notion headless 读取已有私有环境中的 `TOKEN_MONITOR_NOTION_COOKIE`、`TOKEN_MONITOR_NOTION_WORKSPACE_ID`，分别兼容 `NOTION_COOKIE`、`NOTION_WORKSPACE_ID` 别名；前一组优先。此处仅说明配置项，不提供或采集真实认证。工作区必须是用户明确选择的 workspace UUID（请求中的 `spaceId`），不是页面 ID。没有自动工作区选择、桌面凭据抓取、本地 Notion 应用回退或浏览器登录流程。每个设备为一组明确的 Cookie/工作区配置，不提供多账户管理。

已实现的适配依赖 Notion 内部 `getSpaces` 和 `getCreditRateLimitStatus` 接口，通过已验证的用户与指定工作区组合产生稳定脱敏身份。两者任一不匹配、响应结构未知或资格状态不可识别时返回不可用，不猜测额度。支持的 fixture 表示 6 小时滚动与月账期两个窗口；不把其单位换算成 Token 或货币，也不推算未知重置时间。

目前只完成 fixtures 适配，不能称为真实 Business/Enterprise 账户认证、当前资格或实际限额验收。内部接口没有稳定公开契约，真实认证和新凭据持久化需另行确认。真实验证若获准，只保存脱敏结构和通过/失败，不保存 Cookie、原始用户/工作区标识或完整响应。

## 其他来源及能力边界

其他客户端同样需显式 `TOKEN_MONITOR_CLIENTS` 选择及与固定扫描器一致的最小只读挂载；其他额度来源需 `TOKEN_MONITOR_LIMITS_ENABLED=1`、明确 provider 白名单和已支持的 headless 配置。没有实际来源或有效认证时，不把模块注册、健康进程存在或 fixture 通过视为已完成采集。

WorkBuddy 多账户、桌面官方浏览器登录与刷新凭据持久化不在本轮范围；不导入桌面凭据。Pi/CodeBuddy 的共享明细解析代码存在，不代表 Hub 已提供远端聊天正文/逐轮接口。`TOKEN_MONITOR_SYNC_SESSION_DETAILS_ENABLED` 仅控制逐会话统计条目的上传；`TOKEN_MONITOR_SYNC_SESSION_TITLES` 单独控制标题，关闭与迁移须遵循 [标题清理步骤](DEPLOYMENT.md#标题关闭迁移与卸载)。
