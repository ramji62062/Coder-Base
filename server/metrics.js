// Lightweight in-process reliability metrics for CodeTogether's
// editor/terminal infrastructure. Exposed via /api/reliability.

const startedAt = Date.now();

const counters = {
  containers_created: 0,
  containers_create_failed: 0,
  pty_spawns: 0,
  pty_spawn_failed: 0,
  health_recreates: 0,
  oom_kills_detected: 0,
  ws_connects: 0,
  ws_disconnects: 0,
  ws_reconnects_recovered: 0,
  terminal_attach_ok: 0,
  terminal_attach_failed: 0,
  rooms_reaped_idle: 0,
  client_save_failures: 0,
  client_save_retries: 0,
};

const gauges = {};

const lastErrors = []; // ring buffer of recent failure events

function inc(name, by = 1) {
  if (name in counters) counters[name] += by;
}

function setGauge(name, value) {
  gauges[name] = value;
}

function recordError(kind, detail) {
  const entry = { at: new Date().toISOString(), kind, detail: String(detail).slice(0, 300) };
  lastErrors.push(entry);
  if (lastErrors.length > 100) lastErrors.shift();
  console.warn(`[reliability] ${kind}: ${entry.detail}`);
}

function snapshot() {
  return {
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    counters,
    gauges,
    recentErrors: lastErrors.slice(-25),
  };
}

module.exports = { inc, setGauge, recordError, snapshot };
