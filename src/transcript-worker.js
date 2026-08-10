/**
 * transcript-worker.js — heavy JSONL transcript work OFF the main thread
 * (2.235.0, the userL "slow server read as mass session death" follow-up:
 * the event-loop spikes that degraded the whole instance were single-threaded
 * transcript work — 32MB tail parses on every attach/history load, GB-scale
 * line-index builds, full-file turn scans. CPU was never the bottleneck; the
 * ONE loop thread was).
 *
 * Same architecture as safe-fs.js: a worker executes the EXISTING sync
 * implementations (zero logic duplication — this file, run as a worker,
 * simply requires the adapter/session-store modules; their module-level
 * mtime+size caches live in the worker where the work happens), the main
 * thread awaits a compact reply. Ops return either small objects (gapInfo,
 * turns) or parsed record arrays (structured-clone deserialize on main is
 * several times cheaper than the file read + string build + JSON.parse it
 * replaces). If the pool is down, callers fall back to the sync inline path —
 * behavior identical, just without the isolation.
 */

'use strict';

const { parentPort, isMainThread } = require('worker_threads');

// The existing sync implementations — required lazily inside runOp so that
// loading THIS module from the main thread (for the inline fallback + pool
// construction) doesn't create a require cycle with adapters/codex.js.
function _codex() { return require('./adapters/codex'); }

function runOp(op, payload = {}) {
  switch (op) {
    case 'gapInfo': {
      // Builds/extends the worker-side line index as a side effect.
      return { result: _codex().jsonlGapInfo(payload.fp) };
    }
    case 'lineRange': {
      return { result: _codex().readJsonlLineRange(payload.fp, payload.startLine, payload.endLine) };
    }
    case 'userTurns': {
      return { result: _codex().scanJsonlUserTurns(payload.fp, payload.backend) };
    }
    case 'boundedParsed': {
      // readJsonlBounded + line split + JSON.parse, all off-loop. Returns raw
      // parsed records; the caller applies its own filtering (session-store
      // filters subagent records) so the semantics stay in ONE place... except
      // filtering here would ship less across the thread boundary — the caller
      // passes dropSubagent to keep the wire payload minimal.
      const { readJsonlBounded } = _codex();
      const content = readJsonlBounded(payload.fp, { tailOnly: payload.tailOnly !== false });
      const records = [];
      const dropSub = !!payload.dropSubagent;
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          // EXACT parity with session-store isSubagentMessage — a superset
          // here would drop records the sync fallback keeps (cache divergence)
          if (dropSub && (msg.parent_tool_use_id || msg.isSidechain)) continue;
          records.push(msg);
        } catch {}
      }
      return { result: records };
    }
    case '__sleep': { // test hook (deadline/restart path)
      const until = Date.now() + (payload.ms || 1000);
      while (Date.now() < until) { /* burn */ }
      return { result: true };
    }
    default:
      throw Object.assign(new Error('unknown transcript op: ' + op), { code: 'EBADOP' });
  }
}

if (!isMainThread && parentPort) {
  parentPort.on('message', ({ id, op, payload }) => {
    try {
      const { result } = runOp(op, payload);
      parentPort.postMessage({ id, ok: true, result });
    } catch (e) {
      parentPort.postMessage({ id, ok: false, error: { message: e.message, code: e.code } });
    }
  });
}

module.exports = { runOp };
