# Upgrade v0.70.0-01

Version: v0.70.0-01
Source: 02413928fef06abc99e181f253228e549fb4582f
Image: ghcr.io/gott-mit-uns/token-monitor-hermes@sha256:848d6c0b59c35be8e5d9f69d29d347404f2b2988964c8b4838579e24e8621e64

Allowed source versions: v0.69.0-01, v0.69.0-02.

No mandatory archive schema or Hub JSON migration. Source versions require native frozen-data and whole-state restore validation before release. Hermes reasoning cost is charged once; token buckets are preserved. Codex parser caches reparse once. Restore a complete closed pre-deployment state snapshot with its old image. Automatic rollback requires a NAS-local rehearsal receipt for this exact version and digest pair.

Verify the Git tag, both platform OCI revisions and fixed image digest. A tag alone does not prove publication is complete. Before changing containers, identify each NAS independently, stop writers and back up complete consistent Hub/Agent state, original configuration, permissions and SQLite WAL/SHM. Keep device IDs, paths, read-only mounts and old exact images. Upgrade DXP4800 Hub then Agent; validate DH4300Plus Agent-only independently. Check preserved tokens, cache, reasoning, costs, sessions, daily history and devices, followed by a real new upload and restart recovery. Do not enable new sources, quotas or credentials. Publication does not authorize production deployment.
