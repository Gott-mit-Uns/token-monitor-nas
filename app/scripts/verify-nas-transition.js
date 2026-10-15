#!/usr/bin/env node
'use strict';
// Loopback-only mixed-version protocol exercise. Both trees are isolated source
// copies supplied by CI; no user state, credentials or production hosts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const baseline = path.resolve(arg('--baseline'));
const candidate = path.resolve(arg('--candidate'));
const output = process.argv.includes('--output') ? path.resolve(arg('--output')) : null;
const roots = { old: baseline, new: candidate };
function fixture(id, updatedAt) {
  return { deviceId: id, updatedAt, platform: 'linux', trackedClients: ['hermes'],
    history: { daily: [{ date: updatedAt.slice(0, 10), tokens: 125, cost: 0.000405 }] },
    ...Object.fromEntries(['today', 'month', 'allTime'].map(p => [p, {
      totalTokens: 125, outputTokens: 20, cacheReadTokens: 5, costUsd: 0.000405,
      sessions: { [`hermes:${id}`]: { client: 'hermes', sessionId: id,
        totalTokens: 125, outputTokens: 20, cacheReadTokens: 5, costUsd: 0.000405 } }
    }])) };
}
async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-version-transition-'));
  const secret = crypto.randomBytes(24).toString('hex');
  const headers = { authorization: `Bearer ${secret}` };
  const evidence = { scope: 'synthetic loopback HTTP, actual old/new upload and Hub modules; no production deployment',
    baselineVersion: require(path.join(baseline, 'package.json')).version,
    candidateVersion: require(path.join(candidate, 'package.json')).version, combinations: [] };
  try {
    for (const hubVersion of ['old', 'new']) {
      const { createHub } = require(path.join(roots[hubVersion], 'src/hub/server'));
      const dataFile = path.join(temp, `${hubVersion}-hub.json`);
      const options = { host: '127.0.0.1', port: 0, secret, dataFile, logger: { error() {}, warn() {} } };
      const hub = createHub(options);
      await hub.start();
      try {
        const origin = `http://127.0.0.1:${hub.server.address().port}`;
        for (const agentVersion of ['old', 'new']) {
          const { postAgentUsage } = require(path.join(roots[agentVersion], 'src/agent/upload'));
          const summary = fixture(`synthetic-${agentVersion}`, new Date().toISOString());
          await assert.rejects(postAgentUsage({ fetchFn: async () => { throw new Error('synthetic disconnect'); },
            url: `${origin}/api/ingest`, headers, summary, timeoutMs: 1000 }));
          for (let retry = 0; retry < 2; retry++) {
            await postAgentUsage({ fetchFn: fetch, url: `${origin}/api/ingest`, headers, summary });
          }
          const response = await fetch(`${origin}/api/devices`, { headers });
          assert.equal(response.status, 200);
          const { devices } = await response.json();
          const device = devices.find(d => d.deviceId === summary.deviceId);
          assert.equal(device.periods.allTime.totalTokens, 125);
          assert.equal(device.periods.allTime.costUsd, 0.000405);
          assert.deepEqual(device.history.daily, summary.history.daily);
          evidence.combinations.push({ hub: hubVersion, agent: agentVersion, upload: 'passed',
            disconnectRetryAndDuplicate: 'passed', tokens: 125, costUsd: 0.000405 });
        }
        const { fetchCursorLimits } = require(path.join(candidate, 'src/shared/providers/cursor/limits'));
        const quota = await fetchCursorLimits({}, { readActiveAccount: () => ({ id: 'synthetic' }), probe: async () => ({ ok: true,
          usage: { planInfo: { isMerged: true, includedUsagePeriod: 'weekly' }, planPercent: 25,
            prepaid: { availableUsd: 12.5 } }, user: {} }) });
        assert.ok(quota.windows.some(w => w.kind === 'weekly'));
        assert.ok(quota.windows.some(w => w.metric === 'credits' && w.remaining === 12.5));
        const before = hub.getDevices().find(d => d.deviceId === 'synthetic-new');
        hub.ingest({ deviceId: 'synthetic-new', limitsOnly: true, updatedAt: before.updatedAt,
          limits: { updatedAt: new Date().toISOString(), providers: [quota] } });
        for (const client of ['old', 'new']) {
          const { aggregateDevices } = require(path.join(roots[client], 'src/shared/usage'));
          const response = await fetch(`${origin}/api/devices`, { headers });
          const wireDevices = (await response.json()).devices;
          assert.deepEqual(wireDevices.find(d => d.deviceId === 'synthetic-new').history, before.history);
          const stats = aggregateDevices(wireDevices, 0);
          assert.equal(stats.periods.allTime.totalTokens, 250);
          const device = stats.devices.find(d => d.deviceId === 'synthetic-new');
          assert.equal(device.limits.providers[0].windows.length, 2);
          evidence.combinations.push({ hub: hubVersion, client, quotaWindowsAndUsage: 'passed' });
        }
      } finally { await hub.stop(); }
      const restarted = createHub(options);
      assert.equal(restarted.getDevices().length, 2);
      assert.equal(restarted.getStats().periods.allTime.totalTokens, 250);
    }
    if (output) fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
main().catch(() => { console.error('Mixed-version synthetic transition verification failed.'); process.exitCode = 1; });
