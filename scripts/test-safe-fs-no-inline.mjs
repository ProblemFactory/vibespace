#!/usr/bin/env node
// test-safe-fs-no-inline.mjs — B-3b03 (lane hub-loop-stalls): THE POOL NEVER RUNS A PATH OP ON THE MAIN THREAD.
//
// THE ROW (found by reading, lane bl-tests-a; the release 2.369.412 has it): src/safe-fs.js `call` ran an op INLINE in the main
// thread whenever the pool had no live worker («a last resort … keeps file browsing alive»). A hung path (a dead network mount)
// wedges every worker it is sent to; each is killed at its deadline and respawned after a backoff (500 ms, doubling while it keeps
// failing); a call that lands while every worker is between a kill and its respawn ran ON THE MAIN THREAD — and if it named the
// same dead path, the whole hub froze until the mount answered. Only one caller (the membership facts) asked `noInline`.
//
// THE SCENE (a stall placed in the worker's op as the stand-in for a hung path — no mount of any kind): the REAL pool and the
// REAL worker (src/safe-fs-worker.js; its `__sleep` op exists for this, gated by VIBESPACE_SAFEFS_TEST=1). Every worker is given
// a long stall; each overruns its short deadline, is killed and waits its respawn backoff; inside that window ONE more stall is
// asked — the shape of the folder field's next ask or the Files window's listing.
//   ① THE LAW: that call never runs on the main thread — it is REFUSED BY NAME (code `no-worker`, status 503) and the inline
//      runner is never entered; RED CONTROL: the release's inline road planted back (a copy through anchored()) ⇒ the inline
//      runner IS entered (the main thread runs the stall). The gap the main thread lost is MEASURED and printed (a count is
//      asserted, never a clock).
//   ② the pool still answers once a worker is back (the refusal is no lasting fault).
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
process.env.VIBESPACE_SAFEFS_TEST = '1';   // the worker's `__sleep` op (a placed stall); inherited by the workers it spawns
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { runOp } = require(path.join(REPO, 'src/safe-fs-worker.js'));

/** One scene over a SafeFs module: every worker wedged and killed, then ONE call inside the respawn window. */
async function scene(SF, tag) {
  let inline = 0;
  const inlineRun = (op, payload) => { inline++; return runOp(op, payload); };   // the real inline runner, counted
  const pool = new SF.SafeFs({ poolSize: 2, name: `no-inline-${tag}`, inlineRun, timeouts: { default: 15000, __sleep: 300 } });
  // the main thread's gaps, measured (printed, never asserted)
  let last = Date.now(), maxGap = 0; const tick = setInterval(() => { const n = Date.now(); maxGap = Math.max(maxGap, n - last); last = n; }, 10);
  const wedged = [pool.call('__sleep', { ms: 4000 }), pool.call('__sleep', { ms: 4000 })].map((p) => p.then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String(e && e.message))));
  const ends = await Promise.all(wedged);   // both overran their 300 ms deadline: both workers killed, respawning after ~500 ms
  const alive = pool.stats().alive;
  last = Date.now(); maxGap = 0;
  const t0 = Date.now(); let got = null;
  try { got = await pool.call('__sleep', { ms: 1500 }).then((r) => ({ ok: true, r }), (e) => ({ ok: false, code: e && e.code, status: e && e.status, message: String(e && e.message) })); }
  catch (e) { got = { ok: false, threw: String(e && e.message) }; }
  const callMs = Date.now() - t0;
  await sleep(50);
  const gap = maxGap;
  // ② a worker back: the pool answers again
  await sleep(1200);
  let after = null; try { after = await pool.call('__sleep', { ms: 1 }); } catch (e) { after = { error: String(e && e.message) }; }
  clearInterval(tick); pool.close();
  return { tag, ends, alive, got, callMs, gap, inline, after };
}

console.log('① a call while every worker respawns never runs on the main thread');
const SF = require(path.join(REPO, 'src/safe-fs.js'));
const g = await scene(SF, 'law');
console.log(`  [measure] no_inline_gap_ms=${g.gap} call_ms=${g.callMs} inline_runs=${g.inline} (the law: no inline run)`);
ok(g.ends.every((x) => x === 'deadline') && g.alive === 0 && g.inline === 0 && g.got && g.got.ok === false && g.got.code === 'no-worker' && g.got.status === 503,
  `every worker killed at its deadline (${g.ends.join(', ')}; alive ${g.alive}): the next call is REFUSED BY NAME (${g.got && g.got.code}, ${g.got && g.got.status}) — the inline runner entered ${g.inline} times`, JSON.stringify(g));
// (the RED control — the release's inline road planted back through anchored() — is added with the cure; at the release this
// suite IS the proof: the law leg fails, and the measure line says what the main thread lost)

console.log('② the refusal is no lasting fault');
ok(!!g.after && !g.after.error, `a worker back (after its backoff): the pool answers again (${JSON.stringify(g.after)})`);

report();
