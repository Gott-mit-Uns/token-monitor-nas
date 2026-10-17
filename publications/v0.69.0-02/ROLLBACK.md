# Rollback v0.69.0-02

Version: v0.69.0-02
Source: ec79dc7bff697ed5568b013578a8ec8d6261e67e
Image: ghcr.io/gott-mit-uns/token-monitor-hermes@sha256:e35fa4c5f050b3944698a96a5ea48e7ee65b4e851ec49c5ddd1271dc02cca4b2

Policy: restore-snapshot.

No mandatory archive schema migration. Collection can update state metadata. Restore a complete closed pre-deployment state snapshot with its old image. Automatic rollback requires a NAS-local rehearsal receipt for this exact version and digest pair.

Protect new data and preserve the failed state before recovery. Use the old exact image with the complete closed pre-upgrade snapshot and original configuration/permissions. Do not overlay backups onto changing state, downgrade only the image, remove volumes, clear history or recreate device identity. Automatic rollback remains fail-closed unless its existing locally verified rehearsal receipt binds this exact image/state pair; otherwise use the reviewed manual restore procedure. A CI synthetic restore is not a production restore receipt.
