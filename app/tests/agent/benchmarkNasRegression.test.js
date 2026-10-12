'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, median, compare, parse } = require('../../scripts/benchmark-nas-regression');
test('benchmark uses fixed Hermes-only fixture and checks repeated RSS regressions', () => {
  const data = fixture(12);
  assert.equal(data.entries.length, 12);
  assert.equal(new Set(data.entries.map(row => row.sessionId)).size, 12);
  assert.ok(data.entries.every(row => row.client === 'hermes'));
  assert.equal(JSON.stringify(data), JSON.stringify(fixture(12)));
  assert.equal(median([9, 1, 3]), 3);
  assert.equal(median([8, 2]), 5);
  const makeRun = rss => ({ coldMs: 20, peakMs: 20, sustainedTickMedianMs: 20,
    phases: Object.fromEntries(['cold', 'idle', 'peak', 'sustained'].map(phase => [phase,
      Object.fromEntries(['agent', 'watcher', 'hub'].map(role => [role, { maxRssMiB: rss }]))])) });
  const baseline = { runs: [makeRun(80), makeRun(81), makeRun(82)] };
  assert.equal(compare(baseline, { runs: [makeRun(80), makeRun(90), makeRun(85)] }).status, 'passed');
  const regression = compare(baseline, { runs: [makeRun(140), makeRun(145), makeRun(150)] });
  assert.equal(regression.status, 'regression');
  assert.equal(regression.findings.filter(row => !row.passed).length, 12);
  const slow = makeRun(81);
  slow.peakMs = 500;
  const timing = compare(baseline, { runs: [slow, slow, slow] });
  assert.deepEqual(timing.findings.filter(row => !row.passed).map(row => row.metric), ['peakMs']);
});
test('benchmark refuses single snapshots and invalid duration', () => {
  assert.throws(() => parse(['--repeats', '1']), /invalid --repeats/);
  assert.throws(() => parse(['--sustain-ms', 'NaN']), /invalid --sustain-ms/);
});
