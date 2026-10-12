# v0.69.0-01 upgrade and release record

Status: released on 2026-10-12. [PR #4](https://github.com/Gott-mit-Uns/token-monitor-nas/pull/4) merged at `6a7577821dd6b51ea5e64a3666b3e6c388dda6ff`; [Release v0.69.0-01](https://github.com/Gott-mit-Uns/token-monitor-nas/releases/tag/v0.69.0-01) and immutable multi-architecture image published. Deployment remains a separate, explicitly authorized operation. Official commit `3f106ae3d4712b26cced8272f0d488eaab0de1e6`, NAS baseline `2fdfbc57dd11fd0838aff2820504da2d2d67fcf3`. The original main workspace was clean, there were no open PRs or remote development branches, and latest baseline release CI run 38121255462 succeeded. The obsolete local upgrade-official-0.63.1 branch is retained. The shared ChatGPT link was not used as source evidence; repository state is authoritative.

## Changes and validation

- Official shared core, headless runtime, fixed Tokscale manifest and dependency manifests aligned with 0.69.0. Additive session identity/parent metadata preserve accounting IDs and counters; live state stays out of history archives.
- NAS uploader abort/timeout/dedup, health process identity, Hermes read-only titles/consent, SQLite row loading, dictionary safety, Hub strict persistence and bounded SSE remain intact.
- Watcher policy remains a lightweight shared module; official new watch boundaries are merged into it. Separate Watcher process remains default. Agent and image also default to Hermes when no clients are specified; Compose IDs and mounts are unchanged.
- Windows /windows schedule, gzip and online metadata remain in Node Hub. Desktop waiting/relationship display code and Edge Dock are excluded. The runtime adds minimal procps because the official POSIX process identity module and regression RSS sampler require ps; test containers use --init, matching existing Compose init: true. Linux registry tests use a synthetic machine-id with real /proc PID/start/namespace checks; the optional Claude registry remains fail-closed if actual machine-id is absent. Adapter remains in its own repository.
- Upgrade CI uses native Linux x86_64 and aarch64, validates both Compose templates without real .env, builds without publishing, tests fixed Tokscale, NAS tests and repeated performance comparison. See workflow results for current commit, not previous release results.
- Imported shared tests retain core Node assertions; desktop renderer/Cloudflare Worker assertions are excluded because those applications are outside this image. Mixed anchor tests retain identity, counters, persistence and restart checks while omitting visual grouping assertions.

Local checks: fixed Darwin arm64 Tokscale SHA256 and version verified; all 38 effective client IDs and two fork-only IDs accepted; DSH and 8 official real-parser contracts pass; new root/profile Hermes real-SQLite contract verifies 1,828 full/month Tokens and 1,701 single-day Tokens, exact buckets, de-duplication, history and unchanged source bytes. Reinstalled locked production dependencies: npm audit reports zero known vulnerabilities at this run. Local final NAS suite: 992 tests, 987 passed, zero failed, five platform/worker skips; no skipped test is counted as passed. Release-promotion tests: 31/31 passed. Native source-safety checks passed on both architectures. Native CI results are updated below when available. Local runtime is Node 24.19.0/macOS arm64, not the shipping Node 22/Linux runtime. A highly parallel local watcher-event check timed out once; isolated 26/26 passed, and the suite now runs at bounded concurrency 2 to reduce event-test contention.

## Fixed workload performance

Synthetic-only evidence: [local-synthetic-performance.json](evidence/upstream-v0.69.0/local-synthetic-performance.json). Three alternating runs on the same machine, 1,000 Hermes sessions, independent Watcher, 1.5 seconds idle and 15 seconds sustained forced updates. Real Node collection/archive/upload/Hub pipeline; deterministic parser output injected. Real Rust Hermes parsing is verified separately. Values are medians of each run's sampled maximum RSS, MiB.

| Process / phase | v0.68.0-05 | candidate |
| --- | ---: | ---: |
| Agent cold / idle | 211.78 | 212.39 |
| Agent collection peak | 231.66 | 237.42 |
| Agent sustained | 345.33 | 345.31 |
| Watcher all phases | 56.89 | 56.80 |
| Hub cold / idle | 85.88 | 89.64 |
| Hub collection peak | 122.94 | 123.91 |
| Hub sustained | 278.91 | 272.44 |
| Cold delivery, ms | 446.10 | 469.55 |
| Peak tick, ms | 163.48 | 167.29 |
| Sustained tick, ms | 135.89 | 137.36 |

15/15 gates passed using RSS baseline ×1.25 +16 MiB and time baseline ×1.25 +100 ms. No performance improvement is claimed. This is a 250 ms full-refresh stress workload, not production's five-minute schedule; figures do not size NAS memory limits or establish hours/days stability. CI runs the same scenario for 60 seconds per repeat on each native architecture, preserving JSON artifacts. Slow-reader/reconnect semantics have separate functional tests. Full CLI startup, native parser RSS, proxy behavior and real NAS soak remain deployment acceptance items. Do not increase memory limits to hide regression.

## Data and migration risk

No mandatory SQLite schema or Hub JSON format migration from 0.68.0-05. Existing archives are still opened by the same NAS SQLite store; transient live/waiting fields are scrubbed and optional parent metadata may be added. Collector anchor session identity version advances; first refresh may re-resolve existing metadata. Updated Tokscale invalidates Codex parser cache once if Codex was explicitly enabled; default Hermes does not enable it. A backup is still required because normal collection updates archives and anchors. Rollback must restore the complete pre-upgrade state when metadata compatibility is uncertain.

## Deployment after separate authorization

1. Wait for candidate checks and review, merge/release via the existing immutable promotion workflow. Verify native amd64 and arm64 jobs both pass, fixed v0.69.0-01 and retained v0.68.0-05 image digests, and required Release metadata. Candidate branch checks do not publish an image.
2. On each NAS, inventory actual Compose project, device ID, image digest, Hub/Agent state mount paths and settings. Do not assume old docs' IDs match current deployment. Keep original values; DXP4800 and DH4300plus templates are references.
3. Stop the affected Agent and Hub gracefully for a consistent whole-state backup. Back up actual Compose, privately held .env, complete Agent state and Hub state including SQLite sidecars. Store securely on NAS; never copy production backups to this repository or CI. Retain old image/digest. Verify backup restore and SQLite integrity on a closed independent copy.
4. Before production cutover, run candidate on a state copy and read-only Hermes data with an isolated Hub/ports, confirm exact today/month/all-time totals and complete old session IDs/history. Confirm no extra scan roots, title consent, device ID and archive integrity. Run this check privately during authorized deployment; production data and logs must never enter this repository.
5. Pin both services to the new fixed image (or verified digest), retain existing state paths/IDs/read-only mounts/security settings, explicitly keep TOKEN_MONITOR_WATCH_IN_PROCESS=0, then recreate only the authorized services using the existing Compose project. Never use down -v. Pulling the image does not update an existing container or host Compose.
6. Verify actual running image/version, collection and upload health for this boot, independent Watcher PID, no restart loop, Hub accepted identity, unchanged historical sessions and accurate current counters. Observe cold/idle/peak/24-hour memory separately for Agent/Watcher/Hub without changing limits.
7. Verify Windows reconnect/latest full snapshot, lightweight online events, 10/30-minute periods and gzip through the actual HTTPS proxy. Keep existing Windows config and Adapter rollback available. Test local API does not prove public end-to-end delivery.

## Rollback

1. Stop upgraded services gracefully. Preserve candidate state separately for diagnosis; do not delete data or images.
2. Restore old Compose and pre-upgrade full Agent/Hub state backups, including any closed SQLite state; keep the same device IDs and mounts. Restore .env securely in place.
3. Recreate affected services with retained v0.68.0-05 fixed image/digest. Verify old version/health, exact pre-upgrade archive/history IDs and counters, Hub identity and Windows sync. If only Hub changed and no format issue occurred, evaluate whether keeping newer state is safe on a copy first.
4. For Windows path changes, restore saved Hub address/Adapter configuration. Do not let an empty client overwrite remote shared settings. Keep all fixed tags and backups until recovery is independently verified.

## Long-term maintenance

[upstream-lock.json](upstream-lock.json) freezes provenance. [NAS_PATCHES.md](NAS_PATCHES.md) records patch ownership and regression mapping; [UPSTREAM_0.69_AUDIT.md](UPSTREAM_0.69_AUDIT.md) covers every official changed path. Weekly upstream reporting fetches only public releases/source into a temporary repo, classifies file ranges and saves an Actions report; it never changes the pinned commit. For a future upgrade: audit unresolved PRs first, lock tag/SHA, compare and three-way merge official changes, update patch list, run native protocol/archive/security/performance gates, review PR, release, then separately authorize deployment. Benchmark failures need same-runner diagnosis and repeated evidence before tolerance changes.

## Native Linux acceptance evidence — 2026-10-12

[Upgrade CI 38195738924](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38195738924) passed for runtime/source commit `acdad0e7d1e368a515bc67aad94e5ac0e500d421`. Both native x86_64 and aarch64 use shipping Node 22.23.2. Each: 992 NAS tests, 990 passed, zero failed, two Windows-native tests skipped; 31 promotion tests passed; Compose templates, pinned Tokscale release/client/parser gates and real root/profile Hermes SQLite contract passed. Safety scan checked 1,246 historical file versions with zero pattern findings. Later documentation/evidence-only commits do not change runtime source.

Three alternating baseline/candidate runs per architecture, 1,000 synthetic Hermes sessions, 1.5 seconds idle and 60 seconds forced-update soak each. Each architecture's 15/15 comparison gates passed. Raw artifacts preserve source fingerprints, dependency versions, fixture digest and per-run samples: [amd64](evidence/upstream-v0.69.0/native-x86_64-performance.json), [arm64](evidence/upstream-v0.69.0/native-aarch64-performance.json). Values below are medians across each run's sampled maximum RSS (MiB), or wall time (ms). Compare each row within its architecture; no cross-runner performance conclusion is supported.

| Architecture | Metric | v0.68.0-05 | candidate |
| --- | --- | ---: | ---: |
| x86_64 | agent.cold.maxRssMiB | 146.44 | 151.11 |
| x86_64 | agent.idle.maxRssMiB | 146.44 | 151.11 |
| x86_64 | agent.peak.maxRssMiB | 172.73 | 179.43 |
| x86_64 | agent.sustained.maxRssMiB | 252.07 | 266.55 |
| x86_64 | watcher.cold.maxRssMiB | 55.70 | 56.17 |
| x86_64 | watcher.idle.maxRssMiB | 55.70 | 56.17 |
| x86_64 | watcher.peak.maxRssMiB | 55.70 | 56.17 |
| x86_64 | watcher.sustained.maxRssMiB | 55.70 | 56.17 |
| x86_64 | hub.cold.maxRssMiB | 89.78 | 88.86 |
| x86_64 | hub.idle.maxRssMiB | 89.78 | 88.86 |
| x86_64 | hub.peak.maxRssMiB | 116.28 | 114.99 |
| x86_64 | hub.sustained.maxRssMiB | 146.59 | 144.41 |
| x86_64 | coldMs | 679.54 | 700.63 |
| x86_64 | peakMs | 334.55 | 341.71 |
| x86_64 | sustainedTickMedianMs | 226.49 | 228.09 |
| aarch64 | agent.cold.maxRssMiB | 164.94 | 170.21 |
| aarch64 | agent.idle.maxRssMiB | 158.65 | 161.53 |
| aarch64 | agent.peak.maxRssMiB | 176.18 | 182.76 |
| aarch64 | agent.sustained.maxRssMiB | 257.12 | 269.20 |
| aarch64 | watcher.cold.maxRssMiB | 53.88 | 54.00 |
| aarch64 | watcher.idle.maxRssMiB | 53.88 | 54.00 |
| aarch64 | watcher.peak.maxRssMiB | 53.88 | 54.00 |
| aarch64 | watcher.sustained.maxRssMiB | 53.88 | 54.00 |
| aarch64 | hub.cold.maxRssMiB | 90.25 | 89.42 |
| aarch64 | hub.idle.maxRssMiB | 90.03 | 89.42 |
| aarch64 | hub.peak.maxRssMiB | 116.80 | 115.83 |
| aarch64 | hub.sustained.maxRssMiB | 154.50 | 144.95 |
| aarch64 | coldMs | 730.70 | 739.97 |
| aarch64 | peakMs | 330.96 | 324.43 |
| aarch64 | sustainedTickMedianMs | 262.41 | 263.55 |

Agent sustained RSS increased 14.48 MiB on amd64 and 12.08 MiB on arm64. Watcher is effectively unchanged; Hub is slightly lower. These are bounded short synthetic stress observations, not a performance improvement claim or a proof of real NAS leak absence. Existing 512 MiB Agent limits were not raised. Keep the independent Watcher and perform long-running actual deployment acceptance only after separate authorization.

The initial CI failures (synthetic Compose env_file, missing POSIX ps, non-reaped test children and missing container machine-id) were diagnosed and corrected before this passing run. No test assertions were skipped to obtain this result. Windows-native tests require Windows and are explicitly excluded by platform conditions; actual Windows HTTPS/proxy/device acceptance is still pending deployment-stage verification. npm audit covers npm packages, not a complete OS-image CVE audit.

## Publication acceptance — 2026-10-12

[Final PR validation 38196409877](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38196409877) and [release workflow 38197243451](https://github.com/Gott-mit-Uns/token-monitor-nas/actions/runs/38197243451) passed. Native amd64 build/runtime checks, native arm64 verification and immutable promotion all succeeded. The Git Release tag resolves to merge commit `6a7577821dd6b51ea5e64a3666b3e6c388dda6ff`.

Published image: `ghcr.io/gott-mit-uns/token-monitor-hermes:v0.69.0-01`. Both its fixed tag and latest resolved at publication to index digest `sha256:849ad058facfde01a7279efd88333f7461e3bffd3655f3d082913e957c30ed07`. The old `v0.68.0-05` fixed index remains `sha256:3eb6fa177134a4a6089af3d3df643d391ed730f5de3e722aba07e2a0ec563cb3`. No previously published fixed tag was overwritten.

Production acceptance uses private NAS copies and backups, independently from GitHub CI. Keep actual state, credentials, logs, workload measurements and deployment-specific backup paths off this public repository. The Hub startup may remove empty-string session title fields; this does not remove nonempty consented titles or change accounting/history. Compare parsed semantics rather than byte-for-byte JSON serialization. Long-running memory and public Windows HTTPS/client behavior remain separate operational checks.
