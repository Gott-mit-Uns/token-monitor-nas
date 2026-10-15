# Upgrade validation — 2026-09-08

## v0.72.0-01 代码与原生验收完成（2026-10-16，待合并发布）

固定上游 `126e9a43dcc51d3d7b2609231eac9974ba73bed7`，运行提交 `c37cd3c7d50380aac756bf3f78eb6d1c43981458`。本机1666项1655通过0失败11平台跳过；原生amd64/arm64各1666项1658通过0失败8跳过。两个有效自动审查发现已修复，最终运行提交审查无发现。五来源×两架构冻结/完整恢复、真实固定Tokscale、混合协议8组合/每架构和固定资源基准全部通过；阈值不变，来源/权限/512MiB默认值不变。v71-02→本版1845Token、缓存、reasoning语义、会话/逐日/设备与USD0.006445费用保持；跨v69的已知reasoning修正有精确差异oracle。发布辅助59项、Python部署51项通过。工作流、实际指纹、资源数字和限制见 [HANDOFF_0.72.md](HANDOFF_0.72.md)，详细统计见 [COST_VALIDATION_0.72.md](COST_VALIDATION_0.72.md)。代码与验收完成，不等于正式镜像或Release已发布；生产未部署，两台SSH拒绝，逐台计划见 [DEPLOYMENT_PLAN_0.72.md](DEPLOYMENT_PLAN_0.72.md)。

## 最新 v0.71.0-02 完成记录（2026-10-15）

Agent实际入口6项回归：前版0/6、修复后6/6。本机1570项1559通过0失败11平台跳过；原生amd64/arm64各1570项1562通过0失败8平台跳过。4来源×2架构冻结/完整恢复、reasoning费用保护与性能比较通过。正式镜像与Release匿名读回同一源码；DXP4800已备份并实际升级，真实新上传/3571归档会话完整保持，停机37.67秒；DH SSH拒绝未部署本修订。工作流、摘要及范围见 [HANDOFF_0.71.0-02.md](HANDOFF_0.71.0-02.md)。以下均为前版历史。

## 最新 v0.71.0-01 完成记录（2026-10-15）

原生amd64、arm64各1556通过、0失败、8平台/桌面跳过；真实Tokscale39客户端/别名与3 fork-only、Goose累计/创建日/选择优先级/WAL、DSH及Linux10计费契约通过。三来源×两架构冻结、完整恢复、无reasoning及独立含reasoning人工控制器、Agent-only全部通过；固定1000会话三轮旧/新资源对照通过，2000会话归档投影断言通过。正式发布与真实DXP4800新上传、SSE、独立Watcher、core/adapter及3568归档/完整历史保持验证完成，DH4300Plus SSH阻塞。完整证据与限制见 [HANDOFF_0.71.md](HANDOFF_0.71.md)。下列为历史记录。

Target: DXP4800, existing device ID `Hermes-NAS-4800`.

- Built `token-monitor-hermes-agent:0.54.0-nas.1` successfully on the NAS.
- Ran 19 Agent tests in the built runtime image: all passed.
- Dependency pruning removed 16 packages; npm reported zero known vulnerabilities at build time.
- Old running container baseline: approximately 147 MiB of 512 MiB, 0 restarts.
- Repository visibility verified private; collaborator list contained only the owner.

Deployment completed on 2026-09-08 after the SSH session was restored.
- Consistent state and original configuration/source backup completed before cutover.
- A dry run against the Hermes database, using an independent state copy, succeeded.
- Today, month and all-time token totals matched the old Agent's Hub record exactly.
- The existing Compose path and device ID were retained.
- Hub received version 0.54.0 with Hermes active after cutover.
- Local collection and upload checks both reported ok; Docker health was healthy.
- Restart count was zero. Post-start memory snapshot: 118.4 MiB of 512 MiB, CPU 0%.
  This is a snapshot, not a long-term performance benchmark.
- Old image, original files and state snapshots remain on the NAS for rollback.

