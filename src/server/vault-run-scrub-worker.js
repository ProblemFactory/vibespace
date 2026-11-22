'use strict';
// THE RUN SCRUBBER'S WORKER (lane lg-vault-file, 主开发 r1505 / r1573: THE SCAN OFF THE LOOP). One worker a run.
// - The run door (src/server/vault-run-door.js startScrub) starts it before it asks the run's caps; it answers «ready» once its
//   modules are loaded.
// - Right before the child spawns, the door hands it the run's values ONCE (a «secrets» message). It builds the forms and its
//   one createRunMasker: the run's both pipes in arrival order, one window, as on the loop before.
// - Each decoded piece the door posts is answered in order (its seq), with what the masker hands on and the counts so far.
// - The end is answered with the last text and the counts.
// - It reads no file, opens nothing and sends no request. Its only words are its replies.
// - It holds the values while the run lives and ends with it: the door terminates it at its end, on every road.
// - A build that throws, or a piece before its build, is answered «refused» and nothing else: the door withholds the run's output
//   by name (or refuses the run, before it started).
const { isMainThread, parentPort } = require('worker_threads');
if (isMainThread) throw new Error('src/server/vault-run-scrub-worker.js runs as a worker only (the run door starts it)');
const { answerMemory } = require('../worker-memory.js');
const VR = require('../vault-scrubber.js');   // THE SCRUBBER alone (主开发 r1919, THE COST): never the run module's tree

let m = null;
const counts = () => ({ hits: m.hits, bytes: m.bytes, byForm: m.byForm, over: m.over, withheld: m.withheld });
const refuse = (code) => parentPort.postMessage({ type: 'refused', code: String(code || 'error').slice(0, 60) });
parentPort.on('message', (msg) => {
  if (answerMemory(msg, parentPort)) return;   // the memory census (src/worker-memory.js): answered between two pieces
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'secrets') { if (m) return; try { m = VR.createRunMasker(msg.secrets, ['out', 'err'], msg.steps ? { steps: msg.steps } : {}); } catch (e) { refuse(e && e.code); } return; }
  if (!m) { refuse('no_masker'); return; }
  if (msg.type === 'push') { const o = m.push(msg.stream, msg.text); parentPort.postMessage({ type: 'out', seq: msg.seq, out: o.out, err: o.err, counts: counts() }); return; }
  if (msg.type === 'end') { const o = m.end(!!msg.cut); parentPort.postMessage({ type: 'end', seq: msg.seq, out: o.out, err: o.err, counts: counts() }); }
});
parentPort.postMessage({ type: 'ready' });
