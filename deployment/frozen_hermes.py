#!/usr/bin/env python3
"""Compare real old/new Rust parsers and shared/Hub paths on frozen synthetic DBs.

No production paths accepted. No network, credentials or message bodies supplied.
Outputs only synthetic accounting and immutable image/parser identity evidence.
"""
import argparse
import hashlib
import json
import os
import platform
from pathlib import Path
import sqlite3
import tempfile
import time
from exercise import BASELINES, versions
import nas_pull as m

MODEL = 'synthetic-frozen-model'
EXPECTED_COST = {'today': (0.00651, 0.00551), 'month': (0.007645, 0.006445), 'allTime': (0.007645, 0.006445)}
# Only these verified releases already contain the Hermes reasoning correction.
# Older releases keep the exact historical reduction oracle above.
CORRECTED_BASELINES = {'v0.77.0-02', 'v0.77.0-01', 'v0.76.0-02', 'v0.76.0-01', 'v0.75.0-01', 'v0.74.0-01', 'v0.73.0-01', 'v0.72.0-02', 'v0.70.0-01', 'v0.71.0-01', 'v0.71.0-02', 'v0.72.0-01'}

def fixture(file):
    with sqlite3.connect(file) as db:
        db.executescript('''CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT NOT NULL,model TEXT,started_at REAL NOT NULL,message_count INTEGER DEFAULT 0,input_tokens INTEGER DEFAULT 0,output_tokens INTEGER DEFAULT 0,cache_read_tokens INTEGER DEFAULT 0,cache_write_tokens INTEGER DEFAULT 0,reasoning_tokens INTEGER DEFAULT 0,billing_provider TEXT,estimated_cost_usd REAL,actual_cost_usd REAL);
        CREATE TABLE session_model_usage(session_id TEXT NOT NULL,model TEXT NOT NULL,billing_provider TEXT NOT NULL DEFAULT '',task TEXT NOT NULL DEFAULT '',input_tokens INTEGER DEFAULT 0,output_tokens INTEGER DEFAULT 0,cache_read_tokens INTEGER DEFAULT 0,cache_write_tokens INTEGER DEFAULT 0,reasoning_tokens INTEGER DEFAULT 0,estimated_cost_usd REAL DEFAULT 0,actual_cost_usd REAL DEFAULT 0,PRIMARY KEY(session_id,model,billing_provider,task));''')
        db.execute('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', ('frozen-modern', 'cli', MODEL, 1780833600, 3, 1200, 300, 50, 20, 100, 'synthetic', 0, 0))
        db.execute('INSERT INTO session_model_usage VALUES (?,?,?,?,?,?,?,?,?,?,?)', ('frozen-modern', MODEL, 'synthetic', '', 1200, 300, 50, 20, 100, 0, 0))
        db.execute('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', ('frozen-legacy', 'cli', MODEL, 1780747200, 2, 200, 50, 20, 5, 20, 'synthetic', 0, 0))
    file.chmod(0o444)

def prime(config, timestamp):
    cache = config / 'cache'; cache.mkdir(parents=True)
    for provider in ['litellm', 'openrouter', 'models-dev']:
        (cache / f'pricing-{provider}.json').write_text(json.dumps({'timestamp': timestamp, 'data': {}}))
    (config / 'custom-pricing.json').write_text(json.dumps({'models': {MODEL: {
        'input_cost_per_million_tokens': 2, 'output_cost_per_million_tokens': 10,
        'cache_read_input_token_cost_per_million_tokens': 1,
        'cache_creation_input_token_cost_per_million_tokens': 3}}}))

def without_cost(value):
    if isinstance(value, dict): return {k: without_cost(v) for k, v in value.items() if k not in ['costUsd', 'cost']}
    if isinstance(value, list): return [without_cost(v) for v in value]
    return value

