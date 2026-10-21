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

    def test_expected_reasoning_cost_drop_accepted_for_both_069_releases(self):
        for version in ['v0.69.0-01', 'v0.69.0-02']:
            with self.subTest(version=version):
                before, after = self.evidence()
                self.assertEqual(f.compare(before, after, version)['accountingHistoryDeviceAndActualUpload'], 'passed')

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

    def test_070_through_072_baselines_require_equal_corrected_costs(self):
        for version in ['v0.70.0-01', 'v0.71.0-01', 'v0.71.0-02', 'v0.72.0-01', 'v0.73.0-01', 'v0.74.0-01', 'v0.75.0-01', 'v0.76.0-01', 'v0.76.0-02']:
            with self.subTest(version=version):
                before, after = self.evidence()
                result = f.compare(after, after, version)
                self.assertEqual(result['accountingHistoryDeviceAndActualUpload'], 'passed')
                self.assertTrue(all(v['expectedReductionUsd'] == 0 for v in result['reasoningCostCorrection'].values()))
                with self.assertRaises(m.Refused): f.compare(before, after, version)

    def test_071_and_072_cost_equality_does_not_hide_accounting_or_identity_changes(self):
        for mutation in [lambda v: v['periods']['allTime'].__setitem__('totalTokens', 1725),
                lambda v: v['periods']['month']['sessions'].pop('hermes:frozen-legacy'),
                lambda v: v['history'][0].__setitem__('date', '2026-06-05'),
                lambda v: v.__setitem__('deviceId', 'different-device'),
                lambda v: v.__setitem__('uploaded', False),
                lambda v: v['periods']['today'].__setitem__('costUsd', 0),
                lambda v: v['history'][0].__setitem__('cost', 0)]:
            _, before = self.evidence(); after = copy.deepcopy(before); mutation(after)
            for version in ['v0.71.0-01', 'v0.72.0-01', 'v0.73.0-01', 'v0.74.0-01', 'v0.75.0-01', 'v0.76.0-01', 'v0.76.0-02']:
                with self.assertRaises(m.Refused): f.compare(before, after, version)

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
            file = Path(tmp) / 'version'; file.write_text('v0.77.0-01\n')
            self.assertEqual(exercise.BASELINES['v0.71.0-01'], 'sha256:209da1db610b38871eb9357f27b6d625c80441ec9853024256190fd4843b585a')
            self.assertEqual(exercise.BASELINES['v0.72.0-01'], 'sha256:2830d40ea72b99084417ad415dcf6adea7f911959a5c3bfd48cc9b418ffd5810')
            self.assertEqual(exercise.BASELINES['v0.73.0-01'], 'sha256:48edfc344a513cebd8ed59c44f4504a40222c4ba44554d32300e888710daad34')
            self.assertEqual(exercise.BASELINES['v0.74.0-01'], 'sha256:f928d90e8c697d7e872ed1e19f20a93490e378444cfbea0d5b7cb4453ca104d7')
            self.assertEqual(exercise.BASELINES['v0.75.0-01'], 'sha256:c92f1ad9ad1e7d6b6f7e6302bcfde64ad4e3b5f2583b2dea0d8821f76e3328e3')
            self.assertEqual(exercise.BASELINES['v0.76.0-01'], 'sha256:072c1d1bb4f8eda509269d6d7b9e06d56fbaaf66fc97b1f4241988831baa4174')
            self.assertEqual(exercise.BASELINES['v0.76.0-02'], 'sha256:719088855351975f38badadfdec1ae43db98b962f5b99874ca0b641874645160')
            for version, digest in exercise.BASELINES.items():
                ref, candidate = exercise.versions(version, file)
                self.assertEqual(ref, m.IMAGE + '@' + digest)
                self.assertEqual(candidate, 'v0.77.0-01')
            with self.assertRaises(m.Refused): exercise.versions('latest', file)
            file.write_text('v0.69.0-02')
            with self.assertRaises(m.Refused): exercise.versions('v0.69.0-02', file)


if __name__ == '__main__': unittest.main()
