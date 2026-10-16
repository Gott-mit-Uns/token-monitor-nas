# Rollback v0.71.0-01

Version: v0.71.0-01
Source: e92d9add64efbb9985fb482880d9d95734354183
Image: ghcr.io/gott-mit-uns/token-monitor-hermes@sha256:209da1db610b38871eb9357f27b6d625c80441ec9853024256190fd4843b585a

Policy: restore-snapshot.

No mandatory archive schema or Hub JSON migration. Source versions require native frozen-data and whole-state restore validation before release. Hermes reasoning cost is charged once; token buckets are preserved. Codex parser caches reparse once. Restore a complete closed pre-deployment state snapshot with its old image. Automatic rollback requires a NAS-local rehearsal receipt for this exact version and digest pair. Cross-v0.70 Hermes reasoning cost corrections require reviewed manual acceptance: production automatic controller remains fail-closed on any frozen cost difference. Synthetic manual-path receipts are not production receipts.

Protect new data and preserve the failed state before recovery. Use the old exact image with the complete closed pre-upgrade snapshot and original configuration/permissions. Do not overlay backups onto changing state, downgrade only the image, remove volumes, clear history or recreate device identity. Automatic rollback remains fail-closed unless its existing locally verified rehearsal receipt binds this exact image/state pair; otherwise use the reviewed manual restore procedure. A CI synthetic restore is not a production restore receipt.
