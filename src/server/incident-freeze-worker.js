'use strict';
// THE INCIDENT SCENE FREEZE, OFF THE MAIN THREAD (lane vault-slow-load addendum — the owner's inc-mvk5ues0 «打开保险库用了差不多
// 一分钟才加载完»: the hub's loop stood still 4 s and 7 s right after each capture). src/incident.js captureLocal is sync fs
// end to end — every transcript's WHOLE-file sha256 (a 1.1 GB worker transcript is 1.1 GB read), the session metas parsed and
// re-serialized, each project dir listed per conversation — and it ran on the server's loop. Here it runs in its own SafeFs
// worker (src/server/incident-wiring.js), which also writes env.json. `where` says which thread ran it: 'main' = SafeFs's
// in-main fallback (no live worker).
const fs = require('fs');
const path = require('path');
let isMainThread = true;
try { ({ isMainThread } = require('worker_threads')); } catch { }

async function runOp(op, payload) {
  if (op !== 'freeze') throw new Error('unknown incident-freeze op: ' + op);
  const { dir, dataDir, cids = [], terminalIds = [], targets = null } = payload || {};
  const t0 = Date.now();
  const local = await require('../incident.js').captureLocal(dir, { dataDir, cids, terminalIds });
  fs.writeFileSync(path.join(dir, 'env.json'), JSON.stringify({ targets, local }, null, 1));
  return { result: { ms: Date.now() - t0, where: isMainThread ? 'main' : 'worker' } };
}

let parentPort = null;
try { ({ parentPort } = require('worker_threads')); } catch { }
if (parentPort) {
  const { answerMemory } = require('../worker-memory.js');
  parentPort.on('message', (msg) => {
    if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js)
    const { id, op, payload } = msg || {};
    Promise.resolve().then(() => runOp(op, payload)).then(
      ({ result }) => parentPort.postMessage({ id, ok: true, result }),
      (e) => parentPort.postMessage({ id, ok: false, error: { message: e.message, code: e.code, stack: String(e.stack || '').slice(0, 2000) } }));
  });
}

module.exports = { runOp };
