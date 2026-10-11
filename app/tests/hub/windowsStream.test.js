'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindowsStream } = require('../../src/hub/windowsStream');
const { applyFreshnessEvent } = require('../../src/shared/hubProtocol');

function fixture(start = '2026-10-09T08:00:00+08:00') {
  let time = Date.parse(start);
  let sequence = 0;
  const timers = new Map();
  const frames = [];
  let stats = { updatedAt: '2026-10-09T00:00:00Z', historyRevision: 'original', periods: { today: { totalTokens: 1, sessions: { a: { title: 'synthetic' } } } },
    devices: [{ deviceId: 'a', updatedAt: '2026-10-09T00:00:00Z', receivedAt: '2026-10-09T00:00:00Z', ageMs: 0, stale: false }] };
  const deps = { now: () => time,
    setTimer: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimer: id => timers.delete(id), getStats: () => structuredClone(stats),
    getFreshness: () => structuredClone(stats.devices),
    channel: { send: (event, data) => { frames.push({ event, data: structuredClone(data) }); return true; } } };
  const stream = createWindowsStream(deps);
  return { stream, frames, timers, deps, get stats() { return stats; }, set stats(value) { stats = value; },
    now: () => time, full: () => frames.filter(frame => ['stats', 'snapshot'].includes(frame.event)),
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const next = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      time = end;
    }
  };
}

test('latest changes are coalesced until ten minutes, and unchanged content is skipped', () => {
  const f = fixture();
  assert.equal(f.full().length, 1);
  for (let value = 2; value <= 300; value++) {
    f.stats.periods.today.totalTokens = value;
    f.stream.notify();
  }
  f.advance(599999); assert.equal(f.full().length, 1);
  f.advance(1); assert.equal(f.full().length, 2);
  assert.equal(f.full()[1].data.stats.periods.today.totalTokens, 300);
  f.stream.notify(); f.advance(600000);
  assert.equal(f.full().length, 2);
  assert.ok(f.timers.size <= 1);
  f.stream.dispose(); assert.equal(f.timers.size, 0);
});

test('timestamp-only refreshes remain quiet while a changed title and its revocation reach the client', () => {
  const f = fixture();
  f.stats.updatedAt = '2026-10-09T00:05:00Z';
  f.stats.devices[0].updatedAt = f.stats.updatedAt;
  f.stats.devices[0].receivedAt = f.stats.updatedAt;
  f.stats.devices[0].ageMs = 50;
  f.stream.notify();
  f.advance(600000);
  assert.equal(f.full().length, 1);

  f.stats.periods.today.sessions.a.title = 'changed synthetic title';
  f.stream.notify();
  assert.equal(f.full().length, 2);
  assert.equal(f.full().at(-1).data.stats.periods.today.sessions.a.title, 'changed synthetic title');

  f.stats.periods.today.sessions.a.title = '';
  f.stream.notify('sync-titles', true);
  assert.equal(f.full().length, 3);
  assert.equal(f.full().at(-1).data.reason, 'sync-titles');
  assert.equal(f.full().at(-1).data.stats.periods.today.sessions.a.title, '');
  assert.equal(f.full().at(-1).data.stats.periods.today.totalTokens, 1);
  f.stream.dispose();
});

test('outside work hours updates wait thirty minutes; manual read does not reset SSE', () => {
  const f = fixture('2026-10-09T18:00:00+08:00');
  f.stats.periods.today.totalTokens = 2; f.stream.notify();
  f.advance(10 * 60000);
  assert.equal(f.deps.getStats().periods.today.totalTokens, 2);
  f.advance(20 * 60000 - 1); assert.equal(f.full().length, 1);
  f.advance(1); assert.equal(f.full().length, 2);
  f.stream.dispose();
});

test('07:00 enters the shorter interval and publishes changes already ten minutes old', () => {
  const f = fixture('2026-10-09T06:45:00+08:00');
  f.stats.periods.today.totalTokens = 2; f.stream.notify();
  f.advance(15 * 60000 - 1); assert.equal(f.full().length, 1);
  f.advance(1); assert.equal(f.full().length, 2);
  f.stream.dispose();
});

test('17:00 lengthens the interval and midnight switches work calendar', () => {
  const f = fixture('2026-10-09T16:50:00+08:00');
  f.stats.periods.today.totalTokens = 2; f.stream.notify();
  f.advance(10 * 60000); assert.equal(f.full().length, 1);
  f.advance(20 * 60000); assert.equal(f.full().length, 2);
  f.stream.dispose();
  const midnight = fixture('2026-10-09T23:50:00+08:00');
  midnight.stats.periods.today.totalTokens = 2; midnight.stream.notify();
  midnight.advance(30 * 60000); assert.equal(midnight.full().length, 2);
  midnight.stream.dispose();
});

