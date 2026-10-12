'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');
const { extractUsageFromTokscale } = require('../../src/shared/usage');
const { parseGraphResult, normalizeHistory } = require('../../src/shared/history');
const { discoverHermesProfileScanPaths } = require('../../src/shared/providers/hermes/profiles');
const { tokscaleExtraDirsEnv } = require('../../src/shared/customScanPaths');
const { loadManifest, runtimePlatformKey, binaryName } = require('../../scripts/vendoredTokscale');

// Synthetic schema and accounting semantics reviewed against Javis603/tokscale
// 4f17d6c6d85f5582949dcb0476c55518eafd7e23:
// crates/tokscale-core/tests/hermes.rs and src/sessions/hermes.rs.
// Real binary execution is intentional: a mocked JSON row cannot catch parser
// drift, missing profile discovery, cache overlap, or duplicate source scans.
function fixtureDb(file, profile = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, source TEXT NOT NULL, model TEXT,
        started_at REAL NOT NULL, message_count INTEGER DEFAULT 0,
        input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0,
        reasoning_tokens INTEGER DEFAULT 0, billing_provider TEXT,
        estimated_cost_usd REAL, actual_cost_usd REAL
      );
      CREATE TABLE session_model_usage (
        session_id TEXT NOT NULL, model TEXT NOT NULL,
        billing_provider TEXT NOT NULL DEFAULT '', task TEXT NOT NULL DEFAULT '',
        input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0,
        reasoning_tokens INTEGER DEFAULT 0, estimated_cost_usd REAL DEFAULT 0,
        actual_cost_usd REAL DEFAULT 0,
        PRIMARY KEY (session_id, model, billing_provider, task)
      );
    `);
    const session = db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const model = db.prepare('INSERT INTO session_model_usage VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    // Session totals intentionally exceed the authoritative per-model rows:
    // topping up this partly covered session would massively double count it.
    session.run('root-multi', 'cli', 'claude-sonnet-4', 1780833600, 7,
      99999, 99999, 99999, 99999, 100, 'anthropic', 0, 1);
    model.run('root-multi', 'claude-sonnet-4', 'anthropic', '', 1200, 300, 50, 20, 10, 0.12, 0.34);
    model.run('root-multi', 'claude-sonnet-4', 'anthropic', 'title_generation', 10, 2, 3, 1, 1, 0.05, 0);
    model.run('root-multi', 'gpt-5.4', 'openai', '', 100, 10, 5, 0, 4, 0.02, 0);
    if (profile) {
      // No child model row: legacy totals must survive alongside modern rows.
      // The identical root-multi session above is a copied DB session and must
      // be counted only once across the default and extra profile databases.
      session.run('profile-legacy', 'telegram', 'gpt-5.4', 1780747200, 3,
        100, 20, 5, 2, 5, 'openai', 0.1, null);
    }
    session.run(profile ? 'empty-profile' : 'empty-root', 'cli', 'gpt-5.4', 1780833600, 1,
      0, 0, 0, 0, 0, 'openai', 0, 0);
  } finally { db.close(); }
  // Closed DELETE-journal DBs allow a strict before/after byte comparison.
  fs.chmodSync(file, 0o444);
}

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function isolatedEnv(home, hermesHome, profiles) {
  const config = path.join(home, '.config', 'tokscale');
  const cache = path.join(config, 'cache');
  fs.mkdirSync(cache, { recursive: true });
  for (const provider of ['litellm', 'openrouter', 'models-dev']) {
    fs.writeFileSync(path.join(cache, `pricing-${provider}.json`),
      JSON.stringify({ timestamp: Math.floor(Date.now() / 1000), data: {} }));
  }
  // Build from an allowlist. Never inherit real scan-path overrides, settings,
  // credentials, proxies or the developer's production Hermes home.
  const proxy = 'http://127.0.0.1:9';
  return {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    HOME: home, USERPROFILE: home, TZ: 'UTC',
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    HERMES_HOME: hermesHome,
    TOKSCALE_EXTRA_DIRS: tokscaleExtraDirsEnv({ hermes: profiles }, '', { home, platform: process.platform }),
    TOKSCALE_CONFIG_DIR: config, TOKSCALE_PRICING_CACHE_ONLY: '1',
    HTTP_PROXY: proxy, HTTPS_PROXY: proxy, ALL_PROXY: proxy,
    http_proxy: proxy, https_proxy: proxy, all_proxy: proxy
  };
}

function runJson(binary, env, args) {
  const result = spawnSync(binary, args, { env, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `Synthetic Hermes CLI failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function assertPeriod(period, expected) {
  assert.equal(period.totalTokens, expected.total);
  assert.equal(period.clients.hermes, expected.total);
  assert.equal(period.clientOutputs.hermes, expected.output);
  assert.equal(period.clientCacheReads.hermes, expected.read);
  assert.equal(period.clientCacheWrites.hermes, expected.write);
  assert.equal(period.totalTokens - period.clientOutputs.hermes - period.clientCacheReads.hermes - period.clientCacheWrites.hermes, expected.input);
  assert.equal(Object.values(period.sessions).reduce((sum, row) => sum + row.messageCount, 0), expected.messages);
}

