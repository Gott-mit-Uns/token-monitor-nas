'use strict';

const path = require('node:path');
const { resolveHermesHome, discoverHermesProfileScanPaths } = require('../shared/providers/hermes/profiles');
const { resolveSqlite, openDb } = require('../shared/sqliteReadOnly');

// Read only titles for sessions already in this snapshot. The upload overlay
// never changes counters, the collector anchor, or the local session archive.
function applyHermesSessionTitles(summary, options = {}) {
  const sqlite = resolveSqlite(options);
  if (!sqlite || !summary || typeof summary !== 'object') return summary;
  const periods = ['today', 'month'];
  const ids = new Set();
  for (const name of periods) {
    for (const session of Object.values(summary[name]?.sessions || {})) {
      if (session?.client === 'hermes' && typeof session.sessionId === 'string') ids.add(session.sessionId);
    }
  }
  if (!ids.size) return summary;
  const home = options.hermesHome || resolveHermesHome(options);
  const roots = [home, ...discoverHermesProfileScanPaths(home, options)];
  const titles = new Map();
  let failures = 0;
  for (const root of roots) {
    let db;
    try {
      db = openDb(path.join(root, 'state.db'), sqlite);
      const columns = new Set(db.prepare('PRAGMA table_info(sessions)').all().map(row => row.name));
      if (!columns.has('id') || !columns.has('title')) continue; // Older Hermes schemas remain compatible.
      const remaining = [...ids].filter(id => !titles.has(id));
      for (let start = 0; start < remaining.length; start += 200) {
        const batch = remaining.slice(start, start + 200);
        const rows = db.prepare(`SELECT id, title FROM sessions WHERE id IN (${batch.map(() => '?').join(',')})`).all(...batch);
        for (const row of rows) titles.set(row.id, typeof row.title === 'string' ? row.title.trim() : '');
      }
    } catch (_) {
      failures += 1;
    } finally {
      try { db?.close(); } catch (_) { /* A metadata read must not stop usage collection. */ }
    }
  }
  if (failures) options.logger?.(`[hermes-titles] Metadata unavailable for ${failures} database(s); usage collection continues.`);
  if (!titles.size) return summary;
  const result = { ...summary };
  for (const name of periods) {
    const period = summary[name];
    if (!period?.sessions) continue;
    const sessions = { ...period.sessions };
    for (const [key, session] of Object.entries(sessions)) {
      if (session?.client === 'hermes' && titles.has(session.sessionId)) {
        sessions[key] = { ...session, title: titles.get(session.sessionId) };
      }
    }
    result[name] = { ...period, sessions };
  }
  return result;
}

module.exports = { applyHermesSessionTitles };
