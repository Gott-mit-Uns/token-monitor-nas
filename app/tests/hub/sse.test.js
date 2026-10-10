'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');
const zlib = require('node:zlib');
const { createSseChannel } = require('../../src/hub/sse');

class Response extends EventEmitter {
  constructor() { super(); this.writableLength = 0; this.destroyed = false; this.frames = []; this.accept = false; }
  write(frame) { this.frames.push(frame); this.writableLength += Buffer.byteLength(frame); return this.accept; }
  destroy() { this.destroyed = true; this.emit('close'); }
}

test('a blocked stream retains only its latest snapshot, followed by latest freshness', () => {
  const response = new Response();
  const channel = createSseChannel(response);
  channel.send('snapshot', { revision: 0 });
  for (let revision = 1; revision <= 300; revision++) channel.send('stats', { revision });
  channel.send('freshness', { revision: 301 });
  channel.heartbeat();
  assert.equal(response.frames.length, 1);
  response.writableLength = 0;
  response.accept = true;
  response.emit('drain');
  assert.equal(response.frames.length, 3);
  assert.match(response.frames[1], /"revision":300/);
  assert.match(response.frames[2], /event: freshness/);
  channel.dispose();
  assert.equal(response.listenerCount('drain'), 0);
});

test('an oversized pending frame closes the connection and discards queued data', () => {
  const response = new Response();
  let closed = 0;
  const channel = createSseChannel(response, { maxBufferedBytes: 1024, onClose: () => closed++ });
  channel.send('snapshot', {});
  assert.equal(channel.send('stats', { value: 'x'.repeat(2000) }), false);
  assert.equal(response.destroyed, true);
  assert.equal(closed, 1);
  response.emit('drain');
  assert.equal(response.frames.length, 1);
});

test('a connection that never drains expires without further updates', async () => {
  const response = new Response();
  const channel = createSseChannel(response, { blockedTimeoutMs: 10 });
  channel.send('snapshot', {});
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(response.destroyed, true);
  assert.equal(channel.send('stats', {}), false);
});

test('response errors close the connection and release listeners and pending frames once', () => {
  const response = new Response();
  let closed = 0;
  const channel = createSseChannel(response, { onClose: () => closed++ });
  channel.send('snapshot', {});
  channel.send('stats', { revision: 1 });
  response.emit('error', new Error('synthetic socket failure'));
  assert.equal(response.destroyed, true);
  assert.equal(closed, 1);
  assert.equal(response.listenerCount('drain'), 0);
  assert.equal(channel.send('stats', {}), false);
});

test('status never replaces a blocked full snapshot or its following freshness', () => {
  const response = new Response();
  const channel = createSseChannel(response);
  channel.send('snapshot', { revision: 0 });
  channel.send('stats', { revision: 1 });
  channel.send('freshness', { revision: 2 });
  for (let i = 0; i < 100; i++) channel.send('status', { connected: true });
  response.writableLength = 0; response.accept = true; response.emit('drain');
  assert.deepEqual(response.frames.map(frame => frame.match(/event: (\w+)/)[1]), ['snapshot', 'stats', 'freshness', 'status']);
  channel.dispose();
});

class SlowResponse extends Writable {
  constructor() { super({ highWaterMark: 1 }); this.chunks = []; this.callbacks = []; this.allow = false; }
  _write(chunk, _encoding, callback) { this.chunks.push(Buffer.from(chunk)); if (this.allow) callback(); else this.callbacks.push(callback); }
  release() { this.allow = true; for (const callback of this.callbacks.splice(0)) callback(); }
}

test('gzip respects downstream backpressure and keeps the latest snapshot plus liveness and status', async () => {
  const response = new SlowResponse();
  const channel = createSseChannel(response, { gzip: true });
  channel.send('snapshot', { revision: 0, filler: 'x'.repeat(10000) });
  await new Promise(resolve => setTimeout(resolve, 10));
  for (let revision = 1; revision <= 300; revision++) channel.send('stats', { revision, filler: 'x'.repeat(10000) });
  channel.send('freshness', { revision: 301 });
  channel.send('status', { connected: true });
  assert.equal(response.destroyed, false);
  assert.ok(response.writableLength < 100000);
  response.release();
  await new Promise(resolve => setTimeout(resolve, 30));
  const decoded = zlib.gunzipSync(Buffer.concat(response.chunks), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString();
  assert.match(decoded, /"revision":300/);
  assert.doesNotMatch(decoded, /"revision":299/);
  assert.ok(decoded.indexOf('"revision":300') < decoded.indexOf('event: freshness'));
  assert.ok(decoded.indexOf('event: freshness') < decoded.indexOf('event: status'));
  channel.dispose(); response.destroy();
});

test('gzip blocked timeout and oversized pending data terminate the whole transport', async () => {
  const response = new SlowResponse();
  const channel = createSseChannel(response, { gzip: true, blockedTimeoutMs: 10 });
  channel.send('snapshot', { filler: 'x'.repeat(10000) });
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(response.destroyed, true);
  assert.equal(channel.send('status', { connected: true }), false);
  const oversized = new SlowResponse();
  const bounded = createSseChannel(oversized, { gzip: true, maxBufferedBytes: 1024 });
  assert.equal(bounded.send('snapshot', { filler: 'x'.repeat(2000) }), false);
  assert.equal(oversized.destroyed, true);
});

test('compressor errors release the channel exactly once', () => {
  const response = new SlowResponse();
  let compressor;
  let closes = 0;
  const channel = createSseChannel(response, { gzip: true, onClose: () => closes++,
    createCompressor: options => { compressor = zlib.createGzip(options); return compressor; } });
  channel.send('snapshot', { revision: 1 });
  compressor.emit('error', new Error('synthetic compression error'));
  assert.equal(closes, 1);
  assert.equal(response.destroyed, true);
  assert.equal(compressor.destroyed, true);
  assert.equal(channel.send('status', {}), false);
});
