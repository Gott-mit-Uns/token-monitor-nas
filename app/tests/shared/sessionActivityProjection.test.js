'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const projection = require('../../src/shared/sessionActivityProjection');
const { sessionWithActivity } = require('../../src/shared/sessionLive');
const claude = require('../../src/shared/providers/claude/sessionActivity');
const { createDeviceState } = require('../../src/shared/usage/deviceState');
const { createDeviceRuntime } = require('../../src/shared/usage/deviceRuntime');


const now = Date.parse('2026-10-09T00:01:00Z');
const observation = (state, time = now) => ({ state, observedAt: new Date(time).toISOString() });
function fixture(count = 5000) {
  const sessions = Object.fromEntries(Array.from({ length: count }, (_, i) => [`claude:id-${i}`, {
    client: 'claude', sessionId: `id-${i}`, totalTokens: 100, costUsd: 0, models: {},
    lastUsedAt: '2026-10-01T12:00:00Z', turnEnded: true
  }]));
  return { deviceId: 'test', updatedAt: '2026-10-08T23:59:00Z', today: { sessions: {}, totalTokens: 0 },
    month: { sessions, totalTokens: count * 100 }, allTime: { sessions, totalTokens: count * 100 } };
}

test('native admission distinguishes archived accounting from current usage without changing identity lookup', () => {
  const baseline = fixture(2);
  baseline.month.sessions['claude:id-0'].archived = true;
  assert.equal(projection.hasKnownSession(baseline, 'claude', 'id-0', 'month'), true);
  assert.equal(projection.hasKnownSession(baseline, 'claude', 'id-0', 'month', false), false);
  assert.equal(projection.hasKnownSession(baseline, 'claude', 'id-1', 'month', false), true);
  const native = Object.fromEntries([0, 1].map(i => [`claude:id-${i}`, { client: 'claude', sessionId: `id-${i}` }]));
  assert.deepEqual(Object.keys(projection.nativeSessionsForPeriod(baseline, 'claude', native, 'month')), ['claude:id-0']);
});

test('historical and cross-midnight activity uses the index without enumerating history again', () => {
  const summary = fixture();
  let traversals = 0;
  const sessions = new Proxy(summary.month.sessions, { ownKeys(target) { traversals += 1; return Reflect.ownKeys(target); } });
  summary.month.sessions = sessions;
  summary.allTime.sessions = sessions;
  const first = claude.projectSessionActivity(summary, new Map([['id-4', observation('waiting')]]), now);
  assert.equal(sessionWithActivity(first.month, 'claude:id-4').liveActivity.state, 'waiting');
  assert.equal(first.month.sessions, summary.month.sessions);
  assert.equal(summary.month.sessions['claude:id-4'].liveActivity, undefined);
  assert.equal(first.today, summary.today);
  const indexed = traversals;
  const running = claude.projectSessionActivity(first, new Map([['id-4', observation('running')]]), now + 2000);
  assert.equal(sessionWithActivity(running.month, 'claude:id-4').liveActivity.state, 'running');
  assert.equal(running.month.sessions, summary.month.sessions);
  assert.equal(traversals, indexed); // even a changed state never copies history
  assert.equal(claude.projectSessionActivity(first, new Map([['id-4', observation('waiting')]]), now + 3000), null);
  assert.equal(traversals, indexed);
  const cleared = claude.projectSessionActivity(first, new Map(), now + 4000);
  const patch = projection.activityPatch(first, cleared);
  assert.deepEqual(patch.observations, [{ client: 'claude', sessionId: 'id-4', liveActivity: observation('unknown', now + 4000) }]);
  assert.ok(JSON.stringify(patch).length < 500);
  assert.equal(cleared.allTime.totalTokens, summary.allTime.totalTokens);
});

test('a first running observation and its waiting transition cross the activity patch lane', () => {
  const baseline = fixture(10);
  const running = claude.projectSessionActivity(baseline, new Map([['id-4', observation('running')]]), now);
  const first = projection.activityPatch(baseline, running);
  assert.deepEqual(first.observations, [{ client: 'claude', sessionId: 'id-4', liveActivity: observation('running') }]);
  const waiting = claude.projectSessionActivity(running, new Map([['id-4', observation('waiting')]]), now + 1000);
  const received = projection.applyActivityPatch(projection.applyActivityPatch(baseline, first), projection.activityPatch(running, waiting));
  assert.equal(sessionWithActivity(received.allTime, 'claude:id-4').liveActivity.state, 'waiting');
  assert.equal(received.allTime.sessions, baseline.allTime.sessions);
  assert.equal(received.updatedAt, baseline.updatedAt);
});

