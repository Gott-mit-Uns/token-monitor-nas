# Synthetic NAS runtime performance regression

`benchmark-nas-regression.js` executes the real Node collector and Agent runtime,
SQLite session archive, NAS upload/deduplication functions, Node Hub, and the
production independent Watcher process. Only the Tokscale parser boundary is
injected with deterministic Hermes session output. It does not load `.env`,
inherit secrets or scan settings, read real Hermes data, or contact a real Hub.
Temporary data is deleted after each run. The device identity is fixed to
`synthetic-benchmark`; every upload and final Hub record must preserve all fixture
sessions and the exact expected token total. The SQLite archive must exist.

Requires Node with `node:sqlite`, installed production dependencies in both app
folders, and `ps` with `-axo pid=,ppid=,rss=` support (native Linux/macOS). Run
baseline and candidate on the same architecture, machine and Node executable.
For release gates, run independently on native Linux amd64 and arm64; macOS
arm64 results cannot substitute for either Linux gate.

```sh
node app/scripts/benchmark-nas-regression.js \
  --baseline /path/to/baseline/app \
  --candidate /path/to/candidate/app \
  --repeats 3 --sessions 1000 \
  --idle-ms 1500 --sustain-ms 15000 --sample-ms 50 --tick-ms 250 \
  --output /path/to/synthetic-performance.json
```

A CI job can check out baseline `2fdfbc57dd11fd0838aff2820504da2d2d67fcf3`
in a separate folder, install each folder's locked production dependencies, and
run the candidate's tool with the two `app` paths. No baseline source edits are
needed. Alternate baseline/candidate run order reduces monotonic load bias. The
tool refuses a single repeat, identifies the actual forked `watcherWorker.js`
PID, verifies separate-process readiness, and rejects Watcher replacement after
cold readiness. Each side's entire `src` digest and relevant dependency versions
are captured; source changes during measurement fail the run. Persist the JSON
as a CI artifact, including failures; runner contention should be investigated
and repeated on the same controlled environment before changing thresholds.

Output contains cold-start time to the first successful delivery; collection
peak tick and median sustained tick time; Agent/Watcher/Hub sampled median,
maximum and final RSS in cold, idle, peak and sustained phases; and comparison
findings. Default regression allowance is `baseline × 1.25 + 16 MiB` for RSS and
`baseline × 1.25 + 100 ms` for time, evaluated on medians across repeated runs.
A failed comparison returns status `regression` and exit code 1. A run without
`--baseline` returns `not_compared`; it is useful for fixture smoke tests only.
The comparison tolerances are engineering gates, not evidence of improvement.

## Interpretation limits

- This measures the common runtime pipeline, not the complete CLI `agent.js`
  startup, health marker, consent negotiator or source-title SQL lookup. Those
  wrappers have separate functional coverage. It does not measure Rust Tokscale
  Hermes SQLite parsing or subprocess RSS.
- The fixture's `state.db` is only a synthetic file-event target; native database
  parsing is deliberately injected. Pricing and external account endpoints are
  excluded. Fixture input/output/cache-read counts are exact, per-session and
  deterministic; history uses the measurement's UTC day.
- The sustained phase is a short CI soak. It cannot establish memory leak
  absence or stability over hours/days on real NAS hardware. Increase
  `--sustain-ms` for longer controlled experiments and retain multiple runs.
- RSS is sampled through the OS; brief allocation peaks can occur between
  samples. The reported peak is a sampled maximum, not allocator high-water.
- One normal SSE client and one Windows gzip client drain data during peak/soak.
  Slow-reader backpressure and reconnection are covered by functional tests;
  this benchmark does not prove delivery through a real reverse proxy.
- CPU time and I/O throughput are not reported. Wall time includes upload and
  archive work in the controlled local pipeline. Comparing environments or
  extrapolating sampled savings to production would be unsupported.
