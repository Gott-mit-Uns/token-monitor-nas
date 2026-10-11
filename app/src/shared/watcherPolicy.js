'use strict';

// Watch construction is shared by the isolated process and the in-process host.
// Keep it independent of the collector: a file-event listener needs source paths
// and filters, not the usage parsers, pricing, archives or collection lifecycle.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { antigravityCliDataDir, canonicalWatchPath, clientSourceRoots, copilotExporterWatch } = require('./clientSources');
const { dirExists } = require('./clientSourceObservations');
const { normalizeCustomScanPaths } = require('./customScanPaths');
const { antigravityDataRoots } = require('./providers/antigravity/selfSync');
const { SELF_SYNC_KINDS } = require('./selfSyncThrottle');

// Sources that remain part of collection, health, and diagnostics but are too
// broad for a persistent recursive watcher. Kiro globalStorage accepts every
// `.chat`, `.json`, and extensionless file at any depth in tokscale, so a real
// tree can require thousands of native directory watches; after descriptor
// exhaustion the same tree becomes an even more expensive 2-second polling
// watch. Regular interval ticks (five minutes by default), manual refreshes, and
// hourly full reconciliation still scan it through the unchanged Kiro client.
const INTERVAL_ONLY_SOURCE_CHECK_IDS = new Set(['kiro-ide-globalstorage']);

// The watcher only ever wants paths, so it keeps its original shape rather than
// learning about check ids it would immediately discard.
function clientWatchCandidates(clientsCsv, options = {}) {
  const byClient = {};
  for (const [client, roots] of Object.entries(clientSourceRoots(clientsCsv, options))) {
    // The Copilot data root already keeps its `otel/` child through the
    // matcher below. Keep that child as a diagnostic/source check, but do not
    // hand both nested paths to chokidar or it may install two native watches
    // over the same tree.
    byClient[client] = roots
      .filter((root) => (
        !(client === 'copilot' && root.id === 'copilot-otel')
        && !INTERVAL_ONLY_SOURCE_CHECK_IDS.has(root.id)
      ))
      .map((root) => root.dir);
  }
  return byClient;
}

// Clients whose dirs are tokscale caches written only by our own maybeSync* calls.
// Watching them turns every tick into the trigger for the next one (issue #15).
const SELF_SYNCED_CLIENTS = new Set(SELF_SYNC_KINDS);

