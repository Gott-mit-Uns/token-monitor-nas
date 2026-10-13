# v0.70.0-01 upgrade, release and deployment record

Status: source adapted, native tests passed, formal v0.70.0-01 image/Release published and independently verified. Production deployment remains pending explicit owner confirmation; DH4300Plus inventory is deferred by the owner. Date: 2026-10-14 (Asia/Shanghai). This document must be updated with final commit/run/digest evidence before claiming a completed stage.

## Provenance and scope

Official v0.70.0 commit: `ac4eeb2c4aea239dd94b67f074c73f69aafc46f8`; old official v0.69.0: `3f106ae3d4712b26cced8272f0d488eaab0de1e6`. Current formal NAS release v0.69.0-02: `ec79dc7bff697ed5568b013578a8ec8d6261e67e`; starting main `9d23bed717ded9e850b2035ec55a511aaec9082c` adds README only. Original checkout was clean and is preserved; upgrade branch/worktree is isolated. No open upgrade PR or occupied v0.70.0-01 tag/release was found at baseline review.

See [full path audit](UPSTREAM_0.70_AUDIT.md), [patch contract](NAS_PATCHES.md), [upstream lock](upstream-lock.json) and [handoff](HANDOFF_0.70.md). Hermes reasoning, Codex compressed/archive records, DSH model attribution, shared title lookup and atomic streamed SQLite catch-up are included. Optional MiniMax/StepFun/Cursor provider fixes do not enable external accounts. CatPaw stays opt-in, with no Linux source. Electron/renderer/Dock/Windows Adapter/Worker are excluded. Hub, Agent and shared use one official baseline.

## Validation so far

Local macOS arm64, Node 24.19.0 (shipping containers use Node 22 on Linux): 1,296 NAS tests, 1,285 passed, 0 failed, 11 skipped. Skips include platform/Worker and explicitly excluded desktop-only assertions; they are not counted as passing. SQLite 42/42, release/request 59/59, controller/frozen-guard 41/41 passed. Fixed Darwin parser checksum/version/client validation succeeded; DSH and 10 applicable real-parser contracts passed, including corrected Hermes reasoning and compressed Codex/DSH models. These results do not replace native amd64/arm64 Docker checks.

Native candidate CI executed the required gates: version/safety, Compose, fixed Tokscale release/client/parser tests, full NAS suite, repeated fixed-workload performance, both Hub+Agent and Agent-only remote-Hub deployments, per-source whole-state backup/recovery, exact frozen old/new parser-to-Hub comparison. Upload timeout/cancel/retry/dedup, corrupt SQLite/cursor release, Hub corrupt state/write failure, SSE reconnect/gzip/backpressure, process identity and old-state recovery retain regression assertions.

Local frozen old/new real-parser + shared + loopback Hub comparison also passed on the same read-only synthetic SQLite: 1,845 Tokens, two sessions and two historical days, unchanged bytes and device ID, successful upload plus exact Hub readback. Total estimated cost changed from $0.007645 to $0.006445: reduction $0.0012 equals 120 reasoning Tokens × $10 per million. Public output stays 350 and total Tokens stay 1,845; cache-read 70 and cache-write 25 are unchanged. Evidence: [local-frozen-hermes.json](evidence/upstream-v0.70.0/local-frozen-hermes.json). This is macOS arm64 evidence, not native Linux acceptance or production measurement.

## Migration and corrected costs

No mandatory archive schema or Hub JSON migration. Optional fields remain backward compatible; source device IDs, histories and token buckets must be preserved. Hermes reasoning is charged once by the pinned parser and folded into public output once by Node normalization; a decreased estimated cost is valid only with exact frozen token/session/history preservation and an explicit arithmetic explanation. Codex parser cache 12→15 triggers one reparse if explicitly enabled. Optional StepFun account key becomes refresh-half based and stable across access renewal. No accounts are enabled or credentials copied.

`compatibleFrom` is restricted to versions actually tested by native per-source frozen comparison and full-state restore. Published policy lists v0.69.0-01 and v0.69.0-02; both source gates independently passed on both native architectures. Future source-policy entries must be gated the same way.

## Performance evidence