test('history locations use direct keys and evict cold lookups without rescanning canonical maps', () => {
  const baseline = fixture(50_000);
  let traversals = 0;
  let reads = 0;
  const sessions = new Proxy(baseline.allTime.sessions, {
    ownKeys(target) { traversals += 1; return Reflect.ownKeys(target); },
    get(target, key) { reads += 1; return Reflect.get(target, key); }
  });
  baseline.month.sessions = sessions;
  baseline.allTime.sessions = sessions;
  assert.equal(projection.hasKnownSession(baseline, 'claude', 'id-0'), true);
  const seeded = traversals;
  for (let i = 1; i < 600; i += 1) assert.equal(projection.hasKnownSession(baseline, 'claude', `id-${i}`), true);
  const warmed = reads;
  assert.equal(projection.hasKnownSession(baseline, 'claude', 'id-599'), true);
  assert.equal(reads, warmed);
  assert.equal(projection.hasKnownSession(baseline, 'claude', 'id-0'), true);
  assert.ok(reads > warmed); // the oldest location was evicted
  assert.equal(traversals, seeded);
  const changed = { ...baseline, allTime: { ...baseline.allTime, sessions: {} }, month: { ...baseline.month, sessions: {} } };
  assert.equal(projection.hasKnownSession(changed, 'claude', 'id-0'), false);
  assert.equal(projection.hasKnownSession(baseline, 'claude', 'id-0'), true);
});

test('Codex alias lookup prefers verified files and bounds both cached hits and misses', () => {
  const baseline = fixture(10);
  const id = 'rollout-2025-10-01T12-00-00-native-old';
  baseline.allTime.sessions = { ...baseline.allTime.sessions, [`codex:${id}`]: { client: 'codex', sessionId: id } };
  let traversals = 0;
  baseline.allTime.sessions = new Proxy(baseline.allTime.sessions, {
    ownKeys(target) { traversals += 1; return Reflect.ownKeys(target); }
  });
  projection.hasKnownSession(baseline, 'codex', id);
  const seeded = traversals;
  const files = new Map([[id, { nativeId: 'verified-native' }]]);
  assert.deepEqual([...projection.codexActivityCandidates(baseline, ['verified-native'], files)], [id]);
  assert.equal(traversals, seeded);
  assert.deepEqual([...projection.codexActivityCandidates(baseline, ['native-old'])], [id]);
  const cold = traversals;
  assert.deepEqual([...projection.codexActivityCandidates(baseline, ['native-old'])], [id]);
  assert.equal(traversals, cold);
  const misses = Array.from({ length: 600 }, (_, i) => `missing-${i}`);
  assert.equal(projection.codexActivityCandidates(baseline, misses).size, 0);
  const filled = traversals;
  assert.equal(projection.codexActivityCandidates(baseline, ['missing-599']).size, 0);
  assert.equal(traversals, filled);
  assert.equal(projection.codexActivityCandidates(baseline, ['missing-0']).size, 0);
  assert.ok(traversals > filled); // negative entries obey the same retention budget
  assert.deepEqual([...projection.codexActivityCandidates(baseline, ['native-old'])], [id]);
});



test('patches preserve totals, usage freshness, archive exclusions, native clients and prior snapshots', () => {
  const summary = fixture(10);
  summary.month.sessions['claude:id-5'].archived = true;
  summary.nativeSessions = { today: { other: { client: 'reasonix', sessionId: 'other' } } };
  const patch = { observations: [
    { client: 'claude', sessionId: 'id-4', liveActivity: observation('waiting') },
    { client: 'claude', sessionId: 'id-5', liveActivity: observation('waiting') }
  ], nativeSessions: { today: { fresh: { client: 'codex', sessionId: 'new', native: true } } } };
  const next = projection.applyActivityPatch(summary, patch);
  assert.equal(next.updatedAt, summary.updatedAt);
  assert.equal(next.month.totalTokens, summary.month.totalTokens);
  assert.equal(summary.month.sessions['claude:id-4'].liveActivity, undefined);
  assert.equal(next.month.sessions['claude:id-5'].liveActivity, undefined);
  assert.ok(next.nativeSessions.today.other);
  assert.ok(next.nativeSessions.today.fresh);
  const stale = projection.applyActivityPatch(next, { observations: [{ client: 'claude', sessionId: 'id-4', liveActivity: observation('running', now - 1000) }] });
  assert.equal(sessionWithActivity(stale.month, 'claude:id-4').liveActivity.state, 'waiting');
});

