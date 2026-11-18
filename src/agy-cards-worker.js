'use strict';
// THE HUB'S «agy-cards» WORKER (B-299b A1, lane bl-loop-a): src/agy-cards.js's reads of an Antigravity account's store, off the
// main thread (agy-backfill asks it at an attach's warm and at a turn end). The hub's own — the device agent never starts it
// and its bundle never carries it (test-architecture's bundle census).
const { parentPort, isMainThread } = require('worker_threads');

function runOp(op, payload = {}) {
  switch (op) {
    case 'agySnapshots': return { result: require('./agy-cards.js').snapshotsOf(payload) };
    default: throw Object.assign(new Error('unknown agy-cards op: ' + op), { code: 'EBADOP' });
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
