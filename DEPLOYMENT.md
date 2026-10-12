# GitHub 发布与 NAS 受控拉取部署

本说明对应 `v0.69.0-02` 开发候选。GitHub 发布、部署请求、NAS 实际部署是三个独立结果。首次安装控制程序、授予状态回报权限、调整生产目录权限及执行生产部署，必须获得所有者明确授权。本次代码和 CI 不安装生产程序。

## 审查结论与设计

保留 `Test and publish NAS image` 的 amd64 构建/测试、原生 arm64 验证、镜像摘要读回与固定版本保护。在推广成功后，自动校验两架构 OCI 版本/源码 SHA、固定 Git Tag、源码版本和迁移政策，先创建草稿 Release，上传并读回不可变 `release-manifest.json` 后正式发布。失败重试可恢复草稿；已有固定 Tag 或清单不同则停止，历史 Release 不被改写。

独立 `Approve controlled NAS deployment` 只接受从 `main` 手动执行 `workflow_dispatch`。按所有者要求，没有额外 GitHub Environment 人工审批；手动选择目标 NAS、当前版本和目标版本并执行，就是批准这一部署请求。推送 main、创建 Release、更新 latest 均不会触发 NAS 控制程序部署。请求记录在 GitHub Deployments，task 为 `nas-pull`，环境名称只用于区分两台 NAS，不启用额外环境审批。请求有 24 小时有效期，版本必须递增，不替换未完成请求。

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

DH4300Plus 当前 Compose 和状态目录存在组/其他用户可写权限，控制程序会拒绝接入。获得授权后应核对 ACL 和实际业务访问，再收紧权限；不能直接递归 chmod 整个 Hermes 或更换设备数据所有者。DXP4800 的配置和状态权限已符合只读审查预期，但控制程序与回报凭据尚未安装。

## 部署顺序及失败边界

1. 核实请求出处：指定仓库、`nas-pull` task、机器人创建者、main 上的指定手动工作流已成功完成、请求未过期、Release 正式发布、清单与批准内容一致、Git Tag 对应同一源码 SHA。拒绝降级或重复请求。
2. 取得本地独占锁。未完成的旧日志、设备 ID/版本不符、未知服务、配置/挂载不符、非 Hermes-only、非独立 Watcher、路径链接或不安全权限均停止。确认有本地回报凭据，无法提供最终 GitHub 结果时不开始部署。
3. 按目标摘要拉取镜像，验证本机架构、OCI 版本和源码 SHA、RepoDigest。记录各旧镜像 ID/摘要并保留本地回滚标签。
4. 停止本项目 Hub 和 Agent，确认已经停止。备份原 Compose、私有 `.env`、完整 Agent 状态和本地 Hub 状态，包括 SQLite WAL/SHM，保留权限和所有者。所有备份与详细验收记录仅存 NAS 本地。
5. 对 root/profile Hermes 数据库作只读 SQLite 快照，在独立状态副本上运行旧、新 Agent dry-run，核对固定数据下会话、Token 和历史。正式 Hermes 数据不被修改。
6. DXP4800 先更新 Hub，Agent 保持停止。验证 Docker 健康、认证 API、SSE 断线重连、已启用时的 Windows gzip，以及历史、设备、标题策略、共享设置和订阅。失败则不开始 Agent 阶段。
7. 更新 Agent，等待本次启动后成功采集和上传、Hub 新鲜接收设备记录及真正的独立 Watcher 子进程。核对 SQLite 完整性、旧会话键、历史与统计。DH4300Plus 跳过本地 Hub 阶段，但必须验收现有远端 Hub 接收结果。
8. 全部验证后 GitHub Deployment 才记为 success；NAS 私有日志记录时间、旧/目标摘要及各阶段结果。queued 表示等待，in_progress 表示执行，均不是成功。状态回报失败会留下待人工核查记录并阻止下一次部署。

中断、验收失败或崩溃均停止后续动作。已经进入停机阶段而没有安全恢复证明时，相关服务保持停止供调查；这是明确的可用性取舍，不会盲目继续或通过提高内存限制掩盖问题。应在维护窗口执行，避免午夜/月初的周期切换干扰严格统计验收。

## 数据迁移和回滚

