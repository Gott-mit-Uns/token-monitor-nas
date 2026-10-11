'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deviceFreshness } = require('../../src/hub/deviceFreshness');
const { aggregateDevices } = require('../../src/shared/usage');

const START = Date.parse('2026-10-11T00:00:00.000Z');
const MINUTE = 60000;
const projection = ({ deviceId, receivedAt, ageMs, stale }) => ({ deviceId, receivedAt, ageMs, stale });

test('lightweight freshness matches full stats at offline boundaries and upload cadences', t => {
  // Normalize legacy records under the same clock as the full aggregate.
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const records = [
    { deviceId: 'realtime', receivedAt: new Date(START).toISOString() },
    ...[0, 10, 20, 30].map(interval => ({ deviceId: `cadence-${interval}`,
      receivedAt: new Date(START).toISOString(), syncUploadIntervalMs: interval * MINUTE })),
    { deviceId: 'invalid-cadence', receivedAt: new Date(START).toISOString(), syncUploadIntervalMs: 300000 },
    { deviceId: 'string-cadence', receivedAt: new Date(START).toISOString(), syncUploadIntervalMs: '600000' },
    { deviceId: 'invalid-time', receivedAt: 'invalid' },
    { deviceId: 'object-time', receivedAt: { toString: null, valueOf: null } },
    { deviceId: 'array-time', receivedAt: [] },
    { deviceId: 'future-time', receivedAt: new Date(START + 90 * MINUTE).toISOString() },
    { id: 'legacy-no-received-at', updatedAt: new Date(START - 90 * MINUTE).toISOString() },
    { deviceId: 'legacy-blank-received-at', receivedAt: '', updatedAt: new Date(START).toISOString() }
  ];
  const original = structuredClone(records);
  for (const base of [0, 10 * MINUTE, 15 * MINUTE]) {
    for (const offset of [0, 10 * MINUTE, 10 * MINUTE + 1, 20 * MINUTE, 20 * MINUTE + 1,
      40 * MINUTE, 40 * MINUTE + 1, 60 * MINUTE, 60 * MINUTE + 1]) {
      const at = START + offset;
      t.mock.timers.setTime(at);
      assert.deepEqual(deviceFreshness(records, base, at), aggregateDevices(records, base, at).devices.map(projection));
    }
  }
  assert.deepEqual(records, original);
});

test('lightweight freshness reads no usage, history, limits or source timestamp', () => {
  const record = { deviceId: 'device', receivedAt: new Date(START).toISOString(), syncUploadIntervalMs: 600000 };
  for (const key of ['periods', 'today', 'month', 'allTime', 'history', 'limits', 'updatedAt']) {
    Object.defineProperty(record, key, { get() { throw new Error(`Heavy field accessed: ${key}`); } });
  }
  assert.deepEqual(deviceFreshness([record], 600000, START + 20 * MINUTE + 1), [{
    deviceId: 'device', receivedAt: new Date(START).toISOString(), ageMs: 20 * MINUTE + 1, stale: true
  }]);
});
