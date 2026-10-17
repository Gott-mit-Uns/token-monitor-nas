'use strict';

const { spawnSync } = require('node:child_process');
const { IMAGE_REPOSITORY } = require('./promote-nas-image');
const VERSION = /^v\d+\.\d+\.\d+-\d{2}$/;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const RECORD_BRANCH = 'nas-publications';
const LEGACY_VERSIONS = new Set(['v0.69.0-02', 'v0.70.0-01', 'v0.71.0-01', 'v0.71.0-02', 'v0.72.0-01', 'v0.72.0-02']);
const FILES = ['manifest.json', 'UPGRADE.md', 'ROLLBACK.md'];
function validVersion(value) { return VERSION.test(value || '') && !value.endsWith('-00'); }
function command(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${program} verification failed; release completion stopped.`);
  return result.stdout.trim();
}
function validatePolicy(policy, version) {
  if (!policy || policy.schemaVersion !== 1 || policy.version !== version || !Array.isArray(policy.compatibleFrom)
    || policy.compatibleFrom.some(item => !validVersion(item)) || new Set(policy.compatibleFrom).size !== policy.compatibleFrom.length
    || !['none', 'state-format'].includes(policy.migration?.kind)
    || !['manual', 'restore-snapshot'].includes(policy.migration?.rollback)
    || typeof policy.migration?.notes !== 'string' || !policy.migration.notes.trim()) {
    throw new Error('Release migration policy is invalid or does not match the release version.');
  }
  return policy;
}
function createManifest({ version, sourceCommit, imageDigest, policy, inspect }) {
  if (!validVersion(version) || !SHA.test(sourceCommit || '') || !DIGEST.test(imageDigest || '')) throw new Error('Invalid release provenance.');
  validatePolicy(policy, version);
  const manifest = inspect(`${IMAGE_REPOSITORY}:${version}`, 'Manifest');
  if (manifest.digest !== imageDigest) throw new Error('Fixed image differs from the verified digest.');
  const platforms = [];
  for (const architecture of ['amd64', 'arm64']) {
    const entries = (manifest.manifests || []).filter(item => item.platform?.os === 'linux' && item.platform?.architecture === architecture);
    if (entries.length !== 1 || !DIGEST.test(entries[0].digest || '')) throw new Error('Release image must contain exactly one verified image for each native platform.');
    const image = inspect(`${IMAGE_REPOSITORY}@${entries[0].digest}`, 'Image');
    if (image.os !== 'linux' || image.architecture !== architecture
      || image.config?.Labels?.['org.opencontainers.image.version'] !== version
      || image.config?.Labels?.['org.opencontainers.image.revision'] !== sourceCommit) throw new Error('Image platform or OCI source/version provenance mismatch.');
    platforms.push({ os: 'linux', architecture, digest: entries[0].digest });
  }
  return { schemaVersion: 1, version, sourceCommit, imageRepository: IMAGE_REPOSITORY, imageDigest, platforms,
    migration: policy.migration, compatibleFrom: policy.compatibleFrom,
    rollback: { mode: policy.migration.rollback, reason: policy.migration.notes } };
}

function publicationFiles(manifest) {
  const identity = `Version: ${manifest.version}\nSource: ${manifest.sourceCommit}\nImage: ${manifest.imageRepository}@${manifest.imageDigest}\n`;
  return {
    'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'UPGRADE.md': `# Upgrade ${manifest.version}\n\n${identity}\nAllowed source versions: ${manifest.compatibleFrom.join(', ')}.\n\n${manifest.migration.notes}\n\nVerify the Git tag, both platform OCI revisions and fixed image digest. A tag alone does not prove publication is complete. Before changing containers, identify each NAS independently, stop writers and back up complete consistent Hub/Agent state, original configuration, permissions and SQLite WAL/SHM. Keep device IDs, paths, read-only mounts and old exact images. Upgrade DXP4800 Hub then Agent; validate DH4300Plus Agent-only independently. Check preserved tokens, cache, reasoning, costs, sessions, daily history and devices, followed by a real new upload and restart recovery. Do not enable new sources, quotas or credentials. Publication does not authorize production deployment.\n`,
    'ROLLBACK.md': `# Rollback ${manifest.version}\n\n${identity}\nPolicy: ${manifest.rollback.mode}.\n\n${manifest.rollback.reason}\n\nProtect new data and preserve the failed state before recovery. Use the old exact image with the complete closed pre-upgrade snapshot and original configuration/permissions. Do not overlay backups onto changing state, downgrade only the image, remove volumes, clear history or recreate device identity. Automatic rollback remains fail-closed unless its existing locally verified rehearsal receipt binds this exact image/state pair; otherwise use the reviewed manual restore procedure. A CI synthetic restore is not a production restore receipt.\n`
  };
}
function githubApi(repository, token) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) throw new Error('Invalid repository.');
  return async (method, endpoint, { body } = {}) => {
    if (!/^(git\/|contents\/)/.test(endpoint) || endpoint.includes('..')) throw new Error('Unexpected publication API scope.');
    let response;
    try {
      response = await fetch(`https://api.github.com/repos/${repository}/${endpoint}`, { method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000) });
    } catch (_) { throw new Error('GitHub publication request failed; no response details logged.'); }
    if (response.status === 404 && method === 'GET') return null;
    if (!response.ok) throw new Error(`GitHub publication request failed with HTTP ${response.status}; no response details logged.`);
    try { return await response.json(); } catch (_) { throw new Error('GitHub returned invalid publication JSON.'); }
  };
}
async function resolveTag(api, version) {
  let object = (await api('GET', `git/ref/tags/${version}`))?.object;
  if (!object) return null;
  for (let depth = 0; object.type === 'tag' && depth < 4; depth++) object = (await api('GET', `git/tags/${object.sha}`))?.object || {};
  if (object.type !== 'commit' || !SHA.test(object.sha || '')) throw new Error('Publication tag does not resolve to a valid commit.');
  return object.sha;
}
async function sourceFile(api, commit, path, optional = false) {
  const result = await api('GET', `contents/${path}?ref=${commit}`);
  if (!result && optional) return null;
  if (!result || result.type !== 'file' || result.encoding !== 'base64' || typeof result.content !== 'string') throw new Error('Cannot verify repository publication file.');
  return Buffer.from(result.content, 'base64').toString('utf8');
}
async function findRecord(api, version) {
  // Resolve each mutable branch once, then read all files at its immutable commit.
  for (const branch of [RECORD_BRANCH, ...(LEGACY_VERSIONS.has(version) ? ['main'] : [])]) {
    const ref = await api('GET', `git/ref/heads/${branch}`);
    if (!ref) continue;
    if (ref.object?.type !== 'commit' || !SHA.test(ref.object.sha || '')) throw new Error('Invalid publication branch.');
    const commit = ref.object.sha;
    const manifest = await sourceFile(api, commit, `publications/${version}/manifest.json`, true);
    if (manifest === null) continue;
    const files = { 'manifest.json': manifest };
    for (const file of FILES.slice(1)) files[file] = await sourceFile(api, commit, `publications/${version}/${file}`);
    return { branch, commit, files };
  }
  return null;
}
async function verifyRecord({ version, record, api, inspect }) {
  let manifest;
  try { manifest = JSON.parse(record.files['manifest.json']); } catch (_) { throw new Error('Repository publication manifest is invalid.'); }
  if (manifest?.schemaVersion !== 1 || manifest.version !== version || manifest.imageRepository !== IMAGE_REPOSITORY) throw new Error('Publication identity mismatch.');
  const expected = createManifest({ version, sourceCommit: manifest.sourceCommit, imageDigest: manifest.imageDigest,
    policy: { schemaVersion: 1, version, compatibleFrom: manifest.compatibleFrom, migration: manifest.migration }, inspect });
  const files = publicationFiles(expected);
  if (FILES.some(file => record.files[file] !== files[file]) || await resolveTag(api, version) !== manifest.sourceCommit) throw new Error('Publication record or Git tag differs from verified image provenance.');
  let policy;
  try { policy = JSON.parse(await sourceFile(api, manifest.sourceCommit, 'deployment/release-policy.json')); } catch (_) { throw new Error('Tagged source publication policy is invalid.'); }
  validatePolicy(policy, version);
  if ((await sourceFile(api, manifest.sourceCommit, 'nas-version.txt')).trim() !== version
    || JSON.stringify(policy.migration) !== JSON.stringify(manifest.migration)
    || JSON.stringify(policy.compatibleFrom) !== JSON.stringify(manifest.compatibleFrom)) throw new Error('Publication policy differs from tagged source.');
  return { manifest, recordCommit: record.commit, recordBranch: record.branch };
}
async function readVerifiedPublication({ version, api, inspect }) {
  if (!validVersion(version)) throw new Error('Invalid publication version.');
  const record = await findRecord(api, version);
  if (!record) throw new Error('A complete repository publication record is required.');
  return verifyRecord({ version, record, api, inspect });
}
async function ensureNasPublication({ version, sourceCommit, imageDigest, policy, readSource, inspect, api, log = console.log }) {
  if (!validVersion(version) || !SHA.test(sourceCommit || '') || readSource(sourceCommit, 'nas-version.txt').trim() !== version) throw new Error('Publication source version mismatch.');
  const sourcePolicy = JSON.parse(readSource(sourceCommit, 'deployment/release-policy.json'));
  if (JSON.stringify(sourcePolicy) !== JSON.stringify(policy)) throw new Error('Publication policy differs from source.');
  const manifest = createManifest({ version, sourceCommit, imageDigest, policy, inspect });
  // The pushed version tag is the release trigger; never create, move or delete it here.
  if (await resolveTag(api, version) !== sourceCommit) throw new Error('Existing version tag must match verified source.');
  const files = publicationFiles(manifest);
  const existing = await findRecord(api, version);
  if (existing) {
    if (FILES.some(file => existing.files[file] !== files[file])) throw new Error('Existing publication differs; refusing to overwrite.');
    return verifyRecord({ version, record: existing, api, inspect });
  }
  const ref = await api('GET', `git/ref/heads/${RECORD_BRANCH}`);
  if (ref && (ref.object?.type !== 'commit' || !SHA.test(ref.object.sha || ''))) throw new Error('Invalid publication branch.');
  const parent = ref?.object.sha;
  // A different publisher may have completed this version since findRecord.
  if (parent) {
    const stored = await sourceFile(api, parent, `publications/${version}/manifest.json`, true);
    if (stored !== null) {
      const raced = { branch: RECORD_BRANCH, commit: parent, files: { 'manifest.json': stored } };
      for (const file of FILES.slice(1)) raced.files[file] = await sourceFile(api, parent, `publications/${version}/${file}`);
      if (FILES.some(file => raced.files[file] !== files[file])) throw new Error('Existing publication differs; refusing to overwrite.');
      return verifyRecord({ version, record: raced, api, inspect });
    }
  }
  const parentCommit = parent && await api('GET', `git/commits/${parent}`);
  if (parent && !SHA.test(parentCommit?.tree?.sha || '')) throw new Error('Cannot verify publication history.');
  // One tree/commit/ref update records all three files atomically. Non-fast-forward
  // updates are refused, so concurrent writers require a fresh read and safe retry.
  const tree = await api('POST', 'git/trees', { body: {
    ...(parent ? { base_tree: parentCommit.tree.sha } : {}),
    tree: FILES.map(file => ({ path: `publications/${version}/${file}`, mode: '100644', type: 'blob', content: files[file] })) } });
  if (!SHA.test(tree?.sha || '')) throw new Error('Invalid publication tree receipt.');
  const commit = await api('POST', 'git/commits', { body: { message: `Record verified NAS ${version}`, tree: tree.sha, parents: parent ? [parent] : [] } });
  if (!SHA.test(commit?.sha || '')) throw new Error('Invalid publication commit receipt.');
  await api(parent ? 'PATCH' : 'POST', parent ? `git/refs/heads/${RECORD_BRANCH}` : 'git/refs',
    { body: parent ? { sha: commit.sha, force: false } : { ref: `refs/heads/${RECORD_BRANCH}`, sha: commit.sha } });
  const result = await readVerifiedPublication({ version, api, inspect });
  if (result.manifest.sourceCommit !== sourceCommit || result.manifest.imageDigest !== imageDigest) throw new Error('Publication read-back mismatch.');
  log(`Verified repository publication ${version}, source ${sourceCommit}, image ${imageDigest}. No GitHub Release created.`);
  return result;
}
async function main(env = process.env) {
  if (!env.GITHUB_TOKEN) throw new Error('Workflow authentication is required.');
  if (env.GITHUB_REF !== `refs/tags/${env.NAS_VERSION}`) throw new Error('Publication requires the explicit version tag.');
  const readSource = (commit, file) => command('git', ['show', `${commit}:${file}`]);
  if (command('git', ['rev-parse', 'HEAD']) !== env.RELEASE_COMMIT) throw new Error('Checkout differs from verified source.');
  return ensureNasPublication({ version: env.NAS_VERSION, sourceCommit: env.RELEASE_COMMIT, imageDigest: env.CANDIDATE_DIGEST,
    policy: JSON.parse(readSource(env.RELEASE_COMMIT, 'deployment/release-policy.json')), readSource,
    inspect: (ref, field) => JSON.parse(command('docker', ['buildx', 'imagetools', 'inspect', '--format', `{{json .${field}}}`, ref])),
    api: githubApi(env.GITHUB_REPOSITORY, env.GITHUB_TOKEN) });
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { RECORD_BRANCH, LEGACY_VERSIONS, FILES, validatePolicy, createManifest, publicationFiles, resolveTag, findRecord,
  ensureNasPublication, readVerifiedPublication, githubApi };
