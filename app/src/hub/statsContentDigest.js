'use strict';

const { createHash } = require('node:crypto');
const { hubStatsContentKey } = require('../shared/hubProtocol');

function hubStatsContentDigest(stats) {
  // Keep the shared serializer's fields, ordering and freshness exclusions.
  // Only the Hub's retained comparison value changes: the full serialized
  // snapshot is temporary and never becomes a per-connection retained key.
  return createHash('sha256').update(hubStatsContentKey(stats)).digest('hex');
}

module.exports = { hubStatsContentDigest };
