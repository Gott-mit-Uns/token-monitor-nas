# 当前验收记录

维护日期：2026-10-17。仅保留当前有效结论及可追溯CI链接，旧阶段记录保存在Git历史，原始日志/JSON留在CI。费用规则见 [COST_ACCOUNTING.md](COST_ACCOUNTING.md)，生产状态见 [HANDOFF.md](HANDOFF.md)。

## 证据对象与结果

| 对象 | 证据与结论 | 限制 |
| --- | --- | --- |
| 已发布 v0.72.0-02 镜像 | source/tag/OCI为 `0f748427b7c75171d1c2fcaf40c0ef552bfb2f2d`；[发布流水线](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38908457055) 的amd64、原生arm64和推广均成功；[机器清单](publications/v0.72.0-02/manifest.json)绑定index和两个子摘要 | 发布时QEMU仅用于候选构建，两架构的运行验证独立在原生runner执行；不表示生产已更新 |
| 名称补丁的源代码 | 本地NAS 1671项：1660通过、0失败、11既有平台跳过；[最终原生验证](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38905362171)及[六来源恢复演练](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38905362182)通过 | PR合成merge与正式源码的完整tree同为 `bbab1aa9d503bdc14725b3e781b6cc9c740732fb`；原生证据可按树绑定，不冒称同一个提交 |
| 发布方式调整 PR #13 | 代码 `040726779536a347122fe84cb88df2dee6805ac6` 的[原生验证](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38923997527)和[恢复演练](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38923997539)共14项通过，自动审查无发现；已合并 | 不增加版本号，不重建上述固定镜像；首次真实tag触发新流程及专用分支写入未执行 |
| 清理代码 PR #15，文档收敛前 | 代码 `5df2b2bb492bc09bc105865228c4ef491cf55222`：Node发布/审批67项、Python部署59项通过；[原生验证](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38993201357)及[恢复演练](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38993201492)共14项通过，自动审查无发现 | 本表固定到实际已测试提交；随后文档提交的结果见[PR当前检查](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/15/checks)，不移记历史测试 |

## 必须保持的回归边界

- 归档读取、写入、capture或dry-run snapshot失败时，真实Agent入口停止错误用量发布；额度独报和心跳仍保留最后完整用量及历史。见 `app/tests/agent/archivePublication.test.js` 与归档store测试。
- 已知usage/limits producer时间的乱序、重试、重复和重启不重复累计或覆盖较新数据；未来/异常/无时间戳保留明确降级语义，不伪造乱序保证。见 `app/tests/hub/ingressOrdering.test.js`。
- Hub持久化失败回滚内存；损坏状态不初始化为空库；SSE背压、取消和重连释放资源，Windows分时推送和标题撤销保护保留。
- 原生两架构分别跑Tokscale固定二进制、解析/共享契约、NAS全套、固定负载及混合版本测试。旧/新Hub、Agent、客户端八种合成组合与固定统计比较通过；不能把一次构建、模拟器运行或QEMU结果当成全部原生运行。
- 恢复矩阵固定六来源 `v0.69.0-01`、`v0.69.0-02`、`v0.70.0-01`、`v0.71.0-01`、`v0.71.0-02`、`v0.72.0-01` × amd64/arm64，分别执行独立解析/上传、无reasoning控制器、含reasoning人工场景和完整状态恢复。新声明来源必须另行通过，不能照抄兼容列表。
- 发布和部署记录校验tag/源码/OCI/digest、迁移及恢复政策；缺失、损坏、冲突、分支历史不符、无效审批或过期请求均拒绝。只有既有六个版本允许main迁入清单及旧无指针请求，新版缺记录收据拒绝。

## 统计与清理核验

v0.71.0-02→v0.72.0-01的固定Hermes样例保留1845 Token、缓存70/25、2会话、2日期、1设备及USD0.006445；v0.72.0-01→-02仅加名称，不改变统计/费用/格式。跨v0.70的已知reasoning降费按 [费用口径](COST_ACCOUNTING.md) 精确验收，不关闭Token/历史保护。

旧NAS Release已清理，不能再把原Release附件描述为可下载。清理前后21个Git tag对象一致，六个固定镜像digest与原清单一致；六份仓库manifest原字节保持。原始CI记录受保留期约束，不保证永久可下载；本文件仅维护结论、输入边界和CI链接。

文档收敛不改容器运行代码、版本、Docker/Compose、上游锁定或manifest。文档引用、版本及差异检查应在PR提交前通过；最终CI/审查状态以PR实际当前提交为准。

## 未覆盖项

本任务未部署或验收两台生产NAS，未执行其现场备份恢复、真实新增采集或24小时持续运行，也未安装控制程序。真实Android手机、实际Hub局域网/公网/蜂窝链路、OEM后台及真实额度账户不由本仓库合成/原生CI代替。DXP4800和DH4300Plus必须独立验收，详见 [统一部署与回退](DEPLOYMENT.md)。