test('pinned Tokscale reads root/profile Hermes SQLite once and preserves token buckets, sessions, history and source bytes', (t) => {
  const manifest = loadManifest();
  const entry = manifest.platforms[runtimePlatformKey()];
  assert.ok(entry, 'current platform must have a pinned Tokscale binary');
  const appRoot = path.resolve(__dirname, '../..');
  const packageFile = require.resolve(`${entry.package}/package.json`, { paths: [appRoot] });
  const binary = path.join(path.dirname(packageFile), 'bin', binaryName());
  assert.equal(digest(binary), entry.sha256, 'contract must run the checksum-locked binary');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-hermes-contract-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hermesHome = path.join(home, '.hermes');
  const rootDb = path.join(hermesHome, 'state.db');
  const profileDb = path.join(hermesHome, 'profiles', 'synthetic-lab', 'state.db');
  fixtureDb(rootDb);
  fixtureDb(profileDb, true);
  const before = [digest(rootDb), digest(profileDb)];
  const profiles = discoverHermesProfileScanPaths(hermesHome);
  assert.deepEqual(profiles, [path.dirname(profileDb)]);
  const env = isolatedEnv(home, hermesHome, profiles);
  const base = ['--json', '--client', 'hermes', '--group-by', 'client,session,model', '--no-spinner'];
  const full = extractUsageFromTokscale(runJson(binary, env, base));
  // Hermes reasoning is part of output, not an extra disjoint token bucket.
  const all = { total: 1828, input: 1410, output: 332, read: 63, write: 23, messages: 10 };
  const current = { total: 1701, input: 1310, output: 312, read: 58, write: 21, messages: 7 };
  assertPeriod(full, all);
  assert.deepEqual(Object.keys(full.sessions).sort(), ['hermes:profile-legacy', 'hermes:root-multi']);
  assert.equal(full.sessions['hermes:root-multi'].totalTokens, 1701);
  assert.equal(full.sessions['hermes:root-multi'].outputTokens, 312);
  assert.equal(full.sessions['hermes:root-multi'].messageCount, 7);
  assert.equal(full.sessions['hermes:root-multi'].cacheReadTokens, 58);
  assert.equal(full.sessions['hermes:root-multi'].cacheWriteTokens, 21);
  assert.equal(full.sessions['hermes:root-multi'].models['claude-sonnet-4'], 1586);
  assert.equal(full.sessions['hermes:root-multi'].models['gpt-5.4'], 115);
  assert.equal(full.models['claude-sonnet-4'], 1586);
  assert.equal(full.models['gpt-5.4'], 242);
  assert.equal(full.sessions['hermes:profile-legacy'].totalTokens, 127);
  assert.equal(full.sessions['hermes:profile-legacy'].outputTokens, 20);
  assert.equal(full.sessions['hermes:profile-legacy'].cacheReadTokens, 5);
  assert.equal(full.sessions['hermes:profile-legacy'].cacheWriteTokens, 2);
  assert.equal(full.sessions['hermes:profile-legacy'].messageCount, 3);
  const month = extractUsageFromTokscale(runJson(binary, env, [...base, '--since', '2026-06-01', '--until', '2026-06-30']));
  assertPeriod(month, all);
  const day = extractUsageFromTokscale(runJson(binary, env, [...base, '--since', '2026-06-07', '--until', '2026-06-07']));
  assertPeriod(day, current);
  assert.deepEqual(Object.keys(day.sessions), ['hermes:root-multi']);
  // Exercise a warm parse too: the parser cache must preserve every bucket.
  assert.deepEqual(extractUsageFromTokscale(runJson(binary, env, base)), full);
  const history = normalizeHistory(parseGraphResult(runJson(binary, env, ['graph', '--client', 'hermes', '--no-spinner'])));
  assert.equal(history.summary.totalTokens, all.total);
  assert.equal(history.daily.length, 2);
  const today = history.daily.find(row => row.date === '2026-06-07');
  const previous = history.daily.find(row => row.date === '2026-06-06');
  assert.ok(today && previous, 'both fixed dataset days must survive graph normalization');
  assert.equal(today.tokens, current.total);
  assert.equal(previous.tokens, 127);
  assert.equal(today.cacheReadTokens + previous.cacheReadTokens, all.read);
  assert.equal(today.cacheWriteTokens + previous.cacheWriteTokens, all.write);
  assert.equal(today.outputTokens + previous.outputTokens, all.output);
  assert.equal(today.perClient.hermes.tokens + previous.perClient.hermes.tokens, all.total);
  assert.deepEqual([digest(rootDb), digest(profileDb)], before, 'read-only inputs must stay byte-identical');
  assert.deepEqual(fs.readdirSync(path.dirname(profileDb)), ['state.db'], 'no profile database sidecar writes');
  assert.deepEqual(fs.readdirSync(hermesHome).sort(), ['profiles', 'state.db'], 'no root database sidecar writes');
});