// Inside a Hermes home dir tokscale only reads the SQLite db; the rest is the
// Desktop App runtime (hermes-agent/node_modules/venv, logs, cache — 150k+ files
// for some users). A plain recursive watch of ~/.hermes pegged CPU at 100%+
// (issue #38). Watching the db files directly instead would miss the WAL/SHM
// sidecars Hermes creates after startup (no seconds-level refresh on a cold
// start), so we keep watching the dir but hand chokidar an `ignored` matcher
// that prunes everything under a Hermes home except the db family. chokidar
// never recurses into an ignored dir (so the runaway poll is gone), yet a
// newly created state.db-wal is still seen on the next top-level readdir.
const HERMES_DB_FILES = new Set(['state.db', 'state.db-wal', 'state.db-shm']);
// OpenClaw keeps each agent's usage sources in a small set of lanes under
// ~/.openclaw/agents/<agentId>: legacy/published JSONL under sessions/, doctor
// migration archives beside it, the current per-agent SQLite store, and Codex
// app-server rollouts under agent/codex-home and the legacy per-profile CLI
// homes at agent/cli-auth/codex/<profile>. The rest of an agent directory is
// runtime/workspace state and can contain dependency trees large enough to make
// chokidar allocate thousands of directory watches. Keep the official source
// lanes live; Tokscale's periodic full scan remains the fallback for a
// non-standard JSONL placed elsewhere under agents/.
const OPENCLAW_TRANSCRIPT_DIRS = new Set(['sessions', 'session-sqlite-import-archive']);
const OPENCLAW_AGENT_DB_WATCH_PATTERN = /^openclaw-agent\.sqlite(?:-(?:wal|shm))?$/;
// Both Codex homes an agent can own — `agent/codex-home` and the legacy
// `agent/cli-auth/codex/<profile>` — expose their rollouts under the same two
// directory names, so one set covers both.
const OPENCLAW_CODEX_HOME_DIRS = new Set(['sessions', 'archived_sessions']);
// OpenCode discovers only direct opencode.db / opencode-<channel>.db files.
// WAL/SHM are not database inputs to tokscale, but they are the live-write
// signals that must remain watched so a transaction committed before a
// checkpoint refreshes the usage view.
const OPENCODE_DB_WATCH_PATTERN = /^opencode(?:-[A-Za-z0-9._-]+)?\.db(?:-(?:wal|shm))?$/;
// MiMo keeps a multi-gigabyte log/ tree alongside its SQLite state files.
// A plain recursive watch of ~/.local/share/mimocode storms the watcher (every
// SQLite WAL/SHM transaction is a chokidar event, the log dir holds thousands
// of rotated files). Tokscale discovers mimocode.db and
// mimocode-<channel>.db directly under each data root; the sidecars are not
// parsed but must stay watched so a write through WAL/SHM triggers a refresh.
// Keep the home dir watched but ignore everything except that direct db family.
// The home root itself stays watched so a freshly created database or sidecar
// still surfaces on the next top-level readdir.
const MIMO_DB_WATCH_PATTERN = /^mimocode(?:-[A-Za-z0-9._-]+)?\.db(?:-(?:wal|shm))?$/;
// Kiro CLI and Zed expose one SQLite database at a known path. Keep their
// parent dirs watched so the database can appear after startup, but do not
// recurse through the application data trees around them.
const KIRO_DB_WATCH_PATTERN = /^data\.sqlite3(?:-(?:wal|shm))?$/;
const ZED_DB_WATCH_PATTERN = /^threads\.db(?:-(?:wal|shm))?$/;
// Copilot is two exact databases directly under ~/.copilot, not one: `data.db`
// (desktop) and `session-store.db` (CLI, tokscale's copilot_session_store
// parser). Both are `path.is_file()` reads upstream, so the directory stays the
// watch root and each file rides along with its WAL/SHM sidecars. Leaving
// session-store.db out of this pattern prunes it from the watcher, so CLI usage
// would only appear on the next full tick instead of within the refresh window.
const COPILOT_DB_WATCH_PATTERN = /^(?:data|session-store)\.db(?:-(?:wal|shm))?$/;
const ZCODE_DB_WATCH_PATTERN = /^db\.sqlite(?:-(?:wal|shm))?$/;
const CHERRY_STUDIO_DB_WATCH_PATTERN = /^cherrystudio\.sqlite(?:-(?:wal|shm))?$/;
const UNSLOTH_DB_WATCH_PATTERN = /^studio\.db(?:-(?:wal|shm))?$/;
// Bounded to sessions.db directly under each *default* Devin CLI root; the WAL
// and SHM sidecars ride along as the live-write signal, as with every other
// direct-database client. Tokscale's own discovery walks those roots to any
// depth, so a nested sessions.db still counts toward usage — it just does not
// get a watcher or a health check, which matches where the product actually
// installs. The acp-events roots stay recursive event trees.
const DEVIN_CLI_DB_WATCH_PATTERN = /^sessions\.db(?:-(?:wal|shm))?$/;
const GROK_UNIFIED_LOG_FILE = 'unified.jsonl';
// Tokscale scans only these two CodeBuddy extension log subtrees. Keep their
// recursive layout intact, but prune unrelated siblings under Logs before
// chokidar allocates watches for them.
const CODEBUDDY_EXTENSION_SOURCE_DIRS = new Set(['CodeBuddyIDE', 'VSCode']);
// Which parts of an Antigravity IDE home are worth an event. Not "what tokscale
// parses" — tokscale gets the token data over RPC from the running language
// server and only reads `brain/`+`conversations/` to enumerate session ids.
// These are the paths the IDE touches while a turn is in progress, so they are
// what tells us the synced cache went stale. The rest of the home is runtime and
// cache material (bin/, builtin/, crashes/, antigravity_state.pbtxt …) that
// would make every background write a scan trigger.
const ANTIGRAVITY_SOURCE_DIRS = new Set(['annotations', 'brain', 'conversations']);
const ANTIGRAVITY_SOURCE_FILES = new Set(['agyhub_summaries_proto.pb']);
// `brain/` is watched one level deep only. Its children are per-session working
// dirs holding plans, uploads and screenshots — on a 26-session home that is
// ~508 directories and ~780 files for ~4 changes a week, while the actual
// per-turn signal is `conversations/<id>.db-wal`. Recursing costs an inotify
// descriptor per directory on Linux, which is what makes the ENOSPC fallback to
// polling (sticky for the process) more likely, and once polling that whole tree
// gets stat'd every interval — the Hermes runaway of issue #38 in miniature.
// Watching `brain/` itself still catches a new session directory appearing.
const ANTIGRAVITY_SHALLOW_SOURCE_DIRS = new Set(['brain']);

