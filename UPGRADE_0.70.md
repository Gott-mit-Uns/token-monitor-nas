# v0.70.0-01 upgrade, release and deployment record

Status: candidate development; native CI, publication and production deployment pending. Date: 2026-10-14 (Asia/Shanghai). This document must be updated with final commit/run/digest evidence before claiming a completed stage.

## Provenance and scope

Official v0.70.0 commit: `ac4eeb2c4aea239dd94b67f074c73f69aafc46f8`; old official v0.69.0: `3f106ae3d4712b26cced8272f0d488eaab0de1e6`. Current formal NAS release v0.69.0-02: `ec79dc7bff697ed5568b013578a8ec8d6261e67e`; starting main `9d23bed717ded9e850b2035ec55a511aaec9082c` adds README only. Original checkout was clean and is preserved; upgrade branch/worktree is isolated. No open upgrade PR or occupied v0.70.0-01 tag/release was found at baseline review.

See [full path audit](UPSTREAM_0.70_AUDIT.md), [patch contract](NAS_PATCHES.md), [upstream lock](upstream-lock.json) and [handoff](HANDOFF_0.70.md). Hermes reasoning, Codex compressed/archive records, DSH model attribution, shared title lookup and atomic streamed SQLite catch-up are included. Optional MiniMax/StepFun/Cursor provider fixes do not enable external accounts. CatPaw stays opt-in, with no Linux source. Electron/renderer/Dock/Windows Adapter/Worker are excluded. Hub, Agent and shared use one official baseline.

## Validation so far

Local macOS arm64, Node 24.19.0 (shipping containers use Node 22 on Linux): 1,296 NAS tests, 1,285 passed, 0 failed, 11 skipped. Skips include platform/Worker and explicitly excluded desktop-only assertions; they are not counted as passing. SQLite 42/42, release/request 59/59, controller 36/36 passed. Fixed Darwin parser checksum/version/client validation succeeded; DSH and 10 applicable real-parser contracts passed, including corrected Hermes reasoning and compressed Codex/DSH models. These results do not replace native amd64/arm64 Docker checks.

Native candidate CI must run: version/safety, Compose, fixed Tokscale release/client/parser tests, full NAS suite, repeated fixed-workload performance, both Hub+Agent and Agent-only remote-Hub deployments, per-source whole-state backup/recovery, exact frozen old/new parser-to-Hub comparison. Upload timeout/cancel/retry/dedup, corrupt SQLite/cursor release, Hub corrupt state/write failure, SSE reconnect/gzip/backpressure, process identity and old-state recovery retain regression assertions.

## Migration and corrected costs

No mandatory archive schema or Hub JSON migration. Optional fields remain backward compatible; source device IDs, histories and token buckets must be preserved. Hermes reasoning is charged once by the pinned parser and folded into public output once by Node normalization; a decreased estimated cost is valid only with exact frozen token/session/history preservation and an explicit arithmetic explanation. Codex parser cache 12→15 triggers one reparse if explicitly enabled. Optional StepFun account key becomes refresh-half based and stable across access renewal. No accounts are enabled or credentials copied.

`compatibleFrom` is restricted to versions actually tested by native per-source frozen comparison and full-state restore. Candidate policy lists v0.69.0-01 and v0.69.0-02, both gated by CI; do not publish if either source gate fails without correcting the policy.

## Performance evidence

Pending native same-machine old/new runs: 1,000 synthetic sessions, same limits and sample windows, three repeats, idle/collection peak/60-second sustained phases. Record Agent, independent Watcher and Hub separately, including fixture/source fingerprints and resource limits. No production NAS performance or speed improvement is claimed. No memory-limit changes are included.

## Publication gate

Pending. Merge only final-source native passing PR; then verify formal publish workflow, fixed v0.70.0-01, both platform digests/OCI labels/source commit, Git tag and read-back release-manifest migration policy. Preserve old tags. Publish does not deploy production.

## Production deployment and rollback gate

Not authorized for this round. Read-only inventory and the final private device-specific plan must precede owner confirmation. Do not install controllers, alter ACL/modes, add credentials/schedules or recreate containers as part of publication. Device-specific details and backups remain private, outside this public repository.

After explicit confirmation: obtain consistent closed whole-state/config backup including SQLite WAL/SHM, verify restored copies, retain old images/config. Upgrade DXP4800 Hub then Agent; prove fresh collection/upload/Hub ingress, identity/history, isolated Watcher, restart recovery and client reads. Only then upgrade DH4300Plus Agent against the existing remote Hub. Never down -v or clear state. Restore old full state with old image only after proving recovery; automatic restoration needs an exact production-local rehearsal receipt, never a CI receipt. Preserve failed state if recovery is uncertain. A reporting-only failure after healthy acceptance is repaired by reporting only.
