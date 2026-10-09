'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pidFilePath } = require('../shared/config');
const statusPath = () => path.join(path.dirname(pidFilePath()), 'nas-health.json');

function processIdentity(pid) {
  if (process.platform !== 'linux') return null;
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const startTicks = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
  const boot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  if (!/^\d+$/.test(startTicks) || !boot) throw new Error('Process identity unavailable');
  return `${boot}:${startTicks}`;
}

function createHealthTracker({ filePath = statusPath(), now = Date.now, pid = process.pid, identity = processIdentity(pid) } = {}) {
  let state;
  function write(next) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.${pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(temp, filePath);
    state = next;
  }
  return {
    initialize() { write({ version: 2, pid, processIdentity: identity, startedAt: now() }); },
    mark(kind) {
      if (!state) throw new Error('Health tracker is not initialized');
      if (!['collectedAt', 'uploadedAt'].includes(kind)) throw new Error('Unknown health timestamp');
      write({ ...state, [kind]: now() });
    }
  };
}
let tracker;
function initializeHealth() {
  tracker = createHealthTracker();
  tracker.initialize();
}
function mark(kind) { tracker.mark(kind); }

function assess(state, now, maxAge, expected = null) {
  const sameProcess = !expected || (state.version === 2 && state.pid === expected.pid
    && state.processIdentity === expected.identity && Number.isFinite(state.startedAt) && state.startedAt <= now);
  const fresh = value => sameProcess && Number.isFinite(value) && value > 0
    && value >= (state.startedAt || 0) && now - value >= 0 && now - value <= maxAge;
  return {
    collection: fresh(state.collectedAt) ? 'ok' : 'stale',
    upload: fresh(state.uploadedAt) ? 'ok' : 'stale'
  };
}
if (require.main === module) {
  try {
    const pid = Number(fs.readFileSync(pidFilePath(), 'utf8'));
    if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid agent PID');
    process.kill(pid, 0);
    fs.accessSync(path.join(process.env.HERMES_HOME || '/hermes', 'state.db'), fs.constants.R_OK);
    const state = JSON.parse(fs.readFileSync(statusPath(), 'utf8'));
    const status = assess(state, Date.now(), Math.max(900000, 3 * Number(process.env.TOKEN_MONITOR_INTERVAL_MS || 300000)), { pid, identity: processIdentity(pid) });
    console.log(JSON.stringify(status));
    // A sleeping Hub should be visible, but must not cause restart loops.
    process.exitCode = status.collection === 'ok' ? 0 : 1;
  } catch {
    console.log('local collection unavailable');
    process.exitCode = 1;
  }
}
module.exports = { mark, assess, initializeHealth, createHealthTracker, processIdentity };
