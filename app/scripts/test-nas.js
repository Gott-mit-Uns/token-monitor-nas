'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const agentTests = fs.readdirSync('tests/agent').filter(name => name.endsWith('.test.js')).map(name => `tests/agent/${name}`);
const sharedTests = ['orderedSink', 'deviceState', 'deviceRuntime', 'syncPayload', 'sessionUsageArchive', 'collectorPeriodWindows', 'sessionUsageArchiveStore', 'dailyHistoryArchive', 'hermesProfiles', 'usageRuntime', 'collectorHistory', 'collectorAnchorPersistence', 'watcherHost', 'collectorLoadGuards', 'usageThroughput', 'usage', 'syncContent', 'hubProtocol'];
const testArgs = ['--test', '--test-skip-pattern=^Worker:', ...agentTests, ...fs.readdirSync('tests/hub').filter(name => name.endsWith('.test.js')).map(name => `tests/hub/${name}`), ...sharedTests.map(name => `tests/shared/${name}.test.js`)];
// QEMU measures emulator speed, not the NAS runtime; the native amd64 job
// still enforces upstream's wall-clock archive performance assertion.
if (process.env.TOKEN_MONITOR_EMULATED_TESTS === 'arm64') {
  testArgs[1] = '--test-skip-pattern=^Worker:|reapplies a large session archive without repeatedly normalizing growing periods';
}
const result = spawnSync(process.execPath, testArgs, { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
