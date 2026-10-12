'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertManualRun, preflight, approveDeployment, isNewerVersion } = require('../approve-nas-deployment');
const manifest = () => ({ schemaVersion: 1, version: 'v0.69.0-02', sourceCommit: 'a'.repeat(40),
  imageRepository: 'ghcr.io/gott-mit-uns/token-monitor-hermes', imageDigest: `sha256:${'b'.repeat(64)}`,
  platforms: [{ os: 'linux', architecture: 'amd64', digest: `sha256:${'c'.repeat(64)}` },
    { os: 'linux', architecture: 'arm64', digest: `sha256:${'d'.repeat(64)}` }],
  compatibleFrom: ['v0.69.0-01'], migration: { kind: 'none', rollback: 'restore-snapshot', notes: 'Synthetic fixture' },
  rollback: { mode: 'restore-snapshot', reason: 'Restore all backed-up state.' } });
function fixture(overrides = {}) {
  const calls = [];
  const options = { target: 'DXP4800', version: 'v0.69.0-02', fromVersion: 'v0.69.0-01',
    ref: 'refs/heads/main', event: 'workflow_dispatch', workflowRunId: '1234', now: new Date('2026-10-12T00:00:00Z'),
    verifyRelease: async () => ({ manifest: manifest() }),
    api: async (path, request = {}) => { calls.push({ path, ...request });
      if (path.includes('?task=nas-pull&environment=')) return [];
      if (path.endsWith('/deployments')) return { id: 99 };
      if (path.endsWith('/statuses')) return { state: request.body.state };
      throw new Error('Unexpected mock API request'); }, ...overrides };
  return { calls, options };
}
test('manual dispatch from main is the explicit deployment request', () => {
  assert.doesNotThrow(() => assertManualRun({ ref: 'refs/heads/main', event: 'workflow_dispatch' }));
  for (const context of [{ ref: 'refs/heads/experiment', event: 'workflow_dispatch' },
    { ref: 'refs/heads/main', event: 'push' }, { ref: 'refs/heads/main', event: undefined }]) {
    assert.throws(() => assertManualRun(context));
  }
});
test('preflight rejects wrong event, branch, target or version without API access', async () => {
  for (const changes of [{ ref: 'refs/heads/experiment' }, { event: 'push' }, { target: 'other' }, { version: 'latest' }]) {
    const { calls, options } = fixture(changes);
    await assert.rejects(preflight(options));
    assert.equal(calls.length, 0);
  }
});
test('manual request queues full release manifest without claiming deployment', async () => {
  const { calls, options } = fixture();
  const result = await approveDeployment(options);
  assert.equal(result.deploymentId, 99);
  assert.equal(result.payload.expiresAt, '2026-10-13T00:00:00.000Z');
  assert.equal(result.environment, 'production-DXP4800');
  assert.deepEqual(result.payload.manifest, manifest());
  const creation = calls.find(call => call.path.endsWith('/deployments'));
  assert.equal(creation.body.ref, manifest().sourceCommit);
  assert.equal(creation.body.task, 'nas-pull');
  assert.ok(calls.some(call => call.path.includes('?task=nas-pull&environment=')));
  assert.equal(creation.body.auto_merge, false);
  assert.deepEqual(creation.body.required_contexts, []);
  assert.equal(calls.at(-1).body.state, 'queued');
  assert.ok(!calls.some(call => call.body?.state === 'success'));
});
test('DH4300Plus uses its own environment', async () => {
  const { options } = fixture({ target: 'DH4300Plus' });
  assert.equal((await approveDeployment(options)).environment, 'production-DH4300Plus');
});
test('invalid versions and unsupported installed release cannot create request', async () => {
  for (const changes of [{ version: 'latest' }, { version: 'v0.69.0-00' }, { fromVersion: 'v0.69.0-02' },
    { workflowRunId: 'nan' }, { workflowRunId: '9007199254740992' }, { fromVersion: 'v0.68.0-05' },
    { verifyRelease: async () => ({ manifest: { ...manifest(), version: 'v0.70.0-01' } }) },
    { verifyRelease: async () => { throw new Error('Release tag or image mismatch'); } }]) {
    const { calls, options } = fixture(changes);
    await assert.rejects(approveDeployment(options));
    assert.ok(!calls.some(call => call.method === 'POST'));
  }
});
test('outstanding, unverifiable or malformed deployment list fails closed', async () => {
  for (const statuses of [[], [{ state: 'queued' }], [{ state: 'pending' }], [{ state: 'in_progress' }], [{ state: 'unknown' }]]) {
    const { calls, options } = fixture();
    const originalApi = options.api;
    options.api = async (path, request) => {
      if (path.includes('?task=nas-pull&environment=')) return [{ id: 1 }];
      if (path.includes('/1/statuses?')) return statuses;
      return originalApi(path, request);
    };
    await assert.rejects(approveDeployment(options));
    assert.ok(!calls.some(call => call.method === 'POST'));
  }
  const { options } = fixture({ api: async () => Array.from({length:100}, (_, id) => ({id})) });
  await assert.rejects(approveDeployment(options), /enumerate/);
});
test('terminal prior request permits next approval', async () => {
  for (const state of ['success', 'failure', 'error', 'inactive']) {
    const { options } = fixture();
    const originalApi = options.api;
    options.api = async (path, request) => {
      if (path.includes('?task=nas-pull&environment=')) return [{ id: 1 }];
      if (path.includes('/1/statuses?')) return [{ state }];
      return originalApi(path, request);
    };
    assert.equal((await approveDeployment(options)).deploymentId, 99);
  }
});
test('production version order is numeric and never authorizes downgrades', async () => {
  assert.equal(isNewerVersion('v0.69.0-10', 'v0.69.0-09'), true);
  assert.equal(isNewerVersion('v0.100.0-01', 'v0.99.0-99'), true);
  assert.equal(isNewerVersion('v0.69.0-01', 'v0.69.0-02'), false);
  assert.equal(isNewerVersion('v0.68.9-99', 'v0.69.0-01'), false);
  assert.equal(isNewerVersion('v0.69.0-01', 'v0.69.0-01'), false);
  const { calls, options } = fixture({ version: 'v0.69.0-01', fromVersion: 'v0.69.0-02' });
  await assert.rejects(approveDeployment(options), /newer release/);
  assert.equal(calls.length, 0);
});

