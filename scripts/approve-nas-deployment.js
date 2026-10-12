'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const TARGETS = new Set(['DXP4800', 'DH4300Plus']);
const VERSION = /^v\d+\.\d+\.\d+-\d{2}$/;
const REPOSITORY = 'Gott-mit-Uns/token-monitor-nas';
const WORKFLOW_PATH = '.github/workflows/approve-deployment.yml';

function environmentName(target) {
  if (!TARGETS.has(target)) throw new Error('Unsupported production target.');
  return `production-${target}`;
}

function assertManualRun({ ref, event }) {
  if (ref !== 'refs/heads/main' || event !== 'workflow_dispatch') {
    throw new Error('Production deployment request must be manually dispatched from main.');
  }
}

function assertVersion(version) {
  if (!VERSION.test(version || '') || version.endsWith('-00')) throw new Error('Invalid NAS release version.');
}

function isNewerVersion(target, installed) {
  assertVersion(target);
  assertVersion(installed);
  const parts = value => value.slice(1).split(/[.-]/).map(part => BigInt(part));
  const next = parts(target);
  const current = parts(installed);
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== current[index]) return next[index] > current[index];
  }
  return false;
}

async function preflight({ target, version, fromVersion, ref, event }) {
  assertManualRun({ ref, event });
  const environment = environmentName(target);
  assertVersion(version);
  assertVersion(fromVersion);
  if (!isNewerVersion(version, fromVersion)) throw new Error('Approval requires a newer release; rollback needs a separate verified procedure.');
  return environment;
}

async function approveDeployment({ target, version, fromVersion, ref, event, workflowRunId, api, verifyRelease, now = new Date() }) {
  assertVersion(version);
  assertVersion(fromVersion);
  if (!isNewerVersion(version, fromVersion)) throw new Error('Approval requires a newer release; rollback needs a separate verified procedure.');
  if (!/^\d+$/.test(String(workflowRunId || '')) || !Number.isSafeInteger(Number(workflowRunId)) || Number(workflowRunId) <= 0) throw new Error('A valid workflow run ID is required.');
  const environment = await preflight({ target, version, fromVersion, ref, event });
  const { manifest } = await verifyRelease(version);
  if (manifest?.schemaVersion !== 1 || manifest.version !== version || !manifest.compatibleFrom?.includes(fromVersion)) {
    throw new Error('Release manifest does not authorize this installed version.');
  }
  // Serialized workflow jobs prevent races between requests. Do not replace
  // an unconsumed request: operators must explicitly invalidate it first.
  const seenDeployments = new Set();
  for (let page = 1; ; page += 1) {
    const deployments = await api(`/repos/${REPOSITORY}/deployments?task=nas-pull&environment=${encodeURIComponent(environment)}&per_page=100&page=${page}`);
    if (!Array.isArray(deployments) || deployments.length > 100 || seenDeployments.size + deployments.length > 10000) {
      throw new Error('Cannot safely enumerate production deployment requests.');
    }
    for (const deployment of deployments) {
      if (!Number.isSafeInteger(deployment?.id) || deployment.id <= 0 || seenDeployments.has(deployment.id)) {
        throw new Error('Cannot safely enumerate production deployment requests.');
      }
      seenDeployments.add(deployment.id);
      const statuses = await api(`/repos/${REPOSITORY}/deployments/${deployment.id}/statuses?per_page=1`);
      if (!Array.isArray(statuses) || !statuses.length) throw new Error('An existing deployment has no terminal status; resolve it before approval.');
      if (!['success', 'failure', 'error', 'inactive'].includes(statuses[0].state)) {
        throw new Error('An outstanding deployment request already exists for this NAS.');
      }
    }
    if (deployments.length < 100) break;
  }
  const payload = {
    schemaVersion: 1, target, version, sourceCommit: manifest.sourceCommit,
    imageRepository: manifest.imageRepository, imageDigest: manifest.imageDigest,
    manifest, fromVersion, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    workflowRunId: Number(workflowRunId)
  };
  const deployment = await api(`/repos/${REPOSITORY}/deployments`, {
    method: 'POST', body: { ref: manifest.sourceCommit, environment, task: 'nas-pull',
      auto_merge: false, required_contexts: [], production_environment: true,
      transient_environment: false, description: `Approved ${target} ${version}; awaiting NAS pull`, payload }
  });
  if (!Number.isSafeInteger(deployment?.id) || deployment.id <= 0) throw new Error('GitHub did not return a valid deployment ID.');
  // queued is a request, never a claim that the NAS has deployed successfully.
  await api(`/repos/${REPOSITORY}/deployments/${deployment.id}/statuses`, {
    method: 'POST', body: { state: 'queued', description: 'Approved request; waiting for the NAS pull agent.',
      log_url: `https://github.com/${REPOSITORY}/actions/runs/${workflowRunId}`, auto_inactive: false }
  });
  return { deploymentId: deployment.id, environment, payload };
}

