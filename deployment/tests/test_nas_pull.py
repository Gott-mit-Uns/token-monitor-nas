import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('nas_pull', Path(__file__).parents[1] / 'nas_pull.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)

class API:
    def __init__(self, fail_success=False):
        self.calls = []
        self.fail_success = fail_success
    def report(self, identity, state, code):
        self.calls.append((state, code))
        if state == 'success' and self.fail_success:
            raise RuntimeError('a sensitive token must never appear')

class Adapter:
    def __init__(self, cfg, fail=None):
        self.cfg, self.fail, self.calls = cfg, fail, []
    def preflight(self, req):
        self.calls.append('preflight')
        if self.fail == 'preflight':
            raise m.Refused('baseline_unhealthy')
        return {s: {'imageId': 'old-' + s, 'repoDigests': [m.IMAGE + '@sha256:' + 'a' * 64]} for s in [self.cfg['agentService'], self.cfg['hubService']] if s}
    def pull(self, req):
        self.calls.append('pull')
        return m.IMAGE + '@' + req['imageDigest']
    def stop(self):
        self.calls.append('stop')
    def start(self, service, image):
        self.calls.append(('start', service, image))
        if image.startswith(m.IMAGE):
            Path(self.cfg['stateDir'], 'new-marker').write_text('new state')
    def wait_health(self, service):
        self.calls.append(('health', service))
        if self.fail == service:
            self.fail = None
            raise m.Refused('health_timeout')
    def verify_target(self, record):
        self.calls.append('target-identity')
        if self.fail == 'runtime':
            raise m.Refused('report_retry_runtime_identity_changed')
        return {'runtimeIdentity': 'verified'}
    def verify_state(self, snapshot):
        self.calls.append('state')
        return m.verify_state(self.cfg, snapshot)
    def inspect(self, service):
        return {'Image': 'old-' + service}
    def verify_hub(self):
        self.calls.append('hub-protocol')
        return {'authenticatedApi': True, 'gzipSse': True, 'sseReconnect': True}
    def verify_agent(self, started):
        self.calls.append('agent-business')
        if self.fail == 'agent-business':
            raise m.Refused('agent_business_probe_failed')
        return {'collection': 'ok', 'upload': 'ok'}
    def frozen_compare(self, snapshot, old, new):
        self.calls.append('frozen')
        if self.fail == 'frozen':
            raise m.Refused('frozen_accounting_mismatch')
        return {'frozenAccounting': 'exact-match'}

class ControllerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='nas-pull-test-', dir='/tmp')
        root = Path(self.tmp.name).resolve()
        project = root / 'project'
        project.mkdir(mode=0o700)
        self.cfg = {'target': 'DXP4800', 'projectRoot': str(project), 'composeFile': str(project / 'compose.yaml'), 'deviceId': 'DXP4800', 'agentService': 'sandbox-agent', 'hubService': 'sandbox-hub', 'stateDir': str(project / 'state'), 'hubDataDir': str(project / 'hub'), 'hermesDir': str(root / 'hermes'), 'controlDir': str(root / 'control'), 'statusTokenFile': str(root / 'credential'), 'sandbox': True}
        for key in ['stateDir', 'hubDataDir', 'hermesDir', 'controlDir']:
            Path(self.cfg[key]).mkdir(mode=0o700)
        Path(self.cfg['composeFile']).write_text('services: {}\n')
        Path(project / '.env').write_text('PRIVATE_VALUE=never-print-this\n')
        Path(project / '.env').chmod(0o600)
        Path(self.cfg['statusTokenFile']).write_text('a-private-status-token')
        Path(self.cfg['statusTokenFile']).chmod(0o600)
        archive = Path(self.cfg['stateDir']) / 'session-usage-archive.sqlite'
        with sqlite3.connect(archive) as db:
            db.execute('CREATE TABLE sessions(session_key TEXT PRIMARY KEY, entry_json TEXT, revision INTEGER)')
            db.execute("INSERT INTO sessions VALUES('synthetic-session','{}',1)")
        Path(self.cfg['stateDir'], 'daily-history.json').write_text(json.dumps({'daily': {'2026-10-01': {'totalTokens': 500}}}))
        Path(self.cfg['hubDataDir'], 'devices.json').write_text(json.dumps({'version': 1, 'devices': {'DXP4800': {'history': {'daily': {'2026-10-01': {'totalTokens': 500}}}}}, 'syncSettings': {'x': 1}, 'syncTitlePolicies': {}, 'subscriptions': {}}))
        self.req = {'schemaVersion': 1, 'deploymentId': 1, 'target': 'DXP4800', 'fromVersion': 'v0.69.0-01', 'version': 'v0.69.0-02', 'sourceCommit': 'b' * 40, 'imageRepository': m.IMAGE, 'imageDigest': 'sha256:' + 'c' * 64, 'workflowRunId': 23, 'expiresAt': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=23)).isoformat()}
        self.req['manifest'] = {k: self.req[k] for k in ['schemaVersion', 'version', 'sourceCommit', 'imageRepository', 'imageDigest']}
        self.req['manifest'].update(platforms=[{'os': 'linux', 'architecture': a, 'digest': 'sha256:' + 'd' * 64} for a in ['amd64', 'arm64']], compatibleFrom=['v0.69.0-01'], migration={'kind': 'none', 'rollback': 'restore-snapshot', 'notes': 'No format change; full snapshot restore required.'})
    def tearDown(self):
        self.tmp.cleanup()
    def engine(self, fail=None, api=None):
        adapter = Adapter(self.cfg, fail)
        return m.Engine(self.cfg, adapter, api or API()), adapter
    def receipt(self, engine):
        receipt = Path(self.cfg['controlDir']) / 'receipt.json'
        m.private_json(receipt, engine.receipt_value(self.req, engine.adapter.preflight(self.req)))
        engine.adapter.calls.clear()
        self.cfg['rollbackReceiptFile'] = str(receipt)
    def test_success_orders_closed_backup_frozen_hub_agent(self):
        engine, adapter = self.engine()
        result = engine.deploy(self.req)
        self.assertEqual(result['phase'], 'success')
        self.assertLess(adapter.calls.index('stop'), adapter.calls.index('frozen'))
        starts = [x for x in adapter.calls if isinstance(x, tuple) and x[0] == 'start']
        self.assertEqual([x[1] for x in starts], ['sandbox-hub', 'sandbox-agent'])
        self.assertTrue((Path(self.cfg['controlDir']) / 'snapshot-1/original-env').exists())
        self.assertEqual(os.stat(Path(self.cfg['controlDir']) / 'deployment-1.json').st_mode & 0o777, 0o600)
        self.assertEqual(engine.api.calls[-1], ('success', 'all-stages-verified'))
    def test_hub_failure_stops_without_starting_agent_or_auto_rollback(self):
        engine, adapter = self.engine('sandbox-hub')
        with self.assertRaisesRegex(m.Refused, 'health_timeout'):
            engine.deploy(self.req)
        self.assertFalse(any(isinstance(x, tuple) and x[:2] == ('start', 'sandbox-agent') for x in adapter.calls))
        result = json.loads((Path(self.cfg['controlDir']) / 'deployment-1.json').read_text())
        self.assertEqual(result['phase'], 'failed-stopped')
        self.assertEqual(adapter.calls[-1], 'stop')
    def test_frozen_mismatch_prevents_both_stages(self):
        engine, adapter = self.engine('frozen')
        with self.assertRaises(m.Refused):
            engine.deploy(self.req)
        self.assertFalse(any(isinstance(x, tuple) and x[0] == 'start' for x in adapter.calls))
    def test_preflight_failure_does_not_stop_services(self):
        engine, adapter = self.engine('preflight')
        with self.assertRaises(m.Refused):
            engine.deploy(self.req)
        self.assertNotIn('stop', adapter.calls)
    def test_no_credential_no_mutation(self):
        self.cfg.pop('statusTokenFile')
        engine, adapter = self.engine()
        with self.assertRaisesRegex(m.Refused, 'status_credential_required'):
            engine.deploy(self.req)
        self.assertEqual(adapter.calls, [])
    def test_crash_journal_blocks_new_request(self):
        m.private_json(Path(self.cfg['controlDir']) / 'deployment-9.json', {'phase': 'hub-start-intent'})
        engine, adapter = self.engine()
        with self.assertRaisesRegex(m.Refused, 'interrupted_deployment'):
            engine.deploy(self.req)
        self.assertEqual(adapter.calls, [])
    def test_replay_never_redeploys(self):
        engine, adapter = self.engine()
        engine.deploy(self.req)
        count = len(adapter.calls)
        with self.assertRaisesRegex(m.Refused, 'already_recorded'):
            engine.deploy(self.req)
        self.assertEqual(len(adapter.calls), count)
    def test_migration_requires_receipt_before_stop(self):
        self.req['manifest']['migration']['kind'] = 'state-format'
        engine, adapter = self.engine()
        with self.assertRaisesRegex(m.Refused, 'migration_requires_verified_restore_plan'):
            engine.deploy(self.req)
        self.assertNotIn('stop', adapter.calls)
    def test_verified_rollback_restores_snapshot_and_preserves_failed_state(self):
        engine, adapter = self.engine('sandbox-hub')
        self.receipt(engine)
        with patch.object(m, 'check_private', lambda p, root=True: Path(p)):
            with self.assertRaises(m.Refused):
                engine.deploy(self.req)
        self.assertFalse(Path(self.cfg['stateDir'], 'new-marker').exists())
        failed = list(Path(self.cfg['stateDir']).parent.glob('state.failed-*'))
        self.assertEqual(len(failed), 1)
        self.assertTrue((failed[0] / 'new-marker').exists())
        result = json.loads((Path(self.cfg['controlDir']) / 'deployment-1.json').read_text())
        self.assertEqual(result['phase'], 'restored')
        restored = [x for x in adapter.calls if isinstance(x, tuple) and x[0] == 'start' and x[2].startswith('old-')]
        self.assertEqual([x[1] for x in restored], ['sandbox-hub', 'sandbox-agent'])
        self.assertEqual(engine.api.calls[-1][0], 'failure')
    def test_stale_receipt_never_auto_rolls_back(self):
        engine, adapter = self.engine('sandbox-hub')
        self.receipt(engine)
        Path(self.cfg['composeFile']).write_text('services: changed\n')
        with patch.object(m, 'check_private', lambda p, root=True: Path(p)):
            with self.assertRaises(m.Refused):
                engine.deploy(self.req)
        self.assertFalse(any(isinstance(x, tuple) and x[0] == 'start' and x[2].startswith('old-') for x in adapter.calls))
    def test_rehearsal_restores_and_generates_bound_receipt(self):
        engine, adapter = self.engine()
        result = engine.deploy(self.req, rehearse=True)
        self.assertEqual(result['phase'], 'restored')
        receipt = json.loads(Path(self.cfg['controlDir'], 'rollback-rehearsal.json').read_text())
        self.assertEqual(receipt['configFingerprint'], engine.fingerprint())
        self.assertFalse(Path(self.cfg['stateDir'], 'new-marker').exists())
    def test_rehearsal_rejects_production(self):
        self.cfg['sandbox'] = False
        engine, adapter = self.engine()
        with self.assertRaisesRegex(m.Refused, 'isolated_sandbox'):
            engine.deploy(self.req, rehearse=True)
        self.assertEqual(adapter.calls, [])
    def test_api_failure_never_reports_success_or_leaks_exception(self):
        engine, adapter = self.engine(api=API(fail_success=True))
        with self.assertRaisesRegex(m.Refused, '^remote_report_failed$'):
            engine.deploy(self.req)
        text = Path(self.cfg['controlDir'], 'deployment-1.json').read_text()
        for forbidden in ['sensitive token', 'never-print-this', 'a-private-status-token']:
            self.assertNotIn(forbidden, text)
        self.assertEqual(json.loads(text)['phase'], 'verified-report-pending')
        self.assertEqual(adapter.calls.count('stop'), 1)
    def pending_report(self):
        engine, adapter = self.engine(api=API(fail_success=True))
        with self.assertRaisesRegex(m.Refused, 'remote_report_failed'):
            engine.deploy(self.req)
        return engine, adapter
    def test_retry_report_reverifies_without_container_mutations(self):
        engine, adapter = self.pending_report()
        adapter.calls.clear()
        engine.api = API()
        with patch.object(m, 'check_private', lambda p, root=True: Path(p)):
            result = engine.retry_report(1)
        self.assertEqual(result['phase'], 'success')
        self.assertIn('target-identity', adapter.calls)
        self.assertIn('hub-protocol', adapter.calls)
        self.assertIn('agent-business', adapter.calls)
        self.assertNotIn('stop', adapter.calls)
        self.assertNotIn('pull', adapter.calls)
        self.assertFalse(any(isinstance(x, tuple) and x[0] == 'start' for x in adapter.calls))
        self.assertEqual(engine.api.calls[-1], ('success', 'all-stages-verified-report-retry'))
    def test_pending_report_blocks_next_deployment(self):
        engine, adapter = self.pending_report()
        request = dict(self.req, deploymentId=2)
        with self.assertRaisesRegex(m.Refused, 'interrupted_deployment'):
            engine.deploy(request)
    def test_retry_report_refuses_changed_config(self):
        engine, adapter = self.pending_report()
        adapter.calls.clear()
        Path(self.cfg['composeFile']).write_text('changed')
        with patch.object(m, 'check_private', lambda p, root=True: Path(p)):
            with self.assertRaisesRegex(m.Refused, 'report_retry_config_changed'):
                engine.retry_report(1)
        self.assertEqual(adapter.calls, [])
    def test_retry_report_refuses_changed_runtime(self):
        engine, adapter = self.pending_report()
        adapter.calls.clear()
        adapter.fail = 'runtime'
        with patch.object(m, 'check_private', lambda p, root=True: Path(p)):
            with self.assertRaisesRegex(m.Refused, 'report_retry_runtime_identity_changed'):
                engine.retry_report(1)
        self.assertEqual(adapter.calls, ['target-identity'])
    def test_retry_reporting_outage_leaves_verified_services_running(self):
        engine, adapter = self.pending_report()
        adapter.calls.clear()
        with patch.object(m, 'check_private', lambda p, root=True: Path(p)):
            with self.assertRaisesRegex(m.Refused, 'remote_report_failed'):
                engine.retry_report(1)
        self.assertNotIn('stop', adapter.calls)
        self.assertEqual(json.loads(Path(self.cfg['controlDir'], 'deployment-1.json').read_text())['phase'], 'verified-report-pending')
    def test_reporting_outage_does_not_use_even_valid_rollback_receipt(self):
        engine, adapter = self.engine(api=API(fail_success=True))
        self.receipt(engine)
        adapter.calls.clear()
        with patch.object(m, 'check_private', lambda p, root=True: Path(p)):
            with self.assertRaisesRegex(m.Refused, 'remote_report_failed'):
                engine.deploy(self.req)
        self.assertEqual(adapter.calls.count('stop'), 1)
        self.assertFalse(any(isinstance(x, tuple) and x[0] == 'start' and x[2].startswith('old-') for x in adapter.calls))
    def test_title_policy_generation_advance_preserves_consent(self):
        file = Path(self.cfg['hubDataDir'], 'devices.json')
        value = json.loads(file.read_text())
        value['syncTitlePolicies'] = {'DXP4800': {'enabled': False, 'generation': 1}}
        file.write_text(json.dumps(value))
        engine, adapter = self.engine()
        snapshot = engine.snapshot(Path(self.cfg['controlDir']) / 'manual-snapshot')
        value['syncTitlePolicies']['DXP4800']['generation'] = 2
        file.write_text(json.dumps(value))
        m.verify_state(self.cfg, snapshot)
        value['syncTitlePolicies']['DXP4800']['enabled'] = True
        file.write_text(json.dumps(value))
        with self.assertRaisesRegex(m.Refused, 'hub_title_consent_changed'):
            m.verify_state(self.cfg, snapshot)
    def test_title_policy_generation_decrease_refused(self):
        file = Path(self.cfg['hubDataDir'], 'devices.json')
        value = json.loads(file.read_text())
        value['syncTitlePolicies'] = {'DXP4800': {'enabled': False, 'generation': 2}}
        file.write_text(json.dumps(value))
        engine, adapter = self.engine()
        snapshot = engine.snapshot(Path(self.cfg['controlDir']) / 'manual-snapshot')
        value['syncTitlePolicies']['DXP4800']['generation'] = 1
        file.write_text(json.dumps(value))
        with self.assertRaisesRegex(m.Refused, 'hub_title_generation_regressed'):
            m.verify_state(self.cfg, snapshot)
    def test_github_status_requires_matching_readback(self):
        api = m.GitHub(self.cfg)
        with patch.object(api, 'request', side_effect=[{'id': 23, 'state': 'success'}, [{'id': 23, 'state': 'success'}]]):
            api.report(1, 'success', 'all-stages-verified')
        with patch.object(api, 'request', side_effect=[{'id': 23, 'state': 'success'}, [{'id': 24, 'state': 'failure'}]]):
            with self.assertRaisesRegex(m.Refused, 'github_status_readback_failed'):
                api.report(1, 'success', 'all-stages-verified')
    def test_state_detects_lost_archive_key(self):
        engine, adapter = self.engine()
        snapshot = engine.snapshot(Path(self.cfg['controlDir']) / 'manual-snapshot')
        with sqlite3.connect(Path(self.cfg['stateDir']) / 'session-usage-archive.sqlite') as db:
            db.execute('DELETE FROM sessions')
        with self.assertRaisesRegex(m.Refused, 'archive_sessions_lost'):
            m.verify_state(self.cfg, snapshot)
    def test_state_detects_archive_accounting_regression(self):
        archive = Path(self.cfg['stateDir']) / 'session-usage-archive.sqlite'
        with sqlite3.connect(archive) as db:
            db.execute("UPDATE sessions SET entry_json = '{\"totalTokens\":500}'")
        engine, adapter = self.engine()
        snapshot = engine.snapshot(Path(self.cfg['controlDir']) / 'manual-snapshot')
        with sqlite3.connect(archive) as db:
            db.execute("UPDATE sessions SET entry_json = '{\"totalTokens\":0}'")
        with self.assertRaisesRegex(m.Refused, 'archive_accounting_regressed'):
            m.verify_state(self.cfg, snapshot)
    def test_state_detects_history_and_privacy_loss(self):
        engine, adapter = self.engine()
        snapshot = engine.snapshot(Path(self.cfg['controlDir']) / 'manual-snapshot')
        Path(self.cfg['hubDataDir'], 'devices.json').write_text(json.dumps({'devices': {}, 'syncSettings': {'x': 1}, 'syncTitlePolicies': {}, 'subscriptions': {}}))
        with self.assertRaisesRegex(m.Refused, 'hub_devices_lost'):
            m.verify_state(self.cfg, snapshot)
    def test_expiry_digest_and_downgrade_rejected(self):
        for field, value in [('expiresAt', '2020-01-01T00:00:00Z'), ('imageDigest', 'latest'), ('version', 'v0.68.0-01')]:
            req = dict(self.req, **{field: value})
            with self.assertRaises(m.Refused):
                m.validate_request(req, self.cfg)
    def test_snapshot_symlink_rejected(self):
        Path(self.cfg['stateDir'], 'external-link').symlink_to('/etc/passwd')
        engine, adapter = self.engine()
        with self.assertRaisesRegex(m.Refused, 'state_contains_symlink'):
            engine.snapshot(Path(self.cfg['controlDir']) / 'manual-snapshot')



