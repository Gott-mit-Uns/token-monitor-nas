# Upgrade v0.69.0-02

Version: v0.69.0-02
Source: ec79dc7bff697ed5568b013578a8ec8d6261e67e
Image: ghcr.io/gott-mit-uns/token-monitor-hermes@sha256:e35fa4c5f050b3944698a96a5ea48e7ee65b4e851ec49c5ddd1271dc02cca4b2

Allowed source versions: v0.69.0-01.

No mandatory archive schema migration. Collection can update state metadata. Restore a complete closed pre-deployment state snapshot with its old image. Automatic rollback requires a NAS-local rehearsal receipt for this exact version and digest pair.

Verify the Git tag, both platform OCI revisions and fixed image digest. A tag alone does not prove publication is complete. Before changing containers, identify each NAS independently, stop writers and back up complete consistent Hub/Agent state, original configuration, permissions and SQLite WAL/SHM. Keep device IDs, paths, read-only mounts and old exact images. Upgrade DXP4800 Hub then Agent; validate DH4300Plus Agent-only independently. Check preserved tokens, cache, reasoning, costs, sessions, daily history and devices, followed by a real new upload and restart recovery. Do not enable new sources, quotas or credentials. Publication does not authorize production deployment.
