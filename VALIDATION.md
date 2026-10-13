# Upgrade validation — 2026-09-08

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