class FrozenAccountingTest(unittest.TestCase):
    def test_host_metadata_may_differ_but_accounting_and_sessions_may_not(self):
        import copy
        old = {'deviceId': 'synthetic', 'hostname': 'first', 'today': {'totalTokens': 125, 'sessions': {'hermes:x': {'client': 'hermes', 'sessionId': 'x', 'totalTokens': 125}}}, 'history': {'daily': {'2026-10-12': {'totalTokens': 125}}}}
        new = copy.deepcopy(old); new['hostname'] = 'second'; new['agentVersion'] = '0.69.0-02'
        self.assertEqual(m.frozen_accounting(old), m.frozen_accounting(new))
        new['today']['sessions']['hermes:x']['totalTokens'] = 0
        self.assertNotEqual(m.frozen_accounting(old), m.frozen_accounting(new))

    def test_stable_session_creation_and_period_date_cannot_change(self):
        import copy
        old = {'deviceId': 'synthetic', 'periodWindows': {'today': {'key': '2026-10-15', 'endsAt': '2026-10-15T16:00:00Z'}, 'timeZone': 'Asia/Shanghai'}, 'allTime': {'sessions': {'hermes:x': {'client': 'hermes', 'sessionId': 'x', 'startedAt': '2026-10-14T04:00:00Z', 'totalTokens': 125}}}}
        for mutate in [lambda v: v['allTime']['sessions']['hermes:x'].__setitem__('startedAt', '2026-10-15T04:00:00Z'), lambda v: v['periodWindows']['today'].__setitem__('key', '2026-10-14')]:
            new = copy.deepcopy(old); mutate(new)
            self.assertNotEqual(m.frozen_accounting(old), m.frozen_accounting(new))
        new = copy.deepcopy(old); new['allTime']['sessions']['hermes:x']['lastUsedAt'] = '2026-10-15T09:00:00Z'
        self.assertEqual(m.frozen_accounting(old), m.frozen_accounting(new))
        self.assertNotEqual(m.accounting({'startedAt': 'old'}), m.accounting({'startedAt': 'new'}))

