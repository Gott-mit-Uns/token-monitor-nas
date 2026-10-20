#!/usr/bin/env python3
"""Outbound-only, fail-closed NAS deployment controller (Python 3 stdlib).

Requires a locally reviewed root-owned 0600 config and credential. No installation
or production permission is granted by this repository. Output contains phase codes
only; Docker output, configuration, data and credentials stay in process memory.
"""
import argparse
import base64
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import time
import urllib.request

REPO = 'Gott-mit-Uns/token-monitor-nas'
IMAGE = 'ghcr.io/gott-mit-uns/token-monitor-hermes'
VERSION = re.compile(r'^v\d+\.\d+\.\d+-\d{2}$')
SHA = re.compile(r'^[0-9a-f]{40}$')
DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')
PUBLICATION_BRANCH = 'nas-publications'
LEGACY_VERSIONS = {'v0.69.0-02', 'v0.70.0-01', 'v0.71.0-01', 'v0.71.0-02', 'v0.72.0-01', 'v0.72.0-02'}

class Refused(RuntimeError):
    pass

def require(condition, code):
    if not condition:
        raise Refused(code)

def private_json(path, value):
    path = Path(path)
    tmp = path.with_name(path.name + '.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)

def canonical(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def no_links(path):
    path = Path(path)
    require(path.is_absolute() and path == path.resolve(), 'path_symlink_or_relative')
    if path.is_dir():
        require(all(not p.is_symlink() for p in path.rglob('*')), 'state_contains_symlink')
    return path

def check_private(path, root=True):
    path = no_links(path)
    info = path.stat()
    require(stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o600,
            'private_file_requires_0600')
    require(not root or info.st_uid == 0, 'private_file_requires_root_owner')
    return path

def config_load(path):
    require(os.geteuid() == 0, 'local_root_required')
    cfg = json.loads(check_private(path).read_text())
    require(cfg.get('target') in ['DXP4800', 'DH4300Plus'], 'invalid_target')
    project = no_links(cfg['projectRoot'])
    for field in ['composeFile', 'stateDir', 'hermesDir']:
        no_links(cfg[field])
    require(Path(cfg['composeFile']).parent == project, 'compose_not_in_project')
    require(Path(cfg['stateDir']).is_relative_to(project), 'state_outside_project')
    require(Path(cfg['hermesDir']) != project and not Path(cfg['hermesDir']).is_relative_to(project), 'hermes_inside_project')
    if cfg.get('hubDataDir'):
        no_links(cfg['hubDataDir'])
        require(Path(cfg['hubDataDir']).is_relative_to(project), 'hub_state_outside_project')
    check_private(project / '.env', root=False)
    for secured in [project, Path(cfg['composeFile']), Path(cfg['stateDir'])] + ([Path(cfg['hubDataDir'])] if cfg.get('hubDataDir') else []):
        require(not secured.stat().st_mode & 0o022, 'writable_production_path_requires_hardening')
    control = Path(cfg['controlDir'])
    require(control.is_absolute() and not control.is_relative_to(Path(cfg['stateDir'])), 'invalid_control_directory')
    require(not cfg.get('hubDataDir') or not control.is_relative_to(Path(cfg['hubDataDir'])), 'invalid_control_directory')
    require(control == control.resolve(), 'control_symlink')
    control.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(control.stat().st_uid == 0 and stat.S_IMODE(control.stat().st_mode) == 0o700, 'control_requires_root_0700')
    require(bool(cfg.get('statusTokenFile')), 'status_credential_required')
    check_private(cfg['statusTokenFile'])
    return cfg

def validate_request(req, cfg, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    require(req.get('schemaVersion') == 1 and req.get('target') == cfg['target'], 'request_target_or_schema')
    for key in ['version', 'fromVersion']:
        require(bool(VERSION.fullmatch(req.get(key, ''))), 'invalid_version')
    require(tuple(map(int, re.findall(r'\d+', req['version']))) > tuple(map(int, re.findall(r'\d+', req['fromVersion']))), 'already_target_version')
    require(bool(SHA.fullmatch(req.get('sourceCommit', ''))), 'invalid_source_commit')
    require(req.get('imageRepository') == IMAGE and bool(DIGEST.fullmatch(req.get('imageDigest', ''))), 'invalid_image_reference')
    try:
        expiry = dt.datetime.fromisoformat(req.get('expiresAt', '').replace('Z', '+00:00'))
    except (ValueError, TypeError):
        raise Refused('invalid_request_expiry') from None
    require(expiry.tzinfo and now < expiry <= now + dt.timedelta(hours=24), 'expired_or_unbounded_request')
    require(isinstance(req.get('deploymentId'), int) and req['deploymentId'] > 0, 'invalid_deployment_id')
    require(isinstance(req.get('workflowRunId'), int) and req['workflowRunId'] > 0, 'invalid_workflow_run_id')
    manifest = req.get('manifest', {})
    require(manifest.get('schemaVersion') == 1, 'invalid_manifest_schema')
    require(all(manifest.get(k) == req.get(k) for k in ['version', 'sourceCommit', 'imageRepository', 'imageDigest']), 'manifest_identity_mismatch')
    platforms = manifest.get('platforms', [])
    require(isinstance(platforms, list) and len(platforms) == 2 and all(isinstance(p, dict) and DIGEST.fullmatch(p.get('digest', '')) for p in platforms), 'manifest_platforms')
    require({(p.get('os'), p.get('architecture')) for p in platforms} == {('linux', 'amd64'), ('linux', 'arm64')}, 'manifest_platforms')
    migration = manifest.get('migration', {})
    require(migration.get('kind') in ['none', 'state-format'] and migration.get('rollback') in ['manual', 'restore-snapshot'], 'invalid_migration_policy')
    require(isinstance(migration.get('notes'), str) and migration['notes'].strip(), 'migration_notes_required')
    require(req['fromVersion'] in manifest.get('compatibleFrom', []), 'source_version_not_compatible')

class GitHub:
    def __init__(self, cfg):
        self.cfg = cfg
    def request(self, endpoint, payload=None):
        require(endpoint.startswith('/') and '..' not in endpoint, 'invalid_api_endpoint')
        headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'token-monitor-nas-pull', 'X-GitHub-Api-Version': '2022-11-28'}
        if payload is not None:
            headers['Authorization'] = 'Bearer ' + check_private(self.cfg['statusTokenFile']).read_text().strip()
        request = urllib.request.Request('https://api.github.com/repos/' + REPO + endpoint,
            data=None if payload is None else json.dumps(payload).encode(), headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=30) as result:
                return json.load(result)
        except Exception:
            raise Refused('github_request_failed') from None
    def discover(self):
        deployments = self.request('/deployments?environment=production-' + self.cfg['target'] + '&per_page=10')
        if not deployments:
            return None
        deployment = max(deployments, key=lambda x: x['id'])
        statuses = self.request('/deployments/' + str(deployment['id']) + '/statuses?per_page=1')
        if not statuses or statuses[0]['state'] != 'queued':
            return None
        require(deployment.get('task') == 'nas-pull', 'unexpected_deployment_task')
        require(deployment.get('creator', {}).get('login') == 'github-actions[bot]', 'untrusted_deployment_creator')
        req = deployment['payload']
        if isinstance(req, str):
            req = json.loads(req)
        req = dict(req, deploymentId=deployment['id'])
        validate_request(req, self.cfg)
        require(deployment.get('sha') == req['sourceCommit'], 'deployment_sha_mismatch')
        run = self.request('/actions/runs/' + str(req['workflowRunId']))
        require(run.get('conclusion') == 'success' and run.get('status') == 'completed' and run.get('event') == 'workflow_dispatch'
            and run.get('head_branch') == 'main' and run.get('path') == '.github/workflows/approve-deployment.yml'
            and run.get('repository', {}).get('full_name') == REPO, 'approval_workflow_not_successful')
        manifest = self.publication(req)
        require(manifest == req['manifest'], 'publication_manifest_mismatch')
        ref = self.request('/git/ref/tags/' + req['version'])['object']
        for _ in range(4):
            if ref.get('type') != 'tag':
                break
            require(bool(SHA.fullmatch(ref.get('sha', ''))), 'invalid_tag_object')
            ref = self.request('/git/tags/' + ref['sha'])['object']
        require(ref.get('type') == 'commit' and ref.get('sha') == req['sourceCommit'], 'publication_tag_sha_mismatch')
        source_policy = self.repository_file(req['sourceCommit'], 'deployment/release-policy.json', json_value=True)
        require(source_policy.get('schemaVersion') == 1 and source_policy.get('version') == req['version']
            and source_policy.get('migration') == manifest.get('migration')
            and source_policy.get('compatibleFrom') == manifest.get('compatibleFrom'), 'publication_source_policy_mismatch')
        require(self.repository_file(req['sourceCommit'], 'nas-version.txt').strip() == req['version'], 'publication_source_version_mismatch')
        return req
    def repository_file(self, commit, path, json_value=False):
        require(bool(SHA.fullmatch(commit or '')), 'invalid_publication_commit')
        result = self.request('/contents/' + path + '?ref=' + commit)
        require(isinstance(result, dict) and result.get('type') == 'file'
            and result.get('encoding') == 'base64' and isinstance(result.get('content'), str), 'publication_file_unavailable')
        try:
            raw = base64.b64decode(''.join(result['content'].split()), validate=True)
            value = raw.decode('utf-8')
            return json.loads(value) if json_value else value
        except Exception:
            raise Refused('publication_file_invalid') from None
    def publication(self, req):
        commit, branch = req.get('publicationCommit'), req.get('publicationBranch')
        if commit is None and branch is None:
            # Only the six existing releases may use the repository migration
            # records. New versions must carry a verified publication receipt.
            require(req['version'] in LEGACY_VERSIONS, 'publication_receipt_required')
            branch = 'main'
            head = self.request('/git/ref/heads/main')
            require(head.get('object', {}).get('type') == 'commit', 'invalid_publication_branch')
            commit = head['object']['sha']
        else:
            require(bool(SHA.fullmatch(commit or '')) and branch in [PUBLICATION_BRANCH, 'main'], 'invalid_publication_receipt')
            require(branch == PUBLICATION_BRANCH or req['version'] in LEGACY_VERSIONS, 'invalid_publication_branch')
            head = self.request('/git/ref/heads/' + branch)
            require(head.get('object', {}).get('type') == 'commit' and bool(SHA.fullmatch(head['object'].get('sha', ''))), 'invalid_publication_branch')
            ancestry = self.request('/compare/' + commit + '...' + head['object']['sha'])
            require(ancestry.get('status') in ['identical', 'ahead'], 'publication_receipt_not_in_history')
        folder = 'publications/' + req['version'] + '/'
        manifest = self.repository_file(commit, folder + 'manifest.json', json_value=True)
        require(isinstance(manifest, dict), 'publication_file_invalid')
        # Guidance is part of a complete publication, never executable input.
        for name in ['UPGRADE.md', 'ROLLBACK.md']:
            guidance = self.repository_file(commit, folder + name)
            require(req['version'] in guidance and req['sourceCommit'] in guidance
                and req['imageDigest'] in guidance, 'publication_guidance_mismatch')
        return manifest
    def report(self, deployment_id, state, code):
        posted = self.request('/deployments/' + str(deployment_id) + '/statuses', {
            'state': state, 'description': 'NAS controlled deployment: ' + code,
            'auto_inactive': False, 'environment': 'production-' + self.cfg['target']})
        statuses = self.request('/deployments/' + str(deployment_id) + '/statuses?per_page=1')
        require(bool(statuses) and statuses[0].get('id') == posted.get('id') and statuses[0].get('state') == state, 'github_status_readback_failed')

def run(args, timeout=60):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=True)
        return result.stdout
    except (subprocess.SubprocessError, OSError):
        raise Refused('local_command_failed') from None

class RealDocker:
    def __init__(self, cfg):
        self.cfg = cfg
        self.base = ['docker', 'compose', '--project-directory', cfg['projectRoot'], '-f', cfg['composeFile']]
        self.ids = {}
        self.original = None
        self.override = Path(cfg['controlDir']) / 'image-override.json'
        self.images = {}
    def compose(self, *args):
        return run(self.base + list(args), 180)
    def inspect(self, service):
        container = self.compose('ps', '-aq', service).strip()
        require(bool(container) and '\n' not in container, 'service_container_missing')
        value = json.loads(run(['docker', 'inspect', container]))[0]
        self.ids[service] = container
        return value
    def image(self, image):
        return json.loads(run(['docker', 'image', 'inspect', image]))[0]
    def preflight(self, req):
        config = json.loads(self.compose('config', '--format', 'json'))
        expected = {self.cfg['agentService']} | ({self.cfg['hubService']} if self.cfg.get('hubService') else set())
        require(set(config['services']) == expected, 'unknown_compose_services')
        self.original = config
        self.compose_hash = file_hash(self.cfg['composeFile'])
        self.env_hash = file_hash(Path(self.cfg['projectRoot']) / '.env')
        result = {}
        for service in sorted(expected):
            spec = config['services'][service]
            require(not spec.get('build') and not spec.get('extends'), 'compose_build_or_extends')
            require('TOKEN_MONITOR_NAS_VERSION' not in spec.get('environment', {}), 'runtime_version_override_requires_removal')
            info = self.inspect(service)
            files = info['Config'].get('Labels', {}).get('com.docker.compose.project.config_files', '').split(',')
            require(bool(files) and set(files) <= {self.cfg['composeFile'], str(self.override)} and self.cfg['composeFile'] in files, 'unexpected_compose_files')
            require(info['State'].get('Health', {}).get('Status') == 'healthy' and info['State']['Running'], 'baseline_unhealthy')
            env = dict(x.split('=', 1) for x in info['Config']['Env'] if '=' in x)
            require(env.get('TOKEN_MONITOR_NAS_VERSION') == req['fromVersion'], 'live_from_version_mismatch')
            old = self.image(info['Image'])
            require(old['Config'].get('Labels', {}).get('org.opencontainers.image.version') == req['fromVersion'], 'old_image_version_mismatch')
            require(any(d.startswith(IMAGE + '@sha256:') for d in old.get('RepoDigests', [])), 'old_image_digest_missing')
            require(canonical(sorted([{k: m[k] for k in ['Type', 'Source', 'Destination', 'RW']} for m in info['Mounts'] if m['Type'] == 'bind'], key=lambda x: x['Destination'])) == canonical(sorted(self._expected_mounts(spec), key=lambda x: x['Destination'])), 'actual_mounts_differ_from_compose')
            result[service] = {'imageId': info['Image'], 'repoDigests': old['RepoDigests'], 'sourceCommit': old['Config'].get('Labels', {}).get('org.opencontainers.image.revision')}
            if service == self.cfg['agentService']:
                require(env.get('TOKEN_MONITOR_DEVICE_ID') == self.cfg['deviceId'] and env.get('TOKEN_MONITOR_CLIENTS') == 'hermes' and env.get('TOKEN_MONITOR_WATCH_IN_PROCESS') == '0', 'agent_identity_or_scope')
                binds = {m['Destination']: m for m in info['Mounts'] if m['Type'] == 'bind'}
                require(binds.get('/config', {}).get('Source') == self.cfg['stateDir'] and binds.get('/hermes', {}).get('Source') == self.cfg['hermesDir'] and not binds['/hermes']['RW'], 'agent_mounts_changed')
            else:
                require(any(m['Type'] == 'bind' and m['Source'] == self.cfg['hubDataDir'] and m['Destination'] == '/data' for m in info['Mounts']), 'hub_mount_changed')
        for service, baseline in result.items():
            tag = 'token-monitor-nas-rollback:deployment-' + str(req['deploymentId']) + '-' + service
            try:
                existing = self.image(tag)
            except Refused:
                existing = None
            require(existing is None or existing['Id'] == baseline['imageId'], 'rollback_tag_conflict')
            if existing is None:
                run(['docker', 'tag', baseline['imageId'], tag])
            baseline['retainedLocalTag'] = tag
        return result
    def _expected_mounts(self, spec):
        # Compare only invariant bind mounts; Docker adds tmpfs fields which are
        # already protected by semantic effective-Compose verification below.
        actual = []
        for mount in spec.get('volumes', []):
            require(mount['type'] == 'bind', 'named_volume_not_supported')
            no_links(mount['source'])
            actual.append({'Type': 'bind', 'Source': mount['source'], 'Destination': mount['target'], 'RW': not mount.get('read_only', False)})
        return actual
    def pull(self, req):
        ref = IMAGE + '@' + req['imageDigest']
        run(['docker', 'pull', ref], 600)
        info = self.image(ref)
        labels = info['Config'].get('Labels', {})
        require(labels.get('org.opencontainers.image.version') == req['version'] and labels.get('org.opencontainers.image.revision') == req['sourceCommit'], 'target_image_identity_mismatch')
        require(ref in info.get('RepoDigests', []), 'target_digest_mismatch')
        arch = run(['docker', 'info', '--format', '{{.Architecture}}']).strip()
        arch = {'x86_64': 'amd64', 'aarch64': 'arm64'}.get(arch, arch)
        require(info['Architecture'] == arch and info['Os'] == 'linux', 'target_architecture_mismatch')
        return ref
    def stop(self):
        self.compose('stop', *self.original['services'])
        require(all(not self.inspect(s)['State']['Running'] for s in self.original['services']), 'services_not_stopped')
    def start(self, service, image_ref):
        require(file_hash(self.cfg['composeFile']) == self.compose_hash and file_hash(Path(self.cfg['projectRoot']) / '.env') == self.env_hash, 'local_config_changed')
        self.images[service] = image_ref
        private_json(self.override, {'services': {s: {'image': image} for s, image in self.images.items()}})
        merged = json.loads(run(self.base + ['-f', str(self.override), 'config', '--format', 'json']))
        expected = json.loads(json.dumps(self.original))
        for s, image in self.images.items():
            expected['services'][s]['image'] = image
        require(canonical(merged) == canonical(expected), 'override_changes_more_than_images')
        run(self.base + ['-f', str(self.override), 'up', '-d', '--no-deps', '--force-recreate', service], 180)
    def wait_health(self, service):
        until = time.monotonic() + self.cfg.get('healthTimeoutSeconds', 420)
        while time.monotonic() < until:
            info = self.inspect(service)
            state = info['State']
            if state.get('Health', {}).get('Status') == 'healthy':
                env = dict(x.split('=', 1) for x in info['Config']['Env'] if '=' in x)
                labels = self.image(info['Image'])['Config'].get('Labels', {})
                require(env.get('TOKEN_MONITOR_NAS_VERSION') == labels.get('org.opencontainers.image.version'), 'runtime_image_version_mismatch')
                return
            require(state['Running'], 'target_container_stopped')
            time.sleep(3)
        raise Refused('health_timeout')
    def verify_target(self, record):
        config = json.loads(self.compose('config', '--format', 'json'))
        expected = {self.cfg['agentService']} | ({self.cfg['hubService']} if self.cfg.get('hubService') else set())
        require(set(config['services']) == expected, 'unknown_compose_services')
        for service in expected:
            info = self.inspect(service)
            require(info['State']['Running'] and info['State'].get('Health', {}).get('Status') == 'healthy', 'report_retry_runtime_unhealthy')
            image = self.image(info['Image'])
            labels = image['Config'].get('Labels', {})
            env = dict(x.split('=', 1) for x in info['Config']['Env'] if '=' in x)
            require(labels.get('org.opencontainers.image.version') == record['version'] and labels.get('org.opencontainers.image.revision') == record['sourceCommit'] and env.get('TOKEN_MONITOR_NAS_VERSION') == record['version'], 'report_retry_runtime_identity_changed')
            require(IMAGE + '@' + record['imageDigest'] in image.get('RepoDigests', []), 'report_retry_runtime_digest_changed')
            actual = [{k: mount[k] for k in ['Type', 'Source', 'Destination', 'RW']} for mount in info['Mounts'] if mount['Type'] == 'bind']
            require(canonical(sorted(actual, key=lambda x: x['Destination'])) == canonical(sorted(self._expected_mounts(config['services'][service]), key=lambda x: x['Destination'])), 'report_retry_runtime_mounts_changed')
            if service == self.cfg['agentService']:
                require(env.get('TOKEN_MONITOR_DEVICE_ID') == self.cfg['deviceId'] and env.get('TOKEN_MONITOR_CLIENTS') == 'hermes' and env.get('TOKEN_MONITOR_WATCH_IN_PROCESS') == '0', 'report_retry_agent_scope_changed')
        return {'runtimeIdentity': 'verified', 'targetDigest': 'verified', 'healthy': True}
    def verify_state(self, snapshot):
        return verify_state(self.cfg, snapshot)
    def verify_hub(self):
        script = Path(__file__).with_name('verify-state.js').read_text()
        info = self.inspect(self.cfg['hubService'])
        try:
            probe = json.loads(run(['docker', 'exec', info['Id'], 'node', '-e', script, 'hub'], 30))
        except (ValueError, Refused):
            raise Refused('hub_protocol_probe_failed') from None
        require(probe.get('authenticatedApi') and probe.get('sseReconnect') and (not probe.get('windowsEnabled') or probe.get('gzipSse')), 'hub_protocol_probe_failed')
        return probe
    def verify_agent(self, started_ms):
        script = Path(__file__).with_name('verify-state.js').read_text()
        until = time.monotonic() + self.cfg.get('healthTimeoutSeconds', 420)
        while time.monotonic() < until:
            info = self.inspect(self.cfg['agentService'])
            try:
                probe = json.loads(run(['docker', 'exec', info['Id'], 'node', '-e', script], 30))
            except (ValueError, Refused):
                probe = {}
            if probe.get('collection') == 'ok' and probe.get('upload') == 'ok' and probe.get('startedAt', 0) >= started_ms and probe.get('independentWatcher') and probe.get('devicePresent') and probe.get('receivedAt', 0) >= started_ms:
                return {'collection': 'ok', 'upload': 'ok', 'independentWatcher': True, 'devicePresent': True}
            time.sleep(3)
        raise Refused('agent_business_probe_failed')
    def frozen_compare(self, snapshot, old_image, target_ref):
        frozen = snapshot / 'frozen-hermes'
        frozen.mkdir(mode=0o700)
        hermes = Path(self.cfg['hermesDir'])
        sources = [hermes / 'state.db'] + sorted(hermes.glob('profiles/*/state.db'))
        for database in sources:
            no_links(database)
            destination = frozen / database.relative_to(hermes)
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with sqlite3.connect('file:' + str(database) + '?mode=ro', uri=True) as source:
                with sqlite3.connect(str(destination)) as dest:
                    source.backup(dest)
                    require(dest.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'frozen_hermes_integrity_failed')
        outputs = []
        for name, image in [('old', old_image), ('candidate', target_ref)]:
            directory = snapshot / (name + '-dry-state')
            shutil.copytree(snapshot / 'state', directory)
            args = ['docker', 'run', '--rm', '--init', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--cap-add', 'DAC_READ_SEARCH', '--user', '0', '--memory', '512m', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '-v', str(directory) + ':/config', '-v', str(frozen) + ':/hermes:ro']
            for value in ['HOME=/config', 'XDG_CONFIG_HOME=/config', 'HERMES_HOME=/hermes', 'TOKEN_MONITOR_CLIENTS=hermes', 'TOKEN_MONITOR_LIMITS_ENABLED=0', 'TOKEN_MONITOR_PROJECTS_ENABLED=0', 'TOKEN_MONITOR_HISTORY_ENABLED=1', 'TOKEN_MONITOR_SESSION_USAGE_ARCHIVE_ENABLED=1', 'TOKSCALE_PRICING_CACHE_ONLY=1', 'TZ=Asia/Shanghai']:
                args += ['-e', value]
            args += [image, 'node', 'src/agent/agent.js', '--once', '--dry-run', '--device', self.cfg['deviceId'], '--clients', 'hermes', '--watch', '0', '--wslScan', '0', '--timeoutMs', '120000']
            raw = run(args, 180)
            start = raw.find('{')
            require(start >= 0, 'dry_run_output_missing')
            try:
                value = json.loads(raw[start:])
            except ValueError:
                raise Refused('dry_run_output_invalid') from None
            outputs.append(frozen_accounting(value))
        # Private evidence for an independently reviewed manual acceptance.
        # Persisting the pair never authorizes a mismatch or changes any guard.
        private_json(snapshot / 'frozen-accounting.json', {'before': outputs[0], 'after': outputs[1]})
        require(outputs[0] == outputs[1], 'frozen_accounting_mismatch')
        return {'frozenAccounting': 'exact-match'}

def frozen_accounting(record):
    # Container hostname, startup metadata and optional live fields legitimately
    # differ. Compare accounting identities/maps, every session and daily history.
    result = {'deviceId': record.get('deviceId'), 'periodWindows': record.get('periodWindows')}
    counters = ['totalTokens', 'costUsd', 'inputTokens', 'outputTokens',
                'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'messageCount']
    maps = ['clients', 'models', 'clientOutputs', 'modelCosts']
    for name in ['today', 'month', 'allTime']:
        period = record.get(name, {})
        result[name] = {key: period.get(key) for key in counters + maps}
        result[name]['sessions'] = {key: {field: value.get(field)
            for field in counters + ['client', 'sessionId', 'models', 'modelCosts', 'startedAt', 'createdAt', 'date', 'day', 'month']}
            for key, value in period.get('sessions', {}).items()}
    result['history'] = accounting(record.get('history'))
    return result

def accounting(value):
    """Accounting fields only: ignore timestamps, versions and activity metadata."""
    if isinstance(value, list):
        return [accounting(x) for x in value]
    if isinstance(value, dict):
        skip = {'version', 'agentVersion', 'generatedAt', 'updatedAt', 'collectedAt', 'timestamp', 'capturedAt', 'lastUsedAt', 'active', 'activity', 'sessionTitle', 'title', 'nasVersion'}
        return {k: accounting(v) for k, v in value.items() if k not in skip}
    return value

def copy_file(source, destination):
    shutil.copy2(source, destination)
    info = Path(source).stat()
    os.chown(destination, info.st_uid, info.st_gid)
    return str(destination)

def copy_tree(source, destination):
    shutil.copytree(source, destination, copy_function=copy_file)
    source, destination = Path(source), Path(destination)
    for original in [source] + [p for p in source.rglob('*') if p.is_dir()]:
        info = original.stat()
        os.chown(destination / original.relative_to(source), info.st_uid, info.st_gid)

def sqlite_rows(path):
    with sqlite3.connect('file:' + str(path) + '?mode=ro', uri=True) as database:
        require(database.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'sqlite_integrity_failed')
        return {key: json.loads(value) for key, value in database.execute('SELECT session_key, entry_json FROM sessions')}

def sqlite_keys(path):
    return set(sqlite_rows(path))

def local_window(period, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    local = now.astimezone(dt.timezone(dt.timedelta(hours=8)))
    return local.strftime('%Y-%m-%d' if period == 'today' else '%Y-%m')

def window_key(record, period, archive=False):
    window = record.get('periodWindows', {}).get(period, {})
    value = window.get('day' if period == 'today' else 'month') if archive else window.get('key')
    if archive:
        value = value or record.get('day' if period == 'today' else 'month')
    if isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}' if period == 'today' else r'\d{4}-\d{2}', value):
        try:
            dt.date.fromisoformat(value if period == 'today' else value + '-01')
            return value
        except ValueError:
            return None
    if not archive:
        for field in ['updatedAt', 'collectedAt', 'receivedAt']:
            try:
                timestamp = dt.datetime.fromisoformat(record.get(field, '').replace('Z', '+00:00'))
                if timestamp.tzinfo:
                    return local_window(period, timestamp)
            except (ValueError, TypeError, AttributeError):
                pass
    return None

def expired_window(old, new, period, archive=False, now=None):
    previous = window_key(old, period, archive)
    current = window_key(new, period, archive)
    today = local_window(period, now)
    return bool(previous and previous < today and (current == today or (archive and period not in new.get('periods', {}))))

def archive_preserved(old, new, now=None):
    if 'periods' not in old:
        return preserved(accounting(old), accounting(new))
    if old.get('client') != new.get('client') or old.get('sessionId') != new.get('sessionId'):
        return False
    before, after = old.get('periods', {}), new.get('periods', {})
    if 'allTime' in before and not preserved(accounting(before['allTime']), accounting(after.get('allTime'))):
        return False
    for period in ['today', 'month']:
        if period not in before:
            continue
        if expired_window(old, new, period, archive=True, now=now):
            # Window expiry cannot stand in for loss of the lifetime session.
            if 'allTime' not in before or 'allTime' not in after:
                return False
            continue
        old_key, new_key = window_key(old, period, True), window_key(new, period, True)
        if old_key != new_key or not preserved(accounting(before[period]), accounting(after.get(period))):
            return False
    return True

def history_preserved(old, new, path=()):
    """Retain dated history and counters, allowing only bounded USD roundoff.

    This is deliberately separate from archive/frozen accounting comparisons.
    Row ordering and live additions do not change a day/month's identity.
    """
    if isinstance(old, dict):
        if not isinstance(new, dict):
            return False
        for key, value in old.items():
            if key in ['updatedAt', 'savedAt', 'generatedAt', 'pricingRevision']:
                continue
            if key not in new:
                return False
            current = new[key]
            # These presentation values are derived from retained counters.
            if path == ('summary',) and key == 'favoriteModel':
                if not isinstance(value, str) or not isinstance(current, str):
                    return False
                continue
            if (path == ('summary',) and key == 'currentStreak') or (
                    len(path) == 2 and path[0] in ['daily', 'monthly'] and key in ['intensity', 'tokenIntensity', 'costIntensity']):
                if any(type(x) is not int or x < 0 for x in [value, current]):
                    return False
                if key in ['intensity', 'tokenIntensity', 'costIntensity'] and max(value, current) > 4:
                    return False
                continue
            if not history_preserved(value, current, path + (key,)):
                return False
        return True
    if isinstance(old, list):
        if path not in [('daily',), ('monthly',)]:
            return preserved(old, new)
        field = 'date' if path == ('daily',) else 'month'

        def indexed(rows):
            if not isinstance(rows, list):
                return None
            result = {}
            for row in rows:
                key = row.get(field) if isinstance(row, dict) else None
                pattern = r'\d{4}-\d{2}-\d{2}' if field == 'date' else r'\d{4}-\d{2}'
                if not isinstance(key, str) or not re.fullmatch(pattern, key) or key in result:
                    return None
                try:
                    dt.date.fromisoformat(key if field == 'date' else key + '-01')
                except ValueError:
                    return None
                if not history_preserved(row, row, path + (key,)):
                    return None
                result[key] = row
            return result

        before, after = indexed(old), indexed(new)
        return (before is not None and after is not None and set(before) <= set(after)
                and all(history_preserved(row, after[key], path + (key,)) for key, row in before.items()))
    if isinstance(old, bool) or isinstance(new, bool):
        return type(old) is bool and type(new) is bool and old == new
    if isinstance(old, (int, float)) or isinstance(new, (int, float)):
        if any(not isinstance(x, (int, float)) or x < 0
               or (isinstance(x, float) and not math.isfinite(x)) for x in [old, new]):
            return False
        if new >= old:
            return True
        if not path or path[-1] not in ['cost', 'costUsd', 'totalCost'] or new <= 0:
            return False
        # A relative epsilon alone could hide real losses on large amounts.
        # Both an 8-ULP budget and an absolute USD 1e-12 ceiling must hold.
        try:
            return old - new <= min(1e-12, 8 * max(math.ulp(old), math.ulp(new)))
        except OverflowError:
            return False
    return old == new


def verify_state(cfg, snapshot):
    old_archives = list((snapshot / 'state').rglob('session-usage-archive.sqlite'))
    require(len(old_archives) == 1, 'archive_missing_or_ambiguous')
    old = old_archives[0]
    new = Path(cfg['stateDir']) / old.relative_to(snapshot / 'state')
    previous_rows, current_rows = sqlite_rows(old), sqlite_rows(new)
    require(set(previous_rows) <= set(current_rows), 'archive_sessions_lost')
    require(all(archive_preserved(value, current_rows[key]) for key, value in previous_rows.items()), 'archive_accounting_regressed')
    for file in (snapshot / 'state').rglob('*daily-history*.json'):
        before = json.loads(file.read_text())
        after = json.loads((Path(cfg['stateDir']) / file.relative_to(snapshot / 'state')).read_text())
        require(preserved(before, after), 'agent_history_lost')
    if cfg.get('hubDataDir'):
        before = json.loads((snapshot / 'hub-data' / 'devices.json').read_text())
        after = json.loads((Path(cfg['hubDataDir']) / 'devices.json').read_text())
        for key in ['syncSettings', 'subscriptions']:
            require(before.get(key) == after.get(key), 'hub_policy_changed')
        previous_policies, current_policies = before.get('syncTitlePolicies', {}), after.get('syncTitlePolicies', {})
        require(set(previous_policies) <= set(current_policies), 'hub_title_policy_lost')
        for device, policy in previous_policies.items():
            current = current_policies[device]
            require(isinstance(policy, dict) and isinstance(current, dict) and isinstance(policy.get('enabled'), bool) and current.get('enabled') is policy['enabled'], 'hub_title_consent_changed')
            generations = [policy.get('generation'), current.get('generation')]
            require(all(isinstance(g, int) and not isinstance(g, bool) and 0 <= g <= 9007199254740991 for g in generations) and generations[1] >= generations[0], 'hub_title_generation_regressed')
        require(set(before['devices']) <= set(after['devices']), 'hub_devices_lost')
        for device, record in before['devices'].items():
            for period in ['today', 'month', 'allTime']:
                previous = record.get('periods', {}).get(period, record.get(period, {}))
                next_record = after['devices'][device]
                current = next_record.get('periods', {}).get(period, next_record.get(period, {}))
                if period != 'allTime' and expired_window(record, next_record, period):
                    continue
                for counter in ['totalTokens', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens']:
                    if isinstance(previous.get(counter), (int, float)):
                        require(current.get(counter, -1) >= previous[counter], 'hub_accounting_regressed')
            require(history_preserved(record.get('history', {}), after['devices'][device].get('history', {})), 'hub_history_lost')
    return {'archive': 'integrity-ok-and-old-keys-retained', 'history': 'retained', 'hubPolicy': 'preserved'}

def preserved(old, new):
    if isinstance(old, dict):
        return isinstance(new, dict) and all(k in new and preserved(v, new[k]) for k, v in old.items() if k not in ['updatedAt', 'savedAt', 'generatedAt', 'pricingRevision'])
    if isinstance(old, list):
        return all(x in new for x in old) if isinstance(new, list) else False
    if isinstance(old, (int, float)) and not isinstance(old, bool):
        return isinstance(new, (int, float)) and new >= old
    return old == new

class Engine:
    def __init__(self, cfg, adapter, api):
        self.cfg, self.adapter, self.api = cfg, adapter, api
        self.control = Path(cfg['controlDir'])
        self.control.mkdir(mode=0o700, parents=True, exist_ok=True)
    def fingerprint(self):
        fields = {k: self.cfg.get(k) for k in ['target', 'projectRoot', 'composeFile', 'deviceId', 'agentService', 'hubService', 'stateDir', 'hubDataDir', 'hermesDir']}
        fields['composeHash'] = file_hash(self.cfg['composeFile'])
        fields['envHash'] = file_hash(Path(self.cfg['projectRoot']) / '.env')
        return canonical(fields)
    def receipt_value(self, req, old):
        # Retention tag names contain a deployment ID and are not image identity.
        identities = {service: {'imageId': value['imageId'], 'repoDigests': sorted(value['repoDigests']),
            'sourceCommit': value.get('sourceCommit')} for service, value in old.items()}
        return {'schemaVersion': 1, 'result': 'restore-verified', 'fromVersion': req['fromVersion'],
            'version': req['version'], 'sourceCommit': req['sourceCommit'], 'imageDigest': req['imageDigest'],
            'oldImages': identities, 'configFingerprint': self.fingerprint()}
    def receipt_valid(self, req, old):
        path = self.cfg.get('rollbackReceiptFile')
        if not path:
            return False
        try:
            value = json.loads(check_private(path).read_text())
        except (Refused, OSError, ValueError):
            return False
        return value == self.receipt_value(req, old)
    def snapshot(self, directory):
        directory.mkdir(mode=0o700)
        for name, source in [('state', self.cfg['stateDir']), ('hub-data', self.cfg.get('hubDataDir'))]:
            if source:
                no_links(source)
                copy_tree(source, directory / name)
        copy_file(self.cfg['composeFile'], directory / 'original-compose')
        copy_file(Path(self.cfg['projectRoot']) / '.env', directory / 'original-env')
        os.chmod(directory / 'original-env', 0o600)
        return directory
    def restore(self, snapshot, old):
        self.adapter.stop()
        suffix = str(time.time_ns())
        for name, destination in [('state', self.cfg['stateDir']), ('hub-data', self.cfg.get('hubDataDir'))]:
            if destination:
                target = Path(destination)
                os.rename(target, target.with_name(target.name + '.failed-' + suffix))
                copy_tree(snapshot / name, target)
        copy_file(snapshot / 'original-compose', self.cfg['composeFile'])
        copy_file(snapshot / 'original-env', Path(self.cfg['projectRoot']) / '.env')
        for service in [self.cfg.get('hubService'), self.cfg['agentService']]:
            if service:
                self.adapter.start(service, old[service]['imageId'])
                self.adapter.wait_health(service)
        self.adapter.verify_state(snapshot)
        self.adapter.verify_agent(0)
        for service, baseline in old.items():
            require(self.adapter.inspect(service)['Image'] == baseline['imageId'], 'restored_image_mismatch')
    def retry_report(self, deployment_id):
        require(isinstance(deployment_id, int) and deployment_id > 0, 'invalid_deployment_id')
        require(self.cfg.get('statusTokenFile'), 'status_credential_required')
        with open(self.control / 'controller.lock', 'a') as lock:
            os.chmod(self.control / 'controller.lock', 0o600)
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            journal = check_private(self.control / ('deployment-' + str(deployment_id) + '.json'))
            record = json.loads(journal.read_text())
            require(record.get('phase') == 'verified-report-pending' and record.get('deploymentId') == deployment_id and record.get('target') == self.cfg['target'], 'no_verified_pending_report')
            require(record.get('configFingerprint') == self.fingerprint(), 'report_retry_config_changed')
            require(VERSION.fullmatch(record.get('version', '')) and SHA.fullmatch(record.get('sourceCommit', '')) and DIGEST.fullmatch(record.get('imageDigest', '')), 'report_retry_identity_invalid')
            for other in self.control.glob('deployment-*.json'):
                if other != journal:
                    require(json.loads(other.read_text()).get('phase') in ['success', 'restored', 'preflight-refused'], 'interrupted_deployment_requires_manual_review')
            snapshot = no_links(self.control / ('snapshot-' + str(deployment_id)))
            evidence = {'runtime': self.adapter.verify_target(record), 'data': self.adapter.verify_state(snapshot)}
            if self.cfg.get('hubService'):
                evidence['hub'] = self.adapter.verify_hub()
            evidence['agent'] = self.adapter.verify_agent(record.get('agentStartedAtMs', 0))
            require(self.fingerprint() == record['configFingerprint'], 'report_retry_config_changed')
            record['stages'].append({'phase': 'report-retry-verified', 'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'result': evidence})
            private_json(journal, record)
            try:
                self.api.report(deployment_id, 'success', 'all-stages-verified-report-retry')
            except Exception:
                record['report'] = 'remote-report-failed'
                private_json(journal, record)
                raise Refused('remote_report_failed') from None
            record['phase'] = 'success'
            record['report'] = 'success-readback-verified'
            record['stages'].append({'phase': 'success', 'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'result': {}})
            private_json(journal, record)
            return record
    def deploy(self, req, rehearse=False):
        validate_request(req, self.cfg)
        require(not rehearse or (self.cfg.get('sandbox') is True and Path(self.cfg['projectRoot']).resolve().is_relative_to(Path('/tmp').resolve()) and self.cfg['agentService'].startswith('sandbox-') and (not self.cfg.get('hubService') or self.cfg['hubService'].startswith('sandbox-')) and Path(self.cfg['hermesDir']).resolve().is_relative_to(Path('/tmp').resolve())), 'rehearsal_requires_isolated_sandbox')
        require(self.cfg.get('statusTokenFile'), 'status_credential_required')
        with open(self.control / 'controller.lock', 'a') as lock:
            os.chmod(self.control / 'controller.lock', 0o600)
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            for path in self.control.glob('deployment-*.json'):
                previous = json.loads(path.read_text())
                require(previous.get('phase') in ['success', 'restored', 'preflight-refused'], 'interrupted_deployment_requires_manual_review')
            journal = self.control / ('deployment-' + str(req['deploymentId']) + '.json')
            require(not journal.exists(), 'deployment_already_recorded')
            record = {'schemaVersion': 1, 'deploymentId': req['deploymentId'], 'target': self.cfg['target'], 'version': req['version'], 'sourceCommit': req['sourceCommit'], 'imageDigest': req['imageDigest'], 'startedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'stages': []}
            def phase(name, evidence=None):
                record['phase'] = name
                record['stages'].append({'phase': name, 'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'result': evidence or {}})
                private_json(journal, record)
            stopped = False
            snapshot = None
            old = None
            automatic = False
            try:
                phase('preflight')
                self.api.report(req['deploymentId'], 'in_progress', 'preflight')
                old = self.adapter.preflight(req)
                automatic = self.receipt_valid(req, old) and req['manifest']['migration']['rollback'] == 'restore-snapshot'
                if req['manifest']['migration']['kind'] == 'state-format':
                    require(rehearse or automatic, 'migration_requires_verified_restore_plan')
                record['oldImages'] = old
                fingerprint = self.fingerprint()
                record['configFingerprint'] = fingerprint
                ref = self.adapter.pull(req)
                phase('stop-intent')
                stopped = True  # A partial stop is already a production mutation.
                self.adapter.stop()
                phase('snapshot-intent')
                snapshot = self.snapshot(self.control / ('snapshot-' + str(req['deploymentId'])))
                phase('snapshot-complete', self.adapter.verify_state(snapshot))
                phase('frozen-validation', self.adapter.frozen_compare(snapshot, old[self.cfg['agentService']]['imageId'], ref))
                hub = self.cfg.get('hubService')
                if hub:
                    phase('hub-start-intent')
                    self.adapter.start(hub, ref)
                    self.adapter.wait_health(hub)
                    phase('hub-verified', {'data': self.adapter.verify_state(snapshot), 'protocol': self.adapter.verify_hub()})
                started_ms = int(time.time() * 1000)
                record['agentStartedAtMs'] = started_ms
                phase('agent-start-intent')
                self.adapter.start(self.cfg['agentService'], ref)
                self.adapter.wait_health(self.cfg['agentService'])
                phase('agent-verified', self.adapter.verify_agent(started_ms))
                phase('data-verified', self.adapter.verify_state(snapshot))
                require(self.fingerprint() == fingerprint, 'config_changed_during_deployment')
                if rehearse:
                    phase('rehearsal-restore-intent')
                    self.restore(snapshot, old)
                    phase('restored')
                    private_json(self.control / 'rollback-rehearsal.json', self.receipt_value(req, old))
                    self.api.report(req['deploymentId'], 'failure', 'sandbox-rehearsal-restored')
                else:
                    # Persist before posting. A reporting/network failure cannot
                    # stop or roll back a completely verified running deployment.
                    phase('verified-report-pending')
                    self.api.report(req['deploymentId'], 'success', 'all-stages-verified')
                    phase('success')
                return record
            except Exception as error:
                if record.get('phase') == 'verified-report-pending':
                    record['report'] = 'remote-report-failed'
                    private_json(journal, record)
                    raise Refused('remote_report_failed') from None
                code = str(error) if isinstance(error, Refused) else 'internal_failure'
                code = code if re.fullmatch(r'[a-z0-9_-]+', code) else 'internal_failure'
                if stopped:
                    try:
                        self.adapter.stop()
                        phase('failed-stopped', {'code': code})
                        if automatic and snapshot and old:
                            phase('rollback-intent')
                            self.restore(snapshot, old)
                            phase('restored', {'code': code})
                    except Exception:
                        phase('rollback-failed-manual-review', {'code': code})
                else:
                    phase('preflight-refused', {'code': code})
                try:
                    self.api.report(req['deploymentId'], 'failure', code)
                except Exception:
                    record['report'] = 'remote-report-failed'
                    private_json(journal, record)
                raise Refused(code) from None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--retry-report', type=int, metavar='DEPLOYMENT_ID', help='Re-verify and retry only a pending final report; never mutate containers')
    parser.add_argument('--check', action='store_true', help='Check only local permission/path configuration; no Docker mutation')
    args = parser.parse_args()
    try:
        cfg = config_load(args.config)
        if args.check:
            print(json.dumps({'result': 'local-configuration-valid'}))
            return 0
        api = GitHub(cfg)
        if args.retry_report is not None:
            result = Engine(cfg, RealDocker(cfg), api).retry_report(args.retry_report)
            print(json.dumps({'result': result['phase'], 'deploymentId': args.retry_report}))
            return 0
        req = api.discover()
        if not req:
            print(json.dumps({'result': 'no-approved-deployment'}))
            return 0
        result = Engine(cfg, RealDocker(cfg), api).deploy(req)
        print(json.dumps({'result': result['phase'], 'deploymentId': req['deploymentId']}))
        return 0
    except Exception as error:
        code = str(error) if isinstance(error, Refused) else 'internal_failure'
        print(json.dumps({'result': 'refused', 'code': code if re.fullmatch(r'[a-z0-9_-]+', code) else 'internal_failure'}))
        return 1

if __name__ == '__main__':
    sys.exit(main())