test('DeviceState and runtime publish activity separately from accounting and the sink', () => {
  let configured;
  let records = 0;
  let uploads = 0;
  let transforms = 0;
  const patches = [];
  const runtime = createDeviceRuntime({
    transformUsage: (summary) => { transforms += 1; return summary; },
    onRecord: () => { records += 1; }, sink: { enqueue: () => { uploads += 1; } },
    onSessionActivity: (patch) => patches.push(patch)
  }, {
    createUsageRuntime(options) { configured = options; return { stop() {} }; },
    createLimitsRuntime: () => ({ stop() {} })
  });
  const patch = { observations: [{ client: 'claude', sessionId: 'id-4', liveActivity: observation('waiting') }], nativeSessions: {} };
  configured.onSessionActivity(patch);
  assert.equal(patches.length, 0); // no completed baseline yet
  configured.onUpdate(fixture(10), 'startup');
  configured.onSessionActivity(patch);
  assert.equal(records, 1);
  assert.equal(uploads, 1);
  assert.equal(transforms, 1);
  assert.equal(patches.length, 1);
  runtime.stop();
  configured.onSessionActivity(patch);
  assert.equal(patches.length, 1);
  const state = createDeviceState();
  state.updateUsage(fixture(10));
  state.updateActivity(patch);
  patch.observations[0].liveActivity.state = 'running';
  assert.equal(state.getSnapshot().month.sessions['claude:id-4'].liveActivity.state, 'waiting');
});



test('same-poll process validations batch together but a new poll always rechecks PID identity', async () => {
  const { createProcessStartBatch } = require('../../src/shared/processStarts');
  const calls = [];
  const read = async (pids, platform) => { calls.push({ pids, platform }); return new Map(pids.map((pid) => [pid, 42])); };
  const batch = createProcessStartBatch(read);
  const [registry, t3] = await Promise.all([batch([12, 34], 'darwin'), batch([34, 56], 'darwin')]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { pids: [12, 34, 56], platform: 'darwin' });
  assert.deepEqual([...registry], [[12, 42], [34, 42]]);
  assert.deepEqual([...t3], [[34, 42], [56, 42]]);
  await batch([34], 'darwin');
  assert.equal(calls.length, 1);
  await createProcessStartBatch(read)([34], 'darwin');
  assert.equal(calls.length, 2);
});








test('native refresh retains app relationships only for the same client, session and period without mutating either snapshot', () => {
  const old = Object.freeze({ client: 'claude', sessionId: 'child', t3ThreadId: 'thread', parentSessionId: 'parent', parentClient: 'codex' });
  const fresh = Object.freeze({ client: 'claude', sessionId: 'child', liveActivity: observation('running') });
  const summary = { today: { sessions: {} }, month: { sessions: {} }, nativeSessions: { today: { 'claude:child': old } } };
  const rows = Object.freeze({ 'claude:child': fresh });
  const linked = projection.nativeSessionsForPeriod(summary, 'claude', rows, 'today')['claude:child'];
  assert.deepEqual(linked, { ...fresh, t3ThreadId: 'thread', parentSessionId: 'parent', parentClient: 'codex' });
  assert.notEqual(linked, fresh);
  assert.equal(fresh.parentSessionId, undefined);
  assert.equal(old.liveActivity, undefined);
  assert.equal(projection.nativeSessionsForPeriod(summary, 'claude', rows, 'month')['claude:child'], fresh);
  const unrelated = { client: 'codex', sessionId: 'child' };
  assert.equal(projection.nativeSessionsForPeriod(summary, 'codex', { 'codex:child': unrelated }, 'today')['codex:child'], unrelated);
});

test('fresh native relationship evidence takes precedence as an atomic parent pair', () => {
  const summary = { today: { sessions: {} }, nativeSessions: { today: { 'claude:child': {
    client: 'claude', sessionId: 'child', t3ThreadId: 'old-thread', parentSessionId: 'old-parent', parentClient: 'codex'
  } } } };
  const fresh = { client: 'claude', sessionId: 'child', t3ThreadId: 'new-thread', parentSessionId: 'new-parent' };
  const linked = projection.nativeSessionsForPeriod(summary, 'claude', { 'claude:child': fresh }, 'today')['claude:child'];
  assert.deepEqual(linked, fresh);
  assert.equal(linked.parentClient, undefined, 'same-client parent must not inherit the old Codex namespace');
});
