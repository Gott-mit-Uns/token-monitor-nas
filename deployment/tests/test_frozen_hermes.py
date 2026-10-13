import copy
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import exercise
import frozen_hermes as f
import nas_pull as m


class FrozenHermesTest(unittest.TestCase):
    def evidence(self):
        before = {'deviceId': 'synthetic-frozen-device', 'uploaded': True,
            'periods': {k: {'totalTokens': 1845, 'costUsd': v[0],
                'sessions': {'hermes:frozen-modern': {'totalTokens': 1570}, 'hermes:frozen-legacy': {'totalTokens': 275}}}
                for k, v in f.EXPECTED_COST.items()},
            'history': [{'date': '2026-06-06', 'tokens': 275, 'cost': 0.001135},
                {'date': '2026-06-07', 'tokens': 1570, 'cost': 0.00651}]}
        after = copy.deepcopy(before)
        for k, values in f.EXPECTED_COST.items(): after['periods'][k]['costUsd'] = values[1]
        after['history'][0]['cost'] = 0.000935; after['history'][1]['cost'] = 0.00551
        return before, after

    def test_expected_reasoning_cost_drop_accepted(self):
        before, after = self.evidence()
        self.assertEqual(f.compare(before, after)['accountingHistoryDeviceAndActualUpload'], 'passed')

    def test_cost_drop_cannot_hide_token_or_session_loss(self):
        for mutation in [lambda v: v['periods']['allTime'].__setitem__('totalTokens', 1725),
                lambda v: v['periods']['month']['sessions'].pop('hermes:frozen-legacy'),
                lambda v: v['history'].pop()]:
            before, after = self.evidence(); mutation(after)
            with self.assertRaises(m.Refused): f.compare(before, after)

    def test_unexplained_cost_or_device_changes_and_missing_upload_refused(self):
        for mutation in [lambda v: v['periods']['allTime'].__setitem__('costUsd', 0),
                lambda v: v.__setitem__('deviceId', 'different-device'),
                lambda v: v.__setitem__('uploaded', False),
                lambda v: v['history'][0].__setitem__('cost', 0)]:
            before, after = self.evidence(); mutation(after)
            with self.assertRaises(m.Refused): f.compare(before, after)

    def test_synthetic_fixture_closed_and_consistent(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / 'state.db'; f.fixture(file)
            with sqlite3.connect(f'file:{file}?mode=ro', uri=True) as db:
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
                self.assertEqual(db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0], 2)
                self.assertEqual(db.execute('SELECT SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) FROM sessions').fetchone()[0], 1845)
                self.assertEqual(db.execute('SELECT SUM(reasoning_tokens) FROM sessions').fetchone()[0], 120)
                self.assertNotIn('messages', [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")])
            self.assertEqual(sorted(p.name for p in Path(tmp).iterdir()), ['state.db'])

    def test_baselines_are_fixed_and_candidate_read_from_single_version_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / 'version'; file.write_text('v0.70.0-01\n')
            for version, digest in exercise.BASELINES.items():
                ref, candidate = exercise.versions(version, file)
                self.assertEqual(ref, m.IMAGE + '@' + digest)
                self.assertEqual(candidate, 'v0.70.0-01')
            with self.assertRaises(m.Refused): exercise.versions('latest', file)
            file.write_text('v0.69.0-02')
            with self.assertRaises(m.Refused): exercise.versions('v0.69.0-02', file)


if __name__ == '__main__': unittest.main()
