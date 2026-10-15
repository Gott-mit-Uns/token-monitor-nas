'use strict';

const { mergeSyncDeviceRecord } = require('../shared/usage');
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function timestamp(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return NaN;
  if (!value) return NaN;
  return new Date(value).getTime();
}
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
function orderingTimestamp(value, receivedAt) {
  const valueMs = timestamp(value), receiptMs = timestamp(receivedAt);
  // A temporarily wrong client clock must not become a durable watermark.
  // Preserve the legacy arrival-order fallback for unorderable timestamps,
  // including persisted future values admitted by older Hub versions.
  if (!Number.isFinite(receiptMs) || valueMs > receiptMs + MAX_FUTURE_SKEW_MS) return NaN;
  return valueMs;
}
function older(incoming, existing, incomingReceipt, existingReceipt) {
  const next = orderingTimestamp(incoming, incomingReceipt), prior = orderingTimestamp(existing, existingReceipt);
  // Old clients without producer timestamps keep the existing arrival-order
  // contract. Do not invent an ordering from receipt time or token/cost totals.
  return Number.isFinite(next) && Number.isFinite(prior) && next < prior;
}

function mergeIngressRecord(existing, incoming, options) {
  let merged = mergeSyncDeviceRecord(existing, incoming, options);
  if (!existing) {
    if (incoming.limitsOnly === true) {
      const quotaOnly = { ...incoming };
      for (const field of ['periods', 'today', 'month', 'allTime', 'history', 'historyAvailable', 'periodWindows']) delete quotaOnly[field];
      merged = mergeSyncDeviceRecord(null, quotaOnly, options);
      // Persist the existing wire flag until the first authoritative full
      // snapshot. A quota's time must not reject usage already in flight.
      merged.limitsOnly = true;
      merged.updatedAt = '';
    }
    return merged;
  }
  const lateUsage = existing.limitsOnly !== true && older(incoming.updatedAt, existing.updatedAt, incoming.receivedAt, existing.receivedAt);
  if (lateUsage || incoming.limitsOnly === true) {
    // Go through the normal privacy gate even for retained usage: a delayed
    // upload must never revive revoked titles. Receipt freshness is separate
    // from the producer's last complete collection time.
    const retained = mergeSyncDeviceRecord(existing, {
      ...existing, receivedAt: incoming.receivedAt
    }, options);
    if (lateUsage) merged = { ...retained, limits: merged.limits };
    else {
      merged.updatedAt = retained.updatedAt;
      if (hasOwn(retained, 'history')) merged.history = retained.history;
      else delete merged.history;
    }
  }
  if (older(incoming.limits?.updatedAt, existing.limits?.updatedAt, incoming.receivedAt, existing.receivedAt)) {
    merged.limits = mergeSyncDeviceRecord(existing, {
      ...existing, receivedAt: incoming.receivedAt
    }, options).limits;
  }
  if (existing.limitsOnly === true && incoming.limitsOnly === true) {
    merged.limitsOnly = true;
    merged.updatedAt = '';
  }
  return merged;
}

module.exports = { mergeIngressRecord };
