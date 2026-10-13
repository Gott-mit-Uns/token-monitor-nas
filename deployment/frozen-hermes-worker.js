'use strict';
// Runs inside each released/candidate image. Only generated, read-only SQLite
// inputs and fixed local prices are supplied; no source parser is mocked.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function accounting(period) {
  return {
    totalTokens: period.totalTokens, outputTokens: period.clientOutputs.hermes,
    cacheReadTokens: period.clientCacheReads.hermes, cacheWriteTokens: period.clientCacheWrites.hermes,
    costUsd: period.costUsd,
    sessions: Object.fromEntries(Object.entries(period.sessions).sort().map(([id, row]) => [id, {
      totalTokens: row.totalTokens, outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens, cacheWriteTokens: row.cacheWriteTokens,
      messageCount: row.messageCount, costUsd: row.costUsd
    }]))
  };
}

async function main({ root = '/frozen', app = process.cwd(), hubFile = '/tmp/frozen-hub.json' } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(app, 'scripts/vendor/tokscale.json')));
  const key = `${process.platform}-${process.arch}`;
  const entry = manifest.platforms[key];
  assert.ok(entry, 'native parser manifest required');
  const binary = path.join(path.dirname(require.resolve(`${entry.package}/package.json`, { paths: [app] })), 'bin', 'tokscale');
  const parserSha256 = crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
  assert.equal(parserSha256, entry.sha256);
  const { extractUsageFromTokscale } = require(path.join(app, 'src/shared/usage'));
  const { parseGraphResult, normalizeHistory } = require(path.join(app, 'src/shared/history'));
  const { createHub } = require(path.join(app, 'src/hub/server'));
  const { postAgentUsage } = require(path.join(app, 'src/agent/upload'));
  const env = {
    PATH: process.env.PATH, HOME: path.join(root, 'home'), XDG_CONFIG_HOME: path.join(root, 'home/.config'),
    HERMES_HOME: path.join(root, 'hermes'), TOKSCALE_CONFIG_DIR: path.join(root, 'config'),
    TOKSCALE_PRICING_CACHE_ONLY: '1', TZ: 'UTC',
    HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9'
  };
  function run(args) {
    const child = spawnSync(binary, args, { env, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    assert.ifError(child.error);
    assert.equal(child.status, 0, 'synthetic frozen parser must succeed');
    return JSON.parse(child.stdout);
  }
  const base = ['--json', '--client', 'hermes', '--group-by', 'client,session,model', '--no-spinner'];
  const allTime = extractUsageFromTokscale(run(base));
  const month = extractUsageFromTokscale(run([...base, '--since', '2026-06-01', '--until', '2026-06-30']));
  const today = extractUsageFromTokscale(run([...base, '--since', '2026-06-07', '--until', '2026-06-07']));
  assert.deepEqual(accounting(extractUsageFromTokscale(run(base))), accounting(allTime), 'warm parser must preserve accounting');
  const history = normalizeHistory(parseGraphResult(run(['graph', '--client', 'hermes', '--no-spinner'])));
  assert.equal(allTime.totalTokens, 1845);
  assert.equal(month.totalTokens, 1845);
  assert.equal(today.totalTokens, 1570);
  assert.deepEqual(Object.keys(allTime.sessions).sort(), ['hermes:frozen-legacy', 'hermes:frozen-modern']);
  assert.equal(history.summary.totalTokens, 1845);
  assert.deepEqual(history.daily.map(row => [row.date, row.tokens]).sort(), [['2026-06-06', 275], ['2026-06-07', 1570]]);
  const hub = createHub({ port: 0, host: '127.0.0.1', dataFile: hubFile });
  await hub.start();
  try {
    const origin = `http://127.0.0.1:${hub.server.address().port}`;
    const summary = { deviceId: 'synthetic-frozen-device', updatedAt: '2026-06-07T12:00:00.000Z', today, month, allTime, history };
    await postAgentUsage({ fetchFn: fetch, url: `${origin}/api/ingest`, summary, timeoutMs: 5000 });
    const response = await fetch(`${origin}/api/devices`);
    assert.equal(response.status, 200);
    const devices = (await response.json()).devices;
    assert.equal(devices.length, 1);
    assert.equal(devices[0].deviceId, summary.deviceId);
    for (const [name, expected] of Object.entries({ today, month, allTime })) {
      const wireExpected = accounting(expected);
      // Existing sync policy omits all-time session detail; local full session
      // accounting is checked above, while today's/month's detail is uploaded.
      if (name === 'allTime') wireExpected.sessions = {};
      assert.deepEqual(accounting(devices[0].periods[name]), wireExpected, `actual Hub ingress must preserve ${name}`);
    }
    const hubHistory = (await (await fetch(`${origin}/api/history`)).json());
    assert.equal(hubHistory.summary.totalTokens, 1845, 'history must survive actual upload and Hub aggregation');
    console.log(JSON.stringify({ parserCommit: manifest.commit, parserSha256, architecture: process.arch,
      deviceId: devices[0].deviceId, uploaded: true,
      periods: { today: accounting(today), month: accounting(month), allTime: accounting(allTime) },
      history: history.daily.map(row => ({ date: row.date, tokens: row.tokens, outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens, cacheWriteTokens: row.cacheWriteTokens, cost: row.cost })).sort((a, b) => a.date.localeCompare(b.date)) }));
  } finally { await hub.stop(); }
}
if (require.main === module) main().catch(error => {
  console.error(`synthetic_frozen_worker_failed: ${error.message}`);
  process.exitCode = 1;
});
module.exports = { accounting, main };
