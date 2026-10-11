'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { IMAGE_REPOSITORY, candidateReference, fetchMainRelease, promoteNasImage } = require('../promote-nas-image');

const DIGEST = `sha256:${'a'.repeat(64)}`;
const OTHER_DIGEST = `sha256:${'b'.repeat(64)}`;
const VERSION = 'v0.68.0-04';
const RELEASE_COMMIT = 'c'.repeat(40);
const NEXT_COMMIT = 'd'.repeat(40);
const SOURCE = `${IMAGE_REPOSITORY}@${DIGEST}`;
const FIXED = `${IMAGE_REPOSITORY}:${VERSION}`;
const LATEST = `${IMAGE_REPOSITORY}:latest`;

function registryFixture({ fixed, latest = OTHER_DIGEST, intercept = () => null,
  readMainRelease = () => ({ commit: RELEASE_COMMIT, version: VERSION }) } = {}) {
  const entries = new Map([[SOURCE, DIGEST], [LATEST, latest]]);
  if (fixed) entries.set(FIXED, fixed);
  const calls = [];
  const writes = [];
  const docker = args => {
    calls.push(args);
    const override = intercept(args, entries);
    if (override) return override;
    if (args[0] === 'inspect') {
      const ref = args.at(-1);
      if (!entries.has(ref)) return { status: 1, stderr: `ERROR: ${ref}: not found` };
      return { status: 0, stdout: JSON.stringify({ digest: entries.get(ref), manifests: [
        { platform: { os: 'linux', architecture: 'amd64' } },
        { platform: { os: 'linux', architecture: 'arm64' } }
      ] }) };
    }
    if (args[0] === 'create') {
      const target = args[2], source = args[3];
      assert.equal(source, SOURCE, 'all tag writes must reference the verified immutable digest');
      assert.ok(entries.has(source), 'source must exist');
      entries.set(target, entries.get(source));
      writes.push(target);
      return { status: 0 };
    }
    throw new Error(`Unexpected synthetic command ${args[0]}`);
  };
  const promote = () => promoteNasImage({ version: VERSION, digest: DIGEST, releaseCommit: RELEASE_COMMIT,
    readMainRelease, docker, log: () => {} });
  return { entries, calls, writes, promote };
}

test('first promotion creates fixed and latest from the verified multi-platform digest', () => {
  const f = registryFixture();
  assert.deepEqual(f.promote(), { version: VERSION, digest: DIGEST });
  assert.deepEqual(f.writes, [FIXED, LATEST]);
  assert.equal(f.entries.get(FIXED), DIGEST);
  assert.equal(f.entries.get(LATEST), DIGEST);
});

test('retry after fixed tag succeeds but latest fails completes without rewriting fixed tag', () => {
  let failLatest = true;
  const f = registryFixture({ intercept(args) {
    if (args[0] === 'create' && args[2] === LATEST && failLatest) {
      failLatest = false;
      return { status: 1, stderr: 'synthetic registry failure' };
    }
    return null;
  } });
  assert.throws(f.promote, /tag update failed/);
  assert.equal(f.entries.get(FIXED), DIGEST);
  assert.equal(f.entries.get(LATEST), OTHER_DIGEST);
  f.promote();
  assert.deepEqual(f.writes, [FIXED, LATEST]);
  assert.equal(f.entries.get(LATEST), DIGEST);
});

test('already matching fixed and latest tags make promotion a no-op', () => {
  const f = registryFixture({ fixed: DIGEST, latest: DIGEST });
  f.promote();
  assert.deepEqual(f.writes, []);
});

test('rerunning an old failed promotion after a newer release preserves latest', () => {
  const f = registryFixture({ fixed: DIGEST, latest: OTHER_DIGEST,
    readMainRelease: () => ({ commit: NEXT_COMMIT, version: 'v0.68.0-05' }) });
  assert.deepEqual(f.promote(), { version: VERSION, digest: DIGEST, latestSkipped: true });
  assert.deepEqual(f.writes, []);
  assert.equal(f.entries.get(FIXED), DIGEST);
  assert.equal(f.entries.get(LATEST), OTHER_DIGEST);
});

test('a newer main commit blocks an old task even if its version has not changed', () => {
  const f = registryFixture({ fixed: DIGEST,
    readMainRelease: () => ({ commit: NEXT_COMMIT, version: VERSION }) });
  assert.equal(f.promote().latestSkipped, true);
  assert.deepEqual(f.writes, []);
});

test('old tasks cannot create a missing fixed tag after main advances', () => {
  const f = registryFixture({ readMainRelease: () => ({ commit: NEXT_COMMIT, version: 'v0.68.0-05' }) });
  assert.throws(f.promote, /refusing to create an old fixed tag/);
  assert.deepEqual(f.writes, []);
});

test('main advancing during promotion preserves the new fixed tag but does not change latest', () => {
  let reads = 0;
  const f = registryFixture({ readMainRelease: () => ++reads === 1
    ? { commit: RELEASE_COMMIT, version: VERSION } : { commit: NEXT_COMMIT, version: 'v0.68.0-05' } });
  assert.equal(f.promote().latestSkipped, true);
  assert.deepEqual(f.writes, [FIXED]);
  assert.equal(f.entries.get(LATEST), OTHER_DIGEST);
});

test('remote main lookup failure and invalid metadata fail closed', async t => {
  for (const readMainRelease of [
    () => { throw new Error('Cannot verify the current remote main release'); },
    () => ({ commit: 'invalid', version: VERSION }),
    () => ({ commit: RELEASE_COMMIT, version: 'latest' })
  ]) {
    await t.test('no registry writes', () => {
      const f = registryFixture({ readMainRelease });
      assert.throws(f.promote, /remote main release|invalid release metadata/);
      assert.deepEqual(f.writes, []);
    });
  }
});

