'use strict';

// JSON timestamp fields must never invoke object coercion while aggregating a
// persisted device. Preserve existing scalar values and missing-value fallback.
function recordTimestamp(value, fallback) {
  return (typeof value === 'string' || typeof value === 'number') && value ? value : fallback;
}

module.exports = { recordTimestamp };