Native same-machine old/new runs completed (results below): 1,000 synthetic sessions, same limits and sample windows, three repeats, idle/collection peak/60-second sustained phases. Record Agent, independent Watcher and Hub separately, including fixture/source fingerprints and resource limits. No production NAS performance or speed improvement is claimed. No memory-limit changes are included.

## Publication gate

Completed; exact provenance and independent verification are recorded below. Merge only final-source native passing PR; then verify formal publish workflow, fixed v0.70.0-01, both platform digests/OCI labels/source commit, Git tag and read-back release-manifest migration policy. Preserve old tags. Publish does not deploy production.

## Production deployment and rollback gate

Not authorized for this round. Read-only inventory and the final private device-specific plan must precede owner confirmation. Do not install controllers, alter ACL/modes, add credentials/schedules or recreate containers as part of publication. Device-specific details and backups remain private, outside this public repository.

After explicit confirmation: obtain consistent closed whole-state/config backup including SQLite WAL/SHM, verify restored copies, retain old images/config. Upgrade DXP4800 Hub then Agent; prove fresh collection/upload/Hub ingress, identity/history, isolated Watcher, restart recovery and client reads. Only then upgrade DH4300Plus Agent against the existing remote Hub. Never down -v or clear state. Restore old full state with old image only after proving recovery; automatic restoration needs an exact production-local rehearsal receipt, never a CI receipt. Preserve failed state if recovery is uncertain. A reporting-only failure after healthy acceptance is repaired by reporting only.

## Native Linux candidate acceptance — 2026-10-14

