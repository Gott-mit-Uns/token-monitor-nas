#!/usr/bin/env python3
"""Synthetic Docker deployment/restore exercise. Never accepts production paths.

Registry publishing/approval are tested with injected APIs in Node tests. This
exercise uses real released baseline and a locally built candidate for Docker,
SQLite, Hub/Agent, SSE and whole-state restore. Only synthetic summary is exported.
"""
import argparse
import copy
import math
import datetime as dt
import json
import os
from pathlib import Path
import secrets
import sqlite3
import tempfile
import time
import nas_pull as m

BASELINES = {
    'v0.73.0-01': 'sha256:48edfc344a513cebd8ed59c44f4504a40222c4ba44554d32300e888710daad34',
    'v0.72.0-02': 'sha256:81413b1a4fcb30757f906bc732dcfbfe6883cb27683dffaaad98ea7ced9b8715',
    'v0.69.0-01': 'sha256:849ad058facfde01a7279efd88333f7461e3bffd3655f3d082913e957c30ed07',
    'v0.69.0-02': 'sha256:e35fa4c5f050b3944698a96a5ea48e7ee65b4e851ec49c5ddd1271dc02cca4b2',
    'v0.70.0-01': 'sha256:848d6c0b59c35be8e5d9f69d29d347404f2b2988964c8b4838579e24e8621e64',
    'v0.71.0-02': 'sha256:37b72cad44c0410e0acd7c28c29d37f41228e4152cd4236352db8a39079da5ae',
    'v0.72.0-01': 'sha256:2830d40ea72b99084417ad415dcf6adea7f911959a5c3bfd48cc9b418ffd5810',
    'v0.71.0-01': 'sha256:209da1db610b38871eb9357f27b6d625c80441ec9853024256190fd4843b585a',
}

def versions(baseline_version, version_file=None):
    candidate = (version_file or Path(__file__).resolve().parents[1] / 'nas-version.txt').read_text().strip()
    m.require(bool(m.VERSION.fullmatch(candidate)), 'sandbox_candidate_version')
    m.require(baseline_version in BASELINES, 'sandbox_baseline_version')
    m.require(candidate != baseline_version, 'sandbox_versions_equal')
    return m.IMAGE + '@' + BASELINES[baseline_version], candidate

class API:
    def __init__(self): self.events = []
    def report(self, deployment_id, state, code): self.events.append({'id': deployment_id, 'state': state, 'code': code})

class SandboxDocker(m.RealDocker):
    def __init__(self, cfg, candidate, source, fail_hub=False):
        super().__init__(cfg)
        self.candidate, self.source, self.fail_hub = candidate, source, fail_hub
        self.started = []
    def pull(self, request):
        # Registry digest/provenance failure paths have separate unit tests.
        # A PR image is deliberately never published to a production GHCR tag.
        value = self.image(self.candidate)
        labels = value['Config']['Labels']
        m.require(labels['org.opencontainers.image.version'] == request['version'] and labels['org.opencontainers.image.revision'] == self.source, 'sandbox_candidate_identity')
        return value['Id']
    def start(self, service, ref):
        self.started.append((service, ref))
        return super().start(service, ref)
    def verify_state(self, snapshot):
        try:
            return super().verify_state(snapshot)
        except m.Refused as error:
            if str(error) == 'hub_policy_changed':
                before=json.loads((snapshot/'hub-data'/'devices.json').read_text())
                after=json.loads((Path(self.cfg['hubDataDir'])/'devices.json').read_text())
                print(json.dumps({'syntheticHubChangedPolicyFields':[k for k in ['syncSettings','syncTitlePolicies','subscriptions'] if before.get(k)!=after.get(k)]}),flush=True)
            if str(error) == 'agent_history_lost':
                # Diagnostic paths only, on this explicitly synthetic sandbox.
                def differences(a, b, prefix=''):
                    if m.preserved(a, b): return []
                    if isinstance(a, dict) and isinstance(b, dict):
                        return [p for k in a for p in differences(a[k], b.get(k), prefix + '/' + k) if k not in ['updatedAt','savedAt','generatedAt']]
                    return [prefix]
                for file in (snapshot / 'state').rglob('*daily-history*.json'):
                    other=Path(self.cfg['stateDir']) / file.relative_to(snapshot / 'state')
                    print(json.dumps({'syntheticHistoryDifferencePaths': differences(json.loads(file.read_text()),json.loads(other.read_text()))[:20]}), flush=True)
            raise
    def verify_hub(self):
        result = super().verify_hub()
        if self.fail_hub and self.inspect(self.cfg['hubService'])['Image'] == self.image(self.candidate)['Id']:
            raise m.Refused('injected_hub_validation_failure')
        return result

