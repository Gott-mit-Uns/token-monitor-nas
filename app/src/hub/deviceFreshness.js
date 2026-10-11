'use strict';

const { staleAfterMsForSyncUpload } = require('../shared/syncUploadInterval');
const { recordTimestamp } = require('../shared/recordTimestamp');

// Match aggregateDevices' admission/liveness fields without normalizing usage,
// sessions, limits or History. Records admitted by ingest already have a receive
// time; the fallback preserves normalization of older persisted records as well.
function deviceFreshness(devices, staleAfterMs, nowMs = Date.now()) {
  const fallbackReceivedAt = new Date(nowMs).toISOString();
  return devices.map(record => {
    const receivedAt = recordTimestamp(record.receivedAt, fallbackReceivedAt);
    const ageMs = nowMs - Date.parse(receivedAt);
    const uploadIntervalMs = Object.hasOwn(record, 'syncUploadIntervalMs') ? record.syncUploadIntervalMs : undefined;
    const deviceStaleAfterMs = staleAfterMsForSyncUpload(uploadIntervalMs, staleAfterMs);
    return {
      deviceId: String(record.deviceId || record.id || 'unknown'),
      receivedAt,
      ageMs: Number.isFinite(ageMs) ? ageMs : null,
      stale: Number.isFinite(ageMs) && deviceStaleAfterMs > 0 ? ageMs > deviceStaleAfterMs : false
    };
  }).sort((a, b) => a.deviceId.localeCompare(b.deviceId));
}

module.exports = { deviceFreshness };
