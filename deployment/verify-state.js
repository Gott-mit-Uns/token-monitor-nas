'use strict';
// Evaluated with node -e inside an existing container. Return no environment/data.
const fs = require('node:fs');
const path = require('node:path');
const { pidFilePath } = require('./src/shared/config');
const { assess, processIdentity } = require('./src/agent/nasHealth');
const headers = process.env.TOKEN_MONITOR_SECRET ? { authorization: `Bearer ${process.env.TOKEN_MONITOR_SECRET}` } : {};
async function hub() {
  const base = 'http://127.0.0.1:' + (process.env.TOKEN_MONITOR_PORT || '17321');
  const response = await fetch(`${base}/api/devices`, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('API');
  const body = await response.json();
  const devices = Array.isArray(body) ? body : body.devices;
  if (!Array.isArray(devices)) throw new Error('Devices');
  const identities = values => values.map(x => x.deviceId || x.id).sort();
  const expected = identities(devices);
  const windowsEnabled = process.env.TOKEN_MONITOR_WINDOWS_STREAM_ENABLED === '1';
  const endpoint = windowsEnabled ? '/windows/api/stats/stream' : '/api/stats/stream';
  for (let i = 0; i < 2; i++) {
    const stream = await fetch(`${base}${endpoint}`, { headers: { ...headers, 'accept-encoding': windowsEnabled ? 'gzip' : 'identity' }, signal: AbortSignal.timeout(10000) });
    if (!stream.ok || (windowsEnabled && stream.headers.get('content-encoding') !== 'gzip')) throw new Error('SSE');
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (!text.includes('\n\n')) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('SSE ended');
      text += decoder.decode(chunk.value, { stream: true });
      if (text.length > 16 * 1024 * 1024) throw new Error('SSE too large');
    }
    const firstEvent = text.slice(0, text.indexOf('\n\n'));
    const data = firstEvent.split('\n').filter(x => x.startsWith('data:')).map(x => x.slice(5).trim()).join('\n');
    const payload = JSON.parse(data);
    if (payload.type !== 'stats' || !Array.isArray(payload.stats?.devices) || JSON.stringify(identities(payload.stats.devices)) !== JSON.stringify(expected)) throw new Error('SSE device mismatch');
    await reader.cancel();
  }
  return { authenticatedApi: true, windowsEnabled, gzipSse: windowsEnabled, sseReconnect: true };
}
async function agent() {
  const pid = Number(fs.readFileSync(pidFilePath(), 'utf8'));
  const state = JSON.parse(fs.readFileSync(path.join(path.dirname(pidFilePath()), 'nas-health.json'), 'utf8'));
  const health = assess(state, Date.now(), 900000, { pid, identity: processIdentity(pid) });
  // Require a real direct child of the current collector. Do not match our own
  // node -e command line, which contains this source text.
  const watcher = fs.readdirSync('/proc').filter(x => /^\d+$/.test(x)).some(x => {
    try {
      const status = fs.readFileSync(`/proc/${x}/status`, 'utf8');
      const parent = Number(status.match(/^PPid:\s+(\d+)$/m)?.[1]);
      const command = fs.readFileSync(`/proc/${x}/cmdline`, 'utf8').split('\0');
      return parent === pid && command.some(arg => /(?:^|\/)watcherWorker\.js$/.test(arg));
    } catch { return false; }
  });
  const base = String(process.env.TOKEN_MONITOR_HUB_URL || 'http://127.0.0.1:17321').replace(/\/$/, '');
  const response = await fetch(`${base}/api/devices`, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Hub device probe');
  const body = await response.json();
  const devices = Array.isArray(body) ? body : (body.devices || []);
  const id = process.env.TOKEN_MONITOR_DEVICE_ID;
  const record = Array.isArray(devices) ? devices.find(x => x.deviceId === id || x.id === id) : devices[id];
  return { collection: health.collection, upload: health.upload, startedAt: state.startedAt,
    independentWatcher: watcher && process.env.TOKEN_MONITOR_WATCH_IN_PROCESS === '0', devicePresent: Boolean(record), receivedAt: Date.parse(record?.receivedAt) || 0 };
}
(process.argv[1] === 'hub' ? hub() : agent()).then(x => console.log(JSON.stringify(x))).catch(() => { console.log(JSON.stringify({ probe: 'failed' })); process.exitCode = 1; });
