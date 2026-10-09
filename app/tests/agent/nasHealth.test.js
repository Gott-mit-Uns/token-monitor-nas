'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assess, createHealthTracker, processIdentity } = require('../../src/agent/nasHealth');
test('offline Hub does not mark local collection as stalled', () => {
  assert.deepEqual(assess({ collectedAt: 1000000, uploadedAt: 1 }, 1000100, 900000), { collection: 'ok', upload: 'stale' });
});
test('stalled collector and missing timestamps are unhealthy', () => {
  assert.equal(assess({ collectedAt: 1 }, 1000100, 900000).collection, 'stale');
  assert.equal(assess({}, 1000100, 900000).collection, 'stale');
});

test('future timestamps and timestamps preceding this boot are stale', () => {
  assert.equal(assess({ collectedAt: 2000000 }, 1000000, 900000).collection, 'stale');
  assert.equal(assess({ startedAt: 1000000, collectedAt: 999999 }, 1000100, 900000).collection, 'stale');
});

test('initialization replaces old health and accepts only this process lifetime', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-health-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, 'nas-health.json');
  const old = { version: 2, pid: 7, processIdentity: 'previous-boot', startedAt: 999000, collectedAt: 999900, uploadedAt: 999900 };
  fs.writeFileSync(filePath, JSON.stringify(old));
  let now = 1000000;
  const expected = { pid: 7, identity: 'current-boot' };
  assert.equal(assess(old, now, 900000, expected).collection, 'stale');
  const tracker = createHealthTracker({ filePath, pid: 7, identity: expected.identity, now: () => now });
  tracker.initialize();
  let state = JSON.parse(fs.readFileSync(filePath));
  assert.equal(assess(state, now, 900000, expected).collection, 'stale');
  now += 100;
  tracker.mark('collectedAt');
  state = JSON.parse(fs.readFileSync(filePath));
  assert.deepEqual(assess(state, now, 900000, expected), { collection: 'ok', upload: 'stale' });
  tracker.mark('uploadedAt');
  state = JSON.parse(fs.readFileSync(filePath));
  assert.deepEqual(assess(state, now, 900000, expected), { collection: 'ok', upload: 'ok' });
  assert.equal(assess(state, now, 900000, { pid: 7, identity: 'reused-pid' }).collection, 'stale');
});

test('Linux process identity is stable for a live process and rejects missing PIDs', { skip: process.platform !== 'linux' }, () => {
  assert.equal(processIdentity(process.pid), processIdentity(process.pid));
  assert.throws(() => processIdentity(2147483647));
});

test('health CLI rejects a previous process lifetime and stays unready until this boot collects', { skip: process.platform !== 'linux' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-health-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'agent.pid'), String(process.pid));
  fs.writeFileSync(path.join(root, 'state.db'), 'synthetic readable file');
  const filePath = path.join(root, 'nas-health.json');
  const run = () => spawnSync(process.execPath, [path.resolve(__dirname, '../../src/agent/nasHealth.js')], {
    encoding: 'utf8', env: { ...process.env, TOKEN_MONITOR_SHARED_DIR: root, HERMES_HOME: root, TOKEN_MONITOR_INTERVAL_MS: '300000' }
  });
  const old = createHealthTracker({ filePath, identity: 'old-process-lifetime' });
  old.initialize();
  old.mark('collectedAt');
  assert.equal(run().status, 1);
  const current = createHealthTracker({ filePath });
  current.initialize();
  assert.equal(run().status, 1);
  current.mark('collectedAt');
  const result = run();
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { collection: 'ok', upload: 'stale' });
});
