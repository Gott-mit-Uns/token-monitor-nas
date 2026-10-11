'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { hubStatsContentDigest } = require('../../src/hub/statsContentDigest');
const { hubStatsContentKey } = require('../../src/shared/hubProtocol');

function snapshot() {
  return {
    updatedAt: '2026-10-11T01:00:00.000Z',
    periods: { today: { totalTokens: 5, sessions: { 'hermes:synthetic': {
      client: 'hermes', sessionId: 'synthetic', title: 'Synthetic title', totalTokens: 5
    } }, models: { synthetic: { totalTokens: 5 } } } },
    historyRevision: 'synthetic-history',
    limits: { updatedAt: '2026-10-11T01:00:00.000Z', providers: [
      { provider: 'synthetic', updatedAt: '2026-10-11T00:59:00.000Z', remainingPercent: 90 }
    ] },
    devices: [{ deviceId: 'synthetic-nas', updatedAt: '2026-10-11T01:00:00.000Z',
      receivedAt: '2026-10-11T01:00:01.000Z', ageMs: 0, stale: false }]
  };
}

test('Hub-only digest consumes the exact shared content serialization without changing the input', () => {
  const stats = snapshot();
  const before = structuredClone(stats);
  const sharedKey = hubStatsContentKey(stats);
  assert.equal(hubStatsContentDigest(stats), createHash('sha256').update(sharedKey).digest('hex'));
  assert.deepEqual(stats, before);
  assert.equal(hubStatsContentKey(stats), sharedKey, 'the shared serializer remains unchanged');
});

test('large synthetic snapshots retain a fixed-size digest rather than their full JSON key', () => {
  const stats = snapshot();
  stats.periods.today.sessions = Object.fromEntries(Array.from({ length: 2048 }, (_, i) => [
    `hermes:synthetic-${i}`, { client: 'hermes', sessionId: `synthetic-${i}`, title: 'synthetic '.repeat(64), totalTokens: i }
  ]));
  const previousKeyBytes = Buffer.byteLength(hubStatsContentKey(stats));
  const digest = hubStatsContentDigest(stats);
  assert.ok(previousKeyBytes > 1024 * 1024);
  assert.equal(Buffer.byteLength(digest), 64);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(hubStatsContentDigest(structuredClone(stats)), digest);
});

test('regenerated transport timestamps and ages remain excluded', () => {
  const stats = snapshot();
  const refreshed = structuredClone(stats);
  refreshed.updatedAt = '2026-10-11T02:00:00.000Z';
  refreshed.limits.updatedAt = refreshed.updatedAt;
  refreshed.devices[0].updatedAt = refreshed.updatedAt;
  refreshed.devices[0].receivedAt = refreshed.updatedAt;
  refreshed.devices[0].ageMs = 99;
  assert.equal(hubStatsContentDigest(refreshed), hubStatsContentDigest(stats));
});

test('usage, session titles, models, source limits, history and staleness still change the digest', async t => {
  const changes = {
    usage: value => { value.periods.today.totalTokens++; },
    titleRevocation: value => { value.periods.today.sessions['hermes:synthetic'].title = ''; },
    model: value => { value.periods.today.models.synthetic.totalTokens++; },
    limits: value => { value.limits.providers[0].updatedAt = '2026-10-11T02:00:00.000Z'; },
    history: value => { value.historyRevision = 'new-synthetic-history'; },
    stale: value => { value.devices[0].stale = true; },
    deletion: value => { value.devices = []; }
  };
  for (const [name, change] of Object.entries(changes)) {
    await t.test(name, () => {
      const original = snapshot();
      const changed = structuredClone(original);
      change(changed);
      assert.notEqual(hubStatsContentDigest(changed), hubStatsContentDigest(original));
    });
  }
});

test('existing JSON property ordering semantics are preserved, not replaced by canonical sorting', () => {
  const a = { periods: { today: { totalTokens: 5, costUsd: 0.1 } }, devices: [] };
  const b = { periods: { today: { costUsd: 0.1, totalTokens: 5 } }, devices: [] };
  assert.notEqual(hubStatsContentKey(a), hubStatsContentKey(b));
  assert.notEqual(hubStatsContentDigest(a), hubStatsContentDigest(b));
});