test('physical NAS request enumeration excludes automatic Environment deployments', async () => {
  const { calls, options } = fixture();
  const originalApi = options.api;
  options.api = async (path, request) => {
    if (path.includes('/deployments?') && !path.includes('task=nas-pull')) return [{ id: 88, task: 'deploy' }];
    return originalApi(path, request);
  };
  assert.equal((await approveDeployment(options)).deploymentId, 99);
  assert.ok(calls.some(call => call.path.includes('task=nas-pull&environment=production-DXP4800')));
});

test('request creation never reads or configures GitHub Environment protections', async () => {
  const { calls, options } = fixture();
  await approveDeployment(options);
  assert.ok(calls.every(call => !call.path.includes('/environments/')));
});


test('more than 100 terminal deployment records permits a subsequent request', async () => {
  const { calls, options } = fixture();
  const originalApi = options.api;
  const pages = [];
  options.api = async (path, request) => {
    if (path.includes('/deployments?')) {
      const page = Number(new URL(`https://example.invalid${path}`).searchParams.get('page'));
      pages.push({ path, page });
      return page === 1 ? Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })) : [{ id: 101 }];
    }
    if (path.includes('/statuses?')) return [{ state: 'success' }];
    return originalApi(path, request);
  };
  assert.equal((await approveDeployment(options)).deploymentId, 99);
  assert.deepEqual(pages.map(entry => entry.page), [1, 2]);
  assert.ok(pages.every(entry => entry.path.includes('task=nas-pull&environment=production-DXP4800')));
  assert.ok(calls.some(call => call.method === 'POST'));
});

test('queued request on the second page still blocks approval', async () => {
  const { calls, options } = fixture();
  const originalApi = options.api;
  options.api = async (path, request) => {
    if (path.includes('/deployments?')) return path.includes('&page=1') ? Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })) : [{ id: 101 }];
    if (path.includes('/statuses?')) return [{ state: path.includes('/101/statuses?') ? 'queued' : 'success' }];
    return originalApi(path, request);
  };
  await assert.rejects(approveDeployment(options), /outstanding/);
  assert.ok(!calls.some(call => call.method === 'POST'));
});

test('repeated pagination and unbounded deployment histories fail closed', async () => {
  for (const repeated of [true, false]) {
    const { calls, options } = fixture();
    const originalApi = options.api;
    options.api = async (path, request) => {
      if (path.includes('/deployments?')) {
        const page = Number(new URL(`https://example.invalid${path}`).searchParams.get('page'));
        return Array.from({ length: 100 }, (_, index) => ({ id: (repeated ? 0 : page - 1) * 100 + index + 1 }));
      }
      if (path.includes('/statuses?')) return [{ state: 'success' }];
      return originalApi(path, request);
    };
    await assert.rejects(approveDeployment(options), /enumerate/);
    assert.ok(!calls.some(call => call.method === 'POST'));
  }
});