每个新版本源码中包含 `deployment/release-policy.json`，绑定版本、允许的来源版本、是否涉及状态格式迁移以及恢复说明，并进入不可变 Release 清单。不能因镜像可拉取就推断数据向后兼容。

默认自动回滚关闭。自动回滚必须同时具备：该版本声明支持 `restore-snapshot`、本地 root 只读私有恢复演练凭据有效、来源版本/目标版本/目标摘要和本地配置指纹完全匹配。状态格式迁移没有经过验证的恢复计划时，部署在停机前拒绝。

恢复不是仅换镜像：先停服务，将失败后的状态改名保留，再还原完整停机状态、原 Compose 和 `.env`，使用已经保留的旧镜像 ID 依次启动 Hub/Agent，重新验证旧镜像身份、数据库、历史、独立 Watcher、采集及上传。回滚验证失败则停止并要求人工处理。任何路径都不删除镜像、历史或失败现场。

隔离演练凭据绑定隔离项目路径，不能直接拿 CI 的 `/tmp` 凭据用于生产。生产自动回滚仍须经过额外授权的本地演练和审阅；首次接入默认不配置 `rollbackReceiptFile`。当前 CLI 不提供跳过验证或手工制造有效凭据的捷径。

## 首次接入步骤（尚未执行）

1. 审阅并合并本 PR，通过发布工作流产生新版本和不可变清单。旧 `v0.69.0-01` 没有新清单，因此不能被这个新流程自动批准，原手动回退资料继续保留。
2. 获取所有者对每台 NAS 接入、所需权限调整和部署的明确授权。特别确认 DH4300Plus 路径/ACL、既有调度或第三方镜像更新任务。停止任何会绕过受控流程自动重建这些服务的更新任务须单独列入授权范围。
3. 将经过审阅的 `deployment/nas_pull.py` 和 `verify-state.js` 固定安装到 NAS root 控制的目录。不要从请求或 latest 自动下载并执行控制程序。使用本机 Python 3.9+、现有 Docker Compose v2，不连接外网 Docker API。
4. 分别从 `deployment/DXP4800.example.json`、`DH4300Plus.example.json` 创建私有配置，核实实际路径、设备 ID和服务。配置和本地 GitHub 状态回报凭据 root 所有且 0600，控制目录 0700。凭据只授予此仓库 Deployments 写权限，首次保存通过私有安全渠道，禁止写在命令行、Compose、Git、Actions 日志或本报告中。
5. 本地执行 `python3 /固定安装目录/nas_pull.py --config /私有配置路径 --check`，该检查不更新容器。配置检查也不代表真实部署验收。
6. 授权后用 NAS 现有任务调度器每 5 分钟运行一次上述程序，不添加 SSH 常驻访问或 Docker API。无有效请求时只返回 no-approved-deployment；重复执行由独占锁和私有日志防止重复部署。
7. 从 GitHub Actions 手动执行 `Approve controlled NAS deployment`，指定单台 NAS、实际当前版本和正式目标版本。分台执行：先 DXP4800，再观察并执行 DH4300Plus。等待 NAS 主动拉取和最终状态；不要把工作流成功视为 NAS 成功。

控制程序使用 Docker 权限，具有主机级能力，安装目录、本地配置及其维护者必须可信。此权限由首次接入授权授予，不能把控制程序当成普通低权限用户服务。公开 GitHub Deployment 状态只包含通用验收代码，不回传真实会话、用量、文件、日志或密钥。

## 证据与演练

`Validate controlled deployment` 在原生 amd64 和 arm64 运行发布/请求逻辑测试、控制器失败路径测试，并使用真实 Docker、旧版镜像、新版候选镜像、合成 Hermes SQLite 和独立临时 Compose 演练分阶段升级和全状态回滚。PR 候选镜像不发布，GitHub/Registry 写操作用合成 API 验证；Docker 演练不包含生产 NAS 数据或权限。

完整当前报告见 [DEPLOYMENT_VALIDATION.md](DEPLOYMENT_VALIDATION.md)。正式 Release 提供版本/源 SHA/摘要清单；生产结果可在仓库 Deployments 和 NAS 本地私有 `deployment-<id>.json` 查验。公网 Windows UI、24 小时持续运行及生产恢复演练需另行验收。
