# 统一部署与回退

当前固定版本及生产边界见 [HANDOFF.md](HANDOFF.md)，镜像/代码验收见 [VALIDATION.md](VALIDATION.md)，统计与合法降费的人工复核见 [COST_ACCOUNTING.md](COST_ACCOUNTING.md)。只维护本文，不按版本新增升级/回退说明。

所有者目前自行更新NAS容器；本任务不执行生产部署、不安装控制器、不创建凭据。生产操作、权限调整、控制程序安装和现场恢复演练仍须明确授权。发布、部署批准、设备实际升级与业务验收分别记录，CI或容器running不能代替真实业务验证。

## 通用前置核对

逐台确认当前/目标版本和架构、真实Git tag及源码、固定镜像index/本机子摘要/OCI、仓库manifest、源码迁移政策和已测试来源。manifest中的compatibleFrom必须来自相应原生冻结/恢复验收，不能因镜像可拉取就推断兼容。tag单独存在或latest更新不是完整发布证明；发布过程见 [NAS_PUBLICATION.md](NAS_PUBLICATION.md)。

核对实际设备ID、Hub/Agent角色、配置、只读数据源、目录和权限；模板不能覆盖现有配置。不扩大来源、额度、挂载或权限，不自动停止其他更新任务。维护窗口须涵盖停写、完整备份、冻结比较、分阶段升级及失败恢复。

下表仅为2026-10-12历史只读记录，接入前必须重新核实，不代表当前现场；已有设备ID即使不同也原样保留。

| 项目 | DXP4800 | DH4300Plus |
| --- | --- | --- |
| 历史项目目录 | `/volume1/docker/token-monitor-hermes-agent` | `/volume4/docker/token-monitor-nas` |
| 历史服务 | `token-monitor-hub`、`token-monitor-nas` | `token-monitor-nas` |
| 历史设备ID | `DXP4800` | `DH4300Plus` |
| Agent状态 | 项目下state | 项目下state |
| Hub状态 | 项目下hub-data | 使用既有远端Hub |
| 历史只读Hermes路径 | `/volume1/docker/hermes` | `/volume4/docker/hermes` |

历史曾观察到DH4300Plus部分路径可被组/其他用户写入，不能据此假定当前仍然如此。控制程序会拒绝不安全路径；如需调整ACL/权限，应先核实现有业务并取得授权，不能递归更改Hermes数据权限或绕过访问限制。

## 手工升级顺序

1. 按前置核对逐台记录准确身份，保留旧镜像ID、repo digest及原配置。仅在实际Hub服务显式设置 `TOKEN_MONITOR_HUB_DISPLAY_NAME=DXP4800`；Agent-only不需要，不能改deviceId代替。
2. 停止本项目写入者，确认Hub/Agent停止；备份原Compose、私有环境配置、完整Agent状态/历史/归档SQLite及Hub状态，包括DB/WAL/SHM，保留owner/mode。校验一致性、integrity_check和副本可读性。私有备份及原始用量不进入Git、CI或公开日志。
3. 用SQLite backup API对主库和既有profile生成只读快照，在隔离状态副本上以旧/新准确镜像执行dry-run。固定输入、价格缓存/自定价、时区、设备ID和资源限制，逐项比较Token/缓存/reasoning、费用、session ID/数、创建日期、逐日/period和完整历史。合法费用修正按 [费用口径](COST_ACCOUNTING.md) 另行人工审阅，不关闭统计保护。
4. 先DXP4800 Hub，Agent保持停止。验证镜像身份、健康、鉴权API、SSE断线重连、已启用的Windows分时/gzip、完整设备与历史、标题许可/隐私代次、共享设置和订阅。持久化失败或历史异常即停止，不进入Agent阶段。
5. 再更新同机Agent，确认本次启动后成功采集及上传、Hub真正fresh接收、独立Watcher子进程、SQLite完整性、旧会话键/日期及完整历史；随后验证重试/重连和重启恢复。不得永久停更却仅凭健康标签判成功。
6. DXP4800验收完成后才独立处理DH4300Plus Agent-only，验证既有远端Hub接收结果；不能用另一台NAS的原生或现场结果代替。恢复采集后的真实增长另记，不能掩盖冻结数据减少。

任何差异、断网、归档/SQLite/上传错误、资源回归或访问受阻都停止后续动作，保留现场与备份。跨日/月按窗口验证正常today/month过期，同时保留累计值与完整历史；不能机械要求所有日期窗口只增不减。不可通过加内存、清状态或放宽断言绕过失败。

## 完整状态恢复

