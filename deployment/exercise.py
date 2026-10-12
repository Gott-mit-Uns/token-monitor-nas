#!/usr/bin/env python3
"""Synthetic Docker deployment/restore exercise. Never accepts production paths.

Registry publishing/approval are tested with injected APIs in Node tests. This
exercise uses real released baseline and a locally built candidate for Docker,
SQLite, Hub/Agent, SSE and whole-state restore. Only synthetic summary is exported.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import secrets
import sqlite3
import tempfile
import time
import nas_pull as m

BASELINE = m.IMAGE + '@sha256:849ad058facfde01a7279efd88333f7461e3bffd3655f3d082913e957c30ed07'

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

def fixture(path):
    with sqlite3.connect(path) as db:
        db.executescript('''CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT NOT NULL,model TEXT,started_at REAL NOT NULL,message_count INTEGER DEFAULT 0,input_tokens INTEGER DEFAULT 0,output_tokens INTEGER DEFAULT 0,cache_read_tokens INTEGER DEFAULT 0,cache_write_tokens INTEGER DEFAULT 0,reasoning_tokens INTEGER DEFAULT 0,billing_provider TEXT,estimated_cost_usd REAL,actual_cost_usd REAL);
        CREATE TABLE session_model_usage(session_id TEXT NOT NULL,model TEXT NOT NULL,billing_provider TEXT NOT NULL DEFAULT '',task TEXT NOT NULL DEFAULT '',input_tokens INTEGER DEFAULT 0,output_tokens INTEGER DEFAULT 0,cache_read_tokens INTEGER DEFAULT 0,cache_write_tokens INTEGER DEFAULT 0,reasoning_tokens INTEGER DEFAULT 0,estimated_cost_usd REAL DEFAULT 0,actual_cost_usd REAL DEFAULT 0,PRIMARY KEY(session_id,model,billing_provider,task));''')
        db.execute('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', ('synthetic-deployment-session','cli','claude-sonnet-4',time.time(),1,100,20,5,0,0,'anthropic',0,0))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--candidate',required=True);parser.add_argument('--source',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args()
    m.require(os.geteuid()==0, 'sandbox_requires_root')
    m.require(bool(m.SHA.fullmatch(args.source)), 'sandbox_source')
    root=Path(tempfile.mkdtemp(prefix='token-monitor-deployment-exercise-',dir='/tmp'));project=root/'project';project.mkdir(mode=0o700)
    state=project/'state';hub=project/'hub-data';hermes=root/'hermes'
    for p in [state,hub,hermes]:p.mkdir(mode=0o700)
    fixture(hermes/'state.db')
    cache=state/'tokscale'/'cache';cache.mkdir(parents=True)
    for provider in ['litellm','openrouter','models-dev']:(cache/f'pricing-{provider}.json').write_text(json.dumps({'timestamp':int(time.time()),'data':{}}))
    env=project/'.env';env.write_text('TOKEN_MONITOR_SECRET='+secrets.token_hex(24)+'\n');env.chmod(0o600)
    cfg={'target':'DXP4800','projectRoot':str(project),'composeFile':str(project/'compose.json'),'deviceId':'sandbox-device','agentService':'sandbox-agent','hubService':'sandbox-hub','stateDir':str(state),'hubDataDir':str(hub),'hermesDir':str(hermes),'controlDir':str(project/'control'),'statusTokenFile':'injected-test-api-no-credential','healthTimeoutSeconds':90,'sandbox':True}
    common={'image':BASELINE,'init':True,'read_only':True,'cap_drop':['ALL'],'cap_add':['DAC_READ_SEARCH'],'tmpfs':['/tmp:rw,noexec,nosuid,size=64m'],'env_file':['.env'],'mem_limit':'512m','user':'0:0'}
    hubspec={**common,'command':['node','src/hub/server.js'],'volumes':[str(hub)+':/data'],'environment':{'TOKEN_MONITOR_DATA_FILE':'/data/devices.json','TOKEN_MONITOR_WINDOWS_STREAM_ENABLED':'1','TZ':'Asia/Shanghai'},'healthcheck':{'test':['CMD','node','-e',"fetch('http://127.0.0.1:17321/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],'interval':'2s','timeout':'5s','retries':15}}
    agentspec={**common,'volumes':[str(state)+':/config',str(hermes)+':/hermes:ro'],'environment':{'HOME':'/config','XDG_CONFIG_HOME':'/config','HERMES_HOME':'/hermes','TZ':'Asia/Shanghai','TOKEN_MONITOR_DEVICE_ID':'sandbox-device','TOKEN_MONITOR_HUB_URL':'http://sandbox-hub:17321','TOKEN_MONITOR_CLIENTS':'hermes','TOKEN_MONITOR_WATCH':'1','TOKEN_MONITOR_WATCH_IN_PROCESS':'0','TOKEN_MONITOR_INTERVAL_MS':'300000','TOKEN_MONITOR_PROJECTS_ENABLED':'0','TOKEN_MONITOR_LIMITS_ENABLED':'0','TOKEN_MONITOR_HISTORY_ENABLED':'1','TOKEN_MONITOR_SESSION_USAGE_ARCHIVE_ENABLED':'1','TOKSCALE_PRICING_CACHE_ONLY':'1'},'healthcheck':{'test':['CMD','node','src/agent/nasHealth.js'],'interval':'2s','timeout':'5s','retries':15,'start_period':'30s'}}
    Path(cfg['composeFile']).write_text(json.dumps({'name':'sandbox-deploy-'+secrets.token_hex(4),'services':{'sandbox-hub':hubspec,'sandbox-agent':agentspec}}))
    api=API();adapter=SandboxDocker(cfg,args.candidate,args.source);result={'scope':'synthetic-only; no production NAS, credentials or publishing','sourceCommit':args.source,'baselineVersion':'v0.69.0-01','candidateVersion':'v0.69.0-02'}
    digest='sha256:'+'c'*64
    manifest={'schemaVersion':1,'version':'v0.69.0-02','sourceCommit':args.source,'imageRepository':m.IMAGE,'imageDigest':digest,'platforms':[{'os':'linux','architecture':a,'digest':'sha256:'+'a'*64} for a in ['amd64','arm64']],'compatibleFrom':['v0.69.0-01'],'migration':{'kind':'none','rollback':'restore-snapshot','notes':'Synthetic whole-state restore rehearsal'}}
    def request(identity):return {'schemaVersion':1,'target':'DXP4800','deploymentId':identity,'workflowRunId':1,'version':manifest['version'],'fromVersion':'v0.69.0-01','sourceCommit':args.source,'imageRepository':m.IMAGE,'imageDigest':digest,'manifest':manifest,'expiresAt':(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=1)).isoformat()}
    secondary = None
    try:
        m.run(['docker','pull',BASELINE],600)
        adapter.compose('up','-d')
        adapter.wait_health('sandbox-hub');adapter.wait_health('sandbox-agent');adapter.verify_agent(0)
        receipt=m.Engine(cfg,adapter,api).deploy(request(1),rehearse=True)
        assert receipt['phase']=='restored'
        result['successfulDeploymentAndWholeStateRehearsal']='passed'
        cfg['rollbackReceiptFile']=str(Path(cfg['controlDir'])/'rollback-rehearsal.json')
        broken=SandboxDocker(cfg,args.candidate,args.source,fail_hub=True)
        try:m.Engine(cfg,broken,api).deploy(request(2))
        except m.Refused as error:assert str(error)=='injected_hub_validation_failure'
        else:raise AssertionError('Injected failure was not detected')
        journal=json.loads((Path(cfg['controlDir'])/'deployment-2.json').read_text());assert journal['phase']=='restored'
        candidate_id=broken.image(args.candidate)['Id'];assert ('sandbox-agent',candidate_id) not in broken.started
        assert broken.inspect('sandbox-agent')['Image']==broken.image(BASELINE)['Id']
        result['hubFailureStopsAgentAndVerifiedSnapshotRollback']='passed'
        final=m.Engine(cfg,SandboxDocker(cfg,args.candidate,args.source),api).deploy(request(3));assert final['phase']=='success'
        assert [stage['phase'] for stage in final['stages']].index('hub-verified')<[stage['phase'] for stage in final['stages']].index('agent-start-intent')
        result['stagedHubAgentDeployment']='passed'
        try:m.Engine(cfg,SandboxDocker(cfg,args.candidate,args.source),api).deploy(request(3))
        except m.Refused as error:assert str(error)=='deployment_already_recorded'
        else:raise AssertionError('Replay was accepted')
        result['replayRejected']='passed'
        # DH4300Plus shape: separate Compose/state, Agent only, remote Hub.
        second=root/'agent-only-project';second.mkdir(mode=0o700)
        second_state=second/'state';second_state.mkdir(mode=0o700)
        second_cache=second_state/'tokscale'/'cache';second_cache.mkdir(parents=True)
        for provider in ['litellm','openrouter','models-dev']:
            (second_cache/f'pricing-{provider}.json').write_text(json.dumps({'timestamp':int(time.time()),'data':{}}))
        m.copy_file(env,second/'.env')
        agent_only=json.loads(json.dumps(agentspec))
        agent_only['environment']['TOKEN_MONITOR_DEVICE_ID']='sandbox-dh-device'
        agent_only['volumes']=[str(second_state)+':/config',str(hermes)+':/hermes:ro']
        remote_network=next(iter(adapter.inspect('sandbox-hub')['NetworkSettings']['Networks']))
        compose_only=second/'compose.json'
        compose_only.write_text(json.dumps({'name':'sandbox-agentonly-'+secrets.token_hex(4),'services':{'sandbox-agent':agent_only},'networks':{'default':{'external':True,'name':remote_network}}}))
        second_cfg={**cfg,'target':'DH4300Plus','projectRoot':str(second),'composeFile':str(compose_only),'deviceId':'sandbox-dh-device','stateDir':str(second_state),'hubService':None,'hubDataDir':None,'controlDir':str(second/'control'),'rollbackReceiptFile':None}
        secondary=SandboxDocker(second_cfg,args.candidate,args.source)
        secondary.compose('up','-d');secondary.wait_health('sandbox-agent');secondary.verify_agent(0)
        remote_request={**request(4),'target':'DH4300Plus'}
        remote_result=m.Engine(second_cfg,secondary,api).deploy(remote_request)
        assert remote_result['phase']=='success'
        assert not any(stage['phase'].startswith('hub-') for stage in remote_result['stages'])
        result['agentOnlyRemoteHubDeployment']='passed';result['statusEvents']=api.events
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