// A watch policy answers one question about one source root: given a path
// inside it, does this source want the event? It never sees the root itself,
// which is always kept, so `parts` is a non-empty relative path already split.
//
// Roots overlap. An explicit CODEX_HOME can sit inside another client's data
// root, a custom Copilot exporter can name a file inside OpenCode's, and two
// clients can resolve to the same directory outright. chokidar's `ignored` is
// global to the instance, so every root containing a path shares one answer for
// it, and the only safe one is the union of what they read: prune when EVERY
// containing root declines the path, keep it as soon as one wants it.
//
// This replaced an ordered chain of per-client branches in which the first
// matching root answered for all of them, so overlap resolved by declaration
// order rather than by what tokscale reads. A bounded root pruned an
// equally-rooted recursive source out of existence, two bounded roots resolved
// by whichever branch was written first, and the exporter needed its own checks
// hoisted above the chain to survive a broader root declared over it.
const KEEP_EVERYTHING = () => false;
const EMPTY_SET = new Set();

// A custom root is whatever directory the user picked, and in practice that can
// be a whole projects folder (#857: ~1.1M files, mostly dependency and VCS
// trees). No agent writes a transcript into these, but every one of their
// directories costs a watch descriptor, and every file a stat once polling
// takes over. Tokscale still walks them, so a full scan misses nothing; only
// the live trigger is pruned. Built-in recursive roots keep their contract
// untouched, since their shape is the client's own.
const CUSTOM_ROOT_PRUNED_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', '.venv', 'venv', '__pycache__', '.tox'
]);
const pruneDependencyTrees = (parts) => parts.some((part) => CUSTOM_ROOT_PRUNED_DIRS.has(part));

// Tokscale opens one exact database directly under this root instead of walking
// it. Keep the direct children it names — including the WAL/SHM sidecars, which
// are the live-write signal even though tokscale never parses them as databases
// — so a database created later is still discovered, and never recurse into the
// runtime files beside it.
function directChildOnly(isSource) {
  return (parts) => parts.length > 1 || !isSource(parts[0]);
}

