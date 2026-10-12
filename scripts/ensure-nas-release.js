'use strict';

const { spawnSync } = require('node:child_process');
const { IMAGE_REPOSITORY } = require('./promote-nas-image');
const VERSION = /^v\d+\.\d+\.\d+-\d{2}$/;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const ASSET = 'release-manifest.json';

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
function githubApi(repository, token) {
  const base = `https://api.github.com/repos/${repository}`;
  return async (method, endpoint, { body, binary, upload } = {}) => {
    const url = upload || `${base}/${endpoint}`;
    if (upload && !url.startsWith(`https://uploads.github.com/repos/${repository}/releases/`)) throw new Error('Unexpected release upload endpoint.');
    let response;
    try {
      response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28',
        Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json',
        ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: upload ? body : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000) });
    } catch (_) { throw new Error('GitHub request failed; release completion stopped.'); }
    if (response.status === 404 && method === 'GET' && !binary) return null;
    if (!response.ok) throw new Error(`GitHub release request failed with HTTP ${response.status}; no response details logged.`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  };
}
async function resolveTag(api, version) {
  let object = (await api('GET', `git/ref/tags/${version}`))?.object;
  if (!object) return null;
  for (let depth = 0; object.type === 'tag' && depth < 4; depth++) object = (await api('GET', `git/tags/${object.sha}`))?.object || {};
  if (object.type !== 'commit' || !SHA.test(object.sha || '')) throw new Error('Release tag does not resolve to a valid commit.');
  return object.sha;
}
async function readVerifiedRelease({ version, api, inspect }) {
  if (!validVersion(version)) throw new Error('Invalid release version.');
  const release = await api('GET', `releases/tags/${version}`);
  if (!release || release.draft || release.prerelease || release.tag_name !== version) throw new Error('A published stable release is required.');
  const assets = (release.assets || []).filter(item => item.name === ASSET);
  if (assets.length !== 1) throw new Error('Exactly one immutable release manifest is required.');
  const bytes = await api('GET', `releases/assets/${assets[0].id}`, { binary: true });
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch (_) { throw new Error('Published release manifest is invalid.'); }
  if (manifest?.schemaVersion !== 1 || manifest.version !== version || manifest.imageRepository !== IMAGE_REPOSITORY) throw new Error('Published release manifest provenance is invalid.');
  const expected = createManifest({ version, sourceCommit: manifest.sourceCommit, imageDigest: manifest.imageDigest,
    policy: { schemaVersion: 1, version, compatibleFrom: manifest.compatibleFrom, migration: manifest.migration }, inspect });
  if (!bytes.equals(Buffer.from(`${JSON.stringify(expected, null, 2)}\n`)) || await resolveTag(api, version) !== manifest.sourceCommit) throw new Error('Published release manifest or Git tag does not match verified image provenance.');
  async function sourceFile(file) {
    const result = await api('GET', `contents/${file}?ref=${manifest.sourceCommit}`);
    if (!result || result.encoding !== 'base64' || typeof result.content !== 'string') throw new Error('Cannot verify published source release policy.');
    return Buffer.from(result.content, 'base64').toString('utf8');
  }
  let sourcePolicy;
  try { sourcePolicy = JSON.parse(await sourceFile('deployment/release-policy.json')); } catch (_) { throw new Error('Published source release policy is invalid.'); }
  validatePolicy(sourcePolicy, version);
  if ((await sourceFile('nas-version.txt')).trim() !== version || JSON.stringify(sourcePolicy.migration) !== JSON.stringify(manifest.migration)
    || JSON.stringify(sourcePolicy.compatibleFrom) !== JSON.stringify(manifest.compatibleFrom)) throw new Error('Manifest migration policy differs from the tagged source.');
  return { manifest, release };
}
async function ensureNasRelease({ version, sourceCommit, imageDigest, policy, readSource, inspect, api, log = console.log }) {
  if (!validVersion(version) || !SHA.test(sourceCommit || '') || readSource(sourceCommit, 'nas-version.txt').trim() !== version) throw new Error('Release source version mismatch.');
  const manifest = createManifest({ version, sourceCommit, imageDigest, policy, inspect });
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  let tagCommit = await resolveTag(api, version);
  if (tagCommit && tagCommit !== sourceCommit) throw new Error('Existing fixed Git tag points to a different source commit; refusing to overwrite.');
  // Validate every immutable object before making any GitHub mutation.
  let release = await api('GET', `releases/tags/${version}`);
  if (release && (release.tag_name !== version || release.prerelease)) throw new Error('Existing release metadata conflicts with a stable NAS release.');
  const matchingAssets = (release?.assets || []).filter(item => item.name === ASSET);
  if (matchingAssets.length > 1) throw new Error('Duplicate release manifests are not allowed.');
  let asset = matchingAssets[0];
  if (release && !release.draft && !asset) throw new Error('Existing published release has no immutable manifest; historical releases are not modified.');
  if (asset) {
    const existing = await api('GET', `releases/assets/${asset.id}`, { binary: true });
    if (!Buffer.isBuffer(existing) || !existing.equals(bytes)) throw new Error('Existing release manifest differs; refusing to overwrite.');
  }
  if (!tagCommit) {
    await api('POST', 'git/refs', { body: { ref: `refs/tags/${version}`, sha: sourceCommit } });
    tagCommit = await resolveTag(api, version);
    if (tagCommit !== sourceCommit) throw new Error('Created tag did not resolve to the verified source commit.');
  }
  if (!release) {
    release = await api('POST', 'releases', { body: { tag_name: version, target_commitish: sourceCommit, name: version, draft: true, prerelease: false,
      body: `Verified NAS release ${version}.\n\nSource commit: \`${sourceCommit}\`\nImage: \`${IMAGE_REPOSITORY}@${imageDigest}\`\n\nBoth linux/amd64 and linux/arm64 passed native verification. See release-manifest.json for immutable provenance and migration policy. Publishing this release does not deploy a NAS.` } });
  }
  if (!asset) {
    const uploaded = await api('POST', '', { upload: `${release.upload_url.split('{')[0]}?name=${ASSET}`, body: bytes });
    asset = uploaded;
    if (asset.name !== ASSET || asset.state !== 'uploaded') throw new Error('Release manifest upload was not confirmed.');
    const stored = await api('GET', `releases/assets/${asset.id}`, { binary: true });
    if (!stored.equals(bytes)) throw new Error('Uploaded release manifest failed read-back verification.');
  }
  if (release.draft) release = await api('PATCH', `releases/${release.id}`, { body: { draft: false } });
  const final = await api('GET', `releases/tags/${version}`);
  if (!final || final.draft || final.prerelease || final.tag_name !== version || await resolveTag(api, version) !== sourceCommit) throw new Error('Final published release verification failed.');
  const finalAsset = (final.assets || []).find(item => item.name === ASSET);
  if (!finalAsset || !(await api('GET', `releases/assets/${finalAsset.id}`, { binary: true })).equals(bytes)) throw new Error('Final published manifest verification failed.');
  log(`Verified GitHub Release ${version}, source ${sourceCommit}, image ${imageDigest}.`);
  return { version, sourceCommit, imageDigest, url: final.html_url };
}
async function main(env = process.env) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY || '') || !env.GITHUB_TOKEN) throw new Error('GitHub repository and workflow token are required.');
  const readSource = (commit, file) => command('git', ['show', `${commit}:${file}`]);
  if (command('git', ['rev-parse', 'HEAD']) !== env.RELEASE_COMMIT) throw new Error('Checkout differs from the verified release commit.');
  const policy = JSON.parse(readSource(env.RELEASE_COMMIT, 'deployment/release-policy.json'));
  return ensureNasRelease({ version: env.NAS_VERSION, sourceCommit: env.RELEASE_COMMIT, imageDigest: env.CANDIDATE_DIGEST, policy, readSource,
    inspect: (ref, field) => JSON.parse(command('docker', ['buildx', 'imagetools', 'inspect', '--format', `{{json .${field}}}`, ref])),
    api: githubApi(env.GITHUB_REPOSITORY, env.GITHUB_TOKEN) });
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validatePolicy, createManifest, resolveTag, ensureNasRelease, readVerifiedRelease, githubApi };