class ArchiveWindowTest(unittest.TestCase):
    def entry(self, day=None, month=None):
        day = day or m.local_window('today')
        month = month or day[:7]
        return {'client': 'hermes', 'sessionId': 'synthetic', 'capturedAt': day + 'T00:00:00Z',
            'day': day, 'month': month, 'periodWindows': {
                'today': {'day': day, 'capturedAt': day + 'T00:00:00Z'},
                'month': {'month': month, 'capturedAt': day + 'T00:00:00Z'},
                'allTime': {'capturedAt': day + 'T00:00:00Z'}},
            'periods': {name: {'client': 'hermes', 'sessionId': 'synthetic', 'totalTokens': 100, 'models': {'synthetic': 100}}
                for name in ['today', 'month', 'allTime']}}
    def test_existing_session_growth_advances_capture_metadata(self):
        import copy
        old = self.entry(); new = copy.deepcopy(old)
        new['capturedAt'] = m.local_window('today') + 'T12:00:00Z'
        for period in new['periods']:
            new['periodWindows'][period]['capturedAt'] = new['capturedAt']
            new['periods'][period]['lastUsedAt'] = new['capturedAt']
            new['periods'][period]['totalTokens'] = 101
            new['periods'][period]['models']['synthetic'] = 101
        self.assertTrue(m.archive_preserved(old, new))
        new['periods']['allTime']['totalTokens'] = 99
        self.assertFalse(m.archive_preserved(old, new))
    def test_expired_day_prune_requires_lifetime_accounting(self):
        import copy
        yesterday = (dt.date.fromisoformat(m.local_window('today')) - dt.timedelta(days=1)).isoformat()
        old = self.entry(yesterday); new = copy.deepcopy(old)
        del new['periods']['today']; del new['periodWindows']['today']
        self.assertTrue(m.archive_preserved(old, new))
        new['periods']['allTime']['totalTokens'] = 99
        self.assertFalse(m.archive_preserved(old, new))
    def test_current_day_reset_is_not_expiry(self):
        import copy
        old = self.entry(); new = copy.deepcopy(old)
        new['periods']['today']['totalTokens'] = 0
        self.assertFalse(m.archive_preserved(old, new))
        del new['periods']['today']
        self.assertFalse(m.archive_preserved(old, new))
    def test_month_window_can_advance_only_to_actual_current_month(self):
        import copy
        first = dt.date.fromisoformat(m.local_window('month') + '-01')
        last_month = (first - dt.timedelta(days=1)).strftime('%Y-%m')
        old = self.entry(last_month + '-01', last_month); new = copy.deepcopy(old)
        new['day'] = m.local_window('today'); new['month'] = m.local_window('month')
        new['periodWindows']['today']['day'] = new['day']
        new['periodWindows']['month']['month'] = new['month']
        new['periods']['today']['totalTokens'] = 0
        new['periods']['month']['totalTokens'] = 0
        self.assertTrue(m.archive_preserved(old, new))
        new['periodWindows']['month']['month'] = '2099-01'
        self.assertFalse(m.archive_preserved(old, new))
    def test_pricing_revision_is_not_accounting_but_tokens_are(self):
        old = {'daily': {'2026-10-01': {'totalTokens': 100, 'pricingRevision': 'old'}},
            'liveDays': {'2026-10-01': {'observations': {'hermes': {'synthetic': {'totalTokens': 100, 'pricingRevision': 'old'}}}}}}
        import copy
        new = copy.deepcopy(old)
        new['daily']['2026-10-01']['pricingRevision'] = 'new'
        new['liveDays']['2026-10-01']['observations']['hermes']['synthetic']['pricingRevision'] = 'new'
        self.assertTrue(m.preserved(old, new))
        new['daily']['2026-10-01']['totalTokens'] = 99
        self.assertFalse(m.preserved(old, new))