// Every source root of every tracked client, paired with its policy. Bounded
// roots are counted so a client set with nothing to prune can skip the matcher
// entirely rather than hand chokidar a predicate that always answers false.
function watchPolicyEntries(clientsCsv, options = {}) {
  const candidates = clientWatchCandidates(clientsCsv, options);
  const customScanPaths = normalizeCustomScanPaths(options.customScanPaths, {
    platform: options.platform || process.platform
  });
  // canonicalWatchPath must be applied here too: chokidar reports events under
  // whatever root it was handed, so a matcher built on the uncanonicalised path
  // would stop matching on Windows and silently un-prune the Hermes runtime
  // (issue #38) while the watch itself still worked.
  const canonicalRoot = (dir) => path.resolve(canonicalWatchPath(dir));
  const entries = [];
  const claimed = new Map();
  let boundedCount = 0;
  const customRoots = new Map(Object.entries(customScanPaths).map(([client, dirs]) => [
    client,
    new Set(dirs.map(canonicalRoot))
  ]));
  // Same-root duplicates within one client (Kiro's cased globalStorage spellings,
  // Zed's per-platform roots) collapse here. Duplicates ACROSS clients must not:
  // two policies on one directory is precisely the overlap the union resolves,
  // which is why `claimed` is keyed per client — an identical path under two
  // clients would otherwise let the bounded one swallow the recursive one, the
  // very failure this table replaced.
  const bound = (client, dirs, policy) => {
    if (!claimed.has(client)) claimed.set(client, new Set());
    const seen = claimed.get(client);
    // Built-in policies describe each client's default directory shape. A
    // custom root follows Tokscale's recursive extra-root contract instead,
    // even when it belongs to a client whose default root is tightly pruned.
    const boundedDirs = dirs.filter((dir) => !customRoots.get(client)?.has(canonicalRoot(dir)));
    for (const dir of boundedDirs) seen.add(dir);
    for (const root of new Set(boundedDirs.map(canonicalRoot))) {
      entries.push({ root, prefix: root + path.sep, policy });
      boundedCount += 1;
    }
  };
  const withBasename = (client, basename) =>
    (candidates[client] || []).filter((dir) => path.basename(dir) === basename);

  // Hermes: the SQLite trio is the only source, at any depth. Each explicit
  // watch root — the home AND every profile dir under it — is kept by the
  // matcher itself, so a profile's own database still reports.
  bound('hermes', candidates.hermes || [], (parts) => !HERMES_DB_FILES.has(parts[parts.length - 1]));

  bound('openclaw', candidates.openclaw || [], (parts) => {
    // The first level is the dynamic agent id. Keep it so newly created agents
    // can expose one of the bounded source lanes below.
    if (parts.length === 1) return false;
    if (OPENCLAW_TRANSCRIPT_DIRS.has(parts[1])) return false;
    if (parts[1] !== 'agent') return true;

    // Keep the parent so a fresh SQLite store, codex-home or cli-auth home can
    // appear after startup, then limit its contents to those sources.
    if (parts.length === 2) return false;
    if (parts.length === 3) {
      return parts[2] !== 'codex-home'
        && parts[2] !== 'cli-auth'
        && !OPENCLAW_AGENT_DB_WATCH_PATTERN.test(parts[2]);
    }
    if (parts[2] === 'codex-home') return !OPENCLAW_CODEX_HOME_DIRS.has(parts[3]);
    if (parts[2] !== 'cli-auth') return true;
    // Only `cli-auth/codex/<profile>` is a Codex home; `cli-auth/<other>` is an
    // authentication profile Tokscale never reads. The profile level is kept so
    // a login added after startup still reports, and `history.jsonl` beside its
    // session dirs is pruned the same way it is under codex-home.
    if (parts[3] !== 'codex') return true;
    if (parts.length <= 5) return false;
    return !OPENCLAW_CODEX_HOME_DIRS.has(parts[5]);
  });

  bound('copilot', withBasename('copilot', '.copilot'), (parts) => {
    if (parts[0] === 'otel') return false;
    if (parts.length === 1) return !COPILOT_DB_WATCH_PATTERN.test(parts[0]);
    return true;
  });
  bound('copilot', withBasename('copilot', 'workspaceStorage'), (parts) => {
    if (parts.length === 1) return false; // workspace hash dir
    if (parts[1] === 'chatSessions') return false;
    if (parts.length === 2 && parts[1] === 'workspace.json') return false;
    return true;
  });
  // Tokscale ingests exactly the file COPILOT_OTEL_FILE_EXPORTER_PATH names
  // (`path.is_file()`, no glob), but that file need not exist yet, so its parent
  // is what gets watched. The parent is an arbitrary user-chosen directory and
  // can be $HOME — everything in it except that one file is pruned, and
  // watchAttributionRootsForClients keeps it from becoming a copilot prefix.
  const exporter = copilotExporterWatch(os.homedir());
  if (exporter) bound('copilot', [exporter.dir], (_parts, resolved) => resolved !== exporter.canonicalFile);

  const antigravityEnabled = String(clientsCsv || '').split(',').map((value) => value.trim().toLowerCase()).includes('antigravity');
  bound('antigravity', antigravityEnabled ? antigravityDataRoots() : [], (parts) => {
    if (parts.length === 1) {
      return !ANTIGRAVITY_SOURCE_DIRS.has(parts[0]) && !ANTIGRAVITY_SOURCE_FILES.has(parts[0]);
    }
    const firstChild = parts[0];
    if (!ANTIGRAVITY_SOURCE_DIRS.has(firstChild)) return true;
    // brain/<session> is kept (a new session shows up there); brain/<session>/**
    // is not — see ANTIGRAVITY_SHALLOW_SOURCE_DIRS.
    if (ANTIGRAVITY_SHALLOW_SOURCE_DIRS.has(firstChild)) return parts.length > 2;
    return false;
  });

  const reasonixEnabled = String(clientsCsv || '').split(',').map((value) => value.trim().toLowerCase()).includes('reasonix');
  if (reasonixEnabled) {
    // These helpers share a module with the native-session parser. Other
    // clients must not load that parser and its usage dependencies just to watch.
    const { isReasonixNativeSessionSidecar, reasonixNativeSessionWatchRoots } = require('./providers/reasonix/sessions');
    bound(
      'reasonix',
      reasonixNativeSessionWatchRoots().filter(dirExists),
      (_parts, resolved) => {
        if (isReasonixNativeSessionSidecar(resolved)) return false;
        try {
          if (fs.statSync(resolved).isDirectory()) return false;
        } catch (_) {
          // A removed sidecar is still delivered by chokidar; other removed
          // files do not need to invalidate the native-session cache.
        }
        return true;
      }
    );
  }

  // Command Code recursively stores session transcripts below projects/, but
  // checkpoint streams use the same JSONL suffix and are explicitly skipped by
  // Tokscale. Keep directories for traversal and ordinary JSONL files (including
  // removed paths), while pruning checkpoints and unrelated project metadata.
  bound('commandcode', candidates.commandcode || [], (_parts, resolved) => {
    const name = path.basename(resolved);
    if (name.endsWith('.jsonl') && !name.endsWith('.checkpoints.jsonl')) return false;
    try {
      if (fs.statSync(resolved).isDirectory()) return false;
    } catch (_) {
      // Removed transcript paths are handled by the suffix check above.
    }
    return true;
  });

  bound('opencode', candidates.opencode || [], (parts) => {
    if (parts.length === 1) {
      // Keep the root's readdir visible for newly created channel DBs, but
      // do not descend into unrelated app files or directories.
      return parts[0] !== 'storage' && !OPENCODE_DB_WATCH_PATTERN.test(parts[0]);
    }
    if (parts[0] !== 'storage') return true;
    if (parts.length === 2) return parts[1] !== 'message';
    if (parts[1] !== 'message') return true;
    // Tokscale's legacy OpenCode source is storage/message/*/*.json. Keep
    // the message root, one session directory, and its direct JSON files;
    // prune deeper runtime trees before chokidar allocates more watches.
    if (parts.length === 3) return false;
    if (parts.length === 4) return !parts[3].endsWith('.json');
    return true;
  });

  // Tokscale reads only direct children of each MiMo root, so log/* and every
  // other recursive subtree is pruned before chokidar descends into it.
  bound('mimo', candidates.mimo || [], directChildOnly((name) => MIMO_DB_WATCH_PATTERN.test(name)));
  bound('cherrystudio', withBasename('cherrystudio', 'Data'), directChildOnly((name) => CHERRY_STUDIO_DB_WATCH_PATTERN.test(name)));
  bound('unsloth', candidates.unsloth || [], directChildOnly((name) => UNSLOTH_DB_WATCH_PATTERN.test(name)));
  bound('devin', withBasename('devin', 'cli'), directChildOnly((name) => DEVIN_CLI_DB_WATCH_PATTERN.test(name)));
  // The dual-source Grok scanner derives exactly logs/unified.jsonl from each
  // Grok home.
  bound('grok', withBasename('grok', 'logs'), directChildOnly((name) => name === GROK_UNIFIED_LOG_FILE));
  // ZCode v2 is a direct SQLite path, not a recursive project source.
  bound('zcode', withBasename('zcode', 'db'), directChildOnly((name) => ZCODE_DB_WATCH_PATTERN.test(name)));
  bound('kiro', withBasename('kiro', 'kiro-cli'), directChildOnly((name) => KIRO_DB_WATCH_PATTERN.test(name)));
  bound('zed', withBasename('zed', 'threads'), directChildOnly((name) => ZED_DB_WATCH_PATTERN.test(name)));
  bound('codebuddy', withBasename('codebuddy', 'Logs'), (parts) => !CODEBUDDY_EXTENSION_SOURCE_DIRS.has(parts[0]));

  // Everything left is a recursive transcript tree: tokscale walks it, so every
  // path inside it is a potential source. Copilot's built-in roots are bounded
  // above, but its custom roots still follow Tokscale's recursive extra-root
  // contract. The self-synced cache roots are never handed to chokidar in the
  // first place. The parse-local Antigravity CLI dir is added back explicitly —
  // it shares the umbrella client id but is written by `agy`, not by our sync.
  // Candidates are bare paths, so a client that names its own built-in root as
  // a custom path too would read as custom twice over. Whether a root is
  // built-in comes from the source list instead, which still says so.
  const builtInBySource = new Map(Object.entries(clientSourceRoots(clientsCsv, options)).map(([client, roots]) => [
    client,
    new Set(roots.filter((root) => !root.custom).map((root) => canonicalRoot(root.dir)))
  ]));
  const isCustomOnly = (client, root) => Boolean(customRoots.get(client)?.has(root))
    && !builtInBySource.get(client)?.has(root);
  const recursive = [
    ...Object.entries(candidates)
      .flatMap(([client, dirs]) => dirs
        .filter((dir) => (
          (client !== 'copilot' || customRoots.get(client)?.has(canonicalRoot(dir)))
          && (!SELF_SYNCED_CLIENTS.has(client) || customScanPaths[client]?.includes(dir))
          && !(claimed.get(client) || EMPTY_SET).has(dir)
        ))
        .map((dir) => ({ root: canonicalRoot(dir), custom: isCustomOnly(client, canonicalRoot(dir)) }))),
    ...(antigravityEnabled && dirExists(antigravityCliDataDir())
      ? [{ root: canonicalRoot(antigravityCliDataDir()), custom: false }]
      : [])
  ];
  // A directory that is a built-in root for any client keeps everything, even
  // where it is also named as a custom root, by that client or another: the
  // built-in contract is the one that must hold.
  const builtInRoots = new Set(recursive.filter((entry) => !entry.custom).map((entry) => entry.root));
  for (const root of builtInRoots) {
    entries.push({ root, prefix: root + path.sep, policy: KEEP_EVERYTHING });
  }
  for (const root of new Set(recursive.filter((entry) => entry.custom).map((entry) => entry.root))) {
    if (builtInRoots.has(root)) continue;
    entries.push({ root, prefix: root + path.sep, policy: pruneDependencyTrees });
    boundedCount += 1;
  }
  return { entries, boundedCount };
}

