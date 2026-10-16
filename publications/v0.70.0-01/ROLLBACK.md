# Rollback v0.70.0-01

Version: v0.70.0-01
Source: 02413928fef06abc99e181f253228e549fb4582f
Image: ghcr.io/gott-mit-uns/token-monitor-hermes@sha256:848d6c0b59c35be8e5d9f69d29d347404f2b2988964c8b4838579e24e8621e64

Policy: restore-snapshot.

No mandatory archive schema or Hub JSON migration. Source versions require native frozen-data and whole-state restore validation before release. Hermes reasoning cost is charged once; token buckets are preserved. Codex parser caches reparse once. Restore a complete closed pre-deployment state snapshot with its old image. Automatic rollback requires a NAS-local rehearsal receipt for this exact version and digest pair.

Protect new data and preserve the failed state before recovery. Use the old exact image with the complete closed pre-upgrade snapshot and original configuration/permissions. Do not overlay backups onto changing state, downgrade only the image, remove volumes, clear history or recreate device identity. Automatic rollback remains fail-closed unless its existing locally verified rehearsal receipt binds this exact image/state pair; otherwise use the reviewed manual restore procedure. A CI synthetic restore is not a production restore receipt.
