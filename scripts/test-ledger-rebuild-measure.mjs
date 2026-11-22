#!/usr/bin/env node
// THE LEDGER REBUILD'S MEASUREMENT, THE HEAVY TWIN OF scripts/test-ledger-rebuild.mjs (B-7e49, the fast tier's time — lane
// artifacts-by-intent, 主开发 r2460: a leg whose seconds ARE its measure goes to a heavy twin, the rest stays fast). Moved VERBATIM
// from that file: its ⑦ and the fixtures ⑦ reads (the real shape, a copy, a repair, a reader's pass, the cache's digest, the
// on-loop reference). That file pins that this one holds ⑦ (§T) and runs none of it. Only the scratch and mutant folders' names
// are this file's own (two files, two folders), and its ok() carries the swap guard a new suite's helper must (test-ci-gate-tiers §7b).
//   (from scripts/test-ledger-rebuild.mjs's header:)
//   ⑦ THE MEASUREMENT: a real-shape ledger (scripts/boot-shape.mjs, ~79 MB) — the longest loop turn's CPU (a harness meter:
//      process.threadCpuUsage between setImmediate turns, never a wall clock) with the base's rule (a planted copy) vs now
import './scratch.mjs';   // FIRST (主开发 r1845 2, test-architecture §113: the scratch import before every other)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { scratchDir } from './scratch.mjs';
import { writeBootShape } from './boot-shape.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { UsageHistory } = require('../src/usage-history.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (typeof m !== 'string') throw new TypeError('ok(cond, name): the name is a string — a swapped call'); if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };   // the swap guard (test-ci-gate-tiers §7b: a new suite's helper refuses a swapped call)
const tmp = scratchDir('ledger-rebuild-measure');
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
const UH_REL = 'src/usage-history.js', uhSrc = fs.readFileSync(path.join(REPO, UH_REL), 'utf8');
const M = mutantCopies('ledger-rebuild-measure', REPO);
const quiet = async (fn) => { const l = console.log, w = console.warn, said = []; console.log = (...a) => said.push(a.join(' ')); console.warn = (...a) => said.push('WARN ' + a.join(' ')); try { return { v: await fn(), said }; } finally { console.log = l; console.warn = w; } };
const turn = () => new Promise((r) => setImmediate(r));
const NOW = Date.now();

// ── fixtures: the real SHAPE (scripts/boot-shape.mjs — the production ledger's months, row size, recency) ────────────
const shape = (name, scale) => { const d = path.join(tmp, name); const r = writeBootShape({ dataDir: d, homeDir: tmp, scale, now: NOW, only: 'ledger' }); return { dir: d, rows: r.rows.ledger, bytes: r.bytes }; };
const copyOf = (fx, name) => { const d = path.join(tmp, name); fs.cpSync(fx.dir, d, { recursive: true }); return d; };
const shards = (u) => fs.readdirSync(u.dir).filter((f) => /^events-/.test(f)).sort();
/** A repair: the oldest shard rewritten by tmp + rename (another inode) — two lines swapped, or the last line cut. */
const repair = (u, how = 'swap') => { const f = path.join(u.dir, shards(u)[0]); const ls = fs.readFileSync(f, 'utf8').split('\n'); if (how === 'swap') [ls[0], ls[1]] = [ls[1], ls[0]]; else ls.splice(ls.length - 2, 1); fs.writeFileSync(f + '.tmp', ls.join('\n')); fs.renameSync(f + '.tmp', f); };
const read = (u) => { if (u._evCache) u._evCache.checkedAt = 0; return u._loadEvents(); }; // a reader's pass (past the 1 s re-check throttle)
/** THE HOT WINDOW + THE COLD COLUMNS, hashed: every hot row (its JSON, place, size, line hash), the ids, the watermarks,
 *  the cutoff, the shards' places + append proofs, every cold column's first n values and the sorted id indexes. */
/** An index's runs merged (usage-cpu U1): the keys ascending, an equal key in run order (the oldest run first). */
function idxMerged(x) {
  const runs = [[x.keys, x.vals], ...(x.rk || []).map((a, r) => [a, x.rv[r]])], n = runs.reduce((t, [a]) => t + a.length, 0);
  const K = new Float64Array(n), V = new Float64Array(n), ix = new Array(n);
  let o = 0; for (const [a, v] of runs) { for (let q = 0; q < a.length; q++) { K[o + q] = a[q]; V[o + q] = v[q]; ix[o + q] = o + q; } o += a.length; }
  ix.sort((p, q) => (K[p] - K[q]) || (p - q));
  return [Float64Array.from(ix, (i) => K[i]), Float64Array.from(ix, (i) => V[i])];
}
function digest(c) {
  const h = crypto.createHash('sha256'), put = (x) => h.update(typeof x === 'string' ? x : JSON.stringify(x));
  for (const e of c.events) put(JSON.stringify(e) + '\n');
  put([c.sizes, c.locs.map(String), c.hrh.map(String), [...c.rids], [...c.mids], [...c.srcWm], String(c.cutoff), c.shards, [...c.consumed], c.hotBytes]);
  put([...c.marks].map(([f, m]) => [f, m.ino, m.mtimeMs, Buffer.from(m.probe).toString('hex')]));
  const s = c.cold; s.settle(); put([s.n, s.names.map((t) => t.vals)]);
  for (const a of [s.ts, s.rh, s.sh, s.off, ...s.tok, ...s.nm]) h.update(Buffer.from(a.buffer, a.byteOffset, s.n * a.BYTES_PER_ELEMENT));
  // usage-cpu U1: an index is a stack of sorted runs (src/cache-bounds.js HashIndex levels) — hashed as ONE merge of them, the
  // older run first on an equal hash (= the whole merge's order), so two loads that split their runs apart still agree
  for (const k of Object.keys(s.idx)) { const x = s.idx[k]; x.settle(); put(k); const [K, V] = idxMerged(x); h.update(Buffer.from(K.buffer)); h.update(Buffer.from(V.buffer)); }
  return h.digest('hex').slice(0, 16);
}
/** The on-loop build of the same files at the rebuilt cache's cutoff (Date.now pinned to cutoff + the window): the reference. */
function onLoopBuild(dir, cutoff, windowMs, UH = UsageHistory) { const u = new UH({ dataDir: path.dirname(dir), homeDir: tmp }); const real = Date.now; Date.now = () => cutoff + windowMs; try { u.warm(); } finally { Date.now = real; } return u; }