test('a second main lookup failure keeps latest unchanged after fixed tag creation', () => {
  let reads = 0;
  const f = registryFixture({ readMainRelease: () => {
    if (++reads > 1) throw new Error('Cannot verify the current remote main release');
    return { commit: RELEASE_COMMIT, version: VERSION };
  } });
  assert.throws(f.promote, /remote main release/);
  assert.deepEqual(f.writes, [FIXED]);
  assert.equal(f.entries.get(LATEST), OTHER_DIGEST);
});

test('remote main metadata comes from freshly fetched main, without switching the release checkout', () => {
  const calls = [];
  const release = fetchMainRelease({ git: args => {
    calls.push(args);
    if (args[0] === 'rev-parse') return { status: 0, stdout: `${NEXT_COMMIT}\n` };
    if (args[0] === 'show') return { status: 0, stdout: 'v0.68.0-05\n' };
    return { status: 0, stdout: '' };
  } });
  assert.deepEqual(release, { commit: NEXT_COMMIT, version: 'v0.68.0-05' });
  assert.deepEqual(calls, [
    ['fetch', '--no-tags', '--depth=1', 'origin', 'refs/heads/main'],
    ['rev-parse', 'FETCH_HEAD^{commit}'],
    ['show', 'FETCH_HEAD:nas-version.txt']
  ]);
});

test('a failed main fetch cannot fall back to stale local tracking refs or leak its error output', () => {
  const calls = [];
  assert.throws(() => fetchMainRelease({ git: args => {
    calls.push(args);
    return { status: 1, stderr: 'synthetic detail that must not enter public logs' };
  } }), error => error.message === 'Cannot verify the current remote main release; refusing to change release tags.');
  assert.equal(calls.length, 1);
});

test('a fixed version with a different digest blocks every tag write', () => {
  const f = registryFixture({ fixed: OTHER_DIGEST });
  assert.throws(f.promote, /Existing fixed version differs/);
  assert.deepEqual(f.writes, []);
  assert.equal(f.entries.get(LATEST), OTHER_DIGEST);
});

test('registry authentication, timeout, generic 404 and malformed responses fail closed', async t => {
  for (const failure of [
    { status: 1, stderr: 'unauthorized: authentication required' },
    { status: 1, stderr: 'unauthorized: manifest unknown' },
    { status: 1, stderr: 'request failed: 404 Not Found' },
    { status: 1, stderr: 'proxy: not found' },
    { status: null, error: new Error('ETIMEDOUT') },
    { status: 0, stdout: '{invalid' },
    { status: 0, stdout: JSON.stringify({ digest: 'not-a-digest' }) }
  ]) {
    await t.test(JSON.stringify(failure), () => {
      const f = registryFixture({ intercept: args => args[0] === 'inspect' && args.at(-1) === FIXED ? failure : null });
      assert.throws(f.promote, /refusing to change release tags/);
      assert.deepEqual(f.writes, []);
    });
  }
});

test('an explicit MANIFEST_UNKNOWN response permits a missing fixed tag', () => {
  const f = registryFixture({ intercept(args, entries) {
    if (args[0] === 'inspect' && args.at(-1) === FIXED && !entries.has(FIXED)) {
      return { status: 1, stderr: 'manifest unknown: MANIFEST_UNKNOWN' };
    }
    return null;
  } });
  f.promote();
  assert.deepEqual(f.writes, [FIXED, LATEST]);
});

test('the source must resolve to the expected digest and contain both native platforms', async t => {
  for (const manifest of [
    { digest: OTHER_DIGEST },
    { digest: DIGEST, manifests: {} },
    { digest: DIGEST, manifests: [{ platform: { os: 'linux', architecture: 'amd64' } }] }
  ]) {
    await t.test(JSON.stringify(manifest), () => {
      const f = registryFixture({ intercept: args => args[0] === 'inspect' && args.at(-1) === SOURCE
        ? { status: 0, stdout: JSON.stringify(manifest) } : null });
      assert.throws(f.promote, /Candidate image differs|must contain both/);
      assert.deepEqual(f.writes, []);
    });
  }
});

test('a tag write reporting success is checked before latest is touched', () => {
  const f = registryFixture({ intercept(args, entries) {
    if (args[0] === 'create' && args[2] === FIXED) {
      entries.set(FIXED, OTHER_DIGEST);
      return { status: 0 };
    }
    return null;
  } });
  assert.throws(f.promote, /Fixed version differs/);
  assert.equal(f.entries.get(LATEST), OTHER_DIGEST);
});

test('a failure to inspect latest after a matching fixed tag blocks promotion', () => {
  const f = registryFixture({ fixed: DIGEST, intercept: args => args[0] === 'inspect' && args.at(-1) === LATEST
    ? { status: 1, stderr: 'registry temporarily unavailable' } : null });
  assert.throws(f.promote, /Registry inspection failed/);
  assert.deepEqual(f.writes, []);
});

test('invalid candidate or version inputs fail before contacting Docker', () => {
  const docker = () => assert.fail('invalid inputs must not contact the registry');
  assert.throws(() => candidateReference('sha-main'), /valid verified candidate digest/);
  assert.throws(() => promoteNasImage({ version: VERSION, digest: 'latest', docker }), /valid verified candidate digest/);
  assert.throws(() => promoteNasImage({ version: 'v0.68.0-00', digest: DIGEST, docker }), /valid NAS release version/);
  assert.throws(() => promoteNasImage({ version: 'latest', digest: DIGEST, docker }), /valid NAS release version/);
  assert.throws(() => promoteNasImage({ version: VERSION, digest: DIGEST, releaseCommit: 'main', docker }), /valid release commit/);
});
