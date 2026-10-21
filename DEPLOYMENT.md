# GitHub 发布与 NAS 受控拉取部署

当前发布版本为 v0.72.0-02，所有者自行更新容器，本任务未部署或验收生产 NAS。NAS 今后只发 Git tag 和多架构镜像，不再依赖 GitHub Release。版本清单及升级/回退说明保存在仓库，详见 [发布流程](NAS_PUBLICATION.md) 和 [发布记录](publications/README.md)。

以下控制程序是既有可选设计，当前未在 NAS 安装；本次只调整仓库代码，不部署、不安装程序、不创建凭据。首次安装、权限调整及生产部署仍须单独授权。镜像发布、部署请求、实际部署分别验收。

## 审查结论与设计

`Test and publish NAS image` 改为由明确版本 tag 触发；手动重试也必须选择同一个 tag。保留 amd64 和原生 arm64 验证、摘要读回及固定版本保护。先发布/核验固定镜像，将 `manifest.json`、`UPGRADE.md`、`ROLLBACK.md` 原子写入仓库 `nas-publications` 分支的 `publications/<版本>/`，完整读回后才更新 latest。记录与 Git tag、两个 OCI 版本/源码、源码版本和迁移政策必须一致；冲突拒绝覆盖，分支更新失败保持 latest 不变。六个历史版本使用 main 上迁入的原字节清单，不再读取旧 Release API。

独立 `Approve controlled NAS deployment` 只接受从 `main` 手动执行 `workflow_dispatch`。按所有者要求，没有额外 GitHub Environment 人工审批；手动选择目标 NAS、当前版本和目标版本并执行，就是批准这一部署请求。推送 main、创建 Git tag、发布镜像或记录、更新 latest 均不会触发 NAS 控制程序部署。请求记录在 GitHub Deployments，task 为 `nas-pull`，环境名称只用于区分两台 NAS，不启用额外环境审批。请求有 24 小时有效期，版本必须递增，不替换未完成请求。

NAS 本地固定安装经过审阅的 Python 标准库控制程序，每次主动 HTTPS 查询 GitHub，获取已成功执行的指定手动工作流产生的请求。它不接受 GitHub 下发的命令、脚本、路径或 Compose；版本清单只提供校验后的版本、源码 SHA 和镜像摘要。镜像从现有 GHCR 按摘要拉取，无须公网 SSH、Docker API、Webhook 或新的 CI/CD 平台。

## 两台 NAS 的边界

以下是 2026-10-12 只读核实的现有结构。接入时仍须重新核实，不能直接用模板替换生产配置。

| 项目 | DXP4800 | DH4300Plus |
| --- | --- | --- |
| 项目目录 | `/volume1/docker/token-monitor-hermes-agent` | `/volume4/docker/token-monitor-nas` |
| Compose | `docker-compose.yaml` | `docker-compose.yaml` |
| 本地服务 | `token-monitor-hub`、`token-monitor-nas` | `token-monitor-nas` |
| 设备 ID | `DXP4800` | `DH4300Plus` |
| Agent 状态 | 项目下 `state` | 项目下 `state` |
| Hub 状态 | 项目下 `hub-data` | 使用现有远端 Hub，不新增本地 Hub |
| Hermes 只读来源 | `/volume1/docker/hermes` | `/volume4/docker/hermes` |

`.env`、原 Compose、设备 ID、挂载、安全限制及状态目录保留在各自 NAS。控制程序生成仅覆盖镜像的私有 Compose override，验证合并后的有效配置除镜像外完全一致；后续受控重建必须继续使用该 override，不能单独对原 Compose 执行 pull/up 而绕过版本固定。普通容器 restart 不改变镜像。

2026-10-12 的旧审查曾发现 DH4300Plus Compose 和状态目录存在组/其他用户可写权限；现状未重新核实，若仍存在，控制程序会拒绝接入。获得授权后应核对 ACL 和实际业务访问，再收紧权限；不能直接递归 chmod 整个 Hermes 或更换设备数据所有者。DXP4800 的配置和状态权限已符合只读审查预期，但控制程序与回报凭据尚未安装。

## 部署顺序及失败边界