// ── ⑦ THE MEASUREMENT ────────────────────────────────────────────────────────────────────────────────────────────────
// The loop meter (harness only): the main thread's CPU between consecutive setImmediate turns — what one turn of the
// loop cost, whatever else runs on the box (a wall clock would read the machine's contention). The pending turn is
// counted at stop.
const cpuMs = () => { const c = process.threadCpuUsage(); return (c.user + c.system) / 1000; };
function loopMeter() { let last = cpuMs(), on = true, longest = 0, n = 0; const tick = () => { const t = cpuMs(); longest = Math.max(longest, t - last); n++; last = t; if (on) setImmediate(tick); }; setImmediate(tick); return { stop() { on = false; longest = Math.max(longest, cpuMs() - last); return { longest, n: n + 1 }; } }; }
async function measure(UH, fx, tag, { reference = true } = {}) {
  const u = new UH({ dataDir: path.dirname(path.join(copyOf(fx, 'm7' + tag), 'usage-history')), homeDir: tmp }); u.warm();
  repair(u);
  let swapCpu = null; const sw = u._swapCache?.bind(u); if (sw) u._swapCache = (x) => { const a = cpuMs(); sw(x); swapCpu = cpuMs() - a; };
  const parse = JSON.parse; let parses = 0;
  const meter = loopMeter();
  JSON.parse = function (...a) { parses++; return parse.apply(this, a); };
  try { await quiet(async () => { await new Promise((r) => setImmediate(() => { read(u); r(); })); await u.rebuildSettled(); await turn(); }); } finally { JSON.parse = parse; }
  const m = meter.stop();
  // lane fast-debt-clear: the fold digest computed ONCE (it was twice for the fix — `same` and `hash` — and once for the
  // control, whose hash nothing reads); the reference build only for the fix, as before
  const hash = reference ? digest(u._evCache) : null;
  const same = reference ? hash === digest(onLoopBuild(u.dir, u._evCache.cutoff, u._ledgerWindowMs(), UH)._evCache) : null;
  return { ...m, swapCpu, parses, same, hash, rows: u._evCache.events.length + u._evCache.cold.n };
}
{
  const big = shape('big', 0.2);
  console.log(`⑦ the measurement: a real-shape ledger of ${big.rows} rows, ${(big.bytes / 1e6).toFixed(1)} MB — the longest loop turn (main-thread CPU) through a rebuild`);
  const baseRule = uhSrc.replace('if (this._rebuildInWorker(why, c)) continue; yield* this._loadSteps(chunkBytes, trimBatch); return;', 'this._evCache = null; yield* this._loadSteps(chunkBytes, trimBatch); return;');
  const ctl = await measure(M.load(UH_REL, baseRule, 'baserule').UsageHistory, big, 'c', { reference: false });
  const fix = await measure(UsageHistory, big, 'f');
  console.log(`   base rule (the reader re-parses): longest turn ${ctl.longest.toFixed(1)} ms CPU, ${ctl.parses} lines parsed on the loop`);
  console.log(`   now (the worker builds):         longest turn ${fix.longest.toFixed(1)} ms CPU over ${fix.n} turns, the swap ${fix.swapCpu.toFixed(3)} ms, ${fix.parses} lines parsed on the loop, hash ${fix.hash} ${fix.same ? '=' : '≠'} the on-loop build`);
  ok(baseRule !== uhSrc && ctl.longest >= 400 && ctl.parses >= big.rows, `control (the base's rule): one loop turn of ${ctl.longest.toFixed(0)} ms CPU (≥ 400) parsing ${ctl.parses} lines ⇒ RED`);
  ok(fix.longest <= 50 && fix.parses === 0, `⑦ the longest loop turn through the rebuild: ${fix.longest.toFixed(1)} ms CPU (≤ 50), no ledger line parsed on the loop`);
  ok(fix.swapCpu !== null && fix.swapCpu <= 20, `⑦ the swap itself: ${fix.swapCpu.toFixed(3)} ms CPU (≤ 20)`);
  ok(fix.same && fix.rows === big.rows, `⑦ the rebuilt cache is the on-loop build's, byte for byte (${fix.hash}, ${fix.rows} rows)`);
}

console.log(fail ? `✗ ${fail} failed, ${pass} passed` : `ALL PASS ${pass} passed`);
process.exit(fail ? 1 : 0);
