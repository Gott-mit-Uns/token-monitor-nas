'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkApp, excludedPath } = require('../check-nas-scope');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-scope-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  write('package.json', { scripts: { hub: 'node src/hub/server.js' }, dependencies: { undici: '^7.29.1' } });
  write('package-lock.json', { packages: {} });
  return { root, write };
}

test('NAS runtime and shared cross-device features stay in scope', t => {
  const { root, write } = fixture(t);
  for (const name of ['src/hub/windowsStream.js', 'src/shared/providers/codex/auth.js',
    'src/shared/limits/core.js', 'src/shared/sessionDetail.js', 'src/shared/exporter.js',
    'src/shared/diagnosticReport.js', 'scripts/nas-hub-build.js']) {
    assert.equal(excludedPath(name), false, name);
    write(name, "'use strict';\n");
  }
  assert.deepEqual(checkApp(root, { image: true }), []);
});

test('reintroduced desktop files and new Electron/Worker directories fail', t => {
  const { root, write } = fixture(t);
  write('src/shared/trayText.js', '');
  write('src/electron/newWindow.js', '');
  write('worker/src/index.js', '');
  const failures = checkApp(root);
  assert.ok(failures.includes('excluded path: src/shared/trayText.js'));
  assert.ok(failures.includes('excluded path: src/electron/'));
  assert.ok(failures.includes('excluded path: worker/'));
});

test('an excluded import fails even when its target is absent', t => {
  const { root, write } = fixture(t);
  write('src/agent/newHelper.js', "require('../shared/trayLayout');\nrequire.resolve('../shared/macWidgetConfig.js');\n");
  assert.equal(checkApp(root).filter(value => value.startsWith('excluded import')).length, 2);
});

test('desktop package fields, commands and locked transitive packages fail', t => {
  const { root, write } = fixture(t);
  write('package.json', { main: './src/electron/main.js', build: { mac: {} },
    scripts: { start: 'electron .', widget: 'node scripts/build-macos-widget.js' },
    dependencies: { 'electron-updater': '6.8.9' }, devDependencies: { electron: '43.7.9' } });
  write('package-lock.json', { packages: { 'node_modules/parent/node_modules/electron-updater': { version: '6.8.9' } } });
  const failures = checkApp(root);
  assert.ok(failures.includes('desktop package main'));
  assert.ok(failures.includes('desktop electron-builder configuration'));
  assert.ok(failures.includes('desktop npm script: start'));
  assert.ok(failures.includes('desktop npm script: widget'));
  assert.ok(failures.includes('excluded dependencies: electron-updater'));
  assert.ok(failures.includes('excluded devDependencies: electron'));
  assert.ok(failures.some(value => value.startsWith('excluded lock package:')));
});

test('image inspection detects installed desktop modules without manifest entries', t => {
  const { root, write } = fixture(t);
  write('node_modules/@xhayper/discord-rpc/package.json', {});
  write('node_modules/parent/node_modules/electron-updater/package.json', {});
  assert.deepEqual(checkApp(root), []);
  assert.ok(checkApp(root, { image: true }).includes('installed desktop dependency: @xhayper/discord-rpc'));
  assert.ok(checkApp(root, { image: true }).includes('installed desktop dependency: electron-updater'));
});