def verify_fixture_accounting(adapter):
    # This fixed synthetic dataset contains 100 input + 20 output + 5 cached
    # tokens. Verify actual Hub ingress, not merely the successful upload flag.
    script = """const assert=require('assert/strict');(async()=>{const response=await fetch(process.env.TOKEN_MONITOR_HUB_URL+'/api/devices',{headers:{authorization:'Bearer '+process.env.TOKEN_MONITOR_SECRET}});assert.equal(response.status,200);const data=await response.json();const record=data.devices.find(d=>d.deviceId===process.env.TOKEN_MONITOR_DEVICE_ID);assert.ok(record);for(const period of ['today','month','allTime']){assert.equal(record.periods[period].totalTokens,125);assert.equal(record.periods[period].outputTokens,20);assert.equal(record.periods[period].cacheReadTokens,5);}console.log(JSON.stringify({fixedAccounting:true}));})().catch(()=>process.exitCode=1);"""
    info=adapter.inspect(adapter.cfg['agentService'])
    result=json.loads(m.run(['docker','exec',info['Id'],'node','-e',script]))
    assert result['fixedAccounting'] is True

# Deliberately lives in the synthetic exercise, never in the production adapter.
MODEL = 'synthetic-controller-reasoning-model'
OLD_COST = (100 * 2 + (20 + 8) * 10 + 5) / 1000000
NEW_COST = (100 * 2 + 20 * 10 + 5) / 1000000
COST_FIELDS = {'costUsd', 'cost', 'totalCost', 'modelCosts', 'clientCosts'}

def prime_prices(state):
    directory = state / 'tokscale'
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'custom-pricing.json').write_text(json.dumps({'models': {MODEL: {
        'input_cost_per_million_tokens': 2, 'output_cost_per_million_tokens': 10,
        'cache_read_input_token_cost_per_million_tokens': 1,
        'cache_creation_input_token_cost_per_million_tokens': 3}}}))

def correct_synthetic_cost(value, in_cost=False):
    """Exact one-session synthetic oracle; never accepts arbitrary percentages."""
    if isinstance(value, dict):
        return {key: correct_synthetic_cost(item, in_cost or key in COST_FIELDS)
                for key, item in value.items()}
    if isinstance(value, list): return [correct_synthetic_cost(item, in_cost) for item in value]
    if in_cost and isinstance(value, (int, float)) and not isinstance(value, bool):
        m.require(math.isfinite(value), 'synthetic_nonfinite_cost')
        if math.isclose(value, OLD_COST, abs_tol=1e-12, rel_tol=0): return NEW_COST
        m.require(value == 0 or math.isclose(value, NEW_COST, abs_tol=1e-12, rel_tol=0), 'synthetic_unexplained_cost')
    return value

def canonical_synthetic_cost(value, in_cost=False):
    """Normalize only independently verified cost scalars, never other fields."""
    if isinstance(value, dict): return {k: canonical_synthetic_cost(v, in_cost or k in COST_FIELDS) for k, v in value.items()}
    if isinstance(value, list): return [canonical_synthetic_cost(v, in_cost) for v in value]
    if in_cost and isinstance(value, (int, float)) and not isinstance(value, bool):
        m.require(math.isfinite(value), 'synthetic_nonfinite_cost')
        if value == 0: return value
        for known in [OLD_COST, NEW_COST]:
            if math.isclose(value, known, abs_tol=1e-12, rel_tol=0): return known
        raise m.Refused('synthetic_unexplained_cost')
    return value

