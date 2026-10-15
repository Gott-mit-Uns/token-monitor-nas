'use strict';

const { mergeSyncDeviceRecord } = require('../shared/usage');
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function timestamp(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return NaN;
  if (!value) return NaN;
  return new Date(value).getTime();
}
function older(incoming, existing) {
  const next = timestamp(incoming), prior = timestamp(existing);
  // Old clients without producer timestamps keep the existing arrival-order
  // contract. Do not invent an ordering from receipt time or token/cost totals.
  return Number.isFinite(next) && Number.isFinite(prior) && next < prior;
}

function mergeIngressRecord(existing, incoming, options) {
  let merged = mergeSyncDeviceRecord(existing, incoming, options);
  if (!existing) return merged;
  const lateUsage = older(incoming.updatedAt, existing.updatedAt);
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
  if (!hasOwn(incoming, 'limits') || older(incoming.limits?.updatedAt, existing.limits?.updatedAt)) {
    merged.limits = mergeSyncDeviceRecord(existing, {
      ...existing, receivedAt: incoming.receivedAt
    }, options).limits;
  }
  return merged;
}

module.exports = { mergeIngressRecord };
