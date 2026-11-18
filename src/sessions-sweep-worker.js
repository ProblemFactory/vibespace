'use strict';
/**
 * THE SESSIONS SWEEP'S WORKER (B-891e, lane bl-loop-a) — a script of its own, so the device daemon's bundle (which carries
 * the transcript worker) never carries the sweep (§107's 2 % bound): the «sessions-sweep» pool of src/routes/sessions.js
 * runs it. Ops: sessionsSweep (async — the walk, the merge, the sort, the bytes: src/sessions-sweep.js), sessionsLookup
 * (one row of the last sweep), sessionsRows (its rows, cut). runOp is also the pool's inline door (the route refuses a
 * SWEEP there: the last list stands instead).
 */
const { parentPort, isMainThread } = require('worker_threads');

function runOp(op, payload = {}) {
  const S = require('./sessions-sweep.js');
  switch (op) {
    case 'sessionsSweep': return S.sweepInThread(payload).then((result) => ({ result }));
    case 'sessionsLookup': return { result: S.lookupInThread(payload) };
    case 'sessionsRows': return { result: S.rowsInThread(payload) };
    default: throw Object.assign(new Error('unknown sessions-sweep op: ' + op), { code: 'EBADOP' });
  }
}

if (!isMainThread && parentPort) {
  const { answerMemory } = require('./worker-memory.js');
  parentPort.on('message', (msg) => {
    if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js)
    const { id, op, payload } = msg || {};
    const fail = (e) => parentPort.postMessage({ id, ok: false, error: { message: e.message, code: e.code } });
    try {
      const out = runOp(op, payload);
      if (out && typeof out.then === 'function') out.then(({ result }) => parentPort.postMessage({ id, ok: true, result }), fail);   // the sweep (async)
      else parentPort.postMessage({ id, ok: true, result: out.result });
    } catch (e) { fail(e); }
  });
}

module.exports = { runOp };