[PR #6](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/6) source head `01751a34aad48cc6144159ef0900fb50e156135c` passed [native upgrade CI 38476097610](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38476097610), plus the branch equivalent 38476057973. Both native Linux amd64 and arm64 completed Compose, version/publication safety, fixed Tokscale release/client/real-parser and full NAS suite gates. Shipping runtime: Node 22.23.2. amd64 log confirms 1296 tests / 1288 passed / zero failed / eight skips (five desktop-only assertions, one Windows roots and two Windows PID tests). arm64 also independently confirms 1296 tests / 1288 passed / zero failed / eight skips in the formal-image verification log; no architecture is substituted for the other. Each architecture passed 59 release/request tests. Safety checked 1381 reachable NAS historical file versions with zero pattern findings; this is limited pattern evidence, not an exhaustive security audit.

[Controlled-deployment CI 38476097653](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38476097653) passed all four combinations of v0.69.0-01/v0.69.0-02 and native amd64/arm64. All eight JSON evidence files were downloaded and read back. Candidate Docker sandbox source `3b70d92957a70438f8f6d6af17100ac76128cb14` is GitHub's PR merge commit; the branch head is above. Each source/architecture passed same frozen real Rust/shared/Hub ingress, unchanged SQLite bytes and exact corrected cost; whole-state deployment/restoration rehearsal, injected Hub failure preventing new Agent startup, proven sandbox rollback, staged Hub then Agent, Agent-only remote Hub, exact accounting and replay rejection. Python controller/frozen guards 41/41. The temporary CI receipts are not production rollback authorization.

The frozen comparator retains exact today/month/allTime Token buckets and session IDs, daily history, identity and actual upload/Hub readback. It allows only the explained 120 reasoning × $10/M = $0.0012 reduction across allTime/month; daily costs are also checked. Therefore release policy compatibleFrom is supported for exactly v0.69.0-01 and v0.69.0-02.

Performance uses identical 1000-session synthetic parser output, same shipping Node, one aggregate container cap of 1 GiB / 2 CPU for the measured Agent+Watcher+Hub/harness, three alternating repeats, 1.5-second idle and 60-second sustained window per repeat, 50ms sampling and 250ms forced ticks. Production Compose Agent/Hub limits remain 512 MiB each. Real Rust parser contracts are validated separately. Both architectures passed 15/15 gates (RSS baseline ×1.25 +16 MiB; time baseline ×1.25 +100ms), with unchanged thresholds. Values are medians of each run's sampled maximum RSS in MiB or measured time in ms; compare only within an architecture. These short synthetic observations do not establish production NAS memory/speed improvements or long-run leak freedom.

| Architecture | Process/metric | v0.69.0-02 | v0.70.0-01 candidate |
| --- | --- | ---: | ---: |
| arm64 | agent.cold.maxRssMiB | 149.63 | 150.73 |
| arm64 | agent.idle.maxRssMiB | 140.42 | 140.18 |
| arm64 | agent.peak.maxRssMiB | 160.91 | 153.63 |
| arm64 | agent.sustained.maxRssMiB | 175.18 | 173.15 |
| arm64 | watcher.cold.maxRssMiB | 53.98 | 53.95 |
| arm64 | watcher.idle.maxRssMiB | 53.98 | 53.95 |
| arm64 | watcher.peak.maxRssMiB | 53.98 | 53.95 |
| arm64 | watcher.sustained.maxRssMiB | 53.98 | 54.02 |
| arm64 | hub.cold.maxRssMiB | 92.00 | 87.57 |
| arm64 | hub.idle.maxRssMiB | 90.28 | 87.57 |
| arm64 | hub.peak.maxRssMiB | 100.51 | 102.82 |
| arm64 | hub.sustained.maxRssMiB | 118.75 | 122.61 |
| arm64 | coldMs | 764.91 | 775.26 |
| arm64 | peakMs | 436.18 | 420.13 |
| arm64 | sustainedTickMedianMs | 301.35 | 289.16 |
| x64 | agent.cold.maxRssMiB | 130.55 | 130.96 |
| x64 | agent.idle.maxRssMiB | 130.55 | 130.96 |
| x64 | agent.peak.maxRssMiB | 158.92 | 160.78 |
| x64 | agent.sustained.maxRssMiB | 168.61 | 167.49 |
| x64 | watcher.cold.maxRssMiB | 55.89 | 56.29 |
| x64 | watcher.idle.maxRssMiB | 55.89 | 56.29 |
| x64 | watcher.peak.maxRssMiB | 55.89 | 56.29 |
| x64 | watcher.sustained.maxRssMiB | 55.89 | 56.29 |
| x64 | hub.cold.maxRssMiB | 90.96 | 90.77 |
| x64 | hub.idle.maxRssMiB | 90.81 | 90.09 |
| x64 | hub.peak.maxRssMiB | 102.44 | 102.10 |
| x64 | hub.sustained.maxRssMiB | 120.90 | 119.26 |
| x64 | coldMs | 953.60 | 976.98 |
| x64 | peakMs | 581.94 | 555.36 |
| x64 | sustainedTickMedianMs | 307.98 | 307.92 |

Raw synthetic fingerprints, per-run samples and options are in the immutable-name Release evidence assets: [amd64 performance](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/download/v0.70.0-01/native-amd64-performance.json), [arm64 performance](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/download/v0.70.0-01/native-arm64-performance.json). Each tested source/architecture has separate frozen and whole-state exercise JSON assets listed below. Independent runtime review found no reproducible blocking/P1/P2 issue; its additional local 138 tests had 136 pass, no failures, two documented desktop/platform skips. No further runtime changes were made after native passing checks.

## Formal publication acceptance — 2026-10-14

[PR #6](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/6) merged at `02413928fef06abc99e181f253228e549fb4582f`. [Publication workflow 38477243551](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38477243551) completed successfully: amd64 build and actual candidate runtime verification, native arm64 verification of the same immutable candidate index, fixed-tag/latest promotion and stable GitHub Release creation plus manifest readback. [v0.70.0-01 Release](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/tag/v0.70.0-01) is neither draft nor prerelease. Git tag resolves to the release commit. Later evidence/documentation commits do not rebuild or overwrite this version.

Anonymous GHCR index/platform/config downloads independently verified content hashes, both linux platforms, OCI version/source commit and latest/fixed equality. Release-manifest was downloaded separately; its source, platform digests and compatibleFrom/migration were compared with the tagged policy. Old v0.69.0-01 and v0.69.0-02 fixed indices remain unchanged. No production deployment request or NAS container recreation was performed.

| Object | Verified digest |
| --- | --- |
| Fixed v0.70.0-01 / latest index | `sha256:848d6c0b59c35be8e5d9f69d29d347404f2b2988964c8b4838579e24e8621e64` |
| linux/amd64 manifest | `sha256:32cd4993c3c21c43133d53c88cee48beae06a5477a63ad3c17941818af66a9da` |
| linux/arm64 manifest | `sha256:fdc33c32014c794cf7e233aa56093a8c2292843da0cbca95b97430873f93d86b` |
| release-manifest file | `sha256:6d91f21f8600d8e52847d48ffd7307e60a2d91b7b8e859bd2df20718e3f84c2f` |

Public evidence includes [publication-verification.json](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/download/v0.70.0-01/publication-verification.json) and immutable [release-manifest.json](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/download/v0.70.0-01/release-manifest.json). Native JSON evidence is stored on the Release; this documentation-only follow-up does not trigger rebuilding the already fixed version. Fixed image: `ghcr.io/gott-mit-uns/token-monitor-hermes:v0.70.0-01`. The manifest lists only independently native-tested v0.69.0-01/v0.69.0-02 sources, no mandatory format migration and whole-snapshot restore rollback.

## Production status at delivery

Owner requested completion of publication first and deferral of DH4300Plus inventory. DXP4800 read-only role/version/config checks passed for the expected Hub+Agent shape; its observed running version is still v0.69.0-01, with independent Watcher and healthy collection/upload. DH4300Plus SSH refused the current connection, so role, actual version/digest and previous permission issue remain unverified. No controller was assumed, installed or granted permissions. Private device-specific deployment/backup planning is kept outside this public repository.

No new production backup, container stop/recreate, production rollback rehearsal or client acceptance of deployed v0.70 was performed. Actual production state, directories and credentials were not imported into Git. After DH inventory is complete, provide one concrete two-device plan and wait for this round's owner confirmation, then back up/verify and upgrade DXP before DH. CI receipts cannot authorize production automatic rollback. Long-running production memory and end-client behavior remain unverified.

## Native synthetic evidence assets

- [amd64 v0.69.0-01 frozen-hermes](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/download/v0.70.0-01/native-amd64-v0.69.0-01-frozen-hermes.json)
- [amd64 v0.69.0-01 deployment-exercise](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/download/v0.70.0-01/native-amd64-v0.69.0-01-deployment-exercise.json)
- [amd64 v0.69.0-02 frozen-hermes](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/download/v0.70.0-01/native-amd64-v0.69.0-02-frozen-hermes.json)
- [amd64 v0.69.0-02 deployment-exercise](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/download/v0.70.0-01/native-amd64-v0.69.0-02-deployment-exercise.json)
- [arm64 v0.69.0-01 frozen-hermes](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/download/v0.70.0-01/native-arm64-v0.69.0-01-frozen-hermes.json)
- [arm64 v0.69.0-01 deployment-exercise](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/download/v0.70.0-01/native-arm64-v0.69.0-01-deployment-exercise.json)
- [arm64 v0.69.0-02 frozen-hermes](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/download/v0.70.0-01/native-arm64-v0.69.0-02-frozen-hermes.json)
- [arm64 v0.69.0-02 deployment-exercise](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/download/v0.70.0-01/native-arm64-v0.69.0-02-deployment-exercise.json)

## Controlled-deployer cost-change limitation

The newly added frozen real-parser comparator correctly accepts the explained Hermes reasoning cost reduction while requiring exact Token/session/history/identity and actual Hub-ingress preservation. This is independent of the existing production pull controller. Its `RealDocker.frozen_compare` still compares `costUsd`/`modelCosts` exactly, and state-preservation guards also reject cost decreases. The four controller Docker exercises use the retained 125-Token no-reasoning fixture; the separate 1845-Token reasoning fixture validates parser/shared/Hub behavior, not a fee-changing production controller run.

Consequently a legitimate fee correction on real data can fail closed as `frozen_accounting_mismatch` before production cutover. Do not claim this controller automatically accepts the v0.70 correction, disable its gate, or use CI receipts as production authorization. Before choosing a controlled production path, validate and explain actual frozen cost differences and adapt/rehearse the specific comparison path without relaxing Token/session/history loss checks; alternatively define a separately reviewed manual deployment/validation plan. No controller has been installed or invoked on production in this round. This limitation does not change the published Hub/Agent parser fix, immutable image/manifest verification or the independent frozen-accounting results.
