'use strict';
// R9 of row B-9a24 (lane lg-store-writes, 主开发 r3487 / r4350): A KILL INSIDE THE FIRST CONTINUE's DELIVERY. A child of
// scripts/test-auto-resume-record.mjs (section K): argv = <auto-resume module path> <dataDir> <stand-in worker path> <the wall's reset, ms>
// [before]. «before» (r4551): the kill is placed BEFORE the landing — in the spend authorizer, which the fire asks first.
// A fresh auto-resume over the data the suite armed (its writer thread the suite's stand-in) ticks once the reset has landed; its
// continue reaches sendToSession, where this process is KILLED (SIGKILL: no exit flush, nothing of it lands after). The suite then
// starts FRESH over the same data and counts what continues again. Nothing of the module is replaced.
const path = require('path');
const [modPath, dataDir, workerPath, resetsMs, where] = process.argv.slice(2);
const REPO = path.join(__dirname, '..', '..');
console.log = () => { }; console.warn = () => { };
const SW = require(path.join(REPO, 'src', 'store-writer.js'));
const AR = require(modPath);
const W = SW.create({ log: { log() { }, warn() { }, error() { } }, workerPath, durableMs: 1500 });
const sessions = new Map([['s1', { mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false }]]);
const ar = AR.create({ dataDir, activeSessions: sessions, serverSetting: (k) => (k === 'claude.autoResumeOnLimit' ? true : undefined),
  sendToSession: () => { process.kill(process.pid, 'SIGKILL'); return true; }, notify: () => { }, broadcast: () => { }, storeWriter: W,
  ...(where === 'before' ? { authorizeSpend: () => { process.kill(process.pid, 'SIGKILL'); return { ok: true }; }, releaseSpend: () => { } } : {}) });
let n = null;
try { n = ar.tick(Number(resetsMs) + AR.GRACE_MS + 1); } catch (e) { n = 'threw ' + ((e && e.message) || e); }
process.stdout.write('NOT KILLED ' + JSON.stringify(n) + '\n');
process.exit(3);
