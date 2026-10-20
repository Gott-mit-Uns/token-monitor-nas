# 当前验收

## v0.76.0-02 历史守卫已发布、DXP4800部署

2026-10-20：基于main `f1c8f77e`，官方仍为v0.76.0。只修改部署核验和修订/验证政策，不改变app源码、依赖、固定parser或持久化格式。daily/monthly按有效唯一日期匹配，允许重排和单调增量；费用仅接受8 ULP且最多1e-12美元尾差，正数归零、非有限数、类型替换和实质费用减少拒绝。派生强度、常用模型及当前连胜允许有效值重算。丢日期/月、客户端/模型/计数回退、会话归档和设备/共享/隐私丢失继续拦截。通用preserved及冻结会计严格相等不变。确认生产者跨日、旧窗口已触达370自然日边界（含稀疏历史）且月份/累计统计保留后，才允许窗口外最老日到期；缺少该证据、窗口内删行、丢月份或累计回退继续拒绝。自动审查指出的tokenIntensity/costIntensity重算和370日到期两个有效问题均先复现、补测试后修正，复审进一步发现的跨时区证据问题已改用生产者IANA时区、窗口结束UTC瞬间和采集时间证明；跨时区、DST以及未来/矛盾边界正反测试通过。审阅进一步区分normalizeHistory的未裁剪累计摘要和mergeHistories的窗口摘要：activeDays/最长连胜/峰值下降仅在已证明窗口到期且新旧值分别精确匹配daily重算时通过；任意归零、错误下降及高于窗口值的累计指标回退仍拦截。最终提交`006beec4`复审无重大问题，原审查项已修复并关闭。