def compare(before, after, baseline_version="v0.69.0-02"):
    m.require(without_cost(before['periods']) == without_cost(after['periods']), 'frozen_token_session_loss')
    m.require(without_cost(before['history']) == without_cost(after['history']), 'frozen_history_loss')
    m.require(before['deviceId'] == after['deviceId'] == 'synthetic-frozen-device' and before['uploaded'] and after['uploaded'], 'frozen_upload_identity')
    changes = {}
    for period, (old, new) in EXPECTED_COST.items():
        if baseline_version in CORRECTED_BASELINES: old = new
        actual_old = before['periods'][period]['costUsd']; actual_new = after['periods'][period]['costUsd']
        m.require(abs(actual_old - old) < 1e-9 and abs(actual_new - new) < 1e-9, 'frozen_reasoning_cost_mismatch')
        changes[period] = {'baselineCostUsd': actual_old, 'candidateCostUsd': actual_new, 'expectedReductionUsd': old - new}
    for old_row, new_row in zip(before['history'], after['history']):
        key = 'today' if old_row['date'] == '2026-06-07' else None
        expected_old, expected_new = EXPECTED_COST[key] if key else (0.001135, 0.000935)
        if baseline_version in CORRECTED_BASELINES: expected_old = expected_new
        m.require(abs(old_row['cost'] - expected_old) < 1e-9 and abs(new_row['cost'] - expected_new) < 1e-9, 'frozen_history_cost_mismatch')
    return {'accountingHistoryDeviceAndActualUpload': 'passed', 'reasoningCostCorrection': changes,
        'explanation': 'Hermes output includes reasoning. Old pricing billed reasoning a second time; new pricing subtracts the reasoning subset before additive pricing. Public output and total tokens, sessions, dates and device identity remain identical.'}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate', required=True); parser.add_argument('--output', required=True)
    parser.add_argument('--baseline-version', choices=sorted(BASELINES), default='v0.69.0-02')
    args = parser.parse_args()
    baseline, candidate_version = versions(args.baseline_version)
    m.run(['docker', 'pull', baseline], 600)
    worker = Path(__file__).resolve().with_name('frozen-hermes-worker.js')
    with tempfile.TemporaryDirectory(prefix='token-monitor-frozen-hermes-') as tmp:
        root = Path(tmp); hermes = root / 'hermes'; hermes.mkdir()
        fixture(hermes / 'state.db')
        fixture_sha = hashlib.sha256((hermes / 'state.db').read_bytes()).hexdigest()
        results = {}
        timestamp = int(time.time())
        for name, ref, version in [('baseline', baseline, args.baseline_version), ('candidate', args.candidate, candidate_version)]:
            labels = json.loads(m.run(['docker', 'image', 'inspect', ref]))[0]
            m.require(labels['Config']['Labels']['org.opencontainers.image.version'] == version, 'frozen_image_version')
            expected_arch = {'x86_64': 'amd64', 'aarch64': 'arm64'}.get(platform.machine())
            m.require(expected_arch and labels['Architecture'] == expected_arch, 'frozen_requires_native_architecture')
            config = root / name; prime(config, timestamp)
            output = m.run(['docker', 'run', '--rm', '--init', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                '--user', f'{os.getuid()}:{os.getgid()}',
                '--memory', '512m', '--cpus', '2', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
                '-v', f'{hermes}:/frozen/hermes:ro', '-v', f'{config}:/frozen/config',
                '-v', f'{worker}:/frozen/worker.js:ro', ref, 'node', '/frozen/worker.js'], 180)
            results[name] = json.loads(output.strip().splitlines()[-1])
            results[name]['imageId'] = labels['Id']; results[name]['sourceCommit'] = labels['Config']['Labels']['org.opencontainers.image.revision']
            m.require(hashlib.sha256((hermes / 'state.db').read_bytes()).hexdigest() == fixture_sha, 'frozen_source_modified')
        comparison = compare(results['baseline'], results['candidate'], args.baseline_version)
        evidence = {'scope': 'synthetic SQLite; real pinned Rust, shared normalization and loopback Hub upload; no production measurement',
            'baselineVersion': args.baseline_version, 'baselineImage': baseline, 'candidateVersion': candidate_version,
            'fixtureSha256': fixture_sha, 'sourceBytesUnchanged': True,
            'resources': {'memoryMiB': 512, 'cpus': 2, 'network': 'none', 'timezone': 'UTC'},
            **results, 'comparison': comparison}
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output).write_text(json.dumps(evidence, indent=2) + '\n')
        print(json.dumps({'frozenHermesComparison': 'passed', 'baselineVersion': args.baseline_version, 'candidateVersion': candidate_version}))

if __name__ == '__main__': main()
