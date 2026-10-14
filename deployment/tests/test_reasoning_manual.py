import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import exercise as e
import nas_pull as m

class ManualReasoningTest(unittest.TestCase):
    def record(self):
        return {'deviceId': 'sandbox-device', 'history': {'daily': [{'date': '2026-10-15', 'tokens': 125, 'cost': e.OLD_COST}]},
            **{p: {'totalTokens': 125, 'outputTokens': 20, 'cacheReadTokens': 5,
                'costUsd': e.OLD_COST, 'modelCosts': {e.MODEL: e.OLD_COST},
                'sessions': {'hermes:synthetic-deployment-session': {'client': 'hermes', 'sessionId': 'synthetic-deployment-session', 'messageCount': 1, 'totalTokens': 125, 'costUsd': e.OLD_COST}}}
                for p in ['today', 'month', 'allTime']}}
    def test_exact_cost_rule_and_preserved_accounting(self):
        old = self.record(); new = e.correct_synthetic_cost(old)
        self.assertEqual(new['allTime']['costUsd'], 0.000405)
        self.assertTrue(e.exact_cost_comparison(new, copy.deepcopy(new)))
        self.assertEqual(old['allTime']['costUsd'], 0.000485)
        for mutation in [lambda x: x['today'].__setitem__('totalTokens', 124),
                lambda x: x['month']['sessions'].clear(),
                lambda x: x['history']['daily'][0].__setitem__('date', '2026-10-14'),
                lambda x: x.__setitem__('deviceId', 'other'),
                lambda x: x['allTime'].__setitem__('costUsd', 0.000400)]:
            bad = copy.deepcopy(new); mutation(bad)
            self.assertFalse(e.exact_cost_comparison(new, bad))
    def test_oracle_refuses_unknown_nonfinite_or_negative_cost(self):
        for value in [0.0004, -1, float('nan'), float('inf')]:
            with self.assertRaises(m.Refused): e.correct_synthetic_cost({'costUsd': value})
    def test_production_paths_cannot_use_sandbox_adapter(self):
        with self.assertRaises(m.Refused): e.ManualReasoningSandbox({'sandbox': False}, 'candidate', 'a'*40)
        with self.assertRaises(m.Refused): e.ManualReasoningSandbox({'sandbox': True, 'projectRoot': '/tmp/production', 'deviceId': 'sandbox-device'}, 'candidate', 'a'*40)
    def test_real_guard_mismatch_is_required_before_manual_branch(self):
        with tempfile.TemporaryDirectory(prefix='token-monitor-deployment-exercise-') as tmp:
            root = Path(tmp); project = root/'project'; project.mkdir()
            cfg = {'sandbox': True, 'projectRoot': str(project), 'composeFile': str(project/'compose.json'), 'deviceId': 'sandbox-device', 'controlDir': str(project/'control')}
            adapter = e.ManualReasoningSandbox(cfg, 'candidate', 'a'*40)
            old = self.record(); new = e.correct_synthetic_cost(old)
            (root/'frozen-accounting.json').write_text(json.dumps({'before': old, 'after': new}))
            with patch.object(e.SandboxDocker, 'frozen_compare', side_effect=m.Refused('frozen_accounting_mismatch')):
                result = adapter.frozen_compare(root, 'old', 'new')
                self.assertEqual(result['productionGuard'], 'refused-cost-change')
            with patch.object(e.SandboxDocker, 'frozen_compare', side_effect=m.Refused('sqlite_integrity_failed')):
                with self.assertRaises(m.Refused): adapter.frozen_compare(root, 'old', 'new')
            for mutate in [lambda x: x['after']['allTime'].__setitem__('costUsd', 0), lambda x: x['after']['history']['daily'].clear()]:
                pair = {'before': old, 'after': copy.deepcopy(new)}; mutate(pair)
                (root/'frozen-accounting.json').write_text(json.dumps(pair))
                with patch.object(e.SandboxDocker, 'frozen_compare', side_effect=m.Refused('frozen_accounting_mismatch')):
                    with self.assertRaises(m.Refused): adapter.frozen_compare(root, 'old', 'new')

if __name__ == '__main__': unittest.main()
