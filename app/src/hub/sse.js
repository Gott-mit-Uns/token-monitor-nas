'use strict';

const zlib = require('node:zlib');

function createSseChannel(res, { maxBufferedBytes = 8 * 1024 * 1024, blockedTimeoutMs = 30000,
  gzip = false, createCompressor = zlib.createGzip, onFrame = () => {}, onBodyBytes = () => {}, onClose = () => {} } = {}) {
  const encoder = gzip ? createCompressor({ level: zlib.constants.Z_BEST_SPEED, flush: zlib.constants.Z_SYNC_FLUSH }) : null;
  const target = encoder || res;
  let closed = false;
  let blocked = false;
  let timer = null;
  let pendingStats = null;
  let pendingFreshness = null;
  let pendingStatus = null;

  function dispose() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    pendingStats = pendingFreshness = pendingStatus = null;
    res.off('drain', drain);
    res.off('close', dispose);
    res.off('error', close);
    if (encoder) {
      encoder.off('drain', drain);
      encoder.unpipe(res);
      encoder.destroy();
    }
    onClose();
  }
  function close() {
    dispose();
    res.destroy();
    return false;
  }
  function withinBudget(extraBytes = 0) {
    return (res.writableLength || 0) + (encoder?.writableLength || 0) + (encoder?.readableLength || 0)
      + (pendingStats?.bytes || 0) + (pendingFreshness?.bytes || 0) + (pendingStatus?.bytes || 0) + extraBytes <= maxBufferedBytes;
  }
  function block() {
    if (closed || blocked) return;
    blocked = true;
    timer = setTimeout(close, blockedTimeoutMs);
    timer.unref?.();
  }
  function write(frame) {
    if (closed || res.destroyed || !withinBudget(frame.bytes)) return close();
    try {
      if (!target.write(frame.text) || res.writableNeedDrain) block();
      onFrame(frame.event, frame.bytes);
      if (!encoder) onBodyBytes(frame.bytes, false);
      return true;
    } catch (_) { return close(); }
  }
  function drain() {
    if (closed) return;
    if (res.writableNeedDrain || encoder?.writableNeedDrain) return;
    blocked = false;
    clearTimeout(timer);
    timer = null;
    const stats = pendingStats;
    const freshness = pendingFreshness;
    const status = pendingStatus;
    pendingStats = pendingFreshness = pendingStatus = null;
    if (stats && !write(stats)) return;
    if (freshness) {
      if (blocked) pendingFreshness = freshness;
      else write(freshness);
    }
    if (status) {
      if (blocked) pendingStatus = status;
      else write(status);
    }
    if (!withinBudget()) close();
  }
  function send(event, data) {
    if (closed) return false;
    const text = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const frame = { text, event, bytes: Buffer.byteLength(text) };
    if (!blocked) return write(frame);
    if (event === 'freshness') pendingFreshness = frame;
    else if (event === 'status') pendingStatus = frame;
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
    return write({ text: ': hb\n\n', event: 'heartbeat', bytes: 6 });
  }
  res.on('drain', drain);
  res.on('close', dispose);
  res.on('error', close);
  if (encoder) {
    encoder.on('drain', drain);
    encoder.on('error', close);
    encoder.pipe(res);
    encoder.on('data', chunk => {
      onBodyBytes(chunk.byteLength, true);
      if (!withinBudget()) close();
      else if (res.writableNeedDrain) block();
    });
  }
  return { send, heartbeat, dispose, close };
}

module.exports = { createSseChannel };
