'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createHub } = require('../../src/hub/server');

async function fixture(t, displayName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-hub-name-'));
  const hub = createHub({ port: 0, host: '127.0.0.1', secret: 'fixture-only', displayName,
    windowsStreamEnabled: true, dataFile: path.join(dir, 'devices.json'), logger: { warn() {}, error() {} } });
  await hub.start();
  t.after(async () => { await hub.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${hub.server.address().port}`;
  const headers = { Authorization: 'Bearer fixture-only' };
  return { hub, origin, headers };
}

test('explicit Hub name is private and consistent in normal and Windows stats', async t => {
  const { hub, origin, headers } = await fixture(t, '  DXP4800  ');
  assert.deepEqual(hub.getStats().hub, { displayName: 'DXP4800' });
  for (const prefix of ['', '/windows']) {
    const denied = await fetch(`${origin}${prefix}/api/stats`);
    assert.equal(denied.status, 401);
    assert.equal((await denied.text()).includes('DXP4800'), false);
    const stats = await (await fetch(`${origin}${prefix}/api/stats`, { headers })).json();
    assert.deepEqual(stats.hub, { displayName: 'DXP4800' });
    assert.equal(stats.devices.length, 0); // Not a collector and never creates a device identity.
    const health = await (await fetch(`${origin}${prefix}/api/health`)).json();
    assert.equal(JSON.stringify(health).includes('DXP4800'), false);
    assert.equal(Object.hasOwn(health, 'hub'), false);
  }
});

test('initial authenticated SSE snapshot carries the same Hub name', async t => {
  const { origin, headers } = await fixture(t, 'DXP4800');
  for (const prefix of ['', '/windows']) {
    const stats = await new Promise((resolve, reject) => {
      const request = http.get(`${origin}${prefix}/api/stats/stream`, { headers }, response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          body += chunk;
          const match = body.match(/event: snapshot\ndata: (.+)\n\n/);
          if (match) { request.destroy(); resolve(JSON.parse(match[1]).stats); }
        });
      });
      request.setTimeout(3000, () => request.destroy(new Error('SSE snapshot timed out')));
      request.on('error', reject);
    });
    assert.deepEqual(stats.hub, { displayName: 'DXP4800' });
  }
});

test('legacy unconfigured Hub omits the optional metadata without guessing a name', async t => {
  const { hub } = await fixture(t, undefined);
  assert.equal(Object.hasOwn(hub.getStats(), 'hub'), false);
});

test('unsafe or oversized display names are rejected and Unicode code points are bounded', async t => {
  for (const displayName of ['a\nb', 'a\u202eb', 'a\u200bb', 'x'.repeat(81), '\ud800']) {
    assert.throws(() => createHub({ displayName }), /Hub display name/);
  }
  const { hub } = await fixture(t, '机'.repeat(80));
  assert.equal(hub.getStats().hub.displayName.length, 80);
});

test('real Node Hub entrypoint reads the explicit environment setting', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-hub-name-entry-'));
  const reserve = http.createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, [path.resolve(__dirname, '../../src/hub/server.js')], {
    cwd: dir, stdio: 'ignore', env: { PATH: process.env.PATH,
      TOKEN_MONITOR_PORT: String(port), TOKEN_MONITOR_HOST: '127.0.0.1',
      TOKEN_MONITOR_HUB_DISPLAY_NAME: 'DXP4800', TOKEN_MONITOR_SECRET: 'fixture-only',
      TOKEN_MONITOR_DATA_FILE: path.join(dir, 'devices.json') }
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const deadline = Date.now() + 5000;
  let stats;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/stats`, {
        headers: { Authorization: 'Bearer fixture-only' }, signal: AbortSignal.timeout(500) });
      assert.equal(response.status, 200);
      stats = await response.json(); break;
    } catch (_) { await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  assert.deepEqual(stats?.hub, { displayName: 'DXP4800' });
});
