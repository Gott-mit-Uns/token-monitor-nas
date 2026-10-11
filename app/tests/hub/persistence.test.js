'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHub } = require('../../src/hub/server');
const { deviceFreshness } = require('../../src/hub/deviceFreshness');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-hub-durable-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, 'devices.json');
}

test('only a missing Hub file starts empty; malformed or inaccessible files stay untouched', t => {
  const file = fixture(t);
  assert.equal(createHub({ dataFile: file }).getDevices().length, 0);
  assert.equal(fs.existsSync(file), false);
  for (const content of ['', '{broken', 'null', '[]', '{}', '{"devices":[]}', '{"devices":{"a":null}}']) {
    fs.writeFileSync(file, content);
    assert.throws(() => createHub({ dataFile: file }), /Hub data file/);
    assert.equal(fs.readFileSync(file, 'utf8'), content);
  }
  fs.rmSync(file);
  fs.mkdirSync(file);
  assert.throws(() => createHub({ dataFile: file }), /cannot be read/);
  assert.equal(fs.statSync(file).isDirectory(), true);
});

test('failed ingest does not change memory, disk, listeners, or persisted subscriptions', t => {
  const file = fixture(t);
  const hub = createHub({ dataFile: file });
  hub.ingest({ deviceId: 'a', today: { totalTokens: 10 } });
  hub.setSubscriptions([{ id: 'synthetic', provider: 'codex', startDate: '2026-01-01', currency: 'USD' }], '');
  const before = fs.readFileSync(file, 'utf8');
  let notifications = 0;
  hub.onStats(() => notifications++);
  fs.mkdirSync(`${file}.tmp`);
  for (const id of ['a', 'new-device']) {
    assert.throws(() => hub.ingest({ deviceId: id, today: { totalTokens: 99 } }), { code: 'hub_persistence_failed' });
  }
  assert.equal(hub.getDevices().length, 1);
  assert.equal(hub.getDevices()[0].periods.today.totalTokens, 10);
  assert.equal(notifications, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  fs.rmSync(`${file}.tmp`, { recursive: true });
  hub.ingest({ deviceId: 'a', today: { totalTokens: 20 } });
  const restarted = createHub({ dataFile: file });
  assert.equal(restarted.getDevices()[0].periods.today.totalTokens, 20);
  assert.equal(restarted.getSubscriptions().subscriptions.length, 1);
});

test('HTTP reports unavailable persistence instead of acknowledging a failed upload', async t => {
  const file = fixture(t);
  const hub = createHub({ port: 0, host: '127.0.0.1', dataFile: file });
  await hub.start();
  t.after(() => hub.stop());
  fs.mkdirSync(`${file}.tmp`);
  const response = await fetch(`http://127.0.0.1:${hub.server.address().port}/api/ingest`, { method: 'POST', body: JSON.stringify({ deviceId: 'a', today: { totalTokens: 1 } }) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'persistence_unavailable' });
  assert.equal(hub.getDevices().length, 0);
  assert.equal(fs.existsSync(file), false);
});

test('object timestamps cannot persist a failure in stats, history or live freshness', async t => {
  const file = fixture(t);
  const hub = createHub({ port: 0, host: '127.0.0.1', dataFile: file });
  await hub.start();
  t.after(() => hub.stop());
  const response = await fetch(`http://127.0.0.1:${hub.server.address().port}/api/ingest`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: 'synthetic', updatedAt: { toString: null, valueOf: null },
      today: { totalTokens: 7 }, allTime: { totalTokens: 7 } })
  });
  assert.equal(response.status, 200);
  const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(typeof persisted.devices.synthetic.updatedAt, 'string');
  const restarted = createHub({ dataFile: file });
  assert.equal(restarted.getStats().periods.allTime.totalTokens, 7);
  assert.doesNotThrow(() => restarted.getHistory());
  assert.doesNotThrow(() => deviceFreshness(restarted.getDevices(), 600000));

  // Older on-disk records are normalized while reading without invoking an
  // attacker-controlled object's primitive conversion or rewriting the file.
  persisted.devices.synthetic.updatedAt = { toString: null, valueOf: null };
  persisted.devices.synthetic.receivedAt = { toString: null, valueOf: null };
  const legacy = JSON.stringify(persisted);
  fs.writeFileSync(file, legacy);
  const loaded = createHub({ dataFile: file });
  assert.equal(loaded.getStats().periods.allTime.totalTokens, 7);
  assert.doesNotThrow(() => loaded.getHistory());
  assert.doesNotThrow(() => deviceFreshness(loaded.getDevices(), 600000));
  assert.equal(fs.readFileSync(file, 'utf8'), legacy);
});
