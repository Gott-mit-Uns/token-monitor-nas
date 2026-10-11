'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createSseBlockReader, parseSseBlock } = require('../fixtures/desktop-0.68-sse-reader');
const { createWindowsStream } = require('../../src/hub/windowsStream');
const { applyFreshnessEvent } = require('../../src/shared/hubProtocol');

test('official 0.68 status handling suppresses fallback HTTP reads without refreshing old statistics', () => {
  let clock = Date.parse('2026-10-09T18:00:00+08:00');
  let id = 0;
  let reads = 0;
  let onPush;
  const timers = new Map();
  const noop = () => {};
  const state = { streamConnected: true, settings: { hubMode: 'client', refreshMs: 15000 }, period: 'today', stats: { original: true } };
  const context = vm.createContext({ state,
    setInterval(fn, delay) { const next = ++id; timers.set(next, { fn, delay, at: clock + delay }); return next; },
    clearInterval: next => timers.delete(next), refreshStats: () => { reads++; },
    window: { tokenMonitor: { onStatsPush: fn => { onPush = fn; } } },
    isRendererWindowHidden: () => false,
    statsRenderScheduler: { request: noop }, renderConnectionStatus: noop, refreshHubBuildStatus: noop,
    syncContentForm: { refresh: noop }, allTimeSessions: { invalidate: noop, attach: value => value },
    sessionStatsForDisplay: value => value, observeLiveTokenRate: noop, observeDisplayLiveTokenRates: noop,
    applyCodexActiveAccountFromStats: noop, fixedPeriodRangesApi: { isDerived: () => false },
    fixedPeriodHistoryNeedsWarmup: () => false, warmFixedPeriodHistory: noop, maybeUpdateBarsIcon: noop
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../fixtures/desktop-0.68-stats-consumer.js'), 'utf8'), context);
  const blocks = createSseBlockReader();
  let cached = { updatedAt: '2026-10-09T10:00:00Z', periods: { today: { totalTokens: 1 } },
    devices: [{ deviceId: 'a', updatedAt: '2026-10-09T10:00:00Z', receivedAt: '2026-10-09T10:00:00Z', stale: false }] };
  const original = structuredClone(cached);
  const stream = createWindowsStream({ now: () => clock, getStats: () => cached,
    getFreshness: () => cached.devices,
    setTimer: () => 1, clearTimer: noop,
    channel: { send(event, data) {
      const wire = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      // The upstream reader must also handle an event split across transport reads.
      for (const piece of [wire.slice(0, 11), wire.slice(11)]) for (const block of blocks.push(piece)) {
        const parsed = parseSseBlock(block);
        if (parsed.event === 'freshness') {
          cached = applyFreshnessEvent(cached, parsed.data);
          onPush({ event: 'stats', data: { stats: cached, reason: 'liveness' } });
        } else onPush(parsed);
      }
      return true;
    } } });
  function advance(ms) {
    const end = clock + ms;
    for (;;) {
      const next = [...timers.values()].filter(timer => timer.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      clock = next.at; next.at += next.delay; next.fn();
    }
    clock = end;
  }
  for (let i = 0; i < 130; i++) { advance(30000); stream.heartbeat(); }
  assert.equal(reads, 0);
  assert.equal(state.stats.updatedAt, original.updatedAt);
  assert.deepEqual(state.stats.periods, original.periods);
  onPush({ event: 'status', data: { connected: false, mode: 'sync' } });
  advance(15000); assert.equal(reads, 1);
  stream.dispose();
});
