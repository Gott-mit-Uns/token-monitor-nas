#!/usr/bin/env node
'use strict';
// NAS advertises hashes of its actual portable core and Node source closure.
// Worker is not distributed here: retain historical registry entries without
// generating or advertising a new Worker build.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const REGISTRY = 'src/shared/hubBuildRegistry.json';
const CORE_ENTRIES = [
  'limits/providers.js', 'limits/core.js', 'providers/workbuddy/identity.js',
  'usage.js', 'sessionLive.js', 'sessionActivityProviders.js', 'history.js',
  'providers/reasonix/paths.js', 'providers/reasonix/sessionGuard.js',
  'providers/dsh/paths.js', 'providers/devin/paths.js', 'projectKey.js',
  'syncUploadInterval.js', 'subscriptionDisplay.js', 'currency.js',
  'clientHealth.js', 'hubProtocol.js', 'syncContent.js', 'hubBuildIdentity.js'
].map(name => `src/shared/${name}`);
function closure(entries) {
  const visited = new Set(); const pending = [...entries];
  while (pending.length) {
    const file = pending.pop();
    if (file === REGISTRY || visited.has(file)) continue;
    visited.add(file);
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (file.endsWith('.json')) continue;
    for (const match of source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      const resolved = [base, `${base}.js`, `${base}.json`, `${base}/index.js`]
        .find(candidate => fs.existsSync(path.join(ROOT, candidate)) && fs.statSync(path.join(ROOT, candidate)).isFile());
      if (!resolved || resolved.startsWith('../')) throw new Error(`Invalid local dependency in ${file}`);
      pending.push(resolved);
    }
  }
  return [...visited].sort();
}
function hash(files) {
  const digest = crypto.createHash('sha256');
  for (const file of files) {
    digest.update(file); digest.update('\0');
    digest.update(fs.readFileSync(path.join(ROOT, file))); digest.update('\0');
  }
  return `sha256:${digest.digest('hex')}`;
}
function current() {
  const coreFiles = closure(CORE_ENTRIES);
  const coreSet = new Set(coreFiles);
  const runtimeFiles = [...closure(['src/hub/server.js']).filter(file => !coreSet.has(file)), 'package.json', 'package-lock.json'].sort();
  return { core: hash(coreFiles), 'node-hub': hash(runtimeFiles), coreFiles, runtimeFiles };
}
function update() {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTRY), 'utf8'));
  const actual = current();
  for (const component of ['core', 'node-hub']) {
    const entries = registry.components[component]; const last = entries.at(-1);
    if (last.buildId !== actual[component]) entries.push({ revision: last.revision + 1, buildId: actual[component] });
  }
  fs.writeFileSync(path.join(ROOT, REGISTRY), `${JSON.stringify(registry, null, 2)}\n`);
  return actual;
}
if (require.main === module) {
  const actual = process.argv.includes('--update') ? update() : current();
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTRY), 'utf8'));
  for (const component of ['core', 'node-hub']) {
    if (registry.components[component].at(-1).buildId !== actual[component]) throw new Error(`${component} identity is stale; run nas-hub-build.js --update`);
  }
  console.log(JSON.stringify(actual, null, 2));
}
module.exports = { closure, current, update };
