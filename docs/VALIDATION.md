# 当前验收记录

适用：NAS v0.72.0-02；仓库文档基线 `caa51169`。检查时间：2026-10-17（Asia/Shanghai）。来源：基线提交内的 VALIDATION、历次 HANDOFF、费用验收及发布方式交接；历史原文可从 [索引](archive/README.md) 追溯。以下旧结果保留其提交与范围，本次未重跑运行时验收。

## 本次文档治理

范围仅文档、文档检查脚本/测试及检查工作流；不改变运行代码、版本、依赖、锁定文件、Docker/Compose、生产配置或发布机制。`publications/<version>/manifest.json`、`UPGRADE.md`、`ROLLBACK.md` 与基线逐字一致。脚本、链接/锚点、README 授权检查、现有发布/部署单元验证的最终结果在本节更新，不执行大体积镜像构建。

本机已执行：文档链接/锚点、重复命名、封闭归档及 README 依据检查0发现；8项文档检查故障/例外测试通过，Node发布/审批67项通过，Python部署59项通过，NAS版本校验仍为v0.72.0-02，Git差异空白检查通过。使用仓库现有Node工具和Python3.9；不需要安装依赖或镜像构建。另在仅含NAS分支可达历史的干净副本对 `d03162b5` 运行原安全检查，1666个历史文件版本、0发现；共享本地库的无关上游参考refs不进入公开分支。本次后补仅收紧文档重命名和归档检查。新增文档CI在 `eac25922` 的 [38997281395](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38997281395) 实际通过。既有PR触发的产品原生/恢复矩阵因本次为纯文档治理而取消，取消不代表失败或通过，也不改变未来发布门槛；本次未执行新的产品镜像验收。后续提交的文档CI须直接查看PR，未完成不能写通过；本次没有新发布或生产部署。

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

## 当前未覆盖

本次未访问生产。两台设备当前版本/digest/架构、用户手工更新、新上传、真实备份/恢复、24小时持续运行，真实账户、Android 真机和公网 Windows UI/HTTPS/gzip，均不可记为已通过。历史 DXP v0.71 部署不能代替当前证明。下一步与授权边界见 [HANDOFF](HANDOFF.md)。
