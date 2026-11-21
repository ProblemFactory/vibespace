'use strict';
/**
 * THE TELEMETRY SUMMARIES' WORKER (B-360d unit 2, lane bl-keys-misc) — a script of its own on the «telemetry-summary» pool of
 * src/telemetry.js (a pool of one, a deadline): the Diagnostics report's read — the telemetry folder listed and its three newest
 * monthly files read — and their summing run HERE, never on the hub's loop (the owner's hub on 2.369.413: one hold of 5.7 s at
 * that read, on the data folder's network mount). Ops: telemetrySummary (the events-* shards → summarizeEvents) and
 * centralSummary (the central-* shards → summarizeCentral), the same PURE functions src/telemetry.js exports — the same answer,
 * field for field. A file that cannot be read is skipped, as the summary on the loop skipped it.
 */
const fs = require('fs');
const path = require('path');
const { parentPort, isMainThread } = require('worker_threads');

function shardsOf(dir, re) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => re.test(f)).sort().slice(-3); } catch { }
  const texts = [];
  for (const fn of files) { try { texts.push(fs.readFileSync(path.join(dir, fn), 'utf-8')); } catch { } }
  return texts;
}

function runOp(op, payload = {}) {
  const T = require('./telemetry.js');
  const { path: dir, days, now } = payload;   // r887: the folder rides as `path` — the pool's mount door and hung-path memory read it
  switch (op) {
    case 'telemetrySummary': return { result: T.summarizeEvents(shardsOf(dir, T.SHARD_RE.events), { days, now }) };
    case 'centralSummary': return { result: T.summarizeCentral(shardsOf(dir, T.SHARD_RE.central), { days, now }) };
    default: throw Object.assign(new Error('unknown telemetry-summary op: ' + op), { code: 'EBADOP' });
  }
}

if (!isMainThread && parentPort) {
  const { answerMemory } = require('./worker-memory.js');
  parentPort.on('message', (msg) => {
    if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js)
    const { id, op, payload } = msg || {};
    try { parentPort.postMessage({ id, ok: true, result: runOp(op, payload).result }); }
    catch (e) { parentPort.postMessage({ id, ok: false, error: { message: e.message, code: e.code } }); }
  });
}

module.exports = { runOp };