1. 核实请求出处：指定仓库、`nas-pull` task、机器人创建者、main 上的指定手动工作流已成功完成、请求未过期、仓库发布记录完整、清单与批准内容一致、Git tag 对应同一源码 SHA；新请求绑定记录 commit/分支，并验证该 commit 在记录分支的历史中，所有文件从该 commit 读取。拒绝降级或重复请求。
2. 取得本地独占锁。未完成的旧日志、设备 ID/版本不符、未知服务、配置/挂载不符、非 Hermes-only、非独立 Watcher、路径链接或不安全权限均停止。确认有本地回报凭据，无法提供最终 GitHub 结果时不开始部署。
3. 按目标摘要拉取镜像，验证本机架构、OCI 版本和源码 SHA、RepoDigest。记录各旧镜像 ID/摘要并保留本地回滚标签。
4. 停止本项目 Hub 和 Agent，确认已经停止。备份原 Compose、私有 `.env`、完整 Agent 状态和本地 Hub 状态，包括 SQLite WAL/SHM，保留权限和所有者。所有备份与详细验收记录仅存 NAS 本地。
5. 对 root/profile Hermes 数据库作只读 SQLite 快照，在独立状态副本上运行旧、新 Agent dry-run，核对固定数据下会话、Token 和历史。正式 Hermes 数据不被修改。
6. DXP4800 先更新 Hub，Agent 保持停止。验证 Docker 健康、认证 API、SSE 断线重连、已启用时的 Windows gzip，以及历史、设备、标题许可不变、策略代次不下降、共享设置和订阅。正常重启可以推进隐私代次。失败则不开始 Agent 阶段。
7. 更新 Agent，等待本次启动后成功采集和上传、Hub 新鲜接收设备记录及真正的独立 Watcher 子进程。核对 SQLite 完整性、旧会话键、历史与统计。DH4300Plus 跳过本地 Hub 阶段，但必须验收现有远端 Hub 接收结果。
8. 全部验证后 GitHub Deployment 才记为 success；NAS 私有日志记录时间、旧/目标摘要及各阶段结果。queued 表示等待，in_progress 表示执行，均不是成功。回报失败会留下 `verified-report-pending` 并阻止下一次部署，但保留已经验收健康的新版服务运行。使用 `--retry-report DEPLOYMENT_ID` 重新核实运行镜像、配置、健康和数据后，仅补发并读回确认结果，不重新部署。

中断、验收失败或崩溃均停止后续动作。已经进入停机阶段而没有安全恢复证明时，相关服务保持停止供调查；这是明确的可用性取舍，不会盲目继续或通过提高内存限制掩盖问题。应在维护窗口执行；跨日/月时按统计窗口验证，过期 today/month 的正常清理必须同时满足累计统计和完整历史保留。

## 数据迁移和回滚

### 标题关闭、迁移与卸载

此步骤只适用于曾启用标题同步的 Agent。标题默认关闭；逐会话统计开关 `TOKEN_MONITOR_SYNC_SESSION_DETAILS_ENABLED` 不代表上传聊天正文或逐轮内容。标题许可同时受 Hub 开关、发送设备许可及策略代次限制。

删除、移动或重建 Agent 状态目录，以及更换 Hub URL、认证凭据或设备 ID 前，应先停止原 Agent，保留原来的 Hub URL、凭据、设备 ID、完整状态挂载和镜像固定配置，运行一次明确关闭标题的 Agent。以下以模板服务名为例；若生产使用额外 Compose 文件或镜像 override，两条命令必须带上同一组 `-f` 参数：

```sh
docker compose stop token-monitor-nas
docker compose run --rm --no-deps token-monitor-nas node src/agent/agent.js --once --sync-session-titles=false
```

命令从已有私有环境配置取得认证，不把凭据放到命令行。它会正常采集并上传不含标题的用量，不是 dry-run；执行前按维护规则备份。关闭只针对 Agent，不要停止仍需接收撤销请求的旧 Hub。若只是关闭标题，完成后在持久配置中设置 `TOKEN_MONITOR_SYNC_SESSION_TITLES=0`，再重建原 Agent；否则原配置的 `1` 会重新申请标题同步。

Agent 在状态目录内的私有 `agent-sync-credentials.json` 保存旧目标的清理责任及必要认证。模板状态位于 `/config` 下；若指定 `TOKEN_MONITOR_SHARED_DIR`，以该实际共享状态目录为准。保留整个状态目录，不要只拷贝 SQLite 或单独删除这份私有文件。变更目标时程序会重试旧目标，但迁移前主动完成撤销更可靠。

进程正常退出、没有标题出现在新上传中，都不能单独证明旧 Hub 已清理。应私下核验旧设备的撤销响应为 `ok=true`、`enabled=false` 且具有有效正整数 `generation`，私有清理记录无 `active` 或 `pending` 责任，并从旧 Hub 读取该设备确认已存标题被清除。只记录通过/失败，不展示认证、完整清理文件或真实会话标题。出现 `cleanup request(s) pending`、`Private cleanup journal unavailable`、旧 Hub 离线或认证失效时，保留原状态和可恢复备份，处理后重试；不能把删除状态当作清理成功。没有旧状态的历史 Agent，需通过旧 Hub 的认证 `PUT /api/sync/titles/:deviceId` 发送 `{"enabled":false}` 并验证上述响应及存储结果，认证仍从安全渠道读取。

