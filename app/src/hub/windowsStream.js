'use strict';

const { hubStatsContentDigest } = require('./statsContentDigest');
const { windowsStreamPolicy } = require('./windowsSchedule');

function createWindowsStream({ channel, getStats, getFreshness, freshnessEvents = true, now = Date.now,
  policy = windowsStreamPolicy, setTimer = setTimeout, clearTimer = clearTimeout, onFull = () => {} }) {
  let closed = false;
  let timer = null;
  let pending = false;
  let lastFullAt = 0;
  let lastContentKey = '';
  let visibleIds = new Set();
  let pendingReason = 'ingest';

  function full(reason, stats = getStats()) {
    const at = now();
    if (!channel.send(reason === 'snapshot' ? 'snapshot' : 'stats', {
      type: 'stats', reason, stats, at: new Date(at).toISOString()
    })) { closed = true; clearTimer(timer); timer = null; return; }
    lastFullAt = at;
    lastContentKey = hubStatsContentDigest(stats);
    visibleIds = new Set((stats.devices || []).map(device => device.deviceId));
    pending = false;
    onFull(reason, at);
  }

  function schedule() {
    clearTimer(timer);
    timer = null;
    if (closed) return;
    const at = now();
    const current = policy(at);
    const due = pending ? lastFullAt + current.intervalMs : Infinity;
    timer = setTimer(pump, Math.max(1, Math.min(due, current.nextBoundaryAtMs) - at));
    timer?.unref?.();
  }

  function pump() {
    if (closed) return;
    const at = now();
    if (pending && at >= lastFullAt + policy(at).intervalMs) {
      const stats = getStats();
      pending = false;
      if (hubStatsContentDigest(stats) !== lastContentKey) full(pendingReason, stats);
    }
    schedule();
  }

  function notify(reason = 'ingest', urgent = false, stats) {
    if (closed) return;
    if (urgent) full(reason, stats);
    else { pending = true; pendingReason = reason; }
    pump();
  }

  function heartbeat() {
    if (closed) return;
    // Reevaluate after clock corrections or a delayed boundary timer as well.
    pump();
    const nowMs = now();
    const at = new Date(nowMs).toISOString();
    if (!channel.send('status', { connected: true, mode: 'sync' })) return;
    if (!freshnessEvents) return;
    const devices = getFreshness(nowMs);
    // Only admission/liveness metadata travels here. In particular, never stamp
    // delayed usage, sessions, limits or History with a newer source timestamp.
    channel.send('freshness', {
      type: 'freshness', reason: 'liveness', at,
      stats: { devices: devices.filter(device => visibleIds.has(device.deviceId)).map(device => ({
        deviceId: device.deviceId, receivedAt: device.receivedAt, ageMs: device.ageMs, stale: device.stale
      })) }
    });
  }

  function dispose() { closed = true; clearTimer(timer); timer = null; pending = false; visibleIds.clear(); }
  function status() { return { lastFullSnapshotAt: new Date(lastFullAt).toISOString(), pending,
    nextFullSnapshotDueAt: new Date(lastFullAt + policy(now()).intervalMs).toISOString() }; }
  full('snapshot');
  schedule();
  return { notify, heartbeat, dispose, status };
}

module.exports = { createWindowsStream };
