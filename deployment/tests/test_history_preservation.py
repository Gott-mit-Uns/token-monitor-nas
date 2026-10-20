"""Synthetic regression tests for the deployed Hub history retention gate."""
import copy
import json
import math
from pathlib import Path
import unittest
import test_nas_pull as controller_tests

m = controller_tests.m


def history():
    return {
        'daily': [
            {'date': '2026-10-19', 'tokens': 100, 'cost': 1.25, 'intensity': 3, 'tokenIntensity': 3, 'costIntensity': 4,
             'perClient': {'dsh': {'tokens': 100, 'messages': 2, 'cost': 1.25}},
             'perModel': {'synthetic': {'tokens': 100, 'cost': 1.25}}},
            {'date': '2026-10-20', 'tokens': 20, 'cost': 0.25, 'intensity': 1},
        ],
        'monthly': [{'month': '2026-10', 'tokens': 120, 'cost': 1.5}],
        'summary': {'totalTokens': 120, 'totalCost': 1.5, 'messages': 3,
                    'favoriteModel': 'synthetic', 'currentStreak': 2},
    }


class HistoryPreservationTest(unittest.TestCase):
    def test_realistic_increment_reorder_append_and_cost_roundoff(self):
        old = history(); new = copy.deepcopy(old)
        new['daily'][0]['perClient']['dsh']['cost'] = math.nextafter(1.25, 0)
        new['daily'][0]['perModel']['synthetic']['cost'] = math.nextafter(1.25, 0)
        new['daily'][0].update(intensity=1, tokenIntensity=1, costIntensity=2)
        new['daily'][1].update(tokens=40, cost=0.5)
        new['daily'].append({'date': '2026-10-21', 'tokens': 10, 'cost': 0.1})
        new['daily'].reverse()
        new['monthly'][0].update(tokens=150, cost=1.85)
        new['monthly'].append({'month': '2026-11', 'tokens': 1, 'cost': 0.01})
        new['summary'].update(totalTokens=151, totalCost=1.86, messages=5,
                              favoriteModel='another-synthetic', currentStreak=0)
        self.assertTrue(m.history_preserved(old, new))

    def test_real_losses_and_bad_identities_are_rejected(self):
        mutations = [
            lambda h: h['daily'].pop(),
            lambda h: h['monthly'].clear(),
            lambda h: h['daily'][0].update(date='2026-10-18'),
            lambda h: h['daily'][0].update(tokens=99),
            lambda h: h['daily'][0]['perClient']['dsh'].update(tokens=99),
            lambda h: h['daily'][0]['perClient']['dsh'].update(messages=1),
            lambda h: h['daily'][0]['perClient'].clear(),
            lambda h: h['daily'][0]['perModel'].clear(),
            lambda h: h['monthly'][0].update(tokens=119),
            lambda h: h['summary'].update(totalTokens=119),
            lambda h: h['summary'].update(totalCost=1.49),
            lambda h: h['daily'][0].update(cost=1.25 - 1e-9),
            lambda h: h['daily'][0].update(tokens=True),
            lambda h: h['daily'].append(copy.deepcopy(h['daily'][0])),
            lambda h: h['monthly'].append(copy.deepcopy(h['monthly'][0])),
            lambda h: h['daily'][0].update(date='2026-02-30'),
            lambda h: h['monthly'][0].update(month='2026-13'),
            lambda h: h['daily'][0].pop('date'),
            lambda h: h['daily'].append(None),
            lambda h: h['daily'][0].update(cost=float('nan')),
            lambda h: h['daily'][0].update(cost=float('inf')),
            lambda h: h['daily'][0].update(cost=-1),
            lambda h: h['summary'].update(currentStreak=-1),
            lambda h: h['daily'][0].update(intensity=8),
            lambda h: h['daily'][0].update(tokenIntensity=-1),
            lambda h: h['daily'][0].update(costIntensity=5),
            lambda h: h['daily'][0].update(tokenIntensity=True),
            lambda h: h['summary'].update(favoriteModel=None),
        ]
        for i, mutate in enumerate(mutations):
            with self.subTest(case=i):
                old = history(); new = copy.deepcopy(old); mutate(new)
                self.assertFalse(m.history_preserved(old, new))

    def test_roundoff_is_cost_only_and_bounded_in_absolute_and_ulp_units(self):
        for field in ['cost', 'costUsd', 'totalCost']:
            self.assertTrue(m.history_preserved({field: 1.25}, {field: math.nextafter(1.25, 0)}))
        for field in ['tokens', 'totalTokens', 'inputTokens', 'outputTokens',
                      'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'messages']:
            with self.subTest(field=field):
                self.assertFalse(m.history_preserved({field: 1.25}, {field: math.nextafter(1.25, 0)}))
        for old, new in [(1e-15, 0), (1e8, math.nextafter(1e8, 0)),
                         (1.25, 1.25 - 1e-13), (1.25, True), (True, 1.25),
                         (float('nan'), 1), (1, float('inf'))]:
            with self.subTest(old=old, new=new):
                self.assertFalse(m.history_preserved({'cost': old}, {'cost': new}))
        # Do not broaden generic archive/accounting or arbitrary list semantics.
        self.assertFalse(m.preserved({'cost': 1.25}, {'cost': math.nextafter(1.25, 0)}))
        self.assertFalse(m.history_preserved({'unknown': [1, 2]}, {'unknown': [2]}))

    def test_duplicate_or_invalid_baseline_rows_fail_closed(self):
        for mutate in [lambda h: h['daily'].append(copy.deepcopy(h['daily'][0])),
                       lambda h: h['daily'][0].update(date='not-a-date'),
                       lambda h: h['daily'][0].update(cost=float('nan'))]:
            old = history(); mutate(old)
            self.assertFalse(m.history_preserved(old, copy.deepcopy(old)))

    def test_legacy_keyed_history_retains_every_key_and_counter(self):
        old = {'daily': {'2026-10-19': {'tokens': 100, 'cost': 1.25}}}
        new = copy.deepcopy(old); new['daily']['2026-10-19']['tokens'] = 101
        new['daily']['2026-10-19']['cost'] = math.nextafter(1.25, 0)
        self.assertTrue(m.history_preserved(old, new))
        new['daily'].clear()
        self.assertFalse(m.history_preserved(old, new))


class HistoryGateIntegrationTest(unittest.TestCase):
    setUp = controller_tests.ControllerTest.setUp
    tearDown = controller_tests.ControllerTest.tearDown
    engine = controller_tests.ControllerTest.engine

    def test_verify_state_uses_history_gate_and_still_rejects_loss(self):
        file = Path(self.cfg['hubDataDir'], 'devices.json')
        hub = json.loads(file.read_text()); hub['devices']['DXP4800']['history'] = history()
        file.write_text(json.dumps(hub)); engine, _ = self.engine()
        snapshot = engine.snapshot(Path(self.cfg['controlDir']) / 'history-snapshot')
        new = copy.deepcopy(hub)
        rows = new['devices']['DXP4800']['history']['daily']
        rows[0]['cost'] = math.nextafter(1.25, 0); rows[1]['tokens'] = 21; rows.reverse()
        file.write_text(json.dumps(new)); m.verify_state(self.cfg, snapshot)
        rows[0]['tokens'] = 19; file.write_text(json.dumps(new))
        with self.assertRaisesRegex(m.Refused, 'hub_history_lost'):
            m.verify_state(self.cfg, snapshot)

class CappedHistoryRolloverTest(unittest.TestCase):
    setUp = controller_tests.ControllerTest.setUp
    tearDown = controller_tests.ControllerTest.tearDown
    engine = controller_tests.ControllerTest.engine

    def full_history(self, sparse=False):
        import datetime as dt
        today = dt.date.fromisoformat(m.local_window('today'))
        yesterday = today - dt.timedelta(days=1)
        days = [{'date': (yesterday - dt.timedelta(days=369-i)).isoformat(),
                 'tokens': 10, 'cost': 0.125} for i in range(370)]
        if sparse:
            days = days[::29]
        months = {}
        for row in days:
            month = row['date'][:7]
            bucket = months.setdefault(month, {'month': month, 'tokens': 0, 'cost': 0})
            bucket['tokens'] += 10; bucket['cost'] += 0.125
        return {'daily': days, 'monthly': list(months.values()),
                'summary': {'totalTokens': len(days) * 10, 'totalCost': len(days) * 0.125,
                            'activeDays': len(days), 'longestStreak': 1 if sparse else 370, 'peakDayTokens': 10}}

    def test_sparse_window_boundary_expiry_uses_calendar_dates_not_row_count(self):
        import datetime as dt
        today = m.local_window('today')
        previous_day = (dt.date.fromisoformat(today) - dt.timedelta(days=1)).isoformat()
        old = self.full_history(sparse=True)  # Inactive dates need not have rows.
        new = copy.deepcopy(old); new['daily'].pop(0)
        self.assertTrue(m.history_preserved(old, new, daily_window=(previous_day, today)))
        new = copy.deepcopy(old); new['daily'].pop(1)
        self.assertFalse(m.history_preserved(old, new, daily_window=(previous_day, today)))

    def test_only_proven_capped_window_expiry_with_durable_totals_is_allowed(self):
        import datetime as dt
        today = m.local_window('today')
        yesterday = (dt.date.fromisoformat(today) - dt.timedelta(days=1)).isoformat()
        file = Path(self.cfg['hubDataDir'], 'devices.json')
        old = json.loads(file.read_text())
        record = old['devices']['DXP4800']; record['history'] = self.full_history()
        record['periodWindows'] = {'today': {'key': yesterday}}
        file.write_text(json.dumps(old)); engine, _ = self.engine()
        snapshot = engine.snapshot(Path(self.cfg['controlDir']) / 'capped-snapshot')
        new = copy.deepcopy(old); current = new['devices']['DXP4800']
        current['periodWindows']['today']['key'] = today
        current['history']['daily'].pop(0)
        current['history']['summary'].update(activeDays=369, longestStreak=369)
        file.write_text(json.dumps(new)); m.verify_state(self.cfg, snapshot)
        # A new zero-usage today row is also valid; a missing active day is not.
        current['history']['daily'].append({'date': today, 'tokens': 0, 'cost': 0})
        file.write_text(json.dumps(new)); m.verify_state(self.cfg, snapshot)
        for mutate in [
            lambda c: c['history']['daily'].pop(20),
            lambda c: c['history']['monthly'].pop(0),
            lambda c: c['history']['summary'].update(totalTokens=3699),
            lambda c: c['history']['summary'].update(totalCost=46),
            lambda c: c['periodWindows']['today'].update(key=yesterday),
        ]:
            with self.subTest(mutation=mutate):
                bad = copy.deepcopy(new); mutate(bad['devices']['DXP4800'])
                file.write_text(json.dumps(bad))
                with self.assertRaisesRegex(m.Refused, 'hub_history_lost'):
                    m.verify_state(self.cfg, snapshot)
        # No expiry allowance for a short history, even across midnight.
        old['devices']['DXP4800']['history']['daily'] = old['devices']['DXP4800']['history']['daily'][-2:]
        file.write_text(json.dumps(old)); snapshot = engine.snapshot(Path(self.cfg['controlDir']) / 'short-snapshot')
        new = copy.deepcopy(old); current = new['devices']['DXP4800']
        current['periodWindows']['today']['key'] = today; current['history']['daily'].pop(0)
        file.write_text(json.dumps(new))
        with self.assertRaisesRegex(m.Refused, 'hub_history_lost'):
            m.verify_state(self.cfg, snapshot)