撤销清理的是旧 Hub 当前存储中的会话文字，不删除本地完整用量归档，也不会抹去既有备份或客户端已保存的副本。标题清理完成后才进行身份迁移或卸载；迁移后的身份与状态仍须按正常部署验收。

### Hub 历史保留核验

部署核验按daily的date和monthly的month匹配历史行，允许重排、新增日期及原行计数增加；不能删除旧日期/月、客户端/模型分项或减少任何Token、消息、活动时间等统计。重复/无效日期、类型替换和非有限数字拒绝。费用字段cost/costUsd/totalCost仅容忍最多8个IEEE浮点精度单位且不超过1e-12美元的尾数下降，两条件同时满足；不使用随金额放大的相对误差，不允许正数归零或实质费用减少。行intensity/tokenIntensity/costIntensity、summary.favoriteModel/currentStreak是派生展示，允许有效值重算，但其原日期与底层计数必须保留。生产者跨日/跨月依据其periodWindows时区、日期和UTC endsAt边界及采集时间验证，不套用NAS的北京时间；支持夏令时长短日，未来采集时间、矛盾边界或无效时区不作为过期证据。有生产者元数据时不回退到本地日期；完全无该元数据的旧记录保留旧兼容逻辑。只有生产者today窗口被确认跨日、旧daily已触达默认370个自然日的窗口边界（允许无活动日期缺行）、对应月份及累计Token/费用均保留时，允许默认370天窗口之外的最老日期到期；窗口内日期仍不能丢失，非满窗口不放行，月份与累计统计不得回退。设备summary的activeDays/longestStreak/peakDayTokens通常保持单调；上游mergeHistories也会从裁剪后的daily计算这三项，因此仅在已证明窗口到期且新旧值各自精确等于对应daily重算结果时允许下降。未匹配重算的累计指标和任意归零仍拒绝，月度与累计会计不得下降。旧的按日期键控字典仍支持；未知数组沿用严格保留比较。

此规则仅用于Hub历史核验。SQLite会话归档、Agent日账本、冻结旧/新费用和Token对比、设备身份与共享/标题许可保护不放宽。修复随源码发布，现有可选控制器仍未安装；手工部署使用同一发布源码中的核验模块，不因升级镜像自动安装后台控制器。

### 完整状态恢复

每个新版本源码中包含 `deployment/release-policy.json`，绑定版本、允许的来源版本、是否涉及状态格式迁移以及恢复说明，并进入仓库版本清单；清单同时绑定最终镜像摘要，读取时固定记录 commit。不能因镜像可拉取就推断数据向后兼容。

默认自动回滚关闭。自动回滚必须同时具备：该版本声明支持 `restore-snapshot`、本地 root 私有恢复演练凭据有效，来源版本、目标版本、目标源码与摘要、各旧镜像 ID/摘要/源码和本地配置指纹完全匹配。状态格式迁移没有经过验证的恢复计划时，部署在停机前拒绝。

恢复不是仅换镜像：先停服务，将失败后的状态改名保留，再还原完整停机状态、原 Compose 和 `.env`，使用已经保留的旧镜像 ID 依次启动 Hub/Agent，重新验证旧镜像身份、数据库、历史、独立 Watcher、采集及上传。回滚验证失败则停止并要求人工处理。任何路径都不删除镜像、历史或失败现场。

恢复涉及 Windows 接入路径时，恢复已保存的 Hub 地址和独立 Adapter 配置，避免空客户端覆盖远端共享设置。Hub 启动可规范化空字符串标题，比较解析后的语义，不能用 JSON 字节序列变化推断用量或已授权非空标题丢失；非空标题、计数和历史保护仍必须核对。

隔离演练凭据绑定隔离项目路径，不能直接拿 CI 的 `/tmp` 凭据用于生产。生产自动回滚仍须经过额外授权的本地演练和审阅；首次接入默认不配置 `rollbackReceiptFile`。当前 CLI 不提供跳过验证或手工制造有效凭据的捷径。

## 首次接入步骤（尚未执行）

