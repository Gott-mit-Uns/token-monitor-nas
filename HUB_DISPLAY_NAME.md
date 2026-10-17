# Hub 显示名称修复

范围：`v0.72.0-02`；代码、正式发布和生产部署是三个独立状态，最终产物以 Release 不可变清单及逐台验收记录为准。

## 合同与配置

Node Hub 服务可配置 `TOKEN_MONITOR_HUB_DISPLAY_NAME=DXP4800`。普通和 Windows 分时入口的鉴权 `GET /api/stats`、SSE 初始完整快照和后续完整统计均包含：

```json
{"hub":{"displayName":"DXP4800"}}
```

名称按配置显式提供，去掉两端空白后最多 80 个 Unicode 码点，拒绝控制、格式字符及孤立代理码点。空值/未配置时省略整个 `hub` 字段；不推断宿主机、容器主机名或采集设备名称。公开 `/api/health` 不增加该字段。鉴权边界、SSE freshness 白名单及旧协议保持不变。

这是显示元数据，不是可认证的 Hub 实例 ID，不用于端点关联、认证、设备去重或计费。旧客户端可忽略字段；新 Android 对旧 Hub 保留现有 DNS/名称未知回退。Android 从已成功接受的权威快照读取，沿用加密快照缓存，离线显示最近名称；full snapshot 缺失名称时清除旧名称，freshness 不得修改名称。不新增请求、轮询或采集源。

生产启用需在实际 Hub 服务配置该变量并更新到包含修复的正式镜像；Agent-only 服务无需配置。不能通过修改 `TOKEN_MONITOR_DEVICE_ID` 替代本项配置。所有者已选择自行更新 NAS 容器；本任务完成发布和产物验证，不执行生产部署。手工更新参考 `DEPLOYMENT.md`，仅在实际 Hub 服务增加上述显示配置，保持其余私有配置、身份和持久化路径；没有完整备份证明时不重建容器，不创建或清空状态。

## 实现与验证

- `app/src/hub/server.js`：显式配置、输入校验和鉴权快照元数据。
- `app/tests/hub/displayName.test.js`：普通/Windows stats 与 SSE、匿名访问隔离、无配置旧行为、非法名称、真实 Node CLI 环境变量入口。
- `app/scripts/nas-hub-build.js --update`：仅追加实际 Node 源码闭包的运行时指纹，共享核心保持实际原值。
- Node 本地全套 NAS、发布脚本测试及 PR 中原生 amd64/arm64 测试分别记录，不能把 macOS 本地测试写成 Linux 原生通过。
- 新增 `v0.72.0-01` 到既有六来源双架构冻结/完整恢复演练矩阵。政策中的来源必须全部通过才可发布，PR 不发布镜像。

Android 相关改动在独立工作区与分支保留，按所有者的联合交付安排交给 Android PR #7 统一测试与审查；本仓库不包含 APK 或 Android 源码。

## 保留与未覆盖

设备 ID、Agent/Hub 数据目录、历史、用量/费用、账号、Watcher 隔离、资源限制、Windows 时段及重试/乱序保护均保持原行为。无存储格式迁移。回退仍按既有完整状态备份流程和旧固定镜像执行，不改写已发布版本。

DXP4800、DH4300Plus 和实体手机未进行本修复的生产验收。只有 Android 与 Hub 均更新且 Hub 明确配置名称后，手机才会显示 `Hub: DXP4800`；仅更新 Android 能修正手机型号，但旧 Hub 仍可能显示名称未知。