def exact_cost_comparison(expected, actual, in_cost=False):
    if isinstance(expected, dict):
        return isinstance(actual, dict) and expected.keys() == actual.keys() and all(
            exact_cost_comparison(v, actual[k], in_cost or k in COST_FIELDS) for k, v in expected.items())
    if isinstance(expected, list):
        return isinstance(actual, list) and len(expected) == len(actual) and all(
            exact_cost_comparison(a, b, in_cost) for a, b in zip(expected, actual))
    if in_cost and isinstance(expected, (int, float)) and not isinstance(expected, bool):
        return isinstance(actual, (int, float)) and not isinstance(actual, bool) and math.isfinite(actual) and math.isclose(expected, actual, abs_tol=1e-12, rel_tol=0)
    return expected == actual

class ManualReasoningSandbox(SandboxDocker):
    """Rehearse reviewed manual steps while production stays fail-closed.

    Refuses every non-generated scope; price allowance is the independently
    computed exact 8 reasoning tokens at USD 10/million on one synthetic session.
    The original complete backup is never edited and remains rollback material.
    """
    def __init__(self, cfg, *args, **kwargs):
        m.require(cfg.get('sandbox') is True and Path(cfg['projectRoot']).resolve().parent.name.startswith('token-monitor-deployment-exercise-') and cfg['deviceId'] in ['sandbox-device', 'sandbox-dh-device'], 'manual_cost_oracle_sandbox_only')
        super().__init__(cfg, *args, **kwargs)
        self.reviewed_snapshot = None
    def frozen_compare(self, snapshot, old_image, target_ref):
        try:
            return super().frozen_compare(snapshot, old_image, target_ref)
        except m.Refused as error:
            m.require(str(error) == 'frozen_accounting_mismatch', 'synthetic_unexpected_frozen_failure')
        pair = json.loads((snapshot / 'frozen-accounting.json').read_text())
        m.require(pair['before']['deviceId'] == pair['after']['deviceId'] == self.cfg['deviceId'], 'synthetic_device_mismatch')
        for record, expected in [(pair['before'], OLD_COST), (pair['after'], NEW_COST)]:
            for period in ['today', 'month', 'allTime']:
                m.require(math.isclose(record[period]['costUsd'], expected, abs_tol=1e-12, rel_tol=0), 'synthetic_exact_cost_mismatch')
                m.require(record[period]['totalTokens'] == 125 and record[period]['outputTokens'] == 20 and record[period]['cacheReadTokens'] == 5, 'synthetic_token_mismatch')
        m.require(exact_cost_comparison(correct_synthetic_cost(pair['before']), pair['after']), 'synthetic_unknown_accounting_difference')
        # This is the explicit manual branch in a generated sandbox. The normal
        # adapter has already refused before either new production service starts.
        self.reviewed_snapshot = snapshot
        return {'frozenAccounting': 'manual-synthetic-exact-rule', 'productionGuard': 'refused-cost-change', 'rule': 'hermes-reasoning-double-pricing', 'reductionUsd': OLD_COST - NEW_COST}
    def verify_state(self, snapshot):
        if self.reviewed_snapshot != snapshot: return super().verify_state(snapshot)
        # Hub-only staging and restored old services still contain the complete
        # old-price history. Verify that original baseline first; do not lower
        # list-valued history expectations before the new Agent has uploaded.
        try:
            return super().verify_state(snapshot)
        except m.Refused as error:
            if str(error) not in ['archive_accounting_regressed', 'agent_history_lost', 'hub_history_lost']:
                raise
        with tempfile.TemporaryDirectory(prefix='synthetic-cost-review-', dir='/tmp') as tmp:
            reviewed = Path(tmp)
            m.copy_tree(snapshot / 'state', reviewed / 'state')
            for file in (reviewed / 'state').rglob('*daily-history*.json'):
                file.write_text(json.dumps(correct_synthetic_cost(json.loads(file.read_text()))))
            for archive in (reviewed / 'state').rglob('session-usage-archive.sqlite'):
                with sqlite3.connect(archive) as db:
                    rows = db.execute('SELECT session_key, entry_json FROM sessions').fetchall()
                    for key, raw in rows:
                        entry = json.loads(raw)
                        m.require(entry.get('client') == 'hermes' and entry.get('sessionId') == 'synthetic-deployment-session', 'synthetic_unknown_archive_identity')
                        db.execute('UPDATE sessions SET entry_json=? WHERE session_key=?', (json.dumps(correct_synthetic_cost(entry)), key))
            if self.cfg.get('hubDataDir'):
                m.copy_tree(snapshot / 'hub-data', reviewed / 'hub-data')
                file = reviewed / 'hub-data' / 'devices.json'
                data = json.loads(file.read_text())
                # Other devices belong to the remote Hub and get no allowance.
                data['devices'][self.cfg['deviceId']] = correct_synthetic_cost(data['devices'][self.cfg['deviceId']])
                file.write_text(json.dumps(data))
            # Rust and JSON can represent the exact known price with a final
            # floating-point bit difference. Normalize BOTH private comparison
            # copies only after every cost scalar matches an independent known
            # formula within 1e-12; real state and original backup remain intact.
            current = reviewed / 'current'
            m.copy_tree(Path(self.cfg['stateDir']), current / 'state')
            for file in (current / 'state').rglob('*daily-history*.json'):
                file.write_text(json.dumps(canonical_synthetic_cost(json.loads(file.read_text()))))
            for archive in (current / 'state').rglob('session-usage-archive.sqlite'):
                source = Path(self.cfg['stateDir']) / archive.relative_to(current / 'state')
                for suffix in ['-wal', '-shm']:
                    archive.with_name(archive.name + suffix).unlink(missing_ok=True)
                with sqlite3.connect('file:' + str(source) + '?mode=ro', uri=True) as src, sqlite3.connect(archive) as dst:
                    src.backup(dst)
                    for key, raw in dst.execute('SELECT session_key, entry_json FROM sessions').fetchall():
                        dst.execute('UPDATE sessions SET entry_json=? WHERE session_key=?', (json.dumps(canonical_synthetic_cost(json.loads(raw))), key))
            cfg = {**self.cfg, 'stateDir': str(current / 'state')}
            if self.cfg.get('hubDataDir'):
                m.copy_tree(Path(self.cfg['hubDataDir']), current / 'hub-data')
                file = current / 'hub-data' / 'devices.json'
                data = json.loads(file.read_text())
                data['devices'][self.cfg['deviceId']] = canonical_synthetic_cost(data['devices'][self.cfg['deviceId']])
                file.write_text(json.dumps(data));cfg['hubDataDir'] = str(current / 'hub-data')
            return m.verify_state(cfg, reviewed)