The new health command distinguishes successful collection from successful upload.
Upload staleness is reported separately; it does not trigger restart loops while
the Hub is offline. No automatic device deletion is enabled.

## DH4300plus deployment

- Built the same release natively on aarch64; all 19 Agent tests passed.
- Backed up the original configuration, source, state and cutover state under
  `/volume4/docker/token-monitor-backup-20260908`; retained the old image.
- A dry run with an independent state copy matched the old Hub record's today,
  month and all-time token totals exactly.
- Retained `Hermes-NAS-4300`, the NAS-local `.env`, and the original
  `/volume4/docker/token-monitor-hermes-agent/docker-compose.yaml` path.
- Hub received Agent version 0.54.0 with Hermes active after deployment.
- Collection and upload both reported ok; Docker health was healthy with zero restarts.
- Memory snapshots: 70.54 MiB before, 51.34 MiB after, out of 512 MiB; CPU 0%.
  These are point-in-time observations, not a long-term performance benchmark.
- The repository's `docker-compose.4300.yaml` is the volume4 deployment template;
  install it as `docker-compose.yaml` on the NAS to preserve UGREEN project management.

## v0.65.0-01 升级验证

官方基础为 v0.65.0（db325fdf46ea7f7328feeb47a4f2005fe339909f）。本地 NAS 回归测试通过 479 项，新增持续事件最大等待时间、扫描负载保护与吞吐字段相关测试。双架构容器测试由发布工作流在固定版本及 latest 提升前执行。部署结果单独以 NAS 实际镜像版本和采集/上传健康检查确认。

2026-10-03 部署确认：GitHub 发布工作流 37033217902 成功，固定标签及 latest 的 manifest digest 为 `sha256:e0664aee03fa5c21fc0157a274b5db99f637fee1a6e27ebe0755b081e89da4da`。DXP4800 与 DH4300Plus 实际运行版本均为 v0.65.0-01，容器健康且 collection/upload 均为 ok。4800 归档会话 3237 条、旧会话缺失 0；4300 升级前后均为 14 条；归档数据库完整性检查通过。

状态及 Compose 备份存于各部署目录下 `backups/v0.63.1-01-before-0.65.0-01`（4300 完整关闭状态副本为 `state-closed`）。现有设备 ID、持久化挂载、300000ms 兜底周期、60000ms Watch 防抖与只读限制保持原样。新版 Watch 持续事件最大等待边界在该防抖配置下为 60 秒。启动后的内存快照不代表长期占用改善。

## v0.69.0-01 candidate validation — 2026-10-12

Official tag locked to `3f106ae3d4712b26cced8272f0d488eaab0de1e6`; NAS baseline `2fdfbc57dd11fd0838aff2820504da2d2d67fcf3`. Evidence and remaining release/deployment gates are recorded in [UPGRADE_0.69.md](UPGRADE_0.69.md). Historical deployment results above are not verification of this candidate. No production data or NAS was accessed for this upgrade.

Native candidate CI 38195738924 passed at source commit acdad0e7d1e368a515bc67aad94e5ac0e500d421 on Linux amd64 and arm64, Node 22.23.2. Each architecture passed 990/992 NAS tests, with zero failures and two Windows-native platform skips, plus 31 promotion tests. Each architecture also passed all 15 fixed-workload regression gates in three repeats with 60-second soak. See UPGRADE_0.69.md and synthetic-only evidence JSON for complete measurements, source fingerprints and scope. No production deployment or fixed-tag publication occurred.

## v0.70.0-01 candidate — 2026-10-14

Current validation/release/deployment stages are recorded in [UPGRADE_0.70.md](UPGRADE_0.70.md). Historical production results above do not verify the current candidate. Shipping Linux/native Docker checks and production acceptance are separate from local macOS tests.

本轮源码与原生容器/冻结/恢复/性能检查和正式发布已完成，证据见 UPGRADE_0.70.md；生产仍未升级，两台实际部署验收均不计为通过。
