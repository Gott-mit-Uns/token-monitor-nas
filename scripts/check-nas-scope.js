'use strict';

const fs = require('node:fs');
const path = require('node:path');
const policy = require('./nas-scope.json');

function excludedPath(name) {
  const normalized = path.posix.normalize(name.split(path.sep).join('/'));
  return policy.excludedFiles.includes(normalized)
    || policy.excludedDirectories.some(directory => normalized.startsWith(directory));
}

function checkApp(appRoot, { image = false } = {}) {
  const failures = [];
  for (const name of [...policy.excludedDirectories, ...policy.excludedFiles]) {
    if (fs.existsSync(path.join(appRoot, name))) failures.push(`excluded path: ${name}`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  if (pkg.main && excludedPath(pkg.main)) failures.push('desktop package main');
  if (pkg.build) failures.push('desktop electron-builder configuration');
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const name of policy.excludedDependencies) {
      if (Object.hasOwn(pkg[field] || {}, name)) failures.push(`excluded ${field}: ${name}`);
    }
  }
  for (const [name, command] of Object.entries(pkg.scripts || {})) {
    if (/\belectron(?:-builder)?\b/.test(command)
      || policy.excludedFiles.some(file => command.includes(file))) {
      failures.push(`desktop npm script: ${name}`);
    }
  }
  const lock = JSON.parse(fs.readFileSync(path.join(appRoot, 'package-lock.json'), 'utf8'));
  for (const name of Object.keys(lock.packages || {})) {
    const dependency = name.split('node_modules/').at(-1);
    if (policy.excludedDependencies.includes(dependency)) failures.push(`excluded lock package: ${name}`);
  }
  // Catch an upstream import even when its excluded target was not copied.
  function visit(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(/require(?:\.resolve)?\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
          const base = path.relative(appRoot, path.resolve(path.dirname(file), match[1])).split(path.sep).join('/');
          if ([base, `${base}.js`, `${base}/index.js`].some(excludedPath)) {
            failures.push(`excluded import in ${path.relative(appRoot, file)}: ${match[1]}`);
          }
        }
      }
    }
  }
  visit(path.join(appRoot, 'src'));
  if (image) {
    // The image check runs before CI mounts development scripts and tests.
    function installed(directory, scope = '') {
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(directory, entry.name);
        if (!scope && entry.name.startsWith('@')) {
          installed(fullPath, `${entry.name}/`);
          continue;
        }
        const name = scope + entry.name;
        if (policy.excludedDependencies.includes(name)) failures.push(`installed desktop dependency: ${name}`);
        installed(path.join(fullPath, 'node_modules'));
      }
    }
    installed(path.join(appRoot, 'node_modules'));
  }
  return failures;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--image')) {
    throw new Error('Usage: node scripts/check-nas-scope.js [--image /opt/token-monitor]');
  }
  const image = args[0] === '--image';
  const failures = checkApp(image ? path.resolve(args[1]) : path.resolve(__dirname, '../app'), { image });
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else console.log(`NAS scope verified (${image ? 'image' : 'source'}).`);
}

module.exports = { checkApp, excludedPath };