class BoundReceiptTest(unittest.TestCase):
    setUp = ControllerTest.setUp
    tearDown = ControllerTest.tearDown
    engine = ControllerTest.engine
    receipt = ControllerTest.receipt
    def test_same_version_different_old_image_invalidates_receipt(self):
        engine, adapter = self.engine('sandbox-hub')
        self.receipt(engine)
        original = adapter.preflight
        def changed(req):
            values = original(req)
            values['sandbox-agent']['imageId'] = 'other-old-image'
            return values
        adapter.preflight = changed
        with patch.object(m, 'check_private', lambda p, root=True: Path(p)):
            with self.assertRaisesRegex(m.Refused, 'health_timeout'):
                engine.deploy(self.req)
        result = json.loads((Path(self.cfg['controlDir']) / 'deployment-1.json').read_text())
        self.assertEqual(result['phase'], 'failed-stopped')
        self.assertFalse(any(isinstance(x, tuple) and x[0] == 'start' and x[2].startswith('old-') for x in adapter.calls))
    def test_hub_day_rollover_retains_history_and_lifetime_accounting(self):
        import copy
        today = m.local_window('today')
        yesterday = (dt.date.fromisoformat(today) - dt.timedelta(days=1)).isoformat()
        record = {'periodWindows': {'today': {'key': yesterday}, 'month': {'key': today[:7]}},
            'periods': {'today': {'totalTokens': 100}, 'month': {'totalTokens': 200}, 'allTime': {'totalTokens': 300}},
            'history': {'daily': {yesterday: {'totalTokens': 100}}}}
        file = Path(self.cfg['hubDataDir'], 'devices.json')
        hub = json.loads(file.read_text()); hub['devices']['DXP4800'] = record; file.write_text(json.dumps(hub))
        engine, _ = self.engine(); snapshot = engine.snapshot(Path(self.cfg['controlDir']) / 'window-snapshot')
        after = copy.deepcopy(hub); current = after['devices']['DXP4800']
        current['periodWindows']['today']['key'] = today; current['periods']['today']['totalTokens'] = 0
        file.write_text(json.dumps(after)); m.verify_state(self.cfg, snapshot)
        current['periods']['allTime']['totalTokens'] = 299; file.write_text(json.dumps(after))
        with self.assertRaisesRegex(m.Refused, 'hub_accounting_regressed'):
            m.verify_state(self.cfg, snapshot)
        current['periods']['allTime']['totalTokens'] = 300; current['periodWindows']['today']['key'] = yesterday
        file.write_text(json.dumps(after))
        with self.assertRaisesRegex(m.Refused, 'hub_accounting_regressed'):
            m.verify_state(self.cfg, snapshot)
    def test_isolated_migration_rehearsal_can_bootstrap_receipt(self):
        self.req['manifest']['migration']['kind'] = 'state-format'
        engine, adapter = self.engine()
        result = engine.deploy(self.req, rehearse=True)
        self.assertEqual(result['phase'], 'restored')
        receipt = json.loads(Path(self.cfg['controlDir'], 'rollback-rehearsal.json').read_text())
        self.assertIn('sandbox-agent', receipt['oldImages'])
        self.assertEqual(receipt['sourceCommit'], self.req['sourceCommit'])

