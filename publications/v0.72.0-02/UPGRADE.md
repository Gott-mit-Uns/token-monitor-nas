# Upgrade v0.72.0-02

Version: v0.72.0-02
Source: 0f748427b7c75171d1c2fcaf40c0ef552bfb2f2d
Image: ghcr.io/gott-mit-uns/token-monitor-hermes@sha256:81413b1a4fcb30757f906bc732dcfbfe6883cb27683dffaaad98ea7ced9b8715

Allowed source versions: v0.69.0-01, v0.69.0-02, v0.70.0-01, v0.71.0-01, v0.71.0-02, v0.72.0-01.

No mandatory archive schema or Hub JSON migration. Source versions require native frozen-data and whole-state restore validation before release. Hermes reasoning cost is charged once; token buckets are preserved. Codex parser caches reparse once. Restore a complete closed pre-deployment state snapshot with its old image. Automatic rollback requires a NAS-local rehearsal receipt for this exact version and digest pair. Cross-v0.70 Hermes reasoning cost corrections require reviewed manual acceptance: production automatic controller remains fail-closed on any frozen cost difference. Synthetic manual-path receipts are not production receipts. Agent archive publication strictly rejects read/write errors and malformed rows before accepting usage. No accounting-rule or storage-format change from v0.71.0-01; frozen usage and cost must remain equal. v0.72.0 changes optional Cursor quota display and OpenCode metadata/detail reads only; Hermes token/cache/reasoning/cost/history and persisted formats are unchanged. No new source or quota provider is enabled.

Verify the Git tag, both platform OCI revisions and fixed image digest. A tag alone does not prove publication is complete. Before changing containers, identify each NAS independently, stop writers and back up complete consistent Hub/Agent state, original configuration, permissions and SQLite WAL/SHM. Keep device IDs, paths, read-only mounts and old exact images. Upgrade DXP4800 Hub then Agent; validate DH4300Plus Agent-only independently. Check preserved tokens, cache, reasoning, costs, sessions, daily history and devices, followed by a real new upload and restart recovery. Do not enable new sources, quotas or credentials. Publication does not authorize production deployment.