function watchIgnoreMatcher(clientsCsv, options = {}) {
  const { entries, boundedCount } = watchPolicyEntries(clientsCsv, options);
  if (boundedCount === 0) return undefined;
  return (target) => {
    const resolved = path.resolve(target);
    let contained = false;
    for (const { root, prefix, policy } of entries) {
      // A watch root is a source in its own right — a Hermes profile dir inside
      // the Hermes home, the parent of a database created later — so it survives
      // whatever the roots around it would say about a path at that depth.
      if (resolved === root) return false;
      if (!resolved.startsWith(prefix)) continue;
      contained = true;
      if (!policy(path.relative(root, resolved).split(path.sep), resolved)) return false;
    }
    return contained; // a path under no source root at all is never ignored
  };
}

// Escape hatch for filesystems that never deliver native events — network
// mounts, some FUSE drivers, container bind mounts. chokidar has its own
// CHOKIDAR_USEPOLLING override, but that is chokidar's surface, not ours: it
// is undocumented for our users and can change with a dependency bump, so
// support asks would have no stable answer. Resolved here rather than in each
// entry point so the widget and the headless agent cannot drift apart.
// Tri-state on purpose: unset must fall through to the caller's value, which
// is why parseBoolean's fallback semantics don't fit. The default is native on
// every platform — chokidar 4 has no per-platform backend left to differ on,
// and the failure cases it cannot cover are handled by the watch-descriptor
// fallback below rather than by pre-emptively polling everywhere.
//
// Returns undefined when unset, which is what keeps that tri-state readable to
// callers that need to tell "no opinion" from an explicit "never poll".
function watchPollingEnvOverride(env = process.env) {
  const raw = String(env.TOKEN_MONITOR_WATCH_POLLING ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  return !['0', 'false', 'no', 'off'].includes(raw);
}

// Whether the environment rules polling out, resolved in the same order as
// resolveWatchUsePolling so the two can never disagree about who decides.
function watchPollingForbidden(env = process.env) {
  const chokidarOverride = chokidarPollingEnv(env);
  if (chokidarOverride !== undefined) return chokidarOverride === false;
  return watchPollingEnvOverride(env) === false;
}

function resolveWatchUsePolling(preferred, env = process.env) {
  // chokidar's own variable overrides whatever we pass it, so it has to win
  // here too or diagnostics would report native events while chokidar polls.
  const chokidarOverride = chokidarPollingEnv(env);
  if (chokidarOverride !== undefined) return chokidarOverride;
  const override = watchPollingEnvOverride(env);
  if (override !== undefined) return override;
  if (typeof preferred === 'boolean') return preferred;
  return false;
}

// Kernel watch descriptors are a per-user budget shared with every other
// watcher on the machine (inotify on Linux, file descriptors on macOS/BSD), and
// editors are the usual heavy consumer — a busy Linux desktop can hand us
// ENOSPC on startup through no fault of ours. chokidar reports that
// asynchronously on the watcher, so without this the watch would just stop
// delivering events and live mode would silently decay to hourly
// reconciliation. Polling needs no descriptors at all, which makes it the
// correct degraded mode rather than merely a slower one. An explicit
// TOKEN_MONITOR_WATCH_POLLING=0 opts out: with native events now the default
// everywhere, suppressing this fallback is the only thing that direction of the
// override still does.
const WATCH_DESCRIPTOR_ERROR_CODES = new Set(['ENOSPC', 'EMFILE', 'ENFILE']);

// Polling needs no descriptors, but it holds a stat watcher per path and stats
// every one of them each interval, so its cost grows with the tree rather than
// with activity. Over a tree large enough to have exhausted the descriptors in
// the first place, that took the app down (#857: the main process grew by
// ~1.7 GB/min polling ~1.1M paths). Past this many entries the watcher is
// dropped instead and the interval loop collects on its own. A heavy user's
// default roots measured about 5.6k entries, so the limit leaves real headroom.
const WATCH_POLLING_ENTRY_LIMIT = 20000;

// Counts what chokidar would watch — the same roots through the same ignore
// matcher — and stops as soon as the count passes `limit`, so a million-entry
// tree costs no more than a small one. opendir rather than readdir, because a
// single flat directory can itself hold the whole tree.
//
// Symlinked directories are followed, as chokidar follows them by default, and
// every link is walked on its own: chokidar dedupes by the link's own path, not
// its target, so two links into one tree are two trees to poll. Nothing here
// dedupes cycles either. A link back into its own ancestry stops resolving at
// the kernel's symlink limit (ELOOP), which is where chokidar stops too, and
// failing that the counter itself ends the walk — refusing to poll, which is
// the safe answer for a tree chokidar could not finish either.
function watchEntriesExceed(dirs, ignored, limit) {
  let count = 0;
  const pending = [...dirs];
  while (pending.length > 0) {
    const dir = pending.pop();
    let handle;
    try { handle = fs.opendirSync(dir); } catch (_) { continue; }
    try {
      let entry;
      while ((entry = handle.readSync()) !== null) {
        const entryPath = path.join(dir, entry.name);
        if (ignored?.(entryPath)) continue;
        count += 1;
        if (count > limit) return true;
        if (entry.isDirectory()) {
          pending.push(entryPath);
        } else if (entry.isSymbolicLink()) {
          try {
            if (fs.statSync(entryPath).isDirectory()) pending.push(entryPath);
          } catch (_) {
            // A dangling or looping link is one entry and nothing below it.
          }
        }
      }
    } catch (_) {
      // A directory removed or made unreadable mid-walk is simply not counted.
    } finally {
      handle.closeSync();
    }
  }
  return false;
}

// chokidar reads CHOKIDAR_USEPOLLING after the options it is handed and lets it
// win, so the polling mode it actually runs can differ from the one we asked
// for. Parsed exactly as chokidar 4 parses it; undefined when unset.
function chokidarPollingEnv(env = process.env) {
  const raw = env.CHOKIDAR_USEPOLLING;
  if (raw === undefined) return undefined;
  const lower = String(raw).toLowerCase();
  if (lower === 'false' || lower === '0') return false;
  if (lower === 'true' || lower === '1') return true;
  return Boolean(lower);
}

// Reported in place of a watcher when polling would cover more than the limit,
// or when the owner required polling and the environment forbids it. The
// collector answers either by dropping to interval collection.
const WATCH_POLLING_LIMIT_CODE = 'watch-polling-limit';
const WATCH_POLLING_UNAVAILABLE_CODE = 'watch-polling-unavailable';
const WATCH_REFUSAL_CODES = new Set([WATCH_POLLING_LIMIT_CODE, WATCH_POLLING_UNAVAILABLE_CODE]);

// The one place a chokidar instance is created, in the watch process and in the
// in-process fallback alike. The bound lives here rather than in the collector
// because the host can switch to polling on its own (a watch process that never
// confirmed its exit), and a check the host can route around bounds nothing.
function openWatch(chokidar, config = {}) {
  const ignored = watchIgnoreMatcher(config.clients, { customScanPaths: config.customScanPaths });
  const limit = Number.isInteger(config.pollingEntryLimit) && config.pollingEntryLimit >= 0
    ? config.pollingEntryLimit
    : WATCH_POLLING_ENTRY_LIMIT;
  // Bounded on the mode that will really run, through the same resolver every
  // other watch decision uses: CHOKIDAR_USEPOLLING, then our own override, then
  // what was asked for.
  const usePolling = resolveWatchUsePolling(config.usePolling === true);
  // `requirePolling` is not a preference: the host sets it when native
  // descriptors from a previous watcher may still be held, so falling through
  // to native here would put two sets in flight. Not watching is the safe answer.
  if (config.requirePolling === true && !usePolling) {
    const error = new Error('polling required but forbidden by the environment');
    error.code = WATCH_POLLING_UNAVAILABLE_CODE;
    throw error;
  }
  if (usePolling && watchEntriesExceed(config.dirs || [], ignored, limit)) {
    const error = new Error(`over ${limit} paths to poll`);
    error.code = WATCH_POLLING_LIMIT_CODE;
    throw error;
  }
  return chokidar.watch(config.dirs, watcherOptions(usePolling, ignored));
}

function watcherOptions(usePolling, ignored) {
  return {
    ignoreInitial: true,
    persistent: true,
    ...(usePolling
      ? { usePolling: true, interval: 2000, binaryInterval: 5000 }
      : { usePolling: false }),
    ...(ignored ? { ignored } : {}),
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 200 }
  };
}

module.exports = {
  clientWatchCandidates,
  SELF_SYNCED_CLIENTS,
  resolveWatchUsePolling,
  watchPollingForbidden,
  WATCH_DESCRIPTOR_ERROR_CODES,
  WATCH_POLLING_ENTRY_LIMIT,
  watcherOptions,
  watchIgnoreMatcher,
  openWatch,
  WATCH_POLLING_LIMIT_CODE,
  WATCH_POLLING_UNAVAILABLE_CODE,
  WATCH_REFUSAL_CODES
};
