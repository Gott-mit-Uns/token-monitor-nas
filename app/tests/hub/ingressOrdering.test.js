'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHub } = require('../../src/hub/server');

const at = minute => `2026-10-16T00:${String(minute).padStart(2, '0')}:00.000Z`;
function record(minute, tokens, cost = tokens / 1000000) {
  return { deviceId: 'synthetic-ordering', updatedAt: at(minute),
    history: { daily: [{ date: '2026-10-16', tokens, cost }] },
    ...Object.fromEntries(['today', 'month', 'allTime'].map(p => [p, {
      totalTokens: tokens, costUsd: cost, sessions: { 'hermes:ordering': {
        client: 'hermes', sessionId: 'ordering', totalTokens: tokens, costUsd: cost
      } }
    }])),
    limits: { updatedAt: at(minute), providers: [{ provider: 'cursor', accountKey: 'synthetic-ordering-account',
      updatedAt: at(minute), status: 'ok', windows: [{ kind: 'weekly', usedPercent: minute }] }] }
  };
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-ingress-ordering-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'devices.json');
  const open = () => createHub({ dataFile, logger: { error() {} } });
  return { open, hub: open() };
}

test('late full snapshots and retries cannot replace newer persisted usage or history across restart', t => {
  const { hub, open } = fixture(t);
  const latest = hub.ingest(record(2, 250));
  for (const payload of [record(2, 250), record(1, 125), record(2, 250), record(1, 125)]) hub.ingest(payload);
  const restarted = open();
  restarted.ingest(record(1, 125));
  assert.deepEqual(restarted.getDevices()[0].periods, latest.periods);
  assert.deepEqual(restarted.getDevices()[0].history, latest.history);
  assert.equal(restarted.getDevices()[0].updatedAt, at(2));
  assert.equal(restarted.getStats().periods.allTime.totalTokens, 250);
});

test('usage and quota clocks are independent; limits-only cannot replace usage history or its clock', t => {
  const { hub } = fixture(t);
  const baseline = hub.ingest(record(2, 250));
  const oldUsageFreshQuota = record(1, 125);
  oldUsageFreshQuota.limits = record(3, 250).limits;
  hub.ingest(oldUsageFreshQuota);
  assert.equal(hub.getDevices()[0].periods.allTime.totalTokens, 250);
  assert.equal(hub.getDevices()[0].limits.updatedAt, at(3));
  const freshUsageOldQuota = record(4, 500);
  freshUsageOldQuota.limits = record(1, 125).limits;
  hub.ingest(freshUsageOldQuota);
  const before = hub.getDevices()[0];
  hub.ingest({ ...record(5, 0), limitsOnly: true, history: null });
  const after = hub.getDevices()[0];
  assert.deepEqual(after.periods, before.periods);
  assert.deepEqual(after.history, before.history);
  assert.equal(after.updatedAt, at(4));
  assert.equal(after.limits.updatedAt, at(5));
  assert.equal(baseline.periods.allTime.totalTokens, 250);
});

test('a newer verified cost correction and day rollover remain valid without a monotonic-counter rule', t => {
  const { hub } = fixture(t);
  hub.ingest(record(1, 250, 0.001));
  hub.ingest(record(2, 250, 0.0008));
  assert.equal(hub.getDevices()[0].periods.allTime.costUsd, 0.0008);
  const rollover = record(3, 250, 0.0008);
  rollover.today = { totalTokens: 0 };
  hub.ingest(rollover);
  assert.equal(hub.getDevices()[0].periods.today.totalTokens, 0);
  assert.equal(hub.getDevices()[0].periods.allTime.totalTokens, 250);
});
