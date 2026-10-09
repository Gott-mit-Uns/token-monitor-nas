'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
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
