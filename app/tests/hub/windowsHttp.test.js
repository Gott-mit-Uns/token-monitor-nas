'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHub } = require('../../src/hub/server');

async function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-windows-hub-'));
  const hub = createHub({ host: '127.0.0.1', port: 0, dataFile: path.join(root, 'devices.json'),
    secret: 'synthetic-secret', windowsStreamEnabled: true, syncSessionTitles: true, broadcastDelayMs: 1, ...options });
  await hub.start();
  t.after(async () => { await hub.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${hub.server.address().port}`;
  const send = (url, method = 'GET', body, auth = true) => fetch(origin + url, { method,
    headers: { 'content-type': 'application/json', 'accept-encoding': 'identity', 'x-token-monitor-response': 'minimal',
      ...(auth ? { authorization: 'Bearer synthetic-secret' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { hub, origin, send };
}

async function waitFor(predicate, timeout = 1500) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= end) throw new Error('Synthetic SSE event timeout');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function stream(origin, prefix = '/windows', encoding = 'gzip') {
  return new Promise((resolve, reject) => {
    const req = http.get(origin + prefix + '/api/stats/stream', { headers: {
      authorization: 'Bearer synthetic-secret', 'accept-encoding': encoding, 'x-token-monitor-stream': '2'
    } }, res => {
      const events = [];
      let encodedBytes = 0;
      let buffer = '';
      res.on('data', chunk => { encodedBytes += chunk.byteLength; });
      const decoded = res.headers['content-encoding'] === 'gzip' ? res.pipe(zlib.createGunzip()) : res;
      decoded.on('error', () => {});
      decoded.setEncoding('utf8');
      decoded.on('data', chunk => {
        buffer += chunk;
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const event = block.match(/^event:\s*(.+)$/m)?.[1];
          const data = block.match(/^data:\s*(.+)$/m)?.[1];
          if (event && data) events.push({ event, data: JSON.parse(data) });
        }
      });
      resolve({ events, headers: res.headers, get encodedBytes() { return encodedBytes; }, close() { req.destroy(); decoded.destroy(); } });
    });
    req.on('error', reject);
  });
}

test('Windows aliases share the store and gate, without redirects; disabled aliases return 404', async t => {
  const f = await fixture(t);
  const paths = ['/api/stats', '/api/devices', '/api/history', '/api/subscriptions', '/api/sync/content',
    '/api/sync/settings/modelAliases', '/api/sync/settings/customPricing', '/api/stream/status'];
  for (const url of paths) assert.equal((await f.send('/windows' + url, 'GET', undefined, false)).status, 401);
  assert.equal((await f.send('/windows/api/health', 'GET', undefined, false)).status, 200);
  assert.equal((await f.send('/windows/api/ingest', 'POST', { deviceId: 'a' }, false)).status, 401);
  assert.equal((await f.send('/windows/api/ingest', 'POST', { deviceId: 'a', today: { totalTokens: 42 } })).status, 200);
  const normal = await (await f.send('/api/devices')).json();
  assert.equal(normal.devices[0].periods.today.totalTokens, 42);
  assert.deepEqual(await (await f.send('/windows/api/devices')).json(), normal);
  for (const url of paths) {
    const res = await f.send('/windows' + url); assert.equal(res.status, 200); assert.equal(res.headers.has('location'), false);
  }
  const status = await (await f.send('/windows/api/stream/status')).json();
  assert.equal(status.metrics.requests['POST ingest'].requests, 2);
  assert.equal(status.metrics.requests['GET stats'].requests, 2);
  assert.equal(JSON.stringify(status).includes('synthetic-secret'), false);
  const disabled = await fixture(t, { windowsStreamEnabled: false });
  assert.equal((await disabled.send('/windows/api/health')).status, 404);
  assert.equal((await disabled.send('/api/health')).status, 200);
});

test('title admission, both settings, subscriptions and device deletion work through Windows aliases', async t => {
  const f = await fixture(t);
  const title = await (await f.send('/windows/api/sync/titles/a', 'PUT', { enabled: true })).json();
  assert.ok(title.generation);
  const session = { sessionId: 'one', client: 'hermes', totalTokens: 7, title: 'Synthetic title' };
  assert.equal((await f.send('/windows/api/ingest', 'POST', { deviceId: 'a', sessionTitleSyncGeneration: title.generation,
    today: { totalTokens: 7, sessions: { 'hermes:one': session } } })).status, 200);
  const devices = await (await f.send('/api/devices')).json();
  assert.equal(devices.devices[0].periods.today.sessions['hermes:one'].title, 'Synthetic title');
  for (const [kind, value] of [['modelAliases', { modelAliases: { synthetic: 'Alias' }, modelAliasGrouping: 'prefix' }], ['customPricing', []]]) {
    const before = await (await f.send('/api/sync/settings/' + kind)).json();
    const write = await f.send('/windows/api/sync/settings/' + kind, 'PUT', { baseRevision: before.revision, value });
    assert.equal(write.status, 200);
    const original = await (await f.send('/api/sync/settings/' + kind)).json();
    assert.deepEqual(original.value, value);
    assert.equal(original.revision, before.revision + 1);
    assert.equal((await f.send('/windows/api/sync/settings/' + kind, 'PUT', { baseRevision: before.revision, value })).status, 409);
  }
  const subs = await (await f.send('/api/subscriptions')).json();
  assert.equal((await f.send('/windows/api/subscriptions', 'PUT', { subscriptions: [], baseUpdatedAt: subs.updatedAt })).status, 200);
  assert.equal((await f.send('/windows/api/sync/titles/a', 'PUT', { enabled: false })).status, 200);
  const cleared = await (await f.send('/api/devices')).json();
  assert.equal(cleared.devices[0].periods.today.sessions['hermes:one'].title, undefined);
  assert.equal((await f.send('/windows/api/devices/a', 'DELETE')).status, 200);
  assert.equal((await (await f.send('/api/devices')).json()).devices.length, 0);
});

test('gzip streams flush immediately, normal streams stay realtime, manual stats stay latest', async t => {
  const policy = now => ({ timezone: 'Asia/Shanghai', calendarYear: 2026, calendarStatus: 'official', workday: true,
    intervalMs: 120, nextBoundaryAtMs: now + 3600000 });
  const f = await fixture(t, { windowsStreamClock: { policy } });
  f.hub.ingest({ deviceId: 'a', today: { totalTokens: 1 } });
  const limited = await stream(f.origin);
  const ordinary = await stream(f.origin, '');
  t.after(() => { limited.close(); ordinary.close(); });
  await waitFor(() => limited.events.length && ordinary.events.length);
  assert.equal(limited.headers['content-encoding'], 'gzip');
  assert.equal(limited.headers['x-accel-buffering'], 'no');
  assert.equal(limited.headers.vary, 'accept-encoding');
  assert.equal(ordinary.headers['content-encoding'], undefined);
  f.hub.ingest({ deviceId: 'a', today: { totalTokens: 999 } });
  await waitFor(() => ordinary.events.some(row => row.event === 'stats'));
  assert.equal(limited.events.filter(row => row.event === 'stats').length, 0);
  assert.equal((await (await f.send('/windows/api/stats')).json()).periods.today.totalTokens, 999);
  await waitFor(() => limited.events.some(row => row.event === 'stats'));
  assert.equal(limited.events.at(-1).data.stats.periods.today.totalTokens, 999);
  const diagnostic = await (await f.send('/windows/api/stream/status')).json();
  assert.equal(diagnostic.connectionCount, 1);
  assert.equal(diagnostic.gzipConnectionCount, 1);
  assert.equal(diagnostic.metrics.events.snapshot, 1);
  assert.equal(diagnostic.metrics.events.stats, 1);
  assert.ok(diagnostic.metrics.gzipStreamBodyBytes > 0);
  assert.ok(diagnostic.metrics.gzipStreamBodyBytes < diagnostic.metrics.logicalEventBytes);
  limited.close(); ordinary.close();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal((await (await f.send('/windows/api/stream/status')).json()).connectionCount, 0);
});

test('gzip q=0 falls back to identity, and urgent edits publish immediately', async t => {
  const f = await fixture(t);
  const limited = await stream(f.origin, '/windows', 'gzip;q=0, identity');
  t.after(() => limited.close());
  await waitFor(() => limited.events.length > 0);
  assert.equal(limited.headers['content-encoding'], undefined);
  await f.send('/windows/api/sync/titles/a', 'PUT', { enabled: false });
  await waitFor(() => limited.events.some(row => row.data.reason === 'sync-titles'));
  const diagnostic = await (await f.send('/windows/api/stream/status')).json();
  assert.equal(diagnostic.identityConnectionCount, 1);
  assert.equal(diagnostic.metrics.gzipStreamBodyBytes, 0);
  assert.ok(diagnostic.metrics.identityStreamBodyBytes > 0);
});

test('metrics count compressed JSON body bytes, and unknown paths cannot create unbounded metric keys', async t => {
  const f = await fixture(t);
  f.hub.ingest({ deviceId: 'a', today: { sessions: Object.fromEntries(Array.from({ length: 100 }, (_, i) =>
    [`hermes:${i}`, { sessionId: String(i), client: 'hermes', totalTokens: i, model: 'synthetic-model' }])) } });
  const raw = await new Promise((resolve, reject) => {
    http.get(f.origin + '/windows/api/stats', { headers: { authorization: 'Bearer synthetic-secret', 'accept-encoding': 'gzip' } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ body: Buffer.concat(chunks), headers: res.headers }));
    }).on('error', reject);
  });
  assert.equal(raw.headers['content-encoding'], 'gzip');
  for (let i = 0; i < 10; i++) await f.send('/windows/api/unknown-' + i);
  const diagnostic = await (await f.send('/windows/api/stream/status')).json();
  assert.equal(diagnostic.metrics.requests['GET stats'].encodedBodyBytes, raw.body.byteLength);
  assert.equal(diagnostic.metrics.requests['GET other'].requests, 10);
  assert.equal(Object.keys(diagnostic.metrics.requests).filter(key => key.includes('unknown')).length, 0);
});
