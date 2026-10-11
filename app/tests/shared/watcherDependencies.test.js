'use strict';

const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

// A fresh process is important: most collector tests already loaded the heavy
// graph before they construct a watcher, hiding an accidental dependency here.
// Run both production entry paths with synthetic Hermes data, then inspect the
// actual graph after readiness (including any modules loaded by the matcher).
const probeSource = `
'use strict';
const os = require('node:os');
const path = require('node:path');
const [mode, sharedDir, home] = process.argv.slice(2);
os.homedir = () => home;
process.env.HERMES_HOME = path.join(home, '.hermes');
delete process.env.CHOKIDAR_USEPOLLING;
delete process.env.TOKEN_MONITOR_WATCH_POLLING;
if (mode === 'worker') {
  require(path.join(sharedDir, 'watcherWorker.js'));
} else {
  const { createInProcessWatcherHost } = require(path.join(sharedDir, 'watcherHost.js'));
  process.on('message', (message) => {
    if (message.type !== 'configure') return;
    createInProcessWatcherHost(message.config, {
      onReady: () => process.send({ type: 'ready' }),
      onError: (error) => process.send({ type: 'error', code: error.code }),
      onEvent: (event, filePath) => process.send({ type: 'event', event, filePath })
    });
  });
}
process.on('message', (message) => {
  if (message.type === 'probe') {
    process.send({ type: 'modules', files: Object.keys(require.cache) });
  }
});
`;

function nextMessage(child, type) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      child.off('message', onMessage);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    const onMessage = (message) => {
      if (message.type !== type && message.type !== 'error') return;
      cleanup();
      if (message.type === 'error') reject(new Error(`watcher error: ${message.code || 'unknown'}`));
      else resolve(message);
    };
    const onExit = (code) => { cleanup(); reject(new Error(`watcher exited before ${type}: ${code}`)); };
    const onError = (error) => { cleanup(); reject(error); };
    child.on('message', onMessage);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

for (const mode of ['worker', 'in-process']) {
  test(`${mode} Hermes watcher does not load the collection and usage graph`, { timeout: 15000 }, async () => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'tm-watch-deps-'));
    const probe = path.join(root, 'probe.cjs');
    const hermes = path.join(root, '.hermes');
    fs.mkdirSync(hermes);
    fs.writeFileSync(path.join(hermes, 'state.db'), 'synthetic');
    fs.mkdirSync(path.join(hermes, 'runtime'));
    fs.writeFileSync(path.join(hermes, 'runtime', 'unrelated.txt'), 'synthetic');
    fs.writeFileSync(probe, probeSource);
    const child = fork(probe, [mode, path.resolve(__dirname, '../../src/shared'), root], {
      execArgv: [],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });
    const deadline = setTimeout(() => child.kill(), 10000);
    deadline.unref();
    try {
      const ready = nextMessage(child, 'ready');
      child.send({ type: 'configure', revision: 1, config: { dirs: [hermes], clients: 'hermes', usePolling: false } });
      await ready;
      const reported = nextMessage(child, 'modules');
      child.send({ type: 'probe' });
      const { files } = await reported;
      const loaded = files.map((file) => path.basename(file));
      assert.ok(loaded.includes('watcherPolicy.js'));
      assert.ok(files.some((file) => file.includes(`${path.sep}chokidar${path.sep}`)));
      for (const heavy of ['collector.js', 'usage.js', 'sessionMetadata.js', 'sessionUsageArchive.js', 'wslUsage.js']) {
        assert.equal(files.includes(path.resolve(__dirname, '../../src/shared', heavy)), false, `watcher unnecessarily loaded ${heavy}`);
      }
    } finally {
      clearTimeout(deadline);
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test('collector watcher exports retain the shared policy implementations', () => {
  const policy = require('../../src/shared/watcherPolicy');
  const collector = require('../../src/shared/collector');
  for (const key of [
    'clientWatchCandidates', 'resolveWatchUsePolling', 'watcherOptions', 'watchIgnoreMatcher',
    'openWatch', 'WATCH_POLLING_LIMIT_CODE', 'WATCH_POLLING_UNAVAILABLE_CODE', 'WATCH_REFUSAL_CODES'
  ]) {
    assert.equal(collector[key], policy[key], `collector compatibility export ${key}`);
  }
});

test('lazily loaded Reasonix policy keeps native sidecars and prunes unrelated files', () => {
  const { watchIgnoreMatcher } = require('../../src/shared/watcherPolicy');
  const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'tm-watch-reasonix-'));
  const sessions = path.join(root, 'sessions');
  const projects = path.join(root, 'projects');
  const projectSessions = path.join(projects, 'synthetic-project', 'sessions');
  fs.mkdirSync(sessions);
  fs.mkdirSync(projectSessions, { recursive: true });
  const previous = process.env.REASONIX_STATE_HOME;
  process.env.REASONIX_STATE_HOME = root;
  try {
    const ignored = watchIgnoreMatcher('reasonix');
    for (const dir of [sessions, projects, projectSessions]) {
      assert.equal(ignored(dir), false);
      for (const suffix of ['.jsonl.meta', '.jsonl.telemetry.json', '.events.jsonl']) {
        assert.equal(ignored(path.join(dir, `synthetic${suffix}`)), false);
      }
      assert.equal(ignored(path.join(dir, 'synthetic.event-index.json')), true);
    }
  } finally {
    if (previous === undefined) delete process.env.REASONIX_STATE_HOME;
    else process.env.REASONIX_STATE_HOME = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