test('liveness preserves usage timestamps, sessions and revisions; new devices wait for a full snapshot', () => {
  const f = fixture('2026-10-09T18:00:00+08:00');
  const before = f.full()[0].data.stats;
  f.stats.updatedAt = '2026-10-09T10:05:00Z';
  f.stats.historyRevision = 'new';
  f.stats.periods.today.totalTokens = 999;
  f.stats.devices[0].receivedAt = '2026-10-09T10:05:00Z';
  f.stats.devices[0].ageMs = 100;
  f.stats.devices[0].stale = true;
  f.stats.devices.push({ deviceId: 'b', receivedAt: '2026-10-09T10:05:00Z', stale: false });
  f.stream.notify(); f.stream.heartbeat();
  const status = f.frames.find(frame => frame.event === 'status');
  assert.deepEqual(status.data, { connected: true, mode: 'sync' });
  const event = f.frames.find(frame => frame.event === 'freshness').data;
  const refreshed = applyFreshnessEvent(before, event);
  assert.equal(refreshed.updatedAt, before.updatedAt);
  assert.equal(refreshed.historyRevision, 'original');
  assert.deepEqual(refreshed.periods, before.periods);
  assert.equal(refreshed.devices.length, 1);
  assert.equal(refreshed.devices[0].updatedAt, before.devices[0].updatedAt);
  assert.equal(refreshed.devices[0].receivedAt, '2026-10-09T10:05:00Z');
  assert.equal(refreshed.devices[0].stale, true);
  f.advance(1800000);
  assert.equal(f.full().at(-1).data.stats.devices.length, 2);
  f.stream.dispose();
});

test('urgent revocations and shared edits bypass the period; reconnect always starts with latest data', () => {
  const f = fixture('2026-10-09T18:00:00+08:00');
  for (const reason of ['sync-titles', 'delete', 'sync-settings', 'subscriptions']) {
    f.stats.periods.today.sessions = {};
    f.stream.notify(reason, true);
    assert.equal(f.full().at(-1).data.reason, reason);
  }
  assert.equal(f.full().length, 5);
  f.stream.dispose();
  f.stats.periods.today.totalTokens = 10;
  const resumed = createWindowsStream(f.deps);
  assert.equal(f.full().at(-1).event, 'snapshot');
  assert.equal(f.full().at(-1).data.stats.periods.today.totalTokens, 10);
  resumed.dispose();
});

test('clock correction is reevaluated at heartbeat; rejected first send leaves no timer', () => {
  const f = fixture();
  f.stats.periods.today.totalTokens = 2; f.stream.notify();
  f.advance(600000); f.stream.heartbeat();
  assert.equal(f.full().length, 2);
  f.stream.dispose();
  const rejected = createWindowsStream({ ...f.deps, channel: { send: () => false } });
  assert.equal(f.timers.size, 0);
  rejected.dispose();
});

test('old stream consumers receive status but no unsupported freshness payload', () => {
  const f = fixture(); f.stream.dispose(); f.frames.length = 0;
  const stream = createWindowsStream({ ...f.deps, freshnessEvents: false });
  stream.heartbeat();
  assert.deepEqual(f.frames.map(frame => frame.event), ['snapshot', 'status']);
  stream.dispose();
});

test('heartbeats use only the liveness reader until a changed full snapshot is due', () => {
  const f = fixture('2026-10-09T18:00:00+08:00');
  f.stream.dispose(); f.frames.length = 0;
  let fullReads = 0;
  let livenessReads = 0;
  const stream = createWindowsStream({ ...f.deps,
    getStats: () => { fullReads++; return f.deps.getStats(); },
    getFreshness: at => { assert.equal(at, f.now()); livenessReads++; return f.deps.getFreshness(); }
  });
  f.stats.periods.today.totalTokens = 42;
  stream.notify();
  for (let i = 0; i < 59; i++) { f.advance(30000); stream.heartbeat(); }
  assert.equal(fullReads, 1);
  assert.equal(livenessReads, 59);
  assert.equal(f.full().length, 1);
  f.advance(30000); stream.heartbeat();
  assert.equal(fullReads, 2);
  assert.equal(livenessReads, 60);
  assert.equal(f.full().at(-1).data.stats.periods.today.totalTokens, 42);
  // Without another notification, even a later heartbeat has no full work.
  f.advance(1800000); stream.heartbeat();
  assert.equal(fullReads, 2);
  stream.dispose();
});
