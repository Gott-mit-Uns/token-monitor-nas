# 有限历史索引

核对时间：2026-10-17（Asia/Shanghai）；来源树 `caa511690e827db518c401b54bf663b4132e04e2`。当前资料只维护 [交接](../HANDOFF.md)、[验收](../VALIDATION.md)、[费用口径](../COST_MODEL.md)。本目录默认封闭，不继续新增逐版/日期过程记录。

## 唯一保留的历史文档

[upstream](upstream/) 下四份审计包含逐路径接管/排除、三方冲突和 strict 归档补强的独有依据；保留是为了后续上游追踪，不代表当前验收，也不复制为当前报告。原日期/提交保留；其中指向旧过程文档的链接固定到原提交。

- [0.69逐路径审计](upstream/UPSTREAM_0.69_AUDIT.md)：141路径及协议/迁移决定。
- [0.70三方审计](upstream/UPSTREAM_0.70_AUDIT.md)：116路径与 parser/reasoning/归档冲突依据。
- [0.71逐路径审计](upstream/UPSTREAM_0.71_AUDIT.md)：148路径的适配/排除。
- [0.71共享三方审计](upstream/UPSTREAM_0.71_SHARED.md)：共享闭包、Watcher、strict单row的独立决定。
当前 [0.72逐路径审计](../../UPSTREAM_0.72_AUDIT.md) 被未改动的 upstream-lock.json 的 audit 字段引用，保留根目录原路径；该机器引用例外不授权新增下一版过程报告。后续若更新上游锁定基线，应核实消费者并用同一权威审计主题取代，不能累加工作区文件。

六份既有 `evidence/` JSON 是独有合成冻结/恢复和资源样本，保留原位置和原字节（旧审计来源链接依赖它们）。不保存后续原始日志/截图，未来使用CI artifacts，现有工作流30天保留；长期需保存的简短结果更新当前验收并绑定提交/CI来源。

`publications/<version>/manifest.json`、`UPGRADE.md`、`ROLLBACK.md` 是真实消费者使用的固定发布/回滚协议，继续保持每版三份及原内容；不属于交接/验收膨胀例外扩展口。

## 已归并普通过程记录的恢复入口

以下已跟踪文件从工作区删除；当前风险、规则、精确费用和未完成事项已并入固定入口。完整旧数字、当时授权与过程可在同一固定源码树读取，不为旧版本再留一套本地文件。

- [原根目录](https://github.com/Gott-mit-Uns/token-monitor-nas/tree/caa511690e827db518c401b54bf663b4132e04e2)：HANDOFF_0.70、HANDOFF_0.71、HANDOFF_0.71.0-02、HANDOFF_0.72、HANDOFF_0.72.0-02、HANDOFF_NAS_TAG_PUBLICATION。
- [旧费用验收](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/caa511690e827db518c401b54bf663b4132e04e2/COST_VALIDATION_0.71.md)、[0.72冻结数字](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/caa511690e827db518c401b54bf663b4132e04e2/COST_VALIDATION_0.72.md)：计费规则进入COST_MODEL，结果进入VALIDATION。
- [旧VALIDATION](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/caa511690e827db518c401b54bf663b4132e04e2/VALIDATION.md)、[旧部署验收](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/caa511690e827db518c401b54bf663b4132e04e2/DEPLOYMENT_VALIDATION.md)：发布与历史生产结果不作当前证明。
- [旧0.69升级](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/caa511690e827db518c401b54bf663b4132e04e2/UPGRADE_0.69.md)、[旧0.70升级](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/caa511690e827db518c401b54bf663b4132e04e2/UPGRADE_0.70.md)：回退规则进入DEPLOYMENT，原始数据/CI数字从历史追溯。
- [旧0.72部署计划](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/caa511690e827db518c401b54bf663b4132e04e2/DEPLOYMENT_PLAN_0.72.md)、[旧0.72.0-02计划](https://github.com/Gott-mit-Uns/token-monitor-nas/blob/caa511690e827db518c401b54bf663b4132e04e2/DEPLOYMENT_PLAN_0.72.0-02.md)：待核实来源、完整备份、分阶段升级和恢复/新数据保护进入HANDOFF及DEPLOYMENT，不继承旧部署授权。

Git正常历史可恢复这些文件；不改写历史、不强推。任何新增不可替代审计/合规/迁移资料，应在PR解释消费者、保留理由及有限范围，经人工审阅后才调整检查；不能直接追加下一版归档。