class RepositoryDiscoveryTest(unittest.TestCase):
    setUp = ControllerTest.setUp
    tearDown = ControllerTest.tearDown

    def github(self, legacy=False):
        import base64
        import copy
        req = copy.deepcopy(self.req)
        if not legacy:
            req['version'] = 'v0.73.0-01'
            req['manifest']['version'] = req['version']
            req.update(publicationCommit='f' * 40, publicationBranch='nas-publications')
        folder = 'publications/' + req['version'] + '/'
        def file(value):
            text = json.dumps(value) if not isinstance(value, str) else value
            return {'type': 'file', 'encoding': 'base64', 'content': base64.b64encode(text.encode()).decode()}
        commit = req.get('publicationCommit', 'e' * 40)
        documents = {
            folder + 'manifest.json': file(req['manifest']),
            'nas-version.txt': file(req['version']),
            'deployment/release-policy.json': file({'schemaVersion': 1, 'version': req['version'],
                'compatibleFrom': req['manifest']['compatibleFrom'], 'migration': req['manifest']['migration']})
        }
        replies = {
            '/deployments?environment=production-DXP4800&per_page=10': [{'id': 1, 'task': 'nas-pull', 'creator': {'login': 'github-actions[bot]'}, 'sha': req['sourceCommit'], 'payload': req}],
            '/deployments/1/statuses?per_page=1': [{'state': 'queued'}],
            '/actions/runs/23': {'conclusion': 'success', 'status': 'completed', 'event': 'workflow_dispatch', 'head_branch': 'main',
                'path': '.github/workflows/approve-deployment.yml', 'repository': {'full_name': m.REPO}},
            '/git/ref/heads/main': {'object': {'type': 'commit', 'sha': 'e' * 40}},
            '/git/ref/heads/nas-publications': {'object': {'type': 'commit', 'sha': 'e' * 40}},
            '/compare/' + 'f' * 40 + '...' + 'e' * 40: {'status': 'ahead'},
            '/git/ref/tags/' + req['version']: {'object': {'type': 'commit', 'sha': req['sourceCommit']}}
        }
        for name, value in documents.items():
            ref = req['sourceCommit'] if not name.startswith('publications/') else commit
            replies['/contents/' + name + '?ref=' + ref] = value
        class Fake(m.GitHub):
            def __init__(self):
                super().__init__({'target': 'DXP4800'})
                self.calls = []
            def request(self, endpoint, payload=None, allow_missing=False):
                self.calls.append(endpoint)
                if '/releases' in endpoint:
                    raise AssertionError('Release dependency must not remain')
                if payload is not None:
                    raise AssertionError('Discovery must not mutate anything')
                if endpoint not in replies:
                    raise m.Refused('synthetic_missing_repository_file')
                return replies[endpoint]
        return Fake(), req, replies

    def test_new_publication_discovery_uses_pinned_repository_commit(self):
        api, req, _ = self.github()
        self.assertEqual(api.discover(), req)
        self.assertTrue(any('/compare/' in c for c in api.calls))
        self.assertFalse(any('releases' in c for c in api.calls))
        self.assertTrue(any('?ref=' + 'f' * 40 in c for c in api.calls))

    def test_migrated_legacy_request_needs_no_release_api_or_new_receipt(self):
        api, req, _ = self.github(legacy=True)
        self.assertEqual(api.discover(), req)
        self.assertTrue(any('?ref=' + 'e' * 40 in c for c in api.calls))

    def test_new_version_without_repository_receipt_is_refused(self):
        api, req, _ = self.github()
        del req['publicationCommit']; del req['publicationBranch']
        with self.assertRaisesRegex(m.Refused, 'publication_receipt_required'):
            api.discover()

    def test_foreign_or_diverged_receipt_is_refused(self):
        for status in ['behind', 'diverged', 'unknown']:
            api, _, replies = self.github()
            key = next(k for k in replies if k.startswith('/compare/'))
            replies[key] = {'status': status}
            with self.assertRaisesRegex(m.Refused, 'not_in_history'):
                api.discover()
        api, req, _ = self.github()
        req['publicationBranch'] = 'main'
        with self.assertRaisesRegex(m.Refused, 'invalid_publication_branch'):
            api.discover()

    def test_missing_corrupt_or_symlink_record_is_refused(self):
        for change in ['missing', 'invalid_base64', 'symlink', 'bad_json']:
            api, _, replies = self.github()
            key = next(k for k in replies if 'publications/' in k and 'manifest.json' in k)
            if change == 'missing': del replies[key]
            elif change == 'invalid_base64': replies[key]['content'] = '!not-base64!'
            elif change == 'symlink': replies[key]['type'] = 'symlink'
            else: replies[key]['content'] = 'ew=='
            with self.assertRaises(m.Refused):
                api.discover()

    def test_moved_source_tag_and_conflicting_policy_are_refused(self):
        api, req, replies = self.github()
        replies['/git/ref/tags/' + req['version']]['object']['sha'] = 'd' * 40
        with self.assertRaisesRegex(m.Refused, 'tag_sha_mismatch'):
            api.discover()
        api, _, replies = self.github()
        key = next(k for k in replies if '/contents/deployment/release-policy.json' in k)
        replies[key]['content'] = 'e30='
        with self.assertRaisesRegex(m.Refused, 'source_policy_mismatch'):
            api.discover()

    def test_changed_or_missing_manifest_is_refused(self):
        import base64
        api, _, replies = self.github()
        key = next(k for k in replies if 'publications/' in k and 'manifest.json' in k)
        value = json.loads(base64.b64decode(replies[key]['content']))
        value['imageDigest'] = 'sha256:' + 'e' * 64
        replies[key]['content'] = base64.b64encode(json.dumps(value).encode()).decode()
        with self.assertRaisesRegex(m.Refused, 'publication_manifest_mismatch'):
            api.discover()
        api, _, replies = self.github()
        key = next(k for k in replies if 'publications/' in k and 'manifest.json' in k)
        del replies[key]
        with self.assertRaises(m.Refused):
            api.discover()

    def test_wrong_approval_workflow_remains_refused_before_record_reads(self):
        api, _, replies = self.github()
        replies['/actions/runs/23']['event'] = 'push'
        with self.assertRaisesRegex(m.Refused, 'approval_workflow_not_successful'):
            api.discover()
        self.assertFalse(any('/contents/' in c for c in api.calls))


if __name__ == '__main__':
    unittest.main()