function githubApi(token) {
  if (!token) throw new Error('GitHub workflow authentication is unavailable.');
  return async (path, { method = 'GET', body } = {}) => {
    if (!path.startsWith(`/repos/${REPOSITORY}/`)) throw new Error('Unexpected GitHub API scope.');
    let response;
    try {
      response = await fetch(`https://api.github.com${path}`, { method,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    } catch (_) { throw new Error('GitHub API request failed; approval stopped.'); }
    if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}; approval stopped.`);
    try { return await response.json(); } catch (_) { throw new Error('GitHub API returned invalid JSON.'); }
  };
}

function inspect(reference, type = 'Manifest') {
  const result = spawnSync('docker', ['buildx', 'imagetools', 'inspect', '--format', `{{json .${type}}}`, reference],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('Registry verification failed; approval stopped.');
  try { return JSON.parse(result.stdout); } catch (_) { throw new Error('Registry returned invalid metadata.'); }
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const api = githubApi(env.GITHUB_TOKEN);
  if (argv.length === 1 && argv[0] === '--preflight') {
    const environment = await preflight({ target: env.NAS_TARGET, version: env.NAS_VERSION, fromVersion: env.NAS_FROM_VERSION, ref: env.GITHUB_REF, event: env.GITHUB_EVENT_NAME });
    console.log(`Manual production request parameters verified: ${environment}`);
    return;
  }
  if (argv.length) throw new Error('Unexpected approval command arguments.');
  const { readVerifiedRelease, githubApi: releaseGithubApi } = require('./ensure-nas-release');
  const releaseApi = releaseGithubApi(REPOSITORY, env.GITHUB_TOKEN);
  const result = await approveDeployment({ target: env.NAS_TARGET, version: env.NAS_VERSION,
    fromVersion: env.NAS_FROM_VERSION, ref: env.GITHUB_REF, event: env.GITHUB_EVENT_NAME, workflowRunId: env.GITHUB_RUN_ID, api,
    verifyRelease: version => readVerifiedRelease({ version, api: releaseApi, inspect }) });
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `deployment-id=${result.deploymentId}\n`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
    `Approved request **${result.deploymentId}** for **${env.NAS_TARGET}**, ${env.NAS_FROM_VERSION} → ${env.NAS_VERSION}.\n\n` +
    `Image: \`${result.payload.imageRepository}@${result.payload.imageDigest}\`\n\n` +
    `Source: \`${result.payload.sourceCommit}\`\n\nExpires: ${result.payload.expiresAt}\n\n` +
    'Status: **queued — NAS deployment has not yet been executed or verified**.\n');
  console.log(`Deployment request ${result.deploymentId} queued for ${env.NAS_TARGET}.`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { TARGETS, WORKFLOW_PATH, environmentName, assertManualRun, preflight, approveDeployment, githubApi, isNewerVersion };
