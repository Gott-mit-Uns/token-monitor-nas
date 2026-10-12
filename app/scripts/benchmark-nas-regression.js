'use strict';
// Offline runtime benchmark: real collector, archive, upload, Hub and independent
// Watcher; fixed synthetic Tokscale output at the parser boundary. No .env load.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork, spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const crypto = require('node:crypto');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture(count = 1000, revision = 0) {
  return { entries: Array.from({ length: count }, (_, i) => ({
    client: 'hermes', sessionId: `synthetic-${i}`, model: 'synthetic-model',
    input: 100 + revision, output: 20, cacheRead: 10, cacheWrite: 0, cost: 0, messages: 1
  })) };
}
function sourceIdentity(app) {
  const hash = crypto.createHash('sha256');
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      if (fs.statSync(file).isDirectory()) visit(file);
      else { hash.update(path.relative(app, file)); hash.update(fs.readFileSync(file)); }
    }
  }
  visit(path.join(app, 'src'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
  const dependencies = {};
  for (const name of ['chokidar', 'dotenv']) {
    const packageFile = path.join(app, 'node_modules', name, 'package.json');
    dependencies[name] = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
  }
  return { sourceSha256: hash.digest('hex'), appVersion: packageJson.version, dependencies };
}
function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function compare(baseline, candidate, ratio = 1.25, rssAllowanceMiB = 16, timeAllowanceMs = 100) {
  const findings = [];
  for (const role of ['agent', 'watcher', 'hub']) for (const phase of ['cold', 'idle', 'peak', 'sustained']) {
    const before = median(baseline.runs.map(run => run.phases[phase][role].maxRssMiB));
    const after = median(candidate.runs.map(run => run.phases[phase][role].maxRssMiB));
    findings.push({ metric: `${role}.${phase}.maxRssMiB`, baseline: before, candidate: after,
      limit: before * ratio + rssAllowanceMiB, passed: after <= before * ratio + rssAllowanceMiB });
  }
  for (const metric of ['coldMs', 'peakMs', 'sustainedTickMedianMs']) {
    const before = median(baseline.runs.map(run => run[metric]));
    const after = median(candidate.runs.map(run => run[metric]));
    findings.push({ metric, baseline: before, candidate: after, limit: before * ratio + timeAllowanceMs,
      passed: after <= before * ratio + timeAllowanceMs });
  }
  return { status: findings.every(row => row.passed) ? 'passed' : 'regression', ratio, rssAllowanceMiB, timeAllowanceMs, findings };
}
async function worker(role, app, root, count) {
  os.homedir = () => root;
  if (role === 'agent') {
    const childProcess = require('node:child_process');
    const originalFork = childProcess.fork;
    childProcess.fork = function(modulePath, ...args) {
      const child = originalFork.call(this, modulePath, ...args);
      if (path.basename(modulePath) === 'watcherWorker.js') process.send({ type: 'watcherPid', pid: child.pid });
      return child;
    };
  }
  let handle;
  if (role === 'hub') {
    const { createHub } = require(path.join(app, 'src/hub/server'));
    handle = createHub({ port: 0, host: '127.0.0.1', dataFile: path.join(root, 'hub.json'), windowsStreamEnabled: true });
    await handle.start();
    process.send({ type: 'ready', port: handle.server.address().port });
  } else {
    const { runAgent } = require(path.join(app, 'src/agent/runtime'));
    const { createSessionUsageArchiveStore } = require(path.join(app, 'src/shared/usage/sessionUsageArchiveStore'));
    const { applySessionUsageArchive, sessionUsageArchiveDate } = require(path.join(app, 'src/shared/usage/sessionUsageArchive'));
    const { createDeduplicatingDelivery } = require(path.join(app, 'src/agent/deliveryPolicy'));
    const { postAgentUsage } = require(path.join(app, 'src/agent/upload'));
    const archive = createSessionUsageArchiveStore();
    let revision = 0;
    const delivery = createDeduplicatingDelivery({ heartbeatMs: 300000, send: summary => postAgentUsage({ fetchFn: fetch,
      url: `${process.env.BENCHMARK_HUB_URL}/api/ingest`, summary, syncSessionTitles: false, timeoutMs: 5000 }) });
    handle = runAgent({ envelope: { deviceId: 'synthetic-benchmark' }, limitsOptions: { limitsEnabled: false },
      usageOptions: { clients: 'hermes', deviceId: 'synthetic-benchmark', homeDir: root, intervalMs: 300000,
        watchEnabled: true, watchDebounceMs: 60000, historyEnabled: true, projectsEnabled: false,
        wslScanEnabled: false, codexLocalUsageEnabled: false, sessionActivityPolling: false,
        anchorPersistenceEnabled: true, runTokscale: async () => fixture(count, revision),
        runGraph: async () => ({ contributions: [{ date: new Date().toISOString().slice(0, 10), clients: [{
          client: 'hermes', modelId: 'synthetic-model', tokens: { input: count * (100 + revision), output: count * 20, cacheRead: count * 10 }, cost: 0, messages: count
        }] }] }) },
      transformUsage(summary) {
        const captured = archive.capture(summary, sessionUsageArchiveDate(summary));
        if (captured.error) throw captured.error;
        return applySessionUsageArchive(summary, captured.archive, { canonical: true, canonicalSummary: true });
      },
      async deliver(summary) {
        await delivery.deliver(summary);
        const total = summary.today.totalTokens;
        if (total !== count * (130 + revision)) throw new Error(`synthetic token mismatch: ${total}`);
        process.send({ type: 'delivered', totalTokens: total, sessions: Object.keys(summary.today.sessions || {}).length });
      }, onError: error => process.send({ type: 'failure', message: error.message }) });
    handle.archive = archive;
    handle.advance = () => { revision++; };
  }
  process.on('message', async message => {
    try {
      if (message.type === 'tick') { handle.advance(); await handle.tick('benchmark', { force: true }); await handle.flush(); process.send({ type: 'tickDone' }); }
      if (message.type === 'stop') { await handle.stop(); handle.archive?.close(); process.exit(0); }
    } catch (error) { process.send({ type: 'failure', message: error.message }); }
  });
}
function launch(role, app, root, count, hubUrl) {
  // Do not inherit credentials, scan paths, proxies or local collector settings.
  const env = { PATH: process.env.PATH || '', HOME: root, USERPROFILE: root, TZ: 'UTC',
    HERMES_HOME: path.join(root, '.hermes'), TOKEN_MONITOR_SHARED_DIR: path.join(root, 'state'),
    TOKEN_MONITOR_WATCH_IN_PROCESS: '0', TOKEN_MONITOR_OPENCODE_AMBIENT: '0',
    TOKSCALE_CONFIG_DIR: path.join(root, 'tokscale'), TOKSCALE_PRICING_CACHE_ONLY: '1', BENCHMARK_HUB_URL: hubUrl || '' };
  const child = fork(__filename, ['--worker', role, app, root, String(count)], { env, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  child.messages = [];
  child.on('message', message => child.messages.push(message));
  return child;
}
async function until(child, type, timeout = 30000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    const failure = child.messages.find(m => m.type === 'failure');
    if (failure) throw new Error(failure.message);
    const index = child.messages.findIndex(m => m.type === type);
    if (index >= 0) return child.messages.splice(index, 1)[0];
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`${type}: child exited`);
    await sleep(20);
  }
  throw new Error(`${type}: timed out`);
}
function processes() {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('ps RSS sampler unavailable');
  return result.stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
}
async function run(app, options) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tm-synthetic-benchmark-'));
  fs.mkdirSync(path.join(root, '.hermes'), { recursive: true });
  fs.writeFileSync(path.join(root, '.hermes/state.db'), 'synthetic watch target; parser is injected');
  const phases = Object.fromEntries(['cold', 'idle', 'peak', 'sustained'].map(p => [p, { agent: [], watcher: [], hub: [] }]));
  let phase = 'cold';
  let agent, hub, timer, samplerError;
  let watcherPid;
  const sample = () => {
    try {
      const rows = processes();
      const announcedPid = agent?.messages.filter(message => message.type === 'watcherPid').at(-1)?.pid;
      const watcher = rows.find(([pid, parent]) => pid === announcedPid && parent === agent?.pid);
      if (watcher) {
        if (watcherPid && watcherPid !== watcher[0] && phase !== 'cold') throw new Error('independent Watcher restarted after readiness during benchmark');
        watcherPid = watcher[0];
      }
      for (const [role, pid] of [['agent', agent?.pid], ['hub', hub?.pid], ['watcher', watcherPid]]) {
        const row = rows.find(([id]) => id === pid);
        if (row) phases[phase][role].push(row[2] / 1024);
      }
    } catch (error) { samplerError = error; }
  };
  try {
    const started = performance.now();
    hub = launch('hub', app, root, options.sessions);
    timer = setInterval(sample, options.sampleMs);
    const { port } = await until(hub, 'ready');
    agent = launch('agent', app, root, options.sessions, `http://127.0.0.1:${port}`);
    const first = await until(agent, 'delivered');
    const coldMs = performance.now() - started;
    if (first.sessions !== options.sessions) throw new Error('synthetic session identity mismatch');
    await sleep(300); sample();
    if (!watcherPid || watcherPid === agent.pid) throw new Error('independent Watcher not observed');
    phase = 'idle'; await sleep(options.idleMs); sample();
    // Include normal and Windows gzip SSE clients for Hub retained-buffer scope.
    const controllers = [];
    const streams = [];
    for (const route of ['/api/stats/stream', '/windows/api/stats/stream']) {
      const controller = new AbortController(); controllers.push(controller);
      streams.push(fetch(`http://127.0.0.1:${port}${route}`, { headers: { 'Accept-Encoding': 'gzip' }, signal: controller.signal })
        .then(async res => { if (!res.ok) throw new Error(`SSE ${res.status}`); for await (const chunk of res.body) { void chunk; } }).catch(error => { if (!controller.signal.aborted) throw error; }));
    }
    const tick = async () => { const start = performance.now(); agent.send({ type: 'tick' }); await until(agent, 'tickDone'); return performance.now() - start; };
    phase = 'peak'; const peakMs = await tick(); sample();
    phase = 'sustained'; const ticks = [];
    const sustainStart = performance.now();
    while (performance.now() - sustainStart < options.sustainMs) { ticks.push(await tick()); await sleep(options.tickMs); sample(); }
    controllers.forEach(c => c.abort()); await Promise.all(streams);
    if (samplerError) throw samplerError;
    const deviceResponse = await fetch(`http://127.0.0.1:${port}/api/devices`);
    if (!deviceResponse.ok) throw new Error('Hub device validation failed');
    const { devices } = await deviceResponse.json();
    if (devices.length !== 1 || devices[0].deviceId !== 'synthetic-benchmark'
      || devices[0].periods.today.totalTokens !== options.sessions * (131 + ticks.length)
      || Object.keys(devices[0].periods.today.sessions).length !== options.sessions) {
      throw new Error('Hub synthetic identity/token/session mismatch');
    }
    if (!fs.existsSync(path.join(root, 'state/session-usage-archive.sqlite'))) throw new Error('SQLite archive absent');
    const summarized = {};
    for (const [name, roles] of Object.entries(phases)) {
      summarized[name] = {};
      for (const [role, samples] of Object.entries(roles)) {
        if (!samples.length) throw new Error(`no RSS samples: ${name}.${role}`);
        summarized[name][role] = { samples: samples.length, medianRssMiB: median(samples), maxRssMiB: Math.max(...samples), lastRssMiB: samples.at(-1) };
      }
    }
    return { coldMs, peakMs, sustainedTickMedianMs: median(ticks), sustainedTicks: ticks.length,
      watcherSeparateProcess: true, hubSyntheticValidation: true, sqliteArchivePresent: true, phases: summarized };
  } finally {
    clearInterval(timer);
    for (const child of [agent, hub]) if (child && child.exitCode === null && child.signalCode === null) {
      child.send({ type: 'stop' });
      for (let i = 0; i < 100 && child.exitCode === null && child.signalCode === null; i++) await sleep(20);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}
function parse(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) { if (!argv[i].startsWith('--')) throw new Error('expected --option value'); values[argv[i].slice(2)] = argv[++i]; }
  const number = (key, fallback, min) => {
    const value = Number(values[key] ?? fallback);
    if (!Number.isFinite(value) || value < min || !Number.isInteger(value)) throw new Error(`invalid --${key}`);
    return value;
  };
  return { baseline: values.baseline && path.resolve(values.baseline), candidate: path.resolve(values.candidate || path.join(__dirname, '..')),
    output: values.output && path.resolve(values.output), repeats: number('repeats', 3, 2), sessions: number('sessions', 1000, 1),
    sampleMs: number('sample-ms', 50, 10), idleMs: number('idle-ms', 1500, 100), sustainMs: number('sustain-ms', 15000, 100), tickMs: number('tick-ms', 250, 10) };
}
async function main(argv) {
  const options = parse(argv);
  const report = { schemaVersion: 1, runtime: { node: process.version, platform: process.platform, arch: process.arch },
    fixture: { sessions: options.sessions, initialTokens: options.sessions * 130, sha256: crypto.createHash('sha256').update(JSON.stringify(fixture(options.sessions))).digest('hex') },
    options, scope: 'real Node runtime with synthetic Hermes parser output; no Rust parser, production data or NAS deployment',
    limitations: ['Short CI soak is not long-running NAS evidence.', 'ps RSS samples may miss brief allocation peaks.', 'Compare only the same machine, architecture and Node runtime.', 'SSE clients drain normally; bounded slow-reader behavior is covered by separate functional tests.'] };
  const targets = options.baseline ? [['baseline', options.baseline], ['candidate', options.candidate]] : [['candidate', options.candidate]];
  for (const [name, app] of targets) report[name] = { identity: sourceIdentity(app), runs: [] };
  // Alternate baseline/candidate order to reduce monotonic thermal/load bias.
  for (let i = 0; i < options.repeats; i++) for (const [name, app] of (i % 2 ? targets.slice().reverse() : targets)) {
    process.stderr.write(`synthetic benchmark ${name} ${i + 1}/${options.repeats}\n`);
    report[name].runs.push(await run(app, options));
  }
  for (const [name, app] of targets) {
    if (JSON.stringify(sourceIdentity(app)) !== JSON.stringify(report[name].identity)) {
      throw new Error(`${name} source changed during benchmark; rerun after code is stable`);
    }
  }
  report.comparison = report.baseline ? compare(report.baseline, report.candidate) : { status: 'not_compared' };
  const encoded = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) fs.writeFileSync(options.output, encoded); else process.stdout.write(encoded);
  if (report.comparison.status === 'regression') process.exitCode = 1;
}
if (require.main === module) {
  const args = process.argv.slice(2);
  (args[0] === '--worker' ? worker(args[1], args[2], args[3], Number(args[4])) : main(args))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
module.exports = { fixture, median, compare, parse };
