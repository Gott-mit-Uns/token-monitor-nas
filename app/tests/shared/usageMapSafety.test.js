'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizePeriod, mergePeriods, applyPeriodDelta, stripSessionTextFromPeriod } = require('../../src/shared/usage');
const { createHub } = require('../../src/hub/server');

// Build the same own properties as JSON parsing, including legacy setter names.
const map = (key, value) => Object.fromEntries([[key, value]]);

for (const key of ['__proto__', 'constructor', 'prototype']) {
  test(`client/model key ${key} stays ordinary data through normalization and merging`, () => {
    const before = Object.getOwnPropertyDescriptors(Object.prototype);
    const period = normalizePeriod({
      totalTokens: 7, costUsd: 2,
      clients: map(key, 7), clientCosts: map(key, 2),
      models: map(key, 7), modelCosts: map(key, 2),
      clientModels: map(key, map(key, 7)), clientModelCosts: map(key, map(key, 2))
    });
    const merged = mergePeriods(period, period);
    assert.equal(merged.totalTokens, 14);
    assert.equal(merged.costUsd, 4);
    for (const field of ['clients', 'models']) {
      assert.equal(Object.hasOwn(merged[field], key), true);
      assert.equal(merged[field][key], 14);
    }
    for (const field of ['clientCosts', 'modelCosts']) assert.equal(merged[field][key], 4);
    assert.equal(merged.clientModels[key][key], 14);
    assert.equal(merged.clientModelCosts[key][key], 4);
    assert.equal(Object.getPrototypeOf(merged.clientModels), Object.prototype);
    assert.equal(Object.getPrototypeOf(merged.clientModels[key]), Object.prototype);
    assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before);
    assert.deepEqual(normalizePeriod(JSON.parse(JSON.stringify(merged))), merged);
  });
}

test('incremental period updates preserve reserved map keys without inherited values', () => {
  const base = { models: map('__proto__', 5) };
  const fresh = { models: { ...map('__proto__', 7), constructor: 3 } };
  const anchor = { models: map('__proto__', 2) };
  const updated = applyPeriodDelta(base, fresh, anchor);
  assert.deepEqual(updated.models, { ...map('__proto__', 10), constructor: 3 });
  assert.equal(Object.getPrototypeOf(updated.models), Object.prototype);
});

test('session text projection does not change its map prototype for reserved keys', () => {
  const source = { sessions: map('__proto__', { client: 'hermes', sessionId: 'synthetic', title: 'Synthetic title', totalTokens: 1 }) };
  const projected = stripSessionTextFromPeriod(source);
  assert.equal(Object.getPrototypeOf(projected.sessions), Object.prototype);
  assert.equal(Object.hasOwn(projected.sessions, '__proto__'), true);
  assert.equal(projected.sessions.__proto__.title, undefined);
  assert.equal(source.sessions.__proto__.title, 'Synthetic title');
});

test('Hub ingress isolates unusual model maps from later devices and persisted reloads', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-map-safety-'));
  const dataFile = path.join(dir, 'devices.json');
  const hub = createHub({ host: '127.0.0.1', port: 0, dataFile });
  t.after(async () => { await hub.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  await hub.start();
  const url = `http://127.0.0.1:${hub.server.address().port}/api/ingest`;
  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'cost');
  t.after(() => {
    // Keep a regression failure isolated even if this test is run on old code.
    if (original) Object.defineProperty(Object.prototype, 'cost', original);
    else delete Object.prototype.cost;
  });
  const post = async payload => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(response.status, 200);
    return response.json();
  };
  await post({ deviceId: 'synthetic-unusual', today: { totalTokens: 1, clientModels: map('__proto__', { cost: 73 }) } });
  await post({ deviceId: 'synthetic-normal', today: { totalTokens: 1 } });
  assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype, 'cost'), original);
  const normal = hub.getDevices().find(device => device.deviceId === 'synthetic-normal');
  assert.equal(normal.periods.today.costUsd, 0);
  assert.equal(hub.getStats().periods.today.costUsd, 0);
  const persisted = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.equal(persisted.devices['synthetic-normal'].periods.today.costUsd, 0);
  const reloaded = createHub({ dataFile });
  assert.equal(reloaded.getStats().periods.today.costUsd, 0);
  assert.equal(Object.getPrototypeOf(reloaded.getDevices()[0].periods.today.clientModels), Object.prototype);
});
