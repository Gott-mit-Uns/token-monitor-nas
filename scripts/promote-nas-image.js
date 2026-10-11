'use strict';

const { spawnSync } = require('node:child_process');

const IMAGE_REPOSITORY = 'ghcr.io/gott-mit-uns/token-monitor-hermes';
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const VERSION_PATTERN = /^v\d+\.\d+\.\d+-\d{2}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;

function candidateReference(digest) {
  if (!DIGEST_PATTERN.test(digest || '')) throw new Error('A valid verified candidate digest is required.');
  return `${IMAGE_REPOSITORY}@${digest}`;
}

function runDocker(args) {
  return spawnSync('docker', ['buildx', 'imagetools', ...args], {
    encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024
  });
}

function runGit(args) {
  return spawnSync('git', args, {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024
  });
}

function fetchMainRelease({ git = runGit } = {}) {
  function read(args) {
    const result = git(args);
    if (result.error || result.status !== 0) {
      throw new Error('Cannot verify the current remote main release; refusing to change release tags.');
    }
    return String(result.stdout || '').trim();
  }
  // FETCH_HEAD belongs to this isolated Actions checkout. Do not check out
  // main: tests and promotion must continue using the original release code.
  read(['fetch', '--no-tags', '--depth=1', 'origin', 'refs/heads/main']);
  return {
    commit: read(['rev-parse', 'FETCH_HEAD^{commit}']),
    version: read(['show', 'FETCH_HEAD:nas-version.txt'])
  };
}

function manifestIsMissing(stderr, reference) {
  const text = String(stderr || '').trim();
  // Only an explicit missing manifest qualifies. Authentication, network,
  // proxy 404s and unknown Docker failures must never authorize tag creation.
  if (/\bunauthorized\b|\bdenied\b|\bforbidden\b|\bauthentication\b|\btimeout\b|\btimed out\b|\bconnection\b|\bunexpected status\b/i.test(text)) return false;
  if (/\bmanifest unknown\b|\bMANIFEST_UNKNOWN\b/i.test(text)) return true;
  return text.split(/\r?\n/).some(line => line.trim() === `ERROR: ${reference}: not found`);
}

function inspectManifest(reference, { docker, allowMissing = false }) {
  const result = docker(['inspect', '--format', '{{json .Manifest}}', reference]);
  if (result.error || result.status !== 0) {
    if (!result.error && allowMissing && manifestIsMissing(result.stderr, reference)) return null;
    // Do not relay registry output: authentication helpers may include details
    // that do not belong in a public workflow log.
    throw new Error('Registry inspection failed; refusing to change release tags.');
  }
  let manifest;
  try { manifest = JSON.parse(result.stdout); } catch (_) {}
  if (!manifest || !DIGEST_PATTERN.test(manifest.digest || '')) {
    throw new Error('Registry returned an invalid manifest digest; refusing to change release tags.');
  }
  return manifest;
}

function createTag(reference, source, docker) {
  const result = docker(['create', '--tag', reference, source]);
  if (result.error || result.status !== 0) {
    throw new Error('Registry tag update failed; rerun promotion with the same verified digest.');
  }
}

function requireDigest(manifest, digest, description) {
  if (manifest?.digest !== digest) throw new Error(`${description} differs from the verified digest; refusing to continue.`);
}

function promoteNasImage({ version, digest, releaseCommit, readMainRelease = fetchMainRelease, docker = runDocker, log = console.log }) {
  const source = candidateReference(digest);
  if (!VERSION_PATTERN.test(version || '') || version.endsWith('-00')) {
    throw new Error('A valid NAS release version is required.');
  }
  if (!COMMIT_PATTERN.test(releaseCommit || '')) throw new Error('A valid release commit is required.');
  function isCurrentRelease() {
    const main = readMainRelease();
    if (!COMMIT_PATTERN.test(main?.commit || '') || !VERSION_PATTERN.test(main?.version || '') || main.version.endsWith('-00')) {
      throw new Error('Remote main returned invalid release metadata; refusing to change release tags.');
    }
    return main.commit === releaseCommit && main.version === version;
  }
  function skipLatest() {
    log(`Verified fixed ${version} at ${digest}; latest was not changed because remote main has advanced.`);
    return { version, digest, latestSkipped: true };
  }
  // Re-running an old failed job after a newer release must not downgrade
  // latest, even when the old fixed tag matches its originally verified image.
  const currentAtStart = isCurrentRelease();
  const fixed = `${IMAGE_REPOSITORY}:${version}`;
  const latest = `${IMAGE_REPOSITORY}:latest`;
  const candidate = inspectManifest(source, { docker });
  requireDigest(candidate, digest, 'Candidate image');
  const entries = Array.isArray(candidate.manifests) ? candidate.manifests : [];
  const platforms = new Set(entries.map(entry => `${entry?.platform?.os}/${entry?.platform?.architecture}`));
  if (!platforms.has('linux/amd64') || !platforms.has('linux/arm64')) {
    throw new Error('The verified candidate must contain both linux/amd64 and linux/arm64.');
  }

  const currentFixed = inspectManifest(fixed, { docker, allowMissing: true });
  if (currentFixed) requireDigest(currentFixed, digest, 'Existing fixed version');
  if (!currentAtStart) {
    if (!currentFixed) throw new Error('This release is no longer remote main; refusing to create an old fixed tag.');
    return skipLatest();
  }
  if (!currentFixed) createTag(fixed, source, docker);
  // Also verifies a newly created tag before latest is touched. Re-running a
  // partially successful release keeps the matching fixed tag intact.
  requireDigest(inspectManifest(fixed, { docker }), digest, 'Fixed version');

  // main can advance while the registry is being queried. Actions also keeps
  // all publishers in one concurrency group, so a later workflow cannot
  // promote between this guard and the latest write.
  if (!isCurrentRelease()) return skipLatest();

  const currentLatest = inspectManifest(latest, { docker, allowMissing: true });
  if (currentLatest?.digest !== digest) createTag(latest, source, docker);
  requireDigest(inspectManifest(latest, { docker }), digest, 'Latest image');
  log(`Verified ${version} and latest at ${digest}.`);
  return { version, digest };
}

function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.length === 1 && argv[0] === '--candidate-ref') {
    console.log(candidateReference(env.CANDIDATE_DIGEST));
    return;
  }
  if (argv.length) throw new Error('Usage: node scripts/promote-nas-image.js [--candidate-ref]');
  return promoteNasImage({ version: env.NAS_VERSION, digest: env.CANDIDATE_DIGEST, releaseCommit: env.RELEASE_COMMIT });
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { IMAGE_REPOSITORY, candidateReference, fetchMainRelease, manifestIsMissing, promoteNasImage };
