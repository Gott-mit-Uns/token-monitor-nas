'use strict';

function createSseChannel(res, { maxBufferedBytes = 8 * 1024 * 1024, blockedTimeoutMs = 30000, onClose = () => {} } = {}) {
  let closed = false;
  let blocked = false;
  let timer = null;
  let pendingStats = null;
  let pendingFreshness = null;

  function dispose() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    pendingStats = pendingFreshness = null;
    res.off('drain', drain);
    res.off('close', dispose);
    res.off('error', close);
    onClose();
  }
  function close() {
    dispose();
    res.destroy();
    return false;
  }
  function withinBudget(extraBytes = 0) {
    return (res.writableLength || 0) + (pendingStats?.bytes || 0) + (pendingFreshness?.bytes || 0) + extraBytes <= maxBufferedBytes;
  }
  function write(frame) {
    if (closed || res.destroyed || !withinBudget(frame.bytes)) return close();
    try {
      if (!res.write(frame.text)) {
        blocked = true;
        timer = setTimeout(close, blockedTimeoutMs);
        timer.unref?.();
      }
      return true;
    } catch (_) { return close(); }
  }
  function drain() {
    if (closed) return;
    blocked = false;
    clearTimeout(timer);
    timer = null;
    const stats = pendingStats;
    const freshness = pendingFreshness;
    pendingStats = pendingFreshness = null;
    if (stats && !write(stats)) return;
    if (freshness) {
      if (blocked) pendingFreshness = freshness;
      else write(freshness);
    }
    if (!withinBudget()) close();
  }
  function send(event, data) {
    if (closed) return false;
    const text = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const frame = { text, bytes: Buffer.byteLength(text) };
    if (!blocked) return write(frame);
    if (event === 'freshness') pendingFreshness = frame;
    else {
      // Replace intermediate snapshots instead of accumulating them. A later
      // freshness frame must follow the full snapshot, never replace it.
      pendingStats = frame;
      pendingFreshness = null;
    }
    return withinBudget() || close();
  }
  function heartbeat() {
    if (closed) return false;
    if (blocked) return true;
    return write({ text: ': hb\n\n', bytes: 6 });
  }
  res.on('drain', drain);
  res.on('close', dispose);
  res.on('error', close);
  return { send, heartbeat, dispose, close };
}

module.exports = { createSseChannel };
