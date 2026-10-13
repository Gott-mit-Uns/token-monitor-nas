# v0.70.0 NAS 升级交接

日期：2026-10-14（Asia/Shanghai）。本交接记录本轮范围、已核实来源和剩余验收门槛。当前状态为 **candidate adapted / local tests passed / native CI pending / release pending / production deployment pending**；后续只有补充可核验的结果后才能改变各阶段状态。文档存在或候选源码已适配均不表示正式镜像发布成功或 NAS 已部署。

## 精确目标与起点

| 项目 | 身份 |
| --- | --- |
| NAS 仓库 | `https://github.com/Gott-mit-Uns/token-monitor-nas` |
| 上游来源 | `https://github.com/Javis603/token-monitor/releases/tag/v0.70.0` |
| 旧官方 commit | `3f106ae3d4712b26cced8272f0d488eaab0de1e6`（v0.69.0） |
| 新官方 commit | `ac4eeb2c4aea239dd94b67f074c73f69aafc46f8`（v0.70.0 annotated tag 已 peel 核对） |
| 独立升级分支 | `upgrade/upstream-v0.70.0` |
| 独立工作区 | `work/token-monitor-nas-070` |
| NAS 源码起点 | `9d23bed717ded9e850b2035ec55a511aaec9082c`；本地工作区审计开始 clean |
| 最新旧正式版本记录 | `v0.69.0-02` / `ec79dc7bff697ed5568b013578a8ec8d6261e67e` |
| 候选版本 | `v0.70.0-01`；须再次核验远端 tag、Release、固定 GHCR 标签占用 |

旧正式记录的 index digest 为 `sha256:e35fa4c5f050b3944698a96a5ea48e7ee65b4e851ec49c5ddd1271dc02cca4b2`，来源是 `DEPLOYMENT_VALIDATION.md`。它是历史发布身份，不能当成两台 NAS 当前运行镜像的实际摘要，也不能当成这轮实时 GHCR 验证结果。NAS 当前实际版本必须只读核实。

原 `UPGRADE_0.69.md` 以 v0.69.0-01 为标题，但 `VERSIONING.md`、`DEPLOYMENT_VALIDATION.md`、本地标签记载已正式发布 v0.69.0-02。不按文档标题重复开发；已有自动 Release、release-manifest、受控部署控制器及演练逻辑继续复用。源码里存在控制器不证明生产已安装。

## 本轮来源审计与实施边界

完整官方0.69→0.70净差为116个文件、共享运行源码29个；逐路径分类见 [UPSTREAM_0.70_AUDIT.md](UPSTREAM_0.70_AUDIT.md)。本轮上游 `src/agent`、`src/hub` 无净差，Hub和Agent应装载同一 `app/src/shared`、同一新Tokscale pin。不要上游整目录覆盖NAS补丁。

应适配的关键项：

- Tokscale fork 固定为 `fa5f0c13324838d1a988fda317597f9b90da7ad0`，release `token-monitor-fa5f0c13`，npm baseVersion4.18.0。Linux amd64/arm64文件摘要与官方manifest一致；下载结果和实际运行都必须验证。
- Hermes raw reasoning拆分与公共输出回并必须成对合入。原DB output400含reasoning150，新raw output250+reasoning150，public output400、total1650；估算/自定价修正导致费用下降有来源，但Token和历史不能因此丢失。
- Codex plain/压缩/活跃/归档resolver、有限多frame解码、native identity去重、metadata/context/detail兼容；原有headless活动轮询关闭。未授权不新增Codex目录挂载或正文同步。
- T3大量标题单relation查询保留失效/墓碑/别名/旧库fallback；Electron近期会话投影/分组性能不移植至Hub统计。
- SQLite全量流式和stage已由NAS实现；合并上游增量parsed Map staging，补足读取中断可暴露部分catch-up的缺口。cursor异常清理、revision边界、完整archive及并发WAL测试保留。
- DSH精确keepalive模型回退由新fork提供，用六种合成binary契约验证model归属及input2885/output-family25/total2910不变。Cursor后台150000ms与显式1830000ms分开，取消与显式timeout保持。
- CatPaw保留defaultTracked:false且Linux无roots；不得扩大Hermes-only。MiniMax按量余额仅共享options能力、当前Agent没有选择入口；StepFun只在显式配置已有provider后刷新。所有外部账户测试用注入传输，任何新来源/账户访问另行确认。
- shared测试中的Electron混合断言选择性排除，核心行为断言保留；未执行/不适用/平台skip不得算通过。

NAS专项契约必须继续保留：独立轻量Watcher默认 `TOKEN_MONITOR_WATCH_IN_PROCESS=0`；上传总超时/AbortSignal/重试/心跳及失败不推进去重；进程身份健康；Hub坏状态拒绝与写盘失败恢复；safe dictionary/recordTimestamp；双方opt-in Hermes只读标题；有界SSE/gzip、`/windows`节流、隐私撤销即时通知；现有目录、设备身份、过滤规则、端口、Hub目的地及512MiB限制。无架构改造、无旧Windows Adapter、无无关优化。

## 四阶段状态与完成证据

| 阶段 | 当前状态 | 改为完成所需证据 |
| --- | --- | --- |
| 源码 | 差异审计完成，候选适配完成；待最终commit绑定 | 同一上游lock、精确版本、NAS补丁逐项复核、完整diff和最终commit |
| 测试 | 本地suite通过；原生CI/冻结Docker对照pending，旧版0.69报告不复用 | 本轮最终commit的单元/集成/真实Docker、原生amd64与arm64、冻结旧新对照、全状态恢复及性能artifact |
| 镜像/Release | pending | 正式发布commit/tag、双架构候选验证、index及子digest、OCI一致、release-manifest读回、迁移信息与固定tag |
| NAS实际部署 | pending；本轮部署尚未授权 | 两台设备只读来源核验、完整部署报告、所有者明确确认、私有一致性备份、顺序升级及业务验收 |

