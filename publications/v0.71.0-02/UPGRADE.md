# Upgrade v0.71.0-02

Version: v0.71.0-02
Source: 9a06b658e75d96285ac98847ef5e6e67299a4085
Image: ghcr.io/gott-mit-uns/token-monitor-hermes@sha256:37b72cad44c0410e0acd7c28c29d37f41228e4152cd4236352db8a39079da5ae

Allowed source versions: v0.69.0-01, v0.69.0-02, v0.70.0-01, v0.71.0-01.

No mandatory archive schema or Hub JSON migration. Source versions require native frozen-data and whole-state restore validation before release. Hermes reasoning cost is charged once; token buckets are preserved. Codex parser caches reparse once. Restore a complete closed pre-deployment state snapshot with its old image. Automatic rollback requires a NAS-local rehearsal receipt for this exact version and digest pair. Cross-v0.70 Hermes reasoning cost corrections require reviewed manual acceptance: production automatic controller remains fail-closed on any frozen cost difference. Synthetic manual-path receipts are not production receipts. Agent archive publication strictly rejects read/write errors and malformed rows before accepting usage. No accounting-rule or storage-format change from v0.71.0-01; frozen usage and cost must remain equal.

Verify the Git tag, both platform OCI revisions and fixed image digest. A tag alone does not prove publication is complete. Before changing containers, identify each NAS independently, stop writers and back up complete consistent Hub/Agent state, original configuration, permissions and SQLite WAL/SHM. Keep device IDs, paths, read-only mounts and old exact images. Upgrade DXP4800 Hub then Agent; validate DH4300Plus Agent-only independently. Check preserved tokens, cache, reasoning, costs, sessions, daily history and devices, followed by a real new upload and restart recovery. Do not enable new sources, quotas or credentials. Publication does not authorize production deployment.