def verify_reasoning_ingress(adapter):
    script = """const assert=require('assert/strict');(async()=>{const response=await fetch(process.env.TOKEN_MONITOR_HUB_URL+'/api/devices',{headers:{authorization:'Bearer '+process.env.TOKEN_MONITOR_SECRET}});assert.equal(response.status,200);const data=await response.json();const record=data.devices.find(d=>d.deviceId===process.env.TOKEN_MONITOR_DEVICE_ID);assert.ok(record);for(const period of ['today','month','allTime'])assert.ok(Math.abs(record.periods[period].costUsd-0.000405)<1e-12);const history=await(await fetch(process.env.TOKEN_MONITOR_HUB_URL+'/api/history',{headers:{authorization:'Bearer '+process.env.TOKEN_MONITOR_SECRET}})).json();assert.ok(history.daily.some(d=>d.tokens>=125));console.log(JSON.stringify({exactSyntheticReasoningCost:true}));})().catch(()=>process.exitCode=1);"""
    info = adapter.inspect(adapter.cfg['agentService'])
    result = json.loads(m.run(['docker', 'exec', info['Id'], 'node', '-e', script]))
    m.require(result.get('exactSyntheticReasoningCost') is True, 'synthetic_reasoning_ingress_failed')
    def require_final_cost(value, in_cost=False):
        if isinstance(value, dict):
            for key, item in value.items(): require_final_cost(item, in_cost or key in COST_FIELDS)
        elif isinstance(value, list):
            for item in value: require_final_cost(item, in_cost)
        elif in_cost and isinstance(value, (int, float)) and not isinstance(value, bool):
            m.require(value == 0 or math.isclose(value, NEW_COST, abs_tol=1e-12, rel_tol=0), 'synthetic_persisted_cost_not_corrected')
    archives = list(Path(adapter.cfg['stateDir']).rglob('session-usage-archive.sqlite'))
    m.require(len(archives) == 1, 'synthetic_archive_missing')
    rows = m.sqlite_rows(archives[0])
    m.require(len(rows) == 1, 'synthetic_session_count_mismatch')
    for entry in rows.values(): require_final_cost(entry)
    history_files = list(Path(adapter.cfg['stateDir']).rglob('*daily-history*.json'))
    m.require(bool(history_files), 'synthetic_history_missing')
    for file in history_files: require_final_cost(json.loads(file.read_text()))


