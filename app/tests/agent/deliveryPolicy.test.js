'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createDeduplicatingDelivery,
  semanticRecordFingerprint,
  writeAgentSuccess
} = require('../../src/agent/deliveryPolicy');
const { runAgent } = require('../../src/agent/runtime');

function record(tokens, updatedAt = '2026-08-08T00:00:00.000Z') {
  return {
    deviceId: 'nas-hermes',
    updatedAt,
    clientHealth: { observedAt: updatedAt, overall: 'healthy' },
    today: { totalTokens: tokens }
  };
}

test('semantic fingerprint ignores transport clocks but retains usage changes', () => {
  assert.equal(semanticRecordFingerprint(record(10, 'first')), semanticRecordFingerprint(record(10, 'second')));
  assert.notEqual(semanticRecordFingerprint(record(10)), semanticRecordFingerprint(record(11)));
});

test('deduplicates unchanged records while retaining a bounded heartbeat', async () => {
  let now = 1_000;
  const sent = [];
  const successes = [];
  const delivery = createDeduplicatingDelivery({
    heartbeatMs: 300,
    now: () => now,
    send: async (value) => sent.push(value),
    onSuccess: (value) => successes.push(value)
  });

  assert.equal((await delivery.deliver(record(10, 'first'))).sent, true);
  now += 100;
  assert.equal((await delivery.deliver(record(10, 'second'))).duplicate, true);
  now += 200;
  assert.equal((await delivery.deliver(record(10, 'third'))).sent, true);
  now += 10;
  assert.equal((await delivery.deliver(record(11, 'fourth'))).sent, true);
  assert.equal(sent.length, 3);
  assert.equal(successes.length, 3);
});

test('failed delivery remains eligible for retry', async () => {
  let attempts = 0;
  const delivery = createDeduplicatingDelivery({
    send: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
    }
  });

  await assert.rejects(delivery.deliver(record(10)), /offline/);
  assert.equal((await delivery.deliver(record(10))).sent, true);
  assert.equal(attempts, 2);
});

test('idle Agent heartbeats retain each collection interval despite upload latency', async t => {
  let now = 1_000;
  let usage;
  const starts = [];
  const successes = [];
  const errors = [];
  const delivery = createDeduplicatingDelivery({
    heartbeatMs: 300_000,
    now: () => now,
    async send() {
      starts.push(now);
      // Advance a controlled clock across the asynchronous send. The next
      // collection is scheduled from collection completion, not this response.
      await Promise.resolve();
      now += 1_000;
    },
    onSuccess: value => successes.push(value.sentAt)
  });
  const runtime = runAgent({
    envelope: { deviceId: 'nas-hermes' },
    usageOptions: {},
    limitsOptions: {},
    deliver: value => delivery.deliver(value),
    onError: error => errors.push(error)
  }, {
    deviceRuntimeDeps: {
      createUsageRuntime(options) { usage = options; return { stop() {} }; },
      createLimitsRuntime() { return { stop() {} }; }
    }
  });
  t.after(() => runtime.stop());

  for (const tickAt of [1_000, 301_010, 601_020]) {
    now = tickAt;
    usage.onUpdate(record(10, new Date(now).toISOString()), 'interval');
    await runtime.flush();
  }

  assert.deepEqual(errors, []);
  assert.deepEqual(starts, [1_000, 301_010, 601_020]);
  // Health timestamps still describe successful completion, not an attempt.
  assert.deepEqual(successes, [2_000, 302_010, 602_020]);
});

test('failed changed records and heartbeats never advance successful delivery state', async () => {
  let now = 1_000;
  let failNext = false;
  const starts = [];
  const successes = [];
  const delivery = createDeduplicatingDelivery({
    heartbeatMs: 300,
    now: () => now,
    async send() {
      starts.push(now);
      now += 10;
      if (failNext) { failNext = false; throw new Error('offline'); }
    },
    onSuccess: value => successes.push(value.sentAt)
  });
  await delivery.deliver(record(10));

  now = 1_100;
  failNext = true;
  await assert.rejects(delivery.deliver(record(11)), /offline/);
  now = 1_111;
  assert.equal((await delivery.deliver(record(10))).duplicate, true);

  now = 1_300;
  failNext = true;
  await assert.rejects(delivery.deliver(record(10)), /offline/);
  now = 1_311;
  assert.equal((await delivery.deliver(record(10))).sent, true);
  assert.deepEqual(starts, [1_000, 1_100, 1_300, 1_311]);
  assert.deepEqual(successes, [1_010, 1_321]);
});

test('writes the success heartbeat atomically', () => {
  const calls = [];
  const result = writeAgentSuccess({
    path: '/config/Token Monitor/last-success',
    now: () => Date.parse('2026-08-08T00:00:00.000Z'),
    mkdirSync: (...args) => calls.push(['mkdir', ...args]),
    writeFileSync: (...args) => calls.push(['write', ...args]),
    renameSync: (...args) => calls.push(['rename', ...args])
  });

  assert.equal(result.at, '2026-08-08T00:00:00.000Z');
  assert.equal(calls[0][0], 'mkdir');
  assert.match(calls[1][1], /last-success\.\d+\.tmp$/);
  assert.equal(calls[2][2], '/config/Token Monitor/last-success');
});

test('deduplication retains date boundaries and session detail changes', () => {
  const first = { ...record(10), periodWindows: {today: {key: '2026-09-28'}}, allTime: {sessions: {a: {totalTokens: 10}}}};
  const nextDay = {...first, periodWindows: {today: {key: '2026-09-29'}}};
  const nextSession = {...first, allTime: {sessions: {b: {totalTokens: 10}}}};
  assert.notEqual(semanticRecordFingerprint(first), semanticRecordFingerprint(nextDay));
  assert.notEqual(semanticRecordFingerprint(first), semanticRecordFingerprint(nextSession));
});

test('collection health clocks do not defeat deduplication while failures remain visible', () => {
  const first = {...record(10), clientHealth:{clients:{hermes:{collection:{state:'ok', lastAttemptAt:'a', lastSuccessAt:'a'}}}}};
  const repeated = {...first, clientHealth:{clients:{hermes:{collection:{state:'ok', lastAttemptAt:'b', lastSuccessAt:'b'}}}}};
  const failed = {...first, clientHealth:{clients:{hermes:{collection:{state:'failed', lastAttemptAt:'b', lastSuccessAt:'a'}}}}};
  assert.equal(semanticRecordFingerprint(first), semanticRecordFingerprint(repeated));
  assert.notEqual(semanticRecordFingerprint(first), semanticRecordFingerprint(failed));
});
