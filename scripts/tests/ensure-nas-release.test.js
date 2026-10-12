'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { IMAGE_REPOSITORY } = require('../promote-nas-image');
const { ensureNasRelease, createManifest, readVerifiedRelease, validatePolicy } = require('../ensure-nas-release');
const version = 'v0.69.0-02', sourceCommit = 'a'.repeat(40), imageDigest = `sha256:${'b'.repeat(64)}`;
const policy = { schemaVersion: 1, version, compatibleFrom: ['v0.69.0-01'], migration: { kind: 'none', rollback: 'manual', notes: 'Restore the complete stopped snapshot after a locally verified rehearsal.' } };
function fixture(options = {}) {
  let tag = options.tag || null, release = options.release || null, stored = options.stored || null;
  const mutations = [];
  const inspect = (ref, field) => field === 'Manifest'
    ? { digest: options.digest || imageDigest, manifests: ['amd64', 'arm64'].map((architecture, index) => ({ platform: { os: 'linux', architecture }, digest: `sha256:${String(index + 1).repeat(64)}` })) }
    : { os: 'linux', architecture: ref.endsWith('1'.repeat(64)) ? 'amd64' : 'arm64', config: { Labels: {
      'org.opencontainers.image.version': options.labelVersion || version, 'org.opencontainers.image.revision': options.labelCommit || sourceCommit } } };
  const api = async (method, endpoint, data = {}) => {
    if (method !== 'GET') mutations.push([method, endpoint]);
    if (endpoint.startsWith('contents/')) return { encoding: 'base64', content: Buffer.from(endpoint.includes('nas-version.txt') ? version : JSON.stringify(policy)).toString('base64') };
    if (endpoint === `git/ref/tags/${version}`) return tag ? { object: { type: 'commit', sha: tag } } : null;
    if (method === 'GET' && endpoint === `releases/tags/${version}`) return release;
    if (method === 'POST' && endpoint === 'git/refs') { tag = data.body.sha; return {}; }
    if (method === 'POST' && endpoint === 'releases') {
      release = { ...data.body, id: 1, assets: [], upload_url: 'https://uploads.github.com/repos/test/repo/releases/1/assets{?name,label}', html_url: 'https://github.com/test/repo/releases/tag/' + version }; return release;
    }
    if (data.upload) { stored = Buffer.from(data.body); const asset = { id: 2, name: 'release-manifest.json', state: 'uploaded' }; release.assets.push(asset); return asset; }
    if (endpoint === 'releases/assets/2') return stored;
    if (method === 'PATCH') { release.draft = data.body.draft; return release; }
    throw new Error('Unexpected synthetic API request');
  };
  const ensure = () => ensureNasRelease({ version, sourceCommit, imageDigest, policy, readSource: () => options.sourceVersion || version, inspect, api, log: () => {} });
  return { ensure, inspect, api, mutations, get release() { return release; }, get stored() { return stored; } };
}
test('creates Git tag, recoverable draft, immutable manifest and verified stable release', async () => {
  const f = fixture();
  const result = await f.ensure();
  assert.equal(result.sourceCommit, sourceCommit);
  assert.deepEqual(f.mutations.map(item => item[0]), ['POST', 'POST', 'POST', 'PATCH']);
  const manifest = JSON.parse(f.stored);
  assert.equal(manifest.imageRepository, IMAGE_REPOSITORY);
  assert.equal(manifest.rollback.mode, 'manual');
  assert.equal(manifest.platforms.length, 2);
  assert.equal(f.release.draft, false);
  await f.ensure();
  assert.equal(f.mutations.length, 4, 'completed rerun is read-only');
  assert.deepEqual((await readVerifiedRelease({ version, api: f.api, inspect: f.inspect })).manifest, manifest);
});
test('recovers a draft with missing manifest without recreating Git tag or release', async () => {
  const f = fixture({ tag: sourceCommit, release: { id: 1, tag_name: version, draft: true, prerelease: false, assets: [], upload_url: 'https://uploads.github.com/repos/test/repo/releases/1/assets{?name,label}' } });
  await f.ensure();
  assert.deepEqual(f.mutations.map(item => item[0]), ['POST', 'PATCH']);
});
test('historical published releases without manifests are never modified', async () => {
  const f = fixture({ tag: sourceCommit, release: { tag_name: version, draft: false, assets: [] } });
  await assert.rejects(f.ensure, /historical releases are not modified/);
  assert.deepEqual(f.mutations, []);
});
test('mismatched fixed Git tag prevents all GitHub writes', async () => {
  const f = fixture({ tag: 'c'.repeat(40) });
  await assert.rejects(f.ensure, /different source commit/);
  assert.deepEqual(f.mutations, []);
});
test('source, image digest and both OCI labels must agree before writing', async t => {
  for (const options of [{ sourceVersion: 'v0.69.0-01' }, { digest: `sha256:${'f'.repeat(64)}` }, { labelCommit: 'd'.repeat(40) }, { labelVersion: 'v0.69.0-01' }]) {
    await t.test(JSON.stringify(options), async () => {
      const f = fixture(options);
      await assert.rejects(f.ensure, /mismatch|differs/);
      assert.deepEqual(f.mutations, []);
    });
  }
});
test('existing manifest cannot be overwritten even on an unpublished draft', async () => {
  const f = fixture({ tag: sourceCommit, release: { id: 1, tag_name: version, draft: true, assets: [{ id: 2, name: 'release-manifest.json' }] }, stored: Buffer.from('{}') });
  await assert.rejects(f.ensure, /refusing to overwrite/);
  assert.deepEqual(f.mutations, []);
});
test('policy is version bound and rejects absent rollback guidance', () => {
  assert.throws(() => validatePolicy({ ...policy, version: 'v0.69.0-01' }, version), /invalid/);
  assert.throws(() => validatePolicy({ ...policy, migration: { kind: 'state-format', rollback: 'image-only', notes: 'unsafe' } }, version), /invalid/);
});
test('each architecture must have one valid platform entry and OCI identity', () => {
  const f = fixture();
  assert.throws(() => createManifest({ version, sourceCommit, imageDigest, policy, inspect: (ref, field) => field === 'Manifest'
    ? { digest: imageDigest, manifests: [] } : f.inspect(ref, field) }), /exactly one/);
  assert.throws(() => createManifest({ version, sourceCommit, imageDigest, policy, inspect: (ref, field) => {
    const data = f.inspect(ref, field); if (field === 'Image') data.architecture = 'other'; return data;
  } }), /provenance mismatch/);
});
test('published manifest verifier rejects changed tag and unpublished releases', async () => {
  const f = fixture(); await f.ensure();
  const badApi = (method, endpoint, args) => endpoint.startsWith('git/ref/') ? { object: { type: 'commit', sha: 'c'.repeat(40) } } : f.api(method, endpoint, args);
  await assert.rejects(() => readVerifiedRelease({ version, api: badApi, inspect: f.inspect }), /does not match/);
  f.release.draft = true;
  await assert.rejects(() => readVerifiedRelease({ version, api: f.api, inspect: f.inspect }), /published stable/);
});
test('failed manifest upload leaves a draft and recovery publishes the same immutable version', async () => {
  const f = fixture(); let failOnce = true;
  const api = async (method, endpoint, options) => {
    if (options?.upload && failOnce) { failOnce = false; throw new Error('Synthetic upload failure'); }
    return f.api(method, endpoint, options);
  };
  const ensure = () => ensureNasRelease({ version, sourceCommit, imageDigest, policy, readSource: () => version, inspect: f.inspect, api, log: () => {} });
  await assert.rejects(ensure, /Synthetic upload failure/);
  assert.equal(f.release.draft, true);
  await ensure();
  assert.equal(f.release.draft, false);
  assert.equal(f.mutations.filter(item => item[1] === 'git/refs').length, 1);
});
test('approval rejects migration metadata that differs from tagged source', async () => {
  const f = fixture(); await f.ensure();
  const api = (method, endpoint, options) => endpoint.startsWith('contents/deployment/')
    ? { encoding: 'base64', content: Buffer.from(JSON.stringify({ ...policy, migration: { ...policy.migration, notes: 'Different source migration guidance' } })).toString('base64') }
    : f.api(method, endpoint, options);
  await assert.rejects(() => readVerifiedRelease({ version, api, inspect: f.inspect }), /differs from the tagged source/);
});
