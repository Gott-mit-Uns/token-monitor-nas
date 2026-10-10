'use strict';

function createWindowsMetrics(now = Date.now) {
  const startedAt = new Date(now()).toISOString();
  const requests = Object.create(null);
  const events = Object.create(null);
  let encodedStreamBodyBytes = 0;
  let gzipStreamBodyBytes = 0;
  let identityStreamBodyBytes = 0;
  let logicalEventBytes = 0;
  let streamsOpened = 0;
  let lastFullSnapshotAt = null;
  function category(path) {
    if (path === '/api/stats/stream') return 'statsStream';
    if (path === '/api/stream/status') return 'diagnostics';
    if (path === '/api/stats') return 'stats';
    if (path === '/api/history') return 'history';
    if (path.startsWith('/api/devices')) return 'devices';
    if (path.startsWith('/api/sync/')) return 'sync';
    if (path === '/api/subscriptions') return 'subscriptions';
    if (path === '/api/ingest') return 'ingest';
    if (path === '/api/health') return 'health';
    return 'other';
  }
  function request(req, res, path) {
    const key = `${['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER'} ${category(path)}`;
    const row = requests[key] ||= { requests: 0, encodedBodyBytes: 0 };
    row.requests++;
    const count = chunk => { if (typeof chunk === 'string' || Buffer.isBuffer(chunk) || ArrayBuffer.isView(chunk)) {
      row.encodedBodyBytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength;
    } };
    const write = res.write;
    const end = res.end;
    res.write = function(chunk, ...args) { count(chunk); return write.call(this, chunk, ...args); };
    res.end = function(chunk, ...args) { count(chunk); return end.call(this, chunk, ...args); };
  }
  function frame(event, bytes) { events[event] = (events[event] || 0) + 1; logicalEventBytes += bytes; }
  function body(bytes, gzip) {
    encodedStreamBodyBytes += bytes;
    if (gzip) gzipStreamBodyBytes += bytes;
    else identityStreamBodyBytes += bytes;
  }
  function snapshot() { return { startedAt, streamsOpened, events: { ...events }, lastFullSnapshotAt,
    encodedStreamBodyBytes, gzipStreamBodyBytes, identityStreamBodyBytes, logicalEventBytes,
    requests: Object.fromEntries(Object.entries(requests).map(([key, row]) => [key, { ...row }])) }; }
  return { request, frame, body, open: () => streamsOpened++,
    full: (_reason, at) => { lastFullSnapshotAt = new Date(at).toISOString(); }, snapshot };
}

module.exports = { createWindowsMetrics };