1. 审阅拟安装的具体控制程序版本及其支持的仓库清单格式。仅选择已有完整仓库发布记录、固定镜像和迁移政策且来源已验收的目标；不要从旧文档推断来源资格，原手动回退资料继续保留。
2. 获取所有者对每台 NAS 接入、所需权限调整和部署的明确授权。特别确认 DH4300Plus 路径/ACL、既有调度或第三方镜像更新任务。停止任何会绕过受控流程自动重建这些服务的更新任务须单独列入授权范围。
3. 将经过审阅的 `deployment/nas_pull.py` 和 `verify-state.js` 固定安装到 NAS root 控制的目录。不要从请求或 latest 自动下载并执行控制程序。使用本机 Python 3.9+、现有 Docker Compose v2，不连接外网 Docker API。
4. 分别从 `deployment/DXP4800.example.json`、`DH4300Plus.example.json` 创建私有配置，核实实际路径、设备 ID和服务。配置和本地 GitHub 状态回报凭据 root 所有且 0600，控制目录 0700。凭据只授予此仓库 Deployments 写权限，首次保存通过私有安全渠道，禁止写在命令行、Compose、Git、Actions 日志或本报告中。
5. 本地执行 `python3 /固定安装目录/nas_pull.py --config /私有配置路径 --check`，该检查不更新容器。配置检查也不代表真实部署验收。
6. 授权后用 NAS 现有任务调度器每 5 分钟运行一次上述程序，不添加 SSH 常驻访问或 Docker API。无有效请求时只返回 no-approved-deployment；重复执行由独占锁和私有日志防止重复部署。
7. 从 GitHub Actions 手动执行 `Approve controlled NAS deployment`，指定单台 NAS、实际当前版本和正式目标版本。分台执行：先 DXP4800，再观察并执行 DH4300Plus。等待 NAS 主动拉取和最终状态；不要把工作流成功视为 NAS 成功。

控制程序使用 Docker 权限，具有主机级能力，安装目录、本地配置及其维护者必须可信。此权限由首次接入授权授予，不能把控制程序当成普通低权限用户服务。公开 GitHub Deployment 状态只包含通用验收代码，不回传真实会话、用量、文件、日志或密钥。

## 回报重试与受阻请求

GitHub 暂时不可用而现场已验收时，用固定本地程序执行 `--config /私有配置路径 --retry-report DEPLOYMENT_ID`。该操作重新检查镜像、配置、健康及数据，只补发并读回确认状态，不拉取镜像、不停止或重建服务。

未完成日志必须先核查现场及备份，不能通过删除日志跳过检查。过期且从未执行的 queued 请求，可在核查后由维护者结束：

```sh
gh api --silent --method POST repos/Gott-mit-Uns/token-monitor-nas/deployments/DEPLOYMENT_ID/statuses -f state=inactive -f description='Expired unexecuted request; reviewed by maintainer' -F auto_inactive=false
```

这只结束 GitHub 请求，不恢复 NAS 数据或容器，不能替代部署或回滚验收。所有命令都从既有私有凭据文件读取认证，不在命令行放令牌。

## 证据与演练

`Validate controlled deployment` 在原生 amd64 和 arm64 运行发布/请求逻辑测试、控制器失败路径测试，并使用真实 Docker、旧版镜像、新版候选镜像、合成 Hermes SQLite 和独立临时 Compose 演练分阶段升级和全状态回滚。PR 候选镜像不发布，GitHub/Registry 写操作用合成 API 验证；Docker 演练不包含生产 NAS 数据或权限。

完整当前报告见 [当前验收](docs/VALIDATION.md)。仓库发布记录提供版本/源 SHA/摘要清单及升级/回退说明；生产结果可在仓库 Deployments 和 NAS 本地私有 `deployment-<id>.json` 查验。公网 Windows UI、24 小时持续运行及生产恢复演练需另行验收。


## 从 Release 清单迁移

已发布的六份清单按原字节迁入 `publications/<版本>/manifest.json`，与原 Git tag、源码版本及迁移政策核对一致；既有 Release 不删除、不改写。新手动请求读取仓库记录并携带 `publicationCommit` / `publicationBranch`；控制程序验证记录提交属于 `nas-publications` 历史，六个历史版本也允许 main 上的迁入记录。旧有效请求没有记录指针时，仅六个历史版本可以从固定的 main 提交读取迁入记录；新版本缺少指针拒绝。原始测试数据不进入记录分支。

旧控制程序仍依赖 Release，因此不能直接处理今后的新版本；若未来明确启用受控部署，应先单独审阅/更新本地控制程序，再批准部署请求。本任务不执行该安装。当前由所有者手工更新容器的流程不依赖控制程序，也不需要 GitHub Release。

## Hub 可选批量保存

v0.77.0 起支持 `TOKEN_MONITOR_PERSIST_INTERVAL_MS` 或直接启动 Hub 时的 `--persistIntervalMs`，有效范围为 0 至 2147483647 毫秒，默认 0 保持同步落盘和失败返回 503。只有显式非零配置才按首个待保存更新的截止时间合批；这种模式下已确认上传可能尚未落盘，断电、SIGKILL 或强制退出会丢失未保存更新。正常 SIGTERM/SIGINT 会拒绝新请求、限时排空已接收请求并刷新待保存数据；最终保存失败以失败退出，不能当作保存成功。订阅、共享设置、标题许可和删除仍立即保存，失败保留原内存/文件。既有 NAS 部署不自动启用批量模式。JSON 仅改为紧凑序列化，格式版本和内容字段不变。
