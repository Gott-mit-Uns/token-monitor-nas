'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { applyHermesSessionTitles } = require('../../src/agent/hermesTitles');
const { postAgentUsage } = require('../../src/agent/upload');
const { createHub } = require('../../src/hub/server');

function database(root, rows, titleColumn = true) {
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, 'state.db');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY${titleColumn ? ', title TEXT' : ''}, message_body TEXT)`);
  for (const [id, title] of rows) {
    db.prepare(titleColumn ? 'INSERT INTO sessions VALUES (?, ?, ?)' : 'INSERT INTO sessions VALUES (?, ?)')
      .run(...(titleColumn ? [id, title, 'synthetic message excluded from sync'] : [id, 'synthetic message']));
  }
  db.close();
  return file;
}
const session = id => ({ client: 'hermes', sessionId: id, totalTokens: 10, title: 'old title' });
const summary = ids => ({ deviceId: 'synthetic', today: { totalTokens: ids.length * 10, sessions: Object.fromEntries(ids.map(id => [`hermes:${id}`, session(id)])) }, month: { totalTokens: ids.length * 10, sessions: Object.fromEntries(ids.map(id => [`hermes:${id}`, session(id)])) }, allTime: { totalTokens: 1000 } });

test('Hermes titles include profiles and removals without changing source data, counters or archive inputs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-hermes-titles-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const main = database(root, [['one', ' Synthetic title '], ['empty', ''], ['duplicate', 'Root title']]);
  const profile = database(path.join(root, 'profiles/work'), [['two', 'Profile title'], ['duplicate', 'Other title']]);
  const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const before = [digest(main), digest(profile)];
  const original = summary(['one', 'two', 'empty', 'duplicate']);
  const archiveInput = JSON.stringify(original);
  const result = applyHermesSessionTitles(original, { hermesHome: root });
  assert.equal(result.today.sessions['hermes:one'].title, 'Synthetic title');
  assert.equal(result.month.sessions['hermes:two'].title, 'Profile title');
  assert.equal(result.month.sessions['hermes:empty'].title, '');
  assert.equal(result.month.sessions['hermes:duplicate'].title, 'Root title');
  assert.equal(result.today.totalTokens, original.today.totalTokens);
  assert.equal(result.allTime, original.allTime);
  assert.equal(JSON.stringify(original), archiveInput);
  assert.deepEqual([digest(main), digest(profile)], before);
  assert.doesNotMatch(JSON.stringify(result), /message_body|synthetic message/);
});

test('missing databases and old Hermes schemas leave usage intact', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-hermes-old-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = summary(['one']);
  assert.equal(applyHermesSessionTitles(original, { hermesHome: root }), original);
  database(root, [['one', 'ignored']], false);
  assert.equal(applyHermesSessionTitles(original, { hermesHome: root }), original);
  assert.equal(applyHermesSessionTitles(original, { hermesHome: root, sqlite: null }), original);
});

test('Hermes title lookup handles more than one SQL batch', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-hermes-batch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ids = Array.from({ length: 451 }, (_, i) => `s-${i}`);
  database(root, ids.map(id => [id, `Title ${id}`]));
  const result = applyHermesSessionTitles(summary(ids), { hermesHome: root });
  assert.equal(Object.values(result.month.sessions).filter(s => s.title.startsWith('Title ')).length, 451);
});

test('source title reaches Hub only with negotiated consent, while message bodies never leave the source', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-hermes-sync-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  database(root, [['one', 'Synthetic shared title']]);
  const hub = createHub({ port: 0, host: '127.0.0.1', syncSessionTitles: true, dataFile: path.join(root, 'hub.json') });
  await hub.start();
  t.after(() => hub.stop());
  const policy = hub.setSyncTitlePolicy('synthetic', true);
  const record = applyHermesSessionTitles(summary(['one']), { hermesHome: root });
  await postAgentUsage({ fetchFn: fetch, url: `http://127.0.0.1:${hub.server.address().port}/api/ingest`, summary: record, syncSessionTitles: true, sessionTitleSyncGeneration: policy.generation });
  assert.equal(hub.getDevices()[0].periods.month.sessions['hermes:one'].title, 'Synthetic shared title');
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'hub.json'), 'utf8'), /synthetic message/);
  await postAgentUsage({ fetchFn: fetch, url: `http://127.0.0.1:${hub.server.address().port}/api/ingest`, summary: record, syncSessionTitles: false });
  assert.equal(hub.getDevices()[0].periods.month.sessions['hermes:one'].title, '');
});