本机部署70项（含11个新增合成测试及其正反子例）、发布辅助67项、文档规则12项通过，文档检查0发现。先加入测试时复现旧比较器失败，修复后通过。新模块对上次DXP4800私有完整快照与当前状态执行只读副本核验，原hub_history_lost场景现通过，归档/历史/许可全部保留；真实数据仅在NAS私有位置，未进入仓库/CI。[PR #25](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/25) 最终26项检查通过并已合并，正式源码`219ab704fdfcde81e889840c3cae13649b792c94`与已审代码一致。[双架构产品/性能](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39447542940)每架构2022项：2009通过、13跳过、0失败；[11来源×双架构冻结/恢复](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39447542934)22组全部通过。本机隔离NAS引用安全检查1891个文件版本、0发现。

[正式发布](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39449014551)三个job成功，annotated tag、三份记录、固定/latest index及两平台OCI源码/版本身份已独立核验；[固定清单](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/c6ec0107381f02e7096472328ec073e509debbb7/publications/v0.76.0-02/manifest.json)，index `sha256:719088855351975f38badadfdec1ae43db98b962f5b99874ca0b641874645160`。没有新建GitHub Release。

DXP4800（192.168.31.12）从v0.76.0-01升级前先暂停两监控服务写入，完整项目归档699197440字节、531个普通文件，独立解包逐项内容SHA256/权限/uid/gid相等，SQLite完整性通过，冻结一份Hermes数据库；旧/新镜像在相同只读冻结来源和独立状态中执行，Token/费用/会话/日期/历史精确相等。备份及核验工具保存在NAS私有备份目录`20261020-v07602`，未上传真实数据。修复模块SHA256 `64c03dfd41e34a7020a4357ae6781b40e7cb861f520cd270ebfc88fec3315451`与正式源码相同，持久保存于该备份目录deployed-tools，实际部署直接使用此模块verify_state并通过；未安装后台控制器。

仅两处Compose镜像改为固定index，完整解析配置除镜像外一致；先Hub后Agent升级。实际amd64 image ID `sha256:32abad8c98c623c751b89295b2f24f139880f34a8bc229026ce57128aaabe487`，两服务源码/版本正确，环境、挂载、设备、安全和每服务512MiB等资源配置与备份前一致。认证API、普通SSE与Windows gzip SSE及各自重连通过，独立Watcher存在。归档完整性/旧会话、全部历史/共享/标题许可由修复后的直接守卫通过。四设备ID保留，DXP累计Token相等，未观察到新增Hermes消费。启动及下一轮五分钟周期上传均已观察，Hub receivedAt由1792510720475推进至1792511023877；两服务healthy、0重启，启动后日志错误指标为0。未访问DH4300plus；生产回滚、24小时、物理客户端UI/公网代理未验收，完整备份读回和合成恢复不能替代实际生产恢复。

## v0.76.0-01 对齐与发布

2026-10-20（Asia/Shanghai）：正式v0.76.0解引用为`fbbe4c1cb04e3277b73499016d432338c1d2ab4e`，NAS起点`31d8c6c1`。[PR #23](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/23) 运行源码`6a495678bd3743c57c616db643f6cca51f64abeb`，合并源码为`9700023b94f366623359cedc59d64c9600b9279b`；合并后的app/Docker/scripts/deployment/workflow与已验收PR一致。9个上游提交、62个路径中3个共享源码和3个共享测试适用；源码无冲突，测试仅末尾空行冲突。依赖与Tokscale pin不变，新增Antigravity三份测试进入NAS执行清单；默认来源、额度、设备、挂载、README不变。

本机完整NAS suite为2022项：2006通过、16平台/桌面跳过、0失败；定向112项、发布辅助67项、部署Python59项、文档规则12项通过，文档检查0发现。首次本地共享refs扫描命中无关上游Qoder合成DB；仅NAS分支可达历史的隔离副本检查1845个文件版本、0发现，CI保持原安全检查。没有删历史引用或放宽安全检查。

- [原生双架构产品/合成性能](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39433954454)成功，每架构2022项：2009通过、13平台/桌面跳过、0失败；固定Tokscale契约、旧/新Hub-Agent兼容及1000会话旧/新各3轮60秒合成性能通过。短合成结果不是长期生产改善证明。
- [十来源×双架构冻结/完整状态恢复](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39433954429)20组全部通过，新增来源v0.75.0-01固定index；保留生产费用差异保护，合成恢复不能代替真实生产快照。
- PR自动代码审查完成，无发现项；24项检查（含PR正文变更后的文档检查）全部成功。[正式发布](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39435315763)三个job成功；固定tag、多架构镜像、三份发布记录及latest推广完成。已独立匿名核对固定/latest index、两个平台digest和OCI版本/源码身份，annotated tag解引用与正式源码一致。
- 正式index为`sha256:072c1d1bb4f8eda509269d6d7b9e06d56fbaaf66fc97b1f4241988831baa4174`；[固定发布清单](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/e17136182b0064360449cf57d4fca7ff14aa0940/publications/v0.76.0-01/manifest.json)绑定两平台身份与升级/恢复政策。此次收尾仅文档，不增加软件版本或覆盖镜像。

### DXP4800 实际部署

所有者本次明确要求先完整备份，仅操作DXP4800，不动DH4300plus。22端口首次拒绝连接，所有者开启SSH后通过现有安全连接访问；没有新增凭据、权限或控制器。现场Hub与Agent均为v0.74.0-01，而非文档中的最新发布v0.75；先核对实际身份、配置及协议。实际额度、项目和标题开关已开启，原样保留，未用模板默认值覆盖。

- 保留旧准确镜像及本地恢复标签，停止监控写入后备份整个实际项目（含原Compose、私有环境配置、完整Hub/Agent状态、SQLite DB/WAL/SHM及项目内已有文件）。最终归档699176960字节、531个普通文件；独立解包后逐项校验内容SHA256、权限、uid/gid，SQLite完整性和Hub JSON可读。最初Python3.14默认解包过滤改变副本元数据，校验失败后两个旧服务恢复运行；随后对自行生成的可信归档显式保留原元数据，重新停写并创建新的完整备份，验证通过才继续。首次失败归档保留，不冒充最终可恢复副本；私有数据及原始日志未上传仓库。
- 从Hermes只读挂载创建SQLite一致性冻结快照，对备份状态的两份独立副本运行旧/新Agent dry-run，网络禁用、只用相同已有价格缓存，逐期Token/缓存/reasoning/费用、会话/日期/历史完全相等。未修改生产Hermes来源，也未放宽差异保护。
- 实际Compose仅两处镜像改为正式index digest，合并配置除镜像外完全相等。先Hub后Agent；两个运行镜像均为amd64、v0.76.0-01/源码`9700023b`，实际image ID为`sha256:ce30e3b3ecaf67ae3255b2d5d81509419f817da1d7036242e61afdfc3bc4afde`。环境指纹（只排除版本变量）、设备身份、挂载读写、512MiB、安全限制和重启策略保持，0重启、均healthy，检查时无fatal/timeout/failed/SQLite异常指标。
- Hub鉴权API、普通SSE及Windows gzip SSE各自重连成功；四设备身份保持，共享设置、订阅与标题许可保留且策略代次不下降。Agent本次启动后的新采集与成功上传、fresh Hub receivedAt和真实独立Watcher通过；旧SQLite会话键/统计、Agent逐日历史及Hub历史和策略的副本核对通过。只读SQLite缺少SHM时需在稳定副本验证，未为核查向生产状态写入辅助文件。
- 最终跨设备复核时，原`verify_state`严格守卫报告`hub_history_lost`，未修改或放宽该生产守卫。独立只读逐字段审阅确认：DXP4800自身历史完全相等，全部设备日期/行及Token桶保留；其他活跃设备正常上报带来当日计数增加，一台相同producer版本设备的receivedAt前进，其旧日DSH/模型费用有4个IEEE浮点尾数下降，最大`4.440892098500626e-16`美元。严格list字典成员比较不能表达正常活跃行更新；非成本字段及计数没有回退，成本下降仅上述4处舍入尾数。归档完整性/旧键、Agent逐日历史、共享设置/订阅/标题许可已先于该守卫失败逐项通过，配置指纹复核仍相等。此为本次人工证据解释，不把严格守卫写成通过，也不更改数据或自动控制器差异策略。
- 下一轮五分钟正常采集上传已观察到，Hub receivedAt由1792505514036推进至1792505816421；累计Token与升级前相等，没有观察到新增Hermes消费，不能把启动上传/心跳写成新增Token验收。没有操作或验收DH4300plus，没有执行生产回滚、24小时观察、物理客户端UI/公网反向代理验收。备份解包校验与CI合成恢复不等于执行了生产恢复。


## v0.75.0-01 已发布

2026-10-20（Asia/Shanghai）：NAS 起点 main `3e7b5b33409b793610338732c35e3af55062cd36`，已发布版本为 v0.74.0-01；已安装桌面端为0.75.0，官方正式 v0.75.0 为 `877fef6002a5fee84aa502fc3454b4f700b55813`。三方合并11个适用共享源码路径，另按实际闭包追加 NAS 自有注册表身份，并更新两个版本清单及七份共享测试文件；保留 NAS 专用 Claude 活动测试。Agent/Hub 入口、依赖、固定 parser、费用及持久化格式无上游差异，README、Compose、设备ID及默认开关保持。

[PR #21](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/21) 最终 head `3de2aa64` 的21项检查通过，自动审查完成且无发现；合并后的正式源码 `23e63652806921a74d7c4f0945ea56ad16cbd44a` 与已验收 PR 的 tree 相同，annotated tag `v0.75.0-01` 指向该源码。

- [原生 amd64/arm64 产品、混合版本与性能](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39287158124) 成功：每架构1910项，1897通过、13平台/Electron跳过、0失败；固定 Tokscale 契约通过。旧/新 Hub 与 Agent 混合验证、1000会话旧/新各三轮60秒合成负载通过，不据此宣称长期生产性能改善。
- [九来源×双原生架构冻结/完整状态恢复](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39287158151) 的18组全部通过，包含 v0.74.0-01 固定 digest；普通与 reasoning 人工路径保留生产差异保护。合成恢复 receipt 不是生产恢复凭据。
- [正式发布运行39288665611](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39288665611) 成功，build_amd64、verify_arm64、promote 三个 job 均成功；最终镜像的两个原生架构运行检查、固定版本、仓库记录写入/读回及 latest 推广完成。记录提交 `e00128282eeed4755ccb5cc9214a0c35675f3bfa` 的 [manifest](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/e00128282eeed4755ccb5cc9214a0c35675f3bfa/publications/v0.75.0-01/manifest.json)、[UPGRADE](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/e00128282eeed4755ccb5cc9214a0c35675f3bfa/publications/v0.75.0-01/UPGRADE.md)、[ROLLBACK](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/e00128282eeed4755ccb5cc9214a0c35675f3bfa/publications/v0.75.0-01/ROLLBACK.md) 均已逐份读回，版本、正式源码及政策一致。未新建 GitHub Release。
- 独立匿名读取 GHCR 的固定 `v0.75.0-01` 与 latest，均为 index `sha256:c92f1ad9ad1e7d6b6f7e6302bcfde64ad4e3b5f2583b2dea0d8821f76e3328e3`；linux/amd64 `sha256:5998812db273897b2491812ae1c00a9f534cbfd457aeb9f90c753f8edb30ca8e`，linux/arm64 `sha256:b7adfc5aee11edc3d8cf89b753a854966bcae5faab11cf2be9f1eaf13088337f`。两个子 manifest 的实际 digest 与记录一致，各架构 OCI config 的版本 `v0.75.0-01` 和源码 `23e63652806921a74d7c4f0945ea56ad16cbd44a` 均已核实；latest 的当前一致性不能代替固定身份。

本机 macOS arm64 / Node24.19.0：发布辅助67/67、部署 Python59/59、文档规则12/12通过，版本/文档检查0发现。首次部署测试因夹具候选v0.74与新增基准相同而失败；夹具候选改为v0.75并保留同版本拒绝测试。首次定向191项：185通过、2失败、4跳过；两项失败引用 NAS 不分发的 Electron 文件。DSH 改为验证实际分发的共享项目汇总、规范化字段及Token（五项通过）；渲染器集成块显式跳过，共享活动断言保持执行。

本机完整 suite 首轮1910项：1893通过、1固定 parser hash不符、16平台/桌面跳过。另建隔离依赖副本，获取 token-monitor-324d5136 的校验锁定 darwin-arm64 fork；SHA256 `9d0f64bec1b564e19afbc93cb152a5aa82c5e2a10fba4a95a3d5bbc789718a10` 与 manifest 一致，原工作区依赖保留。Hermes SQLite Token契约及全量复跑通过：1910项，1894通过、0失败、16跳过。独立审查无P1/P2，另跑90项（86通过、4平台/桌面跳过）。安全检查仅扫描隔离 NAS 分支可达的1818个历史文件版本、0发现；排除无关上游引用，未改扫描规则或历史。本机结果不能替代上述原生 Linux 验收。

本次文档收尾只修改 HANDOFF 与 VALIDATION，继承上述同一正式源码的产品/发布证据，不重复大构建或恢复矩阵。文档检查0发现、文档规则12项及差异空白检查通过；PR最终提交的文档CI和自动审查结果以实际PR为准。本次没有物理设备、生产 NAS、真实账户或24小时验收；没有安装、重启、迁移或部署。发布成功不代表两台 NAS 已运行本版，v0.73现场结果不能代替本版部署/恢复证明。

## v0.74.0-01 已发布

2026-10-19（Asia/Shanghai）：官方正式 tag v0.74.0 解引用为 `cbed5915e294abb4a210f7ebb385e9415f706821`；NAS 起点 main `aed120716e2e844bfbf1c766b17bbb194935f65e`。42 份旧/新上游参考文件逐份核对 Git blob SHA，20 个适用变更文件三方合并无冲突；官方 registry 仅供核对，NAS 自有闭包另算。共享功能定向测试 163 项：162 通过、1 Electron 专用跳过；发布辅助 67、部署 Python 59、文档规则 12 通过，文档检查0发现。默认来源/挂载/设备模板及 README 未改。

本机为 macOS arm64、Node 24.21.0。终端 DNS 无法解析 GitHub，固定 Tokscale 下载失败；本机已有的 npm 4.20.0 二进制 SHA 与固定 fork 不符，不能用它证明 parser 契约。完整 suite 已尝试但遇到沙箱 HTTP 监听/原生文件事件限制，不记通过。下列原生 CI 后续通过；本机完整 suite 的首轮结果为1758项（1691通过、56失败、11跳过），包含沙箱HTTP/ps/原生watch限制及随后修正的NAS测试适配，不能替代最终Linux结果。这些是发布前的本机结果；正式发布证据见下文，生产部署/恢复未在本次核验。

运行源码 `04afb4f2d400c9f1521ae76340733a7bb57247c1` 的 [PR #19](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/19) 验证：

- [原生双架构产品/性能](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39173173470) 全部成功；每架构1777项，1768通过、9平台/桌面跳过、0失败；指定Tokscale fork的发布/全部平台摘要、客户端与真实二进制契约通过。混合旧/新Hub与Agent、1000会话旧/新各3轮60秒合成负载通过；没有据此宣称长期生产性能改善。
- [八来源×双架构冻结/完整状态恢复](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39173173536) 的16组全部成功，包含v0.73.0-01固定index；普通及reasoning人工路径验证保持生产差异保护，不代表生产恢复快照。
- [文档治理](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39173173469) 成功；本地仅NAS可达引用的历史安全检查1740个文件版本、0发现。初次本地克隆带入87个无关上游参考tag，存在官方Qoder测试DB误入扫描范围；已仅清理隔离副本中的无关引用，未改写仓库历史或放宽检查，GitHub干净NAS引用检查通过。
- 上述是 PR 运行源码的既有验收，本次文档核对未重跑产品/性能或恢复矩阵。PR #19 已合并，正式 main/tag/source 为 `14a590313c3e655cca7eac88d7ac18ac0f250042`；该提交的 [文档治理 CI](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39174431668) 成功。
- 2026-10-19 从本机 Mac 通过 GitHub API 重新核对：[正式发布运行 39182258253](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39182258253) 绑定上述正式源码，build_amd64、verify_arm64、promote 三个 job 均成功；最终两架构原生运行验证、固定镜像、三份仓库记录写入/读回及 latest 推广步骤成功。记录分支提交为 `8719db4f95e550f268f97c9fc47cbe12bcf2ebf8`，[manifest](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/8719db4f95e550f268f97c9fc47cbe12bcf2ebf8/publications/v0.74.0-01/manifest.json) 的 version/sourceCommit 与正式 tag 一致；index `sha256:f928d90e8c697d7e872ed1e19f20a93490e378444cfbea0d5b7cb4453ca104d7`，linux/amd64 子摘要 `sha256:ee08b80ee68f376d3ba185e467e6e9fb26b1fd7bfb5c75d2e10c8279ca635189`，linux/arm64 子摘要 `sha256:ec284ed27483e524479572cea59e632add178aa8d0c2822020fec8351cd7c5a8`。本次没有独立拉取 Registry/OCI，也未新建 GitHub Release；实时 Release 列表仅有 v0.73.0-01，不将 Release 页面作为本版发布门槛。
- 本次只修正文档状态，未访问生产 NAS；真实来源增量、24小时、物理客户端、公网代理和逐台备份/部署仍未覆盖。v0.73 的现场证据不代替 v0.74 部署/恢复证明。

本次文档修复本机检查（2026-10-19，macOS arm64、Python 3.9.6）：`python3 scripts/check-docs.py --base origin/main` 0发现；`python3 -m unittest discover -s scripts/tests -p 'test_doc_governance.py' -v` 12项通过；`git diff --check` 通过。人工核对两个文件的最终差异、历史/当前范围、旧 PR 独有信息及发布记录保留边界。没有重跑业务测试、构建镜像或执行生产操作。

### 旧 PR #15 的保留与替代

2026-10-19 审查 [PR #15](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/15) 最终 head `3e3288e6692558a0e86b1be064950c63a4786f06` 的全部变更文件及文档。费用公式、逐项人工复核、恢复/身份/标题/隐私边界已由 [COST_MODEL](COST_MODEL.md)、[DEPLOYMENT](../DEPLOYMENT.md)、当前交接和有限历史索引覆盖；旧归档审计继续保留，不套用该 PR 的历史改写。控制器 override 的后续使用已有部署说明，本次交接补明完整配套依赖和 override 备份/恢复要求。

该 PR 独有的历史清理记录报告：2026-10-17 已删除21个旧 NAS Release及附件，前后21个Git tag ref/对象SHA一致，六个固定镜像digest与原清单一致。这是旧 PR 的执行报告，本次未重新证明当时前后快照，不将其写成当前实测；旧附件不可作为可下载证据，Git历史保留原资料，CI artifacts仍受保留期约束。后续已创建的 v0.73 Release 不在该旧清理范围，本次不删除任何 Release、tag、镜像或恢复记录。

旧 PR 的四入口/引用整理已被当前治理替代；仅保留 manifest 的发布器/消费者改造、README扩写及删除12份逐版本 UPGRADE/ROLLBACK 不移植。旧 PR 的测试/审查仅适用其原提交，不能移记为当前 main 的通过证据。本次以仅修改两个当前文档的 PR 替代，不合并旧 PR；新 PR 的最终检查以其当前提交为准。

## v0.73.0-01 已发布及 DXP4800 验收

检查时间：2026-10-18（Asia/Shanghai）。官方 v0.73.0 / `1190260afdcacd8998938de311e0435c306a18ed`；NAS 正式源码 `61d43212bea55db685e1d52e8346b0d4b253e5c0`。起点 v0.72.0-02，DXP4800 amd64；本次没有连接或部署 DH4300plus。

- [PR #17](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/17) 的 17 项检查通过；自动审阅的历史 audit 指针问题已修复，最新提交复审无新问题。本机 NAS 1732 项：1721 通过、11 平台/桌面跳过、0 失败；发布辅助 67、部署 Python 59、文档规则 12 项通过。
- [原生 amd64/arm64 产品与性能](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39074950743)、[七来源×双架构冻结/完整恢复](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39074950722) 全部成功。性能为 1000 会话、旧/新各三轮 60 秒合成负载，不代表长期生产稳定性或真实恢复能力。
- [正式发布流水线](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/39075567314) 三个 job 成功；最终镜像两架构原生运行验证、固定版本、仓库记录和 latest 推广均完成。本次所有者明确要求，另创建 [正式 Release](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/tag/v0.73.0-01)，不改变未来默认发布方式。清单在 [nas-publications](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/nas-publications/publications/v0.73.0-01/manifest.json)，index `sha256:48edfc344a513cebd8ed59c44f4504a40222c4ba44554d32300e888710daad34`；已从 DXP4800 核对固定 index、两个平台摘要及拉取镜像的源码/version/amd64 身份。
- DXP4800 按本次明确授权跳过备份，先 Hub 后 Agent；两个服务均固定 v0.73.0-01，保持原设备 ID、目录、来源只读挂载、配置、共享设置及每服务 512MiB。均 healthy、0 重启，启动后日志错误计数为 0；SQLite quick_check 正常，归档会话及累计 Token/输出/缓存桶未减少。没有本次快照恢复凭据，不宣称验证了生产回滚。
- 现场只读原始采集对比使用相同价格缓存、scanner 配置及既有 `Etc/UTC` bucketTimezone；源 DB/WAL 在两版读取前后指纹相同。旧月归档汇总高于旧 parser 的直接重算；新版完整扫描将月汇总纠正为新版 parser 输出。新 pin 按调用日志在月份之间重新分配已存在用量，累计 Token 不变，模型估价存在可复现变化。不能以保持旧的偏大月值作为验收，也不能把估价视为服务商账单。
- 新版 today/month/allTime 的 Token 和费用与同配置直接解析相符。历史继续遵守既有保留/冻结账本边界，不能冒充全部按新 parser 重写；160 天 Hub 历史与持久化归档的只读投影逐日核对通过。其他设备历史摘要、四台设备身份和共享设置保持。
- 本机 Agent 启动后真实上传及下一轮周期同步已观察到；普通统计/SSE、Windows gzip SSE 各自重连均返回四设备快照，独立 Watcher 进程存在。观察期没有新增 Hermes 消费用量，不将心跳宣称为新增 Token 验收。24 小时稳定性、物理客户端 UI/公网代理及真实账单仍未验收；DH4300plus 由所有者手动更新。

以下为保留的历史证据，其适用范围不延伸到本版。

# 当前验收记录

适用：NAS v0.72.0-02；仓库文档基线 `caa51169`。检查时间：2026-10-17（Asia/Shanghai）。来源：基线提交内的 VALIDATION、历次 HANDOFF、费用验收及发布方式交接；历史原文可从 [索引](archive/README.md) 追溯。以下旧结果保留其提交与范围，本次未重跑运行时验收。

## 本次文档治理

范围仅文档、文档检查脚本/测试及检查工作流；不改变运行代码、版本、依赖、锁定文件、Docker/Compose、生产配置或发布机制。`publications/<version>/manifest.json`、`UPGRADE.md`、`ROLLBACK.md` 与基线逐字一致。脚本、链接/锚点、README 授权检查、现有发布/部署单元验证的最终结果在本节更新，不执行大体积镜像构建。

本机已执行：文档链接/锚点、重复命名、封闭归档及 README 依据检查0发现；12项文档检查故障/例外测试通过，Node发布/审批67项通过，Python部署59项通过，NAS版本校验仍为v0.72.0-02，Git差异空白检查通过。使用仓库现有Node工具和Python3.9；不需要安装依赖或镜像构建。另在仅含NAS分支可达历史的干净副本对 `d03162b5` 运行原安全检查，1666个历史文件版本、0发现；共享本地库的无关上游参考refs不进入公开分支。自动审查确认归档修改/删除、README重命名及固定记录文件名大小写变体三个绕过问题，故障测试先失败后修复；已补全部固定入口存在性、所有封存审计hash/存在性、无rename折叠的变更检查，以及不区分大小写的固定记录名检查；有效新主题声明仍不能允许第二套当前记录。新增文档CI在 `eac25922` 的 [38997281395](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38997281395) 实际通过。既有PR触发的产品原生/恢复矩阵因本次为纯文档治理而取消，取消不代表失败或通过，也不改变未来发布门槛；本次未执行新的产品镜像验收。后续提交的文档CI须直接查看PR，未完成不能写通过；本次没有新发布或生产部署。

## 沿用的最近运行代码证据

| 范围 | 原提交/时间和证据 | 已记录结果与适用限制 |
|---|---|---|
| v0.72.0-02 名称修复 | 正式源码 `0f748427b7c75171d1c2fcaf40c0ef552bfb2f2d`，2026-10-16；[发布 CI 38908457055](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38908457055) | amd64、原生 arm64 与推广成功；本地 1671 项：1660 通过、0 失败、11 平台跳过；发布辅助 59、部署 Python 51 通过。最终 PR 14 项检查及复审通过。合成 merge `1c995d5ae3ba4af522b2b1247374ff1a7c5e36f8` 与正式源码 tree `bbab1aa9d503bdc14725b3e781b6cc9c740732fb` 相同。此证据不代替当前 PR 检查。 |
| 发布方式调整 | 基线 `caa51169` 包含已合并流程；原记录 HANDOFF_NAS_TAG_PUBLICATION | 本地 Node 发布/审批 67 项、Python 59 项通过；NAS 1671 项中 1660 通过、0 失败、11 跳过；六份迁入 manifest 与旧公开附件及源码政策相同。原记录未填写最终原生 CI/review，不补写已通过；首次新 tag 真发布仍待实际执行。 |
| v0.72.0-01 固定 Hermes | 源码 `8444a9b1f3aeb88e164fd20b9773a9984d3d33a0`；[最终十组恢复 38813996890](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38813996890)、[正式镜像 38818647520](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38818647520) | 两架构各 1666 项：1658 通过、0 失败、8 平台/桌面跳过；五来源×两架构冻结/恢复，旧/新 Hub×Agent 及额度读取 8 组合/架构、1000 会话三轮 60 秒合成性能通过。没有生产 NAS 或 24 小时结果。 |

v0.72.0-02 六来源×两架构冻结/完整恢复在旧记录中报告通过；首轮 v0.72.0-01 来源未登记曾被拒绝，随后固定 digest 并补严格相等验证。当前迁移资格以版本 [manifest](../publications/v0.72.0-02/manifest.json) 和对应源码政策为准，不能照抄其他版本的 compatibleFrom。

## 保留的精确统计对照

以下是 v0.71.0-02 → v0.72.0-01 的旧合成样例，与新名称功能测试分开。两架构输入 SQLite SHA256 `6612960d7a715d90b650667b8f1806f1cac3e6ed3e34d79cb54ac147da425949`，parser commit `fa5f0c13324838d1a988fda317597f9b90da7ad0`，旧/新同架构 binary SHA 相同；network none、512MiB/2CPU、固定合成单价，仅回环 HTTP。

| 指标 | 旧与新（相同） |
|---|---:|
| today / month / allTime Token | 1570 / 1845 / 1845 |
| output（含 reasoning 子集） | 350 |
| cache read / write | 70 / 25 |
| 会话 / 调用 / 日期 / 设备 | 2 / 5 / 2 / 1 |
| today / month / allTime USD | 0.005510 / 0.006445 / 0.006445 |
| 125 Token 含 reasoning 控制器 USD | 0.000405 |

reasoning 共 120（现代100、legacy20），属于 output 子集，不能重复加总。逐日合成记录 2026-06-06：275 Token/USD0.000935；2026-06-07：1570 Token/USD0.005510。Hub 上传保留设备/汇总/today/month 会话与逐日历史，策略省略 allTime 会话明细；本地完整 allTime 会话在上传前另行断言。两设备混合共250 Token，重试/重复不翻倍。

跨 v0.69 reasoning 修正的独立样例及生产手动限制见 [COST_MODEL](COST_MODEL.md#费用差异的部署保护)。性能样本是三进程合计1GiB测试容器，生产每服务512MiB没有提高；短合成 soak、采样 RSS 不证明普遍改善或长期无泄漏。原始数字与旧报告的固定提交链接见 [历史索引](archive/README.md)。

## v0.72.0-02 当时未覆盖

本次未访问生产。两台设备当前版本/digest/架构、用户手工更新、新上传、真实备份/恢复、24小时持续运行，真实账户、Android 真机和公网 Windows UI/HTTPS/gzip，均不可记为已通过。历史 DXP v0.71 部署不能代替当前证明。下一步与授权边界见 [HANDOFF](HANDOFF.md)。
