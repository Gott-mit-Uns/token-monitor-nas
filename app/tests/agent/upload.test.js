'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const { postAgentUsage } = require('../../src/agent/upload');
const { createOrderedSink } = require('../../src/shared/orderedSink');

test('deadline covers a stalled response body and releases the upload queue', async () => {
  let calls = 0;
  let signal;
  const sink = createOrderedSink({send: (summary) => postAgentUsage({
    timeoutMs: 20, url: 'http://fixture.invalid', summary,
    fetchFn: async (_, options) => {
      calls++;
      if (calls === 1) {
        signal = options.signal;
        return {ok: true, status: 200, json: () => new Promise(() => {})};
      }
      return {ok: true, status: 200, json: async () => ({ok: true})};
    }
  })});
  const first = sink.enqueue({}, 1);
  const second = sink.enqueue({}, 2);
  await assert.rejects(first, {name: 'TimeoutError'});
  await second;
  assert.equal(signal.aborted, true);
  assert.equal(calls, 2);
  sink.stop();
});

test('HTTP failure does not read or disclose the response body', async () => {
  let signal;
  await assert.rejects(postAgentUsage({url: 'http://fixture.invalid', summary: {},
    fetchFn: async (_, options) => {
      signal = options.signal;
      return {ok: false, status: 503, text: () => {throw new Error('must not read');}};
    }
  }), /Hub responded 503/);
  assert.equal(signal.aborted, true);
});

test('a slow HTTP error body is closed immediately after upload failure', { timeout: 10_000 }, async t => {
  let chunkTimer;
  let resolveClosed;
  const responseClosed = new Promise(resolve => { resolveClosed = resolve; });
  const server = http.createServer((request, response) => {
    request.resume();
    response.writeHead(503, { 'content-type': 'text/plain' });
    response.write('synthetic error body that must not be logged');
    // This error body deliberately never ends until the client closes it.
    chunkTimer = setInterval(() => response.write('.'), 25);
    response.on('close', () => { clearInterval(chunkTimer); resolveClosed(); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    clearInterval(chunkTimer);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  let signal;
  const messages = [];
  await assert.rejects(postAgentUsage({
    // Allow cold fetch initialization on native CI; the failure must come from
    // the actual status, not an artificially short request deadline.
    timeoutMs: 5_000,
    url: `http://127.0.0.1:${server.address().port}/api/ingest`,
    summary: { deviceId: 'synthetic' },
    logger: message => messages.push(message),
    fetchFn: (url, options) => { signal = options.signal; return fetch(url, options); }
  }), /^Error: Hub responded 503$/);
  assert.equal(signal.aborted, true);
  let closeTimer;
  try {
    await Promise.race([
      responseClosed,
      new Promise((_, reject) => {
        closeTimer = setTimeout(() => reject(new Error('error response remained open')), 2_000);
      })
    ]);
  } finally {
    clearTimeout(closeTimer);
  }
  assert.deepEqual(messages, []);
});

test('aggregate-only upload preserves source and replaces old Hub session detail including retry', async () => {
  const { mergeDeviceRecord } = require('../../src/shared/usage');
  const summary = {deviceId: 'fixture', trackedClients: ['hermes'], projectsEnabled: false,
    today: {totalTokens: 10, totalCost: 1, sessions: {a: {client: 'hermes', totalTokens: 10}}},
    month: {totalTokens: 20, totalCost: 2, sessions: {a: {client: 'hermes', totalTokens: 10}, b: {client: 'hermes', totalTokens: 10}}},
    allTime: {totalTokens: 30}, history: {daily: [{date: '2026-10-03', totalTokens: 10, outputTokens: 4}]}};
  const before = JSON.stringify(summary);
  const bodies = [];
  await postAgentUsage({url: 'http://fixture.invalid', summary, sessionDetailsEnabled: false,
    fetchFn: async (_, options) => {
      bodies.push(JSON.parse(options.body));
      return bodies.length === 1 ? {status: 413, ok: false, arrayBuffer: async () => new ArrayBuffer(0)}
        : {status: 200, ok: true, json: async () => ({ok: true})};
    }});
  assert.equal(JSON.stringify(summary), before);
  assert.equal(bodies.length, 2);
  for (const body of bodies) {
    assert.deepEqual(body.today.sessions, {});
    assert.deepEqual(body.month.sessions, {});
    assert.deepEqual(body.sessionDetailsOmitted, {today: 1, month: 2});
    assert.equal(body.today.totalTokens, 10);
    assert.equal(body.month.totalCost, 2);
    assert.equal(body.allTime.totalTokens, 30);
    const merged = mergeDeviceRecord(mergeDeviceRecord(null, summary), body);
    assert.deepEqual(merged.periods.today.sessions, {});
    assert.deepEqual(merged.periods.month.sessions, {});
    assert.deepEqual(merged.sessionDetailsOmitted, {today: 1, month: 2});
  }
});

test('default upload retains session detail and full aggregates', async () => {
  let body;
  await postAgentUsage({url: 'http://fixture.invalid', summary: {today: {totalTokens: 10, sessions: {a: {totalTokens: 10}}}},
    fetchFn: async (_, options) => {body = JSON.parse(options.body); return {ok: true, status: 200, json: async () => ({ok: true})};}});
  assert.equal(body.today.sessions.a.totalTokens, 10);
  assert.equal(body.sessionDetailsOmitted, undefined);
});
