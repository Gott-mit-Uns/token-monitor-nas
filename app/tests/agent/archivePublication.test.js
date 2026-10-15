'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');
const archiveModule = require('../../src/shared/usage/sessionUsageArchiveStore');
const { runAgent, runAgentOnce } = require('../../src/agent/runtime');

const filename = path.resolve(__dirname, '../../src/agent/agent.js');
const agentRequire = createRequire(filename);
const source = fs.readFileSync(filename, 'utf8');
const date = '2026-10-15T00:00:00.000Z';

function summary(tokens = 125) {
  return {
    deviceId: 'synthetic-archive-agent', updatedAt: date,
    history: [{ date: '2026-10-15', totalTokens: tokens, costUsd: tokens / 1000000 }],
    ...Object.fromEntries(['today', 'month', 'allTime'].map(period => [period, {
      totalTokens: tokens, costUsd: tokens / 1000000,
      sessions: { 'hermes:synthetic': {
        client: 'hermes', sessionId: 'synthetic', totalTokens: tokens,
        costUsd: tokens / 1000000, startedAt: date
      } }
    }]))
  };
}

async function entrypoint(t, { fault = null, dryRun = false, once = false, prepare } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-agent-archive-publication-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const archiveOptions = { databasePath: path.join(directory, 'archive.sqlite'), path: path.join(directory, 'legacy.json') };
  prepare?.(archiveOptions);
  if (fault === 'read' && !prepare) {
    const writer = archiveModule.createSessionUsageArchiveStore(archiveOptions);
    assert.equal(writer.capture(summary(), new Date(date)).error, null);
    writer.close();
  }
  let currentFault = fault;
  const state = { deliveries: [], marks: [], diagnostics: [], output: [], store: null, runtime: null };
  let collectorOptions, limitsDeps;
  let readyResolve, doneResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const done = new Promise(resolve => { doneResolve = resolve; });
  class FaultDatabase {
    constructor(...args) { this.database = new DatabaseSync(...args); }
    exec(sql) {
      return this.database.exec(sql);
    }
    prepare(sql) {
      if (currentFault === 'read' && /SELECT session_key, entry_json FROM sessions/.test(sql)) throw new Error('synthetic archive read failure');
      const statement = this.database.prepare(sql);
      if (!/INSERT INTO sessions/.test(sql)) return statement;
      return new Proxy(statement, { get(target, property) {
        if (property === 'run') return (...args) => {
          if (currentFault === 'write') throw new Error('synthetic archive write failure');
          return target.run(...args);
        };
        const value = target[property];
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    }
    close() { return this.database.close(); }
  }
  const runtimeDeps = { deviceRuntimeDeps: {
    createUsageRuntime(options) { collectorOptions = options; return { stop() {} }; },
    createLimitsRuntime(_options, deps) {
      limitsDeps = deps;
      return { stop() {}, refresh: async () => null, getSnapshot: () => ({ providers: [] }) };
    }
  } };
  const context = {
    require(id) {
      if (id === '../shared/config') return { ...agentRequire(id), loadDotEnv() {}, pidFilePath: () => path.join(directory, 'agent.pid') };
      if (id === './seedClients') return { seedAgentClients: clients => clients };
      if (id === './titleSync') return { createAgentTitleSync: () => ({ negotiate: async () => ({ syncSessionTitles: false }), invalidate() {} }) };
      if (id === './nasHealth') return { initializeHealth() {}, mark: kind => state.marks.push(kind) };
      if (id === './upload') return { postAgentUsage: async ({ summary: record }) => { state.deliveries.push(structuredClone(record)); } };
      if (id === '../shared/usage/sessionUsageArchiveStore') return {
        ...archiveModule,
        createSessionUsageArchiveStore(options) {
          state.store = archiveModule.createSessionUsageArchiveStore({ ...options, ...archiveOptions, DatabaseSync: FaultDatabase });
          return state.store;
        },
        readSessionUsageArchiveSnapshot: options => archiveModule.readSessionUsageArchiveSnapshot({ ...options, ...archiveOptions })
      };
      if (id === './runtime') return {
        runAgent(options) {
          state.runtime = runAgent(options, runtimeDeps);
          readyResolve();
          return state.runtime;
        },
        async runAgentOnce(options) {
          const result = runAgentOnce(options, runtimeDeps);
          readyResolve();
          try { return await result; } finally { doneResolve(); }
        }
      };
      return agentRequire(id);
    },
    process: {
      argv: ['node', filename, ...(dryRun ? ['--dry-run'] : []), ...(once || dryRun ? ['--once'] : [])],
      pid: 123, on() {},
      env: { TOKEN_MONITOR_HUB_URL: 'https://synthetic.invalid', TOKEN_MONITOR_SECRET: 'synthetic-fixture',
        TOKEN_MONITOR_DEVICE_ID: 'synthetic-archive-agent', TOKEN_MONITOR_CLIENTS: 'hermes',
        TOKEN_MONITOR_LIMITS_ENABLED: 'false', TOKEN_MONITOR_NAS_VERSION: 'v0.71.0-02' }
    },
    fetch: () => { throw new Error('test must not access the network'); },
    console: { log: message => state.output.push(message), warn() {}, error: error => state.diagnostics.push(error) }
  };
  vm.runInNewContext(source, context, { filename });
  await ready;
  t.after(() => { state.runtime?.stop(); state.store?.close(); });
  return {
    state, context, directory, archiveOptions, done,
    setFault(value) { currentFault = value; },
    async tick(record = summary()) {
      try { collectorOptions.onUpdate(record, 'synthetic'); }
      catch (error) { collectorOptions.onError(error, 'synthetic'); }
      await state.runtime?.flush();
    },
    async limits() {
      limitsDeps.onUpdate({ updatedAt: date, providers: [{ provider: 'notion', status: 'unavailable', windows: [] }] });
      await state.runtime?.flush();
    }
  };
}

for (const fault of ['read', 'write']) {
  test(`actual Agent entrypoint refuses first ${fault} failure and recovers without advancing health`, { timeout: 10000 }, async t => {
    const harness = await entrypoint(t, { fault });
    await harness.tick();
    assert.equal(harness.state.deliveries.length, 0);
    assert.deepEqual(harness.state.marks, []);
    assert.ok(harness.state.diagnostics.length);
    await harness.limits();
    assert.equal(harness.state.deliveries.length, 0, 'limits cannot publish an empty first usage baseline');
    harness.setFault(null);
    await harness.tick();
    assert.equal(harness.state.deliveries.length, 1);
    assert.equal(harness.state.deliveries[0].allTime.totalTokens, 125);
    assert.deepEqual(harness.state.marks, ['collectedAt', 'uploadedAt']);
  });
}

test('actual Agent preserves complete usage and health on failed write, including a subsequent limits-only upload', { timeout: 10000 }, async t => {
  const harness = await entrypoint(t);
  await harness.tick();
  const before = structuredClone(harness.state.deliveries[0]);
  const databaseBefore = fs.readFileSync(harness.archiveOptions.databasePath);
  harness.setFault('write');
  await harness.tick(summary(250));
  assert.equal(harness.state.deliveries.length, 1);
  assert.deepEqual(harness.state.marks, ['collectedAt', 'uploadedAt']);
  assert.deepEqual(fs.readFileSync(harness.archiveOptions.databasePath), databaseBefore);
  await harness.limits();
  assert.equal(harness.state.deliveries.length, 2);
  for (const key of ['deviceId', 'today', 'month', 'allTime', 'history']) {
    assert.deepEqual(harness.state.deliveries[1][key], before[key]);
  }
  assert.equal(harness.state.marks.filter(kind => kind === 'collectedAt').length, 1);
  harness.setFault(null);
  await harness.tick(summary(250));
  assert.equal(harness.state.deliveries.length, 3);
  assert.equal(harness.state.deliveries[2].today.totalTokens, 250);
  assert.equal(harness.state.marks.filter(kind => kind === 'collectedAt').length, 2);
});

test('actual Agent refuses corrupt persisted SQLite rows; repairing the same revision permits retry', { timeout: 10000 }, async t => {
  let savedRow;
  const harness = await entrypoint(t, { prepare(options) {
    const writer = archiveModule.createSessionUsageArchiveStore(options);
    assert.equal(writer.capture(summary(), new Date(date)).error, null);
    writer.close();
    const database = new DatabaseSync(options.databasePath);
    savedRow = database.prepare('SELECT entry_json FROM sessions').get().entry_json;
    database.exec("UPDATE sessions SET entry_json = 'synthetic invalid JSON'");
    database.close();
  } });
  await harness.tick(summary(250));
  assert.equal(harness.state.deliveries.length, 0);
  assert.deepEqual(harness.state.marks, []);
  const database = new DatabaseSync(harness.archiveOptions.databasePath);
  assert.equal(database.prepare('SELECT entry_json FROM sessions').get().entry_json, 'synthetic invalid JSON');
  database.prepare('UPDATE sessions SET entry_json = ?').run(savedRow);
  database.close();
  await harness.tick(summary(250));
  assert.equal(harness.state.deliveries.length, 1);
  assert.equal(harness.state.deliveries[0].today.totalTokens, 250);
});

test('actual Agent --once exits with failure and does not upload on archive failure', { timeout: 10000 }, async t => {
  const harness = await entrypoint(t, { fault: 'read', once: true });
  await harness.tick();
  await harness.done;
  await new Promise(setImmediate);
  assert.equal(harness.context.process.exitCode, 1);
  assert.equal(harness.state.deliveries.length, 0);
  assert.deepEqual(harness.state.marks, []);
});

test('actual Agent dry-run refuses corrupt legacy state without outputting a misleading summary or migrating it', { timeout: 10000 }, async t => {
  const bad = '{"version":1,"sessions":{"hermes:synthetic":{"invalid":true}}}';
  const harness = await entrypoint(t, { dryRun: true, prepare(options) { fs.writeFileSync(options.path, bad); } });
  await harness.tick();
  await harness.done;
  await new Promise(setImmediate);
  assert.equal(harness.context.process.exitCode, 1);
  assert.equal(harness.state.deliveries.length, 0);
  assert.equal(harness.state.output.length, 0);
  assert.equal(fs.readFileSync(harness.archiveOptions.path, 'utf8'), bad);
  assert.equal(fs.existsSync(harness.archiveOptions.databasePath), false);
});