目标版Release URL、index digest、架构digest、发布commit尚未作为成功结果填写。发布或验证受权限/签名/流程阻碍时停在对应阶段，保留证据和准确限制。

本地本轮NAS suite1296项：1285通过、0失败、11跳过；跳过为5项桌面断言、1项Windows roots、3项Linux本机行为、2项Windows PID行为。SQLite store采用完整上游v0.70等价实现并保留NAS及新官方fault tests，专项42/42通过。CatPawwatch边界已合到轻量watcherPolicy，collector源指纹保持；StepFun续期持久化失败日志改为固定文本以保护敏感异常内容。本地平台结果不代替新镜像两架构Docker实测，最终结果见 [UPGRADE_0.70.md](UPGRADE_0.70.md) 和 [VALIDATION.md](VALIDATION.md)。

## 验证待办

1. 完全相同合成脱敏输入分别运行旧固定镜像和新候选：比较Token各桶、费用、会话ID/数、today/month/alltime/history、deviceId、上传请求以及Hub实际接收。Hermes专项必须有reasoning并覆盖reported cost与估算/自定价，不让无reasoning旧fixture代替修复验证。
2. 执行新共享测试与现有NAS回归。覆盖Hub+Agent、Agent-only连接远端Hub、上传失败/取消/重试/恢复、坏SQLite及iterator异常、Hub写盘失败、gzip SSE慢读/重连、旧JSON及SQLite归档恢复、进程身份/重启健康。
3. 原生Linux amd64与arm64分别运行实际Docker，不用macOS本地或QEMU成功替代另一架构。记录Node/OS/架构、fixture、resource limits、时间窗和skip原因。
4. 同数据、限额、时窗测idle、collection peak、sustained Agent/Watcher/Hub占用和时间；报告实际数字，不因改善愿望调整限制。不宣称生产NAS速度/内存改善，生产尚未测量。
5. `deployment/release-policy.json` 的 `compatibleFrom`只包括本轮实际验证的来源版本；每个来源需冻结旧新数据及完整状态恢复证据。未验证来源移除，不照抄0.69名单。
6. 更新lock、patches、版本/变更/迁移、升级和验证报告；公开安全检查、version check及发布辅助测试完成。固定标签不可覆盖；失败部分发布沿用原digest恢复，不能重建新digest覆盖旧固定版。
7. 提交/推送/PR检查/合并后按现有流程发布；正式manifest必须绑定version、source/tag、index及架构digest、OCI与真实迁移政策，再匿名或有权限读回核验。不只交付latest。

## 发布后生产部署的确认边界

本轮源码、验证、正式发布已获任务授权；**本轮NAS容器重建尚未授权**。Release发布不会自动批准生产部署。发布成功后，只读核验：

| 设备 | 地址 / 预期角色 | 尚须实时核实 |
| --- | --- | --- |
| DXP4800 | `192.168.31.12`，Hub+Agent | 主任务已只读核验当前v0.69.0-01、Hub+Agent健康，未检测到控制器；部署报告仍需绑定实际旧digest、配置/挂载/身份和权限 |
| DH4300Plus | `192.168.31.13`，预期仅Agent连接既有远端Hub | 本轮SSH拒绝，角色/版本/digest、远端Hub、此前目录权限和控制器均未核实；解除只读访问阻碍后重新核查 |

角色与预期不符则停止并澄清。不能安装控制器、递归chmod、修改ACL、配置长期凭据或自动调度来绕过权限问题。连接用已安全配置方式；缺凭据则单独索取，不把值写入输出、文件或Git。

一次性向所有者报告实际目标设备和容器、来源/目标版本及digest、停机影响、私有备份位置、迁移说明、验证顺序、可用回退，再等待明确的本轮确认。不能把旧部署授权、CI演练凭据或已有release记录当本轮生产批准。

## 获确认后的顺序与验收

1. 按真实存储取得一致性私有备份，含必要Compose/配置、Hub/Agent状态及SQLite；需停机时关闭服务后复制完整DB和WAL/SHM。保留旧镜像、原Compose与旧完整状态，备份不进入Git或公开日志。
2. 仅作必要固定镜像更新，不清数据、不执行 `down -v`。先DXP4800 Hub，证明数据和健康后验Agent；该设备验收完成再处理DH4300Plus Agent-only。
3. 验实际fresh collection、上传和Hub接收、deviceId、Token各桶/历史/会话保留、独立Watcher、重启恢复、已有客户端读取、SSE重连与标题隐私。running/health endpoint只是中间证据。
4. 失败保留现场，核实完整状态兼容和备份可恢复后才执行恢复。自动全状态回滚需现有控制器的NAS本地、目标旧新version/digest绑定的有效生产演练receipt；CI临时receipt不可代替。只切旧镜像不是安全回退。
5. 服务已验健康而GitHub补报失败时只补报，不能再次部署。完成后分别报告源码、测试、发布、两台NAS部署结果及失败/未验项目，然后停止。

当前备份位置、控制器receipt、两台新版生产验收记录均未填写，因为本轮尚未执行。已核实的旧运行证据和生产私有路径留在主任务私有记录，不把私有配置目录写入公开仓库；DH4300Plus身份/权限仍未证实。继续者不得将这些空项补成推测的成功结果。
