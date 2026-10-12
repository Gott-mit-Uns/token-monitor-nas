# v0.69.0-01 upgrade candidate

Status: candidate branch; no fixed image tag or GitHub Release created, no production deployment. Official commit `3f106ae3d4712b26cced8272f0d488eaab0de1e6`, NAS baseline `2fdfbc57dd11fd0838aff2820504da2d2d67fcf3`. The original main workspace was clean, there were no open PRs or remote development branches, and latest baseline release CI run 38121255462 succeeded. The obsolete local upgrade-official-0.63.1 branch is retained. The shared ChatGPT link was not used as source evidence; repository state is authoritative.

## Changes and validation

- Official shared core, headless runtime, fixed Tokscale manifest and dependency manifests aligned with 0.69.0. Additive session identity/parent metadata preserve accounting IDs and counters; live state stays out of history archives.
- NAS uploader abort/timeout/dedup, health process identity, Hermes read-only titles/consent, SQLite row loading, dictionary safety, Hub strict persistence and bounded SSE remain intact.
- Watcher policy remains a lightweight shared module; official new watch boundaries are merged into it. Separate Watcher process remains default. Agent and image also default to Hermes when no clients are specified; Compose IDs and mounts are unchanged.
- Windows /windows schedule, gzip and online metadata remain in Node Hub. Desktop waiting/relationship display code and Edge Dock are excluded. Adapter remains in its own repository.
- Upgrade CI uses native Linux x86_64 and aarch64, validates both Compose templates without real .env, builds without publishing, tests fixed Tokscale, NAS tests and repeated performance comparison. See workflow results for current commit, not previous release results.
- Imported shared tests retain core Node assertions; desktop renderer/Cloudflare Worker assertions are excluded because those applications are outside this image. Mixed anchor tests retain identity, counters, persistence and restart checks while omitting visual grouping assertions.

Local checks: fixed Darwin arm64 Tokscale SHA256 and version verified; all 38 effective client IDs and two fork-only IDs accepted; DSH and 8 official real-parser contracts pass. Reinstalled locked production dependencies: npm audit reports zero known vulnerabilities at this run. Publication safety, final suite and native CI results are updated below when available. Local runtime is Node 24.19.0/macOS arm64, not the shipping Node 22/Linux runtime. A highly parallel local watcher-event check timed out once; isolated 26/26 passed, and the suite now runs at bounded concurrency 2 to reduce event-test contention.

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
4. Before production cutover, run candidate on a state copy and read-only Hermes data with an isolated Hub/ports, confirm exact today/month/all-time totals and complete old session IDs/history. Confirm no extra scan roots, title consent, device ID and archive integrity. This production-copy dry run is not performed in this change.
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
