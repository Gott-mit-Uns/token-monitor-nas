'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { sessionActivityProvidersFor } = require('./sessionActivityRegistry');
const { discoverT3DbPaths } = require('./t3SessionMetadata');
const { activityWatchIgnored: compileActivityWatchIgnored } = require('./watcherPolicy');
const comparablePath = path.sep === '\\' ? (value) => value.toLowerCase() : (value) => value;

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function existingParent(target, floor) {
  let dir = target;
  while (inside(floor, dir)) {
    try { if (fs.statSync(dir).isDirectory()) return dir; } catch (_) {}
    if (dir === floor) break;
    dir = path.dirname(dir);
  }
  return null;
}

function activityWatchSources(clients, options = {}) {
  if (options.scopedHome) return [];
  const providers = sessionActivityProvidersFor(clients);
  const home = options.homeDir || os.homedir();
  const sources = [];
  for (const entry of providers) for (const source of entry.watchTargets({ ...options, homeDir: home })) {
    const target = path.resolve(source.target);
    const dir = existingParent(target, path.resolve(source.floor));
    if (dir && dir !== path.resolve(home)) sources.push({ ...source, dir, target, clients: [entry.id] });
  }
  const t3Clients = providers.filter((entry) => entry.t3Driver).map((entry) => entry.id);
  if (t3Clients.length) for (const file of discoverT3DbPaths(options)) {
    if (path.basename(file) !== 'statev2.sqlite') continue;
    const target = path.resolve(file);
    // Never watch the user's entire home when T3 is not installed.
    const parent = path.dirname(target);
    const dir = existingParent(parent, path.dirname(path.dirname(parent)));
    if (dir && dir !== path.resolve(home)) sources.push({ dir, target, kind: 'sqlite',
      runtimeFile: path.join(parent, 'server-runtime.json'), clients: t3Clients });
  }
  return sources;
}

function matches(source, file) {
  const target = comparablePath(source.target);
  // Keep just the ancestor chain so a missing sessions/userdata directory can
  // appear later. A registry's children are numeric PID files only.
  if (inside(file, target)) return true;
  if (source.kind === 'pid-registry') return path.dirname(file) === target && /^[1-9]\d*\.json$/.test(path.basename(file));
  return file === target || file === `${target}-wal`
    || (source.runtimeFile && file === comparablePath(source.runtimeFile));
}

function activityClientsForPath(filePath, sources) {
  const file = comparablePath(path.resolve(filePath || '.'));
  return [...new Set(sources.filter((source) => matches(source, file)).flatMap((source) => source.clients))];
}


function activityWatchIgnored(usageIgnored, usageDirs, sources) {
  return compileActivityWatchIgnored(usageIgnored, usageDirs, sources, path);
}

module.exports = { activityWatchSources, activityClientsForPath, activityWatchIgnored };