def fixture(path, reasoning=False):
    with sqlite3.connect(path) as db:
        db.executescript('''CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT NOT NULL,model TEXT,started_at REAL NOT NULL,message_count INTEGER DEFAULT 0,input_tokens INTEGER DEFAULT 0,output_tokens INTEGER DEFAULT 0,cache_read_tokens INTEGER DEFAULT 0,cache_write_tokens INTEGER DEFAULT 0,reasoning_tokens INTEGER DEFAULT 0,billing_provider TEXT,estimated_cost_usd REAL,actual_cost_usd REAL);
        CREATE TABLE session_model_usage(session_id TEXT NOT NULL,model TEXT NOT NULL,billing_provider TEXT NOT NULL DEFAULT '',task TEXT NOT NULL DEFAULT '',input_tokens INTEGER DEFAULT 0,output_tokens INTEGER DEFAULT 0,cache_read_tokens INTEGER DEFAULT 0,cache_write_tokens INTEGER DEFAULT 0,reasoning_tokens INTEGER DEFAULT 0,estimated_cost_usd REAL DEFAULT 0,actual_cost_usd REAL DEFAULT 0,PRIMARY KEY(session_id,model,billing_provider,task));''')
        db.execute('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', ('synthetic-deployment-session','cli',MODEL if reasoning else 'claude-sonnet-4',time.time(),1,100,20,5,0,8 if reasoning else 0,'synthetic' if reasoning else 'anthropic',0,0))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--candidate',required=True);parser.add_argument('--source',required=True);parser.add_argument('--output',required=True)
    parser.add_argument('--baseline-version', choices=sorted(BASELINES), default='v0.69.0-02')
    parser.add_argument('--reasoning', action='store_true', help='Sandbox-only exact Hermes cost correction manual-path rehearsal')
    args=parser.parse_args()
    baseline, candidate_version = versions(args.baseline_version)
    m.require(os.geteuid()==0, 'sandbox_requires_root')
    m.require(bool(m.SHA.fullmatch(args.source)), 'sandbox_source')
    root=Path(tempfile.mkdtemp(prefix='token-monitor-deployment-exercise-',dir='/tmp'));project=root/'project';project.mkdir(mode=0o700)
    state=project/'state';hub=project/'hub-data';hermes=root/'hermes'
    for p in [state,hub,hermes]:p.mkdir(mode=0o700)
    fixture(hermes/'state.db', args.reasoning)
    cache=state/'tokscale'/'cache';cache.mkdir(parents=True)
    for provider in ['litellm','openrouter','models-dev']:(cache/f'pricing-{provider}.json').write_text(json.dumps({'timestamp':int(time.time()),'data':{}}))
    if args.reasoning: prime_prices(state)
    env=project/'.env';env.write_text('TOKEN_MONITOR_SECRET='+secrets.token_hex(24)+'\n');env.chmod(0o600)
    cfg={'target':'DXP4800','projectRoot':str(project),'composeFile':str(project/'compose.json'),'deviceId':'sandbox-device','agentService':'sandbox-agent','hubService':'sandbox-hub','stateDir':str(state),'hubDataDir':str(hub),'hermesDir':str(hermes),'controlDir':str(project/'control'),'statusTokenFile':'injected-test-api-no-credential','healthTimeoutSeconds':90,'sandbox':True}
    common={'image':baseline,'init':True,'read_only':True,'cap_drop':['ALL'],'cap_add':['DAC_READ_SEARCH'],'tmpfs':['/tmp:rw,noexec,nosuid,size=64m'],'env_file':['.env'],'mem_limit':'512m','user':'0:0'}
    hubspec={**common,'command':['node','src/hub/server.js'],'volumes':[str(hub)+':/data'],'environment':{'TOKEN_MONITOR_DATA_FILE':'/data/devices.json','TOKEN_MONITOR_WINDOWS_STREAM_ENABLED':'1','TZ':'Asia/Shanghai'},'healthcheck':{'test':['CMD','node','-e',"fetch('http://127.0.0.1:17321/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],'interval':'2s','timeout':'5s','retries':15}}
    agentspec={**common,'volumes':[str(state)+':/config',str(hermes)+':/hermes:ro'],'environment':{'HOME':'/config','XDG_CONFIG_HOME':'/config','HERMES_HOME':'/hermes','TZ':'Asia/Shanghai','TOKEN_MONITOR_DEVICE_ID':'sandbox-device','TOKEN_MONITOR_HUB_URL':'http://sandbox-hub:17321','TOKEN_MONITOR_CLIENTS':'hermes','TOKEN_MONITOR_WATCH':'1','TOKEN_MONITOR_WATCH_IN_PROCESS':'0','TOKEN_MONITOR_INTERVAL_MS':'300000','TOKEN_MONITOR_PROJECTS_ENABLED':'0','TOKEN_MONITOR_LIMITS_ENABLED':'0','TOKEN_MONITOR_HISTORY_ENABLED':'1','TOKEN_MONITOR_SESSION_USAGE_ARCHIVE_ENABLED':'1','TOKSCALE_PRICING_CACHE_ONLY':'1'},'healthcheck':{'test':['CMD','node','src/agent/nasHealth.js'],'interval':'2s','timeout':'5s','retries':15,'start_period':'30s'}}
    Path(cfg['composeFile']).write_text(json.dumps({'name':'sandbox-deploy-'+secrets.token_hex(4),'services':{'sandbox-hub':hubspec,'sandbox-agent':agentspec}}))
    api=API();adapter_class = ManualReasoningSandbox if args.reasoning else SandboxDocker
    adapter=adapter_class(cfg,args.candidate,args.source);result={'scope':'synthetic-only; no production NAS, credentials or publishing','sourceCommit':args.source,'baselineVersion':args.baseline_version,'baselineImage':baseline,'candidateVersion':candidate_version}
    digest='sha256:'+'c'*64
    manifest={'schemaVersion':1,'version':candidate_version,'sourceCommit':args.source,'imageRepository':m.IMAGE,'imageDigest':digest,'platforms':[{'os':'linux','architecture':a,'digest':'sha256:'+'a'*64} for a in ['amd64','arm64']],'compatibleFrom':[args.baseline_version],'migration':{'kind':'none','rollback':'restore-snapshot','notes':'Synthetic whole-state restore rehearsal'}}
    def request(identity):return {'schemaVersion':1,'target':'DXP4800','deploymentId':identity,'workflowRunId':1,'version':manifest['version'],'fromVersion':args.baseline_version,'sourceCommit':args.source,'imageRepository':m.IMAGE,'imageDigest':digest,'manifest':manifest,'expiresAt':(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=1)).isoformat()}
    secondary = None
    try:
        m.run(['docker','pull',baseline],600)
        adapter.compose('up','-d')
        adapter.wait_health('sandbox-hub');adapter.wait_health('sandbox-agent');adapter.verify_agent(0)
        receipt=m.Engine(cfg,adapter,api).deploy(request(1),rehearse=True)
        assert receipt['phase']=='restored'
        result['successfulDeploymentAndWholeStateRehearsal']='passed'
        cfg['rollbackReceiptFile']=str(Path(cfg['controlDir'])/'rollback-rehearsal.json')
        broken=adapter_class(cfg,args.candidate,args.source,fail_hub=True)
        try:m.Engine(cfg,broken,api).deploy(request(2))
        except m.Refused as error:assert str(error)=='injected_hub_validation_failure'
        else:raise AssertionError('Injected failure was not detected')
        journal=json.loads((Path(cfg['controlDir'])/'deployment-2.json').read_text());assert journal['phase']=='restored'
        candidate_id=broken.image(args.candidate)['Id'];assert ('sandbox-agent',candidate_id) not in broken.started
        assert broken.inspect('sandbox-agent')['Image']==broken.image(baseline)['Id']
        result['hubFailureStopsAgentAndVerifiedSnapshotRollback']='passed'
        successful=adapter_class(cfg,args.candidate,args.source)
        final=m.Engine(cfg,successful,api).deploy(request(3));assert final['phase']=='success'
        verify_fixture_accounting(successful)
        if args.reasoning: verify_reasoning_ingress(successful)
        assert [stage['phase'] for stage in final['stages']].index('hub-verified')<[stage['phase'] for stage in final['stages']].index('agent-start-intent')
        result['stagedHubAgentDeployment']='passed'
        try:m.Engine(cfg,adapter_class(cfg,args.candidate,args.source),api).deploy(request(3))
        except m.Refused as error:assert str(error)=='deployment_already_recorded'
        else:raise AssertionError('Replay was accepted')
        result['replayRejected']='passed'
        # DH4300Plus shape: separate Compose/state, Agent only, remote Hub.
        second=root/'agent-only-project';second.mkdir(mode=0o700)
        second_state=second/'state';second_state.mkdir(mode=0o700)
        second_cache=second_state/'tokscale'/'cache';second_cache.mkdir(parents=True)
        for provider in ['litellm','openrouter','models-dev']:
            (second_cache/f'pricing-{provider}.json').write_text(json.dumps({'timestamp':int(time.time()),'data':{}}))
        if args.reasoning: prime_prices(second_state)
        m.copy_file(env,second/'.env')
        agent_only=json.loads(json.dumps(agentspec))
        agent_only['environment']['TOKEN_MONITOR_DEVICE_ID']='sandbox-dh-device'
        agent_only['volumes']=[str(second_state)+':/config',str(hermes)+':/hermes:ro']
        remote_network=next(iter(adapter.inspect('sandbox-hub')['NetworkSettings']['Networks']))
        compose_only=second/'compose.json'
        compose_only.write_text(json.dumps({'name':'sandbox-agentonly-'+secrets.token_hex(4),'services':{'sandbox-agent':agent_only},'networks':{'default':{'external':True,'name':remote_network}}}))
        second_cfg={**cfg,'target':'DH4300Plus','projectRoot':str(second),'composeFile':str(compose_only),'deviceId':'sandbox-dh-device','stateDir':str(second_state),'hubService':None,'hubDataDir':None,'controlDir':str(second/'control'),'rollbackReceiptFile':None}
        secondary=adapter_class(second_cfg,args.candidate,args.source)
        secondary.compose('up','-d');secondary.wait_health('sandbox-agent');secondary.verify_agent(0)
        remote_request={**request(4),'target':'DH4300Plus'}
        remote_result=m.Engine(second_cfg,secondary,api).deploy(remote_request)
        assert remote_result['phase']=='success'
        verify_fixture_accounting(secondary)
        if args.reasoning: verify_reasoning_ingress(secondary)
        assert not any(stage['phase'].startswith('hub-') for stage in remote_result['stages'])
        result['agentOnlyRemoteHubDeployment']='passed';result['reasoningManualSandbox']={'enabled':args.reasoning,'productionAutomaticCostChange':'not-authorized','rule':'Hermes output contains reasoning; remove the additional 8 × 10 / 1000000 USD charge only','baselineCostUsd':OLD_COST if args.baseline_version.startswith('v0.69.') else NEW_COST,'candidateCostUsd':NEW_COST} if args.reasoning else {'enabled':False,'fixture':'125 Token with zero reasoning'};result['fixedHermesHubAccounting']='passed';result['statusEvents']=api.events
        Path(args.output).parent.mkdir(parents=True,exist_ok=True);Path(args.output).write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps({k:v for k,v in result.items() if k!='statusEvents'}))
    finally:
        # This project is generated only under /tmp with sandbox service names.
        if secondary:
            second_override=Path(secondary.cfg['controlDir'])/'image-override.json'
            try:m.run(secondary.base+(['-f',str(second_override)] if second_override.exists() else [])+['down'],120)
            except m.Refused:pass
        override=Path(cfg['controlDir'])/'image-override.json'
        extra=['-f',str(override)] if override.exists() else []
        try:m.run(adapter.base+extra+['down'],120)
        except m.Refused:pass

if __name__=='__main__':main()
