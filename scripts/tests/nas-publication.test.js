'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { IMAGE_REPOSITORY } = require('../promote-nas-image');
const { ensureNasPublication, createManifest, readVerifiedPublication, publicationFiles, validatePolicy, LEGACY_VERSIONS, githubApi } = require('../nas-publication');
const version = 'v0.73.0-01', sourceCommit = 'a'.repeat(40), imageDigest = `sha256:${'b'.repeat(64)}`;
const policy = { schemaVersion: 1, version, compatibleFrom: ['v0.72.0-02'], migration: { kind: 'none', rollback: 'restore-snapshot', notes: 'Restore the complete closed snapshot after local rehearsal.' } };
function fixture(options = {}) {
  let tag = options.tag === undefined ? sourceCommit : options.tag;
  let head = options.head || null;
  let files = { ...(options.files || {}) };
  const mutations = [], calls = [], commits = new Map(), trees = new Map();
  const inspect = (ref, field) => field === 'Manifest'
    ? { digest: options.digest || imageDigest, manifests: ['amd64', 'arm64'].map((architecture, i) => ({ platform: { os: 'linux', architecture }, digest: `sha256:${String(i + 1).repeat(64)}` })) }
    : { os: 'linux', architecture: ref.endsWith('1'.repeat(64)) ? 'amd64' : 'arm64', config: { Labels: {
      'org.opencontainers.image.version': options.labelVersion || version, 'org.opencontainers.image.revision': options.labelCommit || sourceCommit } } };
  const api = async (method, endpoint, data = {}) => {
    assert.ok(!endpoint.startsWith('releases'), 'GitHub Release API is never used');
    calls.push([method, endpoint]);
    if (method !== 'GET') mutations.push([method, endpoint, data.body]);
    if (endpoint === `git/ref/tags/${version}`) return tag ? { object: { type: 'commit', sha: tag } } : null;
    if (endpoint === 'git/ref/heads/nas-publications') return head ? { object: { type: 'commit', sha: head } } : null;
    if (endpoint === 'git/ref/heads/main') return { object: { type: 'commit', sha: 'f'.repeat(40) } };
    if (endpoint.startsWith('contents/')) {
      const [file, query] = endpoint.slice(9).split('?ref=');
      const content = query === sourceCommit ? (file === 'nas-version.txt' ? version : JSON.stringify(options.sourcePolicy || policy)) : files[file];
      return content === undefined ? null : { type: 'file', encoding: 'base64', content: Buffer.from(content).toString('base64') };
    }
    if (method === 'GET' && endpoint.startsWith('git/commits/')) return { tree: { sha: 'd'.repeat(40) } };
    if (method === 'POST' && endpoint === 'git/trees') {
      const sha = String(trees.size + 3).repeat(40); trees.set(sha, data.body.tree); return { sha };
    }
    if (method === 'POST' && endpoint === 'git/commits') {
      const sha = String(commits.size + 5).repeat(40); commits.set(sha, data.body); return { sha };
    }
    if ((method === 'POST' && endpoint === 'git/refs') || (method === 'PATCH' && endpoint === 'git/refs/heads/nas-publications')) {
      if (options.failRefOnce) { options.failRefOnce = false; throw new Error('Synthetic ref failure'); }
      const commit = commits.get(data.body.sha);
      assert.deepEqual(commit.parents, head ? [head] : []);
      if (method === 'PATCH') assert.equal(data.body.force, false);
      for (const entry of trees.get(commit.tree)) files[entry.path] = entry.content;
      head = data.body.sha; return {};
    }
    throw new Error('Unexpected synthetic API request: ' + endpoint);
  };
  const readSource = (commit, file) => file === 'nas-version.txt' ? options.sourceVersion || version : JSON.stringify(options.sourcePolicy || policy);
  const ensure = (override = {}) => ensureNasPublication({ version, sourceCommit, imageDigest, policy, readSource, inspect, api, log: () => {}, ...override });
  return { ensure, inspect, api, calls, mutations, get head() { return head; }, get files() { return files; }, set files(value) { files = value; } };
}
test('records all files atomically without creating a Release or changing the version tag', async () => {
  const f = fixture();
  const result = await f.ensure();
  assert.equal(result.manifest.sourceCommit, sourceCommit);
  assert.equal(result.recordBranch, 'nas-publications');
  assert.equal(result.recordCommit, f.head);
  assert.deepEqual(f.mutations.map(x => x[1]), ['git/trees', 'git/commits', 'git/refs']);
  const files = publicationFiles(result.manifest);
  for (const [name, content] of Object.entries(files)) assert.equal(f.files[`publications/${version}/${name}`], content);
  await f.ensure();
  assert.equal(f.mutations.length, 3, 'completed rerun is read-only');
});
test('appends to existing history without losing another version', async () => {
  const f = fixture({ head: 'e'.repeat(40), files: { 'publications/old/manifest.json': 'preserve' } });
  await f.ensure();
  assert.equal(f.files['publications/old/manifest.json'], 'preserve');
  assert.equal(f.mutations.at(-1)[1], 'git/refs/heads/nas-publications');
  assert.equal(f.mutations.at(-1)[2].force, false);
});
test('failed branch update exposes no partial record and safe retry completes', async () => {
  const f = fixture({ failRefOnce: true });
  await assert.rejects(f.ensure, /Synthetic ref failure/);
  assert.equal(f.head, null); assert.deepEqual(f.files, {});
  await f.ensure();
  assert.equal((await readVerifiedPublication({ version, api: f.api, inspect: f.inspect })).manifest.imageDigest, imageDigest);
});
test('missing or moved Git tags, OCI mismatch and invalid policy prevent repository writes', async t => {
  for (const options of [{ tag: null }, { tag: 'c'.repeat(40) }, { sourceVersion: 'v0.72.0-02' },
    { digest: `sha256:${'f'.repeat(64)}` }, { labelCommit: 'd'.repeat(40) }, { labelVersion: 'v0.72.0-02' }]) {
    await t.test(JSON.stringify(options), async () => {
      const f = fixture(options); await assert.rejects(f.ensure); assert.equal(f.mutations.length, 0);
    });
  }
  const f = fixture();
  await assert.rejects(() => f.ensure({ policy: { ...policy, compatibleFrom: [] } }), /differs from source/);
  assert.equal(f.mutations.length, 0);
});
test('an existing manifest or either guidance document cannot be overwritten', async () => {
  for (const name of ['manifest.json', 'UPGRADE.md', 'ROLLBACK.md']) {
    const f = fixture(); await f.ensure(); const count = f.mutations.length;
    f.files[`publications/${version}/${name}`] = '{}';
    await assert.rejects(f.ensure, /refusing to overwrite/);
    assert.equal(f.mutations.length, count);
  }
});
test('partial publication record and absent future publication fail closed without main fallback', async () => {
  const f = fixture();
  await assert.rejects(() => readVerifiedPublication({ version, api: f.api, inspect: f.inspect }), /complete repository/);
  assert.ok(!f.calls.some(x => x[1] === 'git/ref/heads/main'));
  await f.ensure(); delete f.files[`publications/${version}/ROLLBACK.md`];
  await assert.rejects(() => readVerifiedPublication({ version, api: f.api, inspect: f.inspect }), /repository publication file/);
});
test('reader validates tagged source policy and moved tag after publication', async () => {
  const f = fixture(); await f.ensure();
  for (const altered of ['tag', 'policy', 'version']) {
    const api = (method, endpoint, args) => {
      if (altered === 'tag' && endpoint.startsWith('git/ref/tags/')) return { object: { type: 'commit', sha: 'c'.repeat(40) } };
      if (altered !== 'tag' && endpoint.startsWith('contents/') && endpoint.endsWith('?ref=' + sourceCommit)) {
        const content = altered === 'policy' ? JSON.stringify({ ...policy, migration: { ...policy.migration, notes: 'Different' } }) : 'v0.72.0-02';
        return { type: 'file', encoding: 'base64', content: Buffer.from(content).toString('base64') };
      }
      return f.api(method, endpoint, args);
    };
    await assert.rejects(() => readVerifiedPublication({ version, api, inspect: f.inspect }));
  }
});
test('policy requires version binding, unique source versions and a complete rollback policy', () => {
  for (const changes of [{ version: 'v0.72.0-02' }, { compatibleFrom: ['v0.72.0-02', 'v0.72.0-02'] },
    { migration: { kind: 'state-format', rollback: 'image-only', notes: 'unsafe' } }]) assert.throws(() => validatePolicy({ ...policy, ...changes }, version));
});
test('each architecture must have exactly one valid platform entry and matching OCI identity', () => {
  const f = fixture();
  for (const inspect of [() => ({ digest: imageDigest, manifests: [] }), (ref, field) => {
    const data = f.inspect(ref, field); if (field === 'Image') data.architecture = 'other'; return data;
  }]) assert.throws(() => createManifest({ version, sourceCommit, imageDigest, policy, inspect }));
});
test('all six legacy repository imports preserve canonical manifest and bound guidance', () => {
  for (const v of LEGACY_VERSIONS) {
    const folder = path.join(__dirname, '../../publications', v);
    const bytes = fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(bytes); assert.equal(manifest.version, v);
    const files = publicationFiles(manifest);
    for (const [name, expected] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(folder, name), 'utf8'), expected);
  }
});
test('legacy records are read from main at a pinned commit without Release API access', async () => {
  const v = 'v0.72.0-02', files = {};
  for (const name of ['manifest.json', 'UPGRADE.md', 'ROLLBACK.md']) files[name] = fs.readFileSync(path.join(__dirname, '../../publications', v, name), 'utf8');
  const manifest = JSON.parse(files['manifest.json']); const head = 'f'.repeat(40);
  const api = async (method, endpoint) => {
    assert.equal(method, 'GET'); assert.ok(!endpoint.startsWith('releases'));
    if (endpoint === 'git/ref/heads/nas-publications') return null;
    if (endpoint === 'git/ref/heads/main') return { object: { type: 'commit', sha: head } };
    if (endpoint === `git/ref/tags/${v}`) return { object: { type: 'commit', sha: manifest.sourceCommit } };
    const file = endpoint.slice(9).split('?ref=')[0];
    const text = endpoint.endsWith('?ref=' + head) ? files[path.basename(file)] : file === 'nas-version.txt' ? v : JSON.stringify({ schemaVersion: 1, version: v, compatibleFrom: manifest.compatibleFrom, migration: manifest.migration });
    assert.ok(text); return { type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64') };
  };
  const inspect = (ref, field) => field === 'Manifest' ? { digest: manifest.imageDigest, manifests: manifest.platforms.map(p => ({ platform: p, digest: p.digest })) }
    : { os: 'linux', architecture: manifest.platforms.find(p => ref.endsWith(p.digest)).architecture, config: { Labels: { 'org.opencontainers.image.version': v, 'org.opencontainers.image.revision': manifest.sourceCommit } } };
  const result = await readVerifiedPublication({ version: v, api, inspect });
  assert.equal(result.recordBranch, 'main'); assert.equal(result.recordCommit, head);
});
test('publication API refuses Release endpoints before making a request', async () => {
  const api = githubApi('test/repo', 'synthetic');
  await assert.rejects(() => api('POST', 'releases'), /scope/);
});

test('a conflicting version added between initial lookup and commit preparation cannot be overwritten', async () => {
  const f = fixture({ head: 'e'.repeat(40) }); let reads = 0;
  const api = async (method, endpoint, args) => {
    if (endpoint === 'git/ref/heads/nas-publications' && ++reads === 2) {
      const manifest = createManifest({ version, sourceCommit, imageDigest, policy, inspect: f.inspect });
      const files = publicationFiles(manifest); files['ROLLBACK.md'] = 'Conflicting concurrent publication';
      for (const [name, value] of Object.entries(files)) f.files[`publications/${version}/${name}`] = value;
    }
    return f.api(method, endpoint, args);
  };
  await assert.rejects(() => f.ensure({ api }), /refusing to overwrite/);
  assert.equal(f.mutations.length, 0);
});
test('a compare-and-swap conflict preserves existing records and stops publication', async () => {
  const f = fixture({ head: 'e'.repeat(40), files: { 'publications/old/manifest.json': 'preserve' } });
  const api = (method, endpoint, args) => {
    if (method === 'PATCH') throw new Error('Synthetic non-fast-forward conflict');
    return f.api(method, endpoint, args);
  };
  await assert.rejects(() => f.ensure({ api }), /non-fast-forward/);
  assert.equal(f.head, 'e'.repeat(40)); assert.deepEqual(f.files, { 'publications/old/manifest.json': 'preserve' });
});
test('workflow only triggers on version tags, preserves native gates and records before latest', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/validate.yml'), 'utf8');
  assert.match(workflow, /push:\s+tags:/);
  assert.doesNotMatch(workflow, /branches: \[main\]|ensure-nas-release|gh release|releases\/tags/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/tags\/\$version"/);
  assert.match(workflow, /needs: \[build_amd64, verify_arm64\]/);
  const fixed = workflow.indexOf('run: node scripts/promote-nas-image.js --fixed-only');
  const record = workflow.indexOf('run: node scripts/nas-publication.js');
  const latest = workflow.lastIndexOf('run: node scripts/promote-nas-image.js');
  assert.ok(fixed > 0 && fixed < record && record < latest);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});
