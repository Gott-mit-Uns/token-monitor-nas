# 当前验收

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