回退须使用已保留的旧准确镜像和同一份完整停机快照、原Compose/私有配置及owner/mode。先停服务，将失败后的状态另行保留并保护新增数据，再恢复完整一致性副本，按Hub→Agent启动旧服务并验证旧身份、数据库、归档/历史、独立Watcher、采集及真实上传。不能叠加恢复到变化中的状态、只切旧镜像、删除卷或清空历史，不重建设备身份；恢复失败时停止供调查。

默认自动回滚关闭。只有目标政策允许restore-snapshot，且NAS本地root私有演练receipt绑定实际来源/目标版本、目标源码/digest、旧镜像ID/digest/源码和配置指纹时才可自动恢复。状态迁移缺少完整恢复计划必须在停机前拒绝。CI合成receipt绑定隔离路径，不能移到生产；没有制造或跳过有效恢复证明的捷径。

## 身份迁移与标题撤销

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

## 可选受控部署（未在NAS安装）

此节是既有仓库能力，不是当前已启用的自动更新服务。未来接入须先取得每台设备、权限/任务调度调整及控制程序安装的独立授权；当前所有者的手工更新不依赖它。

审批工作流只接受从main手动执行workflow_dispatch，指定单台NAS、实际来源和目标版本；手动执行是该部署请求的批准，没有额外Environment审批。main/tag/镜像/记录/latest更新均不触发生产部署。请求为GitHub Deployments的nas-pull task，按设备分环境，24小时有效，目标必须递增，不替换未完成请求。

审批先校验仓库manifest、固定镜像、两个OCI和源码版本/政策及Git tag，再固定publicationCommit/publicationBranch。消费者独立验证请求机器人、仓库、成功的指定main手动审批工作流、有效期及部署SHA；确认记录提交属于分支历史，从固定提交读取manifest并重验tag/源码政策。仅六个迁入历史版本可使用main记录或旧无指针请求，新版缺收据拒绝；不接受远端下发脚本、路径或Compose。

本地控制程序只主动HTTPS访问GitHub/GHCR，不开放公网SSH/Docker API/Webhook。接入时固定安装同一受审阅提交的完整deployment程序及其所需验证依赖，不从请求或latest自动下载执行，也不能只复制入口脚本遗漏其配套文件。运行所需Docker权限相当于主机管理能力，维护者及安装路径必须可信。

本地配置和既有状态回报凭据需root所有且0600，控制目录0700；Compose/状态/挂载必须满足现有权限和防链接要求。身份、服务、状态目录、挂载和策略与实际配置不符时拒绝。首次保存凭据仅经私有安全渠道，不写入命令行、Compose、Git、Actions日志或文档。缺少回报能力时不开始部署；本任务不创建这些配置或凭据。

接入前先用同版程序的--check核对配置，使用隔离副本完成恢复演练；--check不是部署验收。经明确授权后可用既有调度器每5分钟主动查询一次，无有效请求不操作；本地独占锁、私有阶段日志与重放保护防止重复部署。升级仍执行本文相同的停写备份、冻结比较、Hub→Agent和真实业务门槛。未知服务、损坏记录、基线不健康、未完成日志或恢复证明不符均停止，不能通过删日志绕过。

控制程序将准确镜像写入私有控制目录的 `image-override.json`，不会改写基础 Compose 文件。此后每次手工重建、修改配置或执行本文中的标题撤销命令，都必须保留基础文件及该 override 的同一组 `-f` 参数；例如 `docker compose -f /实际路径/compose.yml -f /实际控制目录/image-override.json up -d`。只使用基础文件会丢失固定镜像选择，可能重新拉起基础配置中的旧镜像或 `latest`。备份和恢复也必须包含这份 override，并核验合并后的镜像与原准确 digest 一致。

queued/in_progress分别表示等待/执行，只有全部现场验收并成功回读GitHub状态后才是success。NAS私有日志保留准确镜像、阶段及结果；公开状态仅使用通用验收代码，不上传会话、真实用量、文件、日志或敏感信息。

现场已验证但回报暂时失败时保留verified-report-pending，阻止新请求并保持已验收服务；固定程序的--retry-report DEPLOYMENT_ID重新核对运行镜像、配置、健康和数据后，只补报并读回状态，不拉镜像或重建。未完成日志或过期queued须核查现场/备份，再由维护者结束相应GitHub请求，不能把结束请求当作恢复或验收。

旧版控制程序仍依赖已清理的Release，未来启用前必须单独审阅更新。原生CI使用合成GitHub/Registry写接口、真实Docker及隔离状态测试失败恢复；CI成功不能证明生产安装、权限或恢复已验证。完整当前范围见 [VALIDATION.md](VALIDATION.md)。
