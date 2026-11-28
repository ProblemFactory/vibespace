#!/usr/bin/env node
// THE LEDGER REBUILD OFF THE LOOP (B-748f, the never-block law; memory-residency verify r3 #4). The usage ledger's cache
// rebuild — a shard rewritten / shrunk / vanished, a walk that read a stale place, a reload after a repair — parsed the
// whole ledger in ONE loop turn (5 s at 497 MB, 69 s at 4.9 GB measured by that verifier). It now runs in the fold worker
// (usage-cold-worker.js op 'rebuild'); the loop keeps serving the previous cache, stages the built one a chunk per turn
// and swaps it in with ONE assignment (src/usage-history.js _rebuildInWorker → _rebuildJob → _stageBuilt → _swapCache).
//   ① THE CENSUS (acorn over src/usage-history.js, the file list by git ls-files): every site that drops or replaces the
//      cache is the worker door or a DECLARED row; a planted on-loop re-parse is RED; no server caller of the sync readers
//   ② a rewrite: the reader is served the previous cache, ONE worker builds, the swap brings the rebuilt one — identical,
//      byte for byte, to the on-loop build of the same files (a hash of the hot window + the cold columns)
//   ③ asks during a rebuild join it (one worker, one swap)        ④ a reader on every loop turn sees old or new, whole
//   ⑤ a failed rebuild keeps the previous cache, says why ONCE, waits before the next try   ⑥ the walk folds the rebuilt cache
//   ⑦ THE MEASUREMENT moved VERBATIM to its heavy twin scripts/test-ledger-rebuild-measure.mjs (B-7e49, 主开发 r2460: its seconds
//      ARE its measure — a ~79 MB real-shape ledger rebuilt twice); §T pins that the twin holds it and this file runs none of it
// Every leg has a planted RED control (scripts/mutant-copy.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mutantCopies } from './mutant-copy.mjs';
import { scratchDir } from './scratch.mjs';
import { writeBootShape } from './boot-shape.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const acorn = require('acorn');
const { UsageHistory } = require('../src/usage-history.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const tmp = scratchDir('ledger-rebuild');
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
const UH_REL = 'src/usage-history.js', uhSrc = fs.readFileSync(path.join(REPO, UH_REL), 'utf8');
const M = mutantCopies('ledger-rebuild', REPO);
const quiet = async (fn) => { const l = console.log, w = console.warn, said = []; console.log = (...a) => said.push(a.join(' ')); console.warn = (...a) => said.push('WARN ' + a.join(' ')); try { return { v: await fn(), said }; } finally { console.log = l; console.warn = w; } };
const turn = () => new Promise((r) => setImmediate(r));
const NOW = Date.now();

// ── ① THE CENSUS ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Rows by enclosing function: `drop` / `set` = an assignment to ._evCache, `restart` = _loadSteps calling itself (a
// load pass starting over), `worker` = the door (_rebuildInWorker), `onloop` = the declared on-loop rebuild's callers.
const DECLARED = {
  'set _loadSteps': 'the first load: an empty cache when there is none',
  'drop _rebuildInWorker': 'no whole cache yet (the first load under way): it starts over',
  'drop _rebuildOnLoop': 'THE DECLARED ON-LOOP REBUILD — the sync full-row readers only',
  'drop _packWhole': "the worker's own instance (usage-cold-worker.js)",
  'set _swapCache': 'THE SWAP — one assignment',
  'set _bootLoad': "the hub's first load (lane ledger-boot-load): an EMPTY placeholder that says «loading» — no line read; the worker's cache replaces it (_swapCache)",
};
const ONLOOP_CALLERS = new Set(['aggregate', '_allRows']); // migrations and tests: no server caller (the grep below)
function rebuildCensus(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true });
  const rows = [], prop = (m) => m && m.type === 'MemberExpression' && !m.computed && m.property.type === 'Identifier' ? m.property.name : null;
  const nameOf = (n, parent) => n.type === 'MethodDefinition' || n.type === 'Property' ? (n.key.name || n.key.value)
    : (n.type === 'FunctionDeclaration' && n.id) ? n.id.name
    : (n.type === 'AssignmentExpression' && /Function/.test(n.right.type)) ? prop(n.left) || null
    : (n.type === 'VariableDeclarator' && n.init && /Function/.test(n.init.type)) ? n.id.name : null;
  (function walk(n, fns, parent) {
    if (!n || typeof n.type !== 'string') return;
    const nm = nameOf(n, parent), here = nm ? [...fns, nm] : fns, fn = here.at(-1) || '(top)', line = n.loc.start.line;
    if (n.type === 'AssignmentExpression' && prop(n.left) === '_evCache') rows.push({ kind: n.right.type === 'Literal' && n.right.value === null ? 'drop' : 'set', fn, line });
    if (n.type === 'CallExpression' && prop(n.callee) === '_loadSteps' && fn === '_loadSteps') {
      const block = parent && parent.block, i = block ? block.indexOf(parent.stmt) : -1, prev = i > 0 ? block[i - 1] : null;
      const guarded = !!(prev && prev.type === 'IfStatement' && prev.test.type === 'CallExpression' && prop(prev.test.callee) === '_rebuildInWorker' && /^(Continue|Break)Statement$/.test(prev.consequent.type));
      rows.push({ kind: 'restart', fn, line, guarded });
    }
    if (n.type === 'CallExpression' && prop(n.callee) === '_rebuildInWorker') rows.push({ kind: 'worker', fn, line, why: n.arguments[0] ? src.slice(n.arguments[0].start, n.arguments[0].end).slice(0, 70) : '?' });
    if (n.type === 'CallExpression' && prop(n.callee) === '_rebuildOnLoop') rows.push({ kind: 'onloop', fn, line });
    for (const k of Object.keys(n)) {
      if (k === 'loc') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => walk(c, here, { block: v, stmt: c })); // a statement list: each child is its own statement
      else if (v && typeof v.type === 'string') walk(v, here, parent); // inside one statement: the statement stays the enclosing one
    }
  })(ast, [], null);
  const bad = [];
  for (const r of rows) {
    if ((r.kind === 'drop' || r.kind === 'set') && !DECLARED[`${r.kind} ${r.fn}`]) bad.push(`${UH_REL}:${r.line} ${r.fn} ${r.kind}s the ledger cache — an on-loop re-parse outside the worker job (call _rebuildInWorker)`);
    if (r.kind === 'restart' && !r.guarded) bad.push(`${UH_REL}:${r.line} _loadSteps starts the load over without asking the worker first`);
    if (r.kind === 'onloop' && !ONLOOP_CALLERS.has(r.fn)) bad.push(`${UH_REL}:${r.line} ${r.fn} rebuilds on the loop — only the declared sync readers may`);
  }
  return { rows, bad };
}
/** Every other product file (git ls-files src/ server.js data/bin): no ._evCache assignment, no server caller of the sync
 *  full-row readers (usageHistory.aggregate( / .rows( — the route folds through aggregateAsync). */
function treeCensus(texts) {
  const bad = [];
  for (const [f, t] of Object.entries(texts)) {
    if (f === UH_REL || !/\.(c|m)?js$/.test(f) || /usage-index-worker\.js$/.test(f)) continue;
    if (/\._evCache\s*=(?!=)/.test(t)) bad.push(`${f} drops the ledger cache itself`);
    const m = t.match(/\b\w*[hH]istory\??\.(?:aggregate|rows)\(/); if (m) bad.push(`${f} calls the sync full-row reader (${m[0]}) — an on-loop rebuild on a stale cache`);
  }
  return bad;
}
console.log('① the census: every ledger re-parse is the worker job or a declared row');
{
  const C = rebuildCensus(uhSrc);
  for (const r of C.rows) console.log(`   ${String(r.line).padStart(5)} ${r.kind.padEnd(7)} ${r.fn}${r.why ? ' — ' + r.why : ''}${r.kind === 'restart' ? (r.guarded ? ' (after the door)' : ' UNGUARDED') : ''}${DECLARED[`${r.kind} ${r.fn}`] ? ' — DECLARED: ' + DECLARED[`${r.kind} ${r.fn}`] : ''}`);
  ok(C.bad.length === 0, `① ${UH_REL}: ${C.bad.join(' · ')}`);
  const workers = C.rows.filter((r) => r.kind === 'worker'), byFn = new Set(workers.map((r) => r.fn));
  ok(gateOf(['reloadEvents', '_loadSteps', '_aggregateWalk'].every((f) => byFn.has(f))) && workers.filter((r) => r.fn === '_loadSteps').length === 2 && workers.filter((r) => r.fn === '_aggregateWalk').length === 2 && workers.length >= 6,
    `① every trigger names the worker job: the reload, the vanished shard + the rewrite rules, a walk's STALE + vanished shard, the re-attribution (${workers.length} rows: ${[...byFn].join(', ')})`);
  ok(C.rows.filter((r) => r.kind === 'restart').length === 2 && C.rows.filter((r) => r.kind === 'onloop').length === 2, '① two guarded restarts (the first load), the declared on-loop rebuild asked by aggregate + _allRows only');
  const files = execFileSync('git', ['-C', REPO, 'ls-files', 'src', 'server.js', 'data/bin'], { encoding: 'utf8' }).split('\n').filter((f) => /\.(c|m)?js$/.test(f));
  const texts = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]));
  const T = treeCensus(texts);
  ok(T.length === 0 && files.length > 300, `① the rest of the product (${files.length} files) never drops the cache nor calls a sync full-row reader: ${T.join(' · ')}`);
  // planted REDs: the base's rewrite rule, the base's walk STALE rung, a restart with no door, a caller elsewhere
  const plants = [
    ['the rewrite rule re-parses in the reader\'s call (the base)', uhSrc.replace('if (this._rebuildInWorker(why, c)) continue; yield* this._loadSteps(chunkBytes, trimBatch); return;', 'this._evCache = null; yield* this._loadSteps(chunkBytes, trimBatch); return;')],
    ["a walk's STALE drops the cache (the base)", uhSrc.replace("this._rebuildInWorker('a walk read a stale place (' + e.message + ')', c);", 'this._evCache = null;')],
    ['the reload drops the cache (the base)', uhSrc.replace("this.reloadEvents = () => { this._rebuildInWorker('a reload after a repair');", 'this.reloadEvents = () => { this._evCache = null;')],
    ['an on-loop rebuild asked from the route', uhSrc.replace('if (this._evCache.stale) { await this._requestRebuild(this._evCache.stale); this._loadEvents(); }', 'if (this._evCache.stale) this._rebuildOnLoop();')],
  ];
  for (const [what, src] of plants) { const P = rebuildCensus(src); ok(src !== uhSrc && P.bad.length >= 1, `control (${what}): ${P.bad.length} RED row(s) — ${P.bad.join(' · ') || 'NONE'}`); }
  const plantedTree = treeCensus({ ...texts, 'src/usage-anchors.js': texts['src/usage-anchors.js'] + '\nfunction x(usageHistory) { usageHistory._evCache = null; return usageHistory.aggregate({}); }\n' });
  ok(plantedTree.length === 2, `control (a drop + a sync reader planted in src/usage-anchors.js): ${plantedTree.length} RED`);
}

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
const money = (u) => { let n = 0, t = 0; for (const e of u._events(null, null)) { n++; t += (e.i || 0) + (e.o || 0) + (e.cr || 0); } return `${u._loadEvents().length}+${u._evCache.cold.n}:${n}:${t}`; };

const small = shape('small', 0.012);
console.log(`② the rebuild in the worker, swapped whole (a real-shape ledger: ${small.rows} rows, ${(small.bytes / 1e6).toFixed(1)} MB)`);
{
  const u = new UsageHistory({ dataDir: path.dirname(path.join(copyOf(small, 'm2'), 'usage-history')), homeDir: tmp });
  u.warm();
  const old = u._evCache, w0 = u._rebuildWorkers || 0, g0 = u.ledgerGen;
  repair(u);
  const served = read(u);
  ok(served === old.events && u._evCache === old && gateOf(old.stale) && verdictOf(/was rewritten \(another file\)/.test(old.stale)), `② the reader is served the PREVIOUS cache (stale but whole: "${old.stale}") — no parse in its call`);
  const { said } = await quiet(() => u.rebuildSettled());
  const fresh = u._evCache, ref = onLoopBuild(u.dir, fresh.cutoff, u._ledgerWindowMs());
  ok(fresh !== old && gateOf(fresh.whole) && !fresh.stale && (u._rebuildWorkers || 0) - w0 === 1 && u.ledgerGen === g0 + 1, `② ONE worker built it, the swap brought a new generation (${(u._rebuildWorkers || 0) - w0} worker, gen ${g0}→${u.ledgerGen})`);
  ok(digest(fresh) === digest(ref._evCache) && fresh.events.length + fresh.cold.n === small.rows && fresh.cold.n > 1000 && fresh.events.length > 2 * 2048, `② byte for byte the on-loop build: ${digest(fresh)} = ${digest(ref._evCache)} (hot ${fresh.events.length}, cold ${fresh.cold.n})`);
  ok(said.length === 1 && verdictOf(/rebuilt in the fold worker \(.*was rewritten.*\): \d+ rows/.test(said[0])), `② one line says it: ${said[0]}`);
  // the swapped cache is a working cache: an append is read by the next pass, a cold lookup answers, a sync fold matches
  const f = path.join(u.dir, shards(u).at(-1)); fs.appendFileSync(f, JSON.stringify({ rid: 'req_after_swap', mid: 'msg_after_swap', ts: NOW - 1000, sid: 's', be: 'claude', model: 'claude-fable-5-1', i: 7, o: 7, cw5: 0, cw1: 0, cr: 0 }) + '\n');
  read(u);
  const coldRid = (() => { const l = fs.readFileSync(path.join(u.dir, shards(u)[1]), 'utf8').split('\n')[3]; return JSON.parse(l).rid; })();
  ok(gateOf(u.ledgerKnowsId('req_after_swap')) && gateOf(u.ledgerKnowsId(coldRid)) && u._evCache === fresh && !fresh.stale, '② after the swap the cache reads the appended tail and finds a cold row by id (the moved indexes)');
  const aRef = new UsageHistory({ dataDir: path.dirname(u.dir), homeDir: tmp }); aRef.ledgerWindowMs = u._ledgerWindowMs();
  const COST12 = (k, v) => (k === 'cost' && typeof v === 'number' ? Number(v.toPrecision(12)) : v);   // B-360d unit 1: a cost to 12 significant digits (law 2's 1e-9)
  ok(JSON.stringify((await u.aggregateAsync({ to: NOW })).totals, COST12) === JSON.stringify(aRef.aggregate({ to: NOW }).totals, COST12), '② the route\'s fold over the swapped cache = a fresh instance\'s sync fold (its cost to 12 significant digits)');
}

console.log('③ asks during a rebuild join it');
async function coalesce(UH, tag) {
  const u = new UH({ dataDir: path.dirname(path.join(copyOf(small, 'm3' + tag), 'usage-history')), homeDir: tmp }); u.warm();
  const w0 = u._rebuildWorkers || 0; let swaps = 0; const sw = u._swapCache.bind(u); u._swapCache = (x) => { swaps++; sw(x); };
  repair(u); read(u); u.reloadEvents(); read(u);
  const asks = u._rb ? u._rb.asks : 0;
  await quiet(async () => { await u.rebuildSettled(); for (let i = 0; i < 20 && u._rb; i++) await u.rebuildSettled(); });
  return { workers: (u._rebuildWorkers || 0) - w0, swaps, asks };
}
{
  const r = await coalesce(UsageHistory, 'a');
  ok(r.workers === 1 && r.swaps === 1 && r.asks === 3, `③ a rewrite seen twice + a reload: ${r.asks} asks, ${r.workers} worker, ${r.swaps} swap`);
  const noJoin = uhSrc.replace('if (this._rb) { this._rb.asks++; return this._rb.p; }', '');
  const R = await coalesce(M.load(UH_REL, noJoin, 'nojoin').UsageHistory, 'b');
  ok(noJoin !== uhSrc && R.workers > 1, `control (no join): ${R.workers} workers for one repair ⇒ RED`);
}

console.log('④ a reader on every loop turn sees the previous cache or the rebuilt one, each whole');
async function readers(UH, tag) {
  const u = new UH({ dataDir: path.dirname(path.join(copyOf(small, 'm4' + tag), 'usage-history')), homeDir: tmp }); u.warm();
  const before = money(u);
  repair(u, 'cut'); read(u); // the last line of the oldest shard cut: the rebuilt cache holds one row less
  const seen = []; let on = true;
  const loop = (async () => { while (on) { seen.push(money(u)); await turn(); } })();
  await quiet(() => u.rebuildSettled()); for (let i = 0; i < 3; i++) await turn(); on = false; await loop; // …and a few reads after the swap
  const after = money(u);
  return { before, after, seen, odd: seen.filter((x) => x !== before && x !== after) };
}
{
  const r = await readers(UsageHistory, 'a');
  ok(r.before !== r.after && r.odd.length === 0 && r.seen.filter((x) => x === r.before).length >= 3 && verdictOf(r.seen.includes(r.after)), `④ ${r.seen.length} reads across the rebuild: ${r.seen.filter((x) => x === r.before).length} the previous cache (${r.before}), the rest the rebuilt one (${r.after}), ${r.odd.length} anything else`);
  const live = uhSrc.replace('const events = [], sizes = [], locs = [], hrh = [], rids = new Set(), mids = new Set();', 'const events = [], sizes = [], locs = [], hrh = [], rids = new Set(), mids = new Set(); this._evCache = Object.assign(Object.create(null), this._evCache, { events, sizes, locs, hrh, sorted: null });');
  const R = await readers(M.load(UH_REL, live, 'live').UsageHistory, 'b');
  ok(live !== uhSrc && R.odd.length > 0, `control (staged INTO the live cache): ${R.odd.length} reads saw a half-built cache (${R.odd[0]}) ⇒ RED`);
}

console.log('⑤ a failed rebuild keeps the previous cache, says why once, waits before the next try');
async function failing(UH, tag) {
  const u = new UH({ dataDir: path.dirname(path.join(copyOf(small, 'm5' + tag), 'usage-history')), homeDir: tmp }); u.warm();
  const stub = path.join(tmp, `fail-worker-${tag}.js`);
  fs.writeFileSync(stub, "const { parentPort } = require('worker_threads'); parentPort.on('message', (m) => { if (m && m.op === 'rebuild') parentPort.postMessage({ ev: 'error', id: m.id, error: 'planted: the shard could not be read' }); });");
  u.rebuildWorkerFile = stub;
  const old = u._evCache, w0 = u._rebuildWorkers || 0, rows0 = money(u);
  const { said } = await quiet(async () => {
    repair(u); read(u); await u.rebuildSettled();
    read(u); u.reloadEvents(); read(u); await u.rebuildSettled(); // asks inside the retry wait
  });
  const kept = u._evCache === old && money(u) === rows0 && old.events.length > 0;
  const { v: e } = await quiet(() => u.aggregateAsync({ to: NOW - 1 }).then(() => null, (x) => x));
  const out = { kept, workers: (u._rebuildWorkers || 0) - w0, warns: said.filter((l) => l.startsWith('WARN')), e };
  u.rebuildWorkerFile = null; if (u._rbFail) u._rbFail.retryAt = 0; // the wait passed: the next ask rebuilds
  await quiet(async () => { read(u); await u.rebuildSettled(); });
  out.recovered = u._evCache !== old && !u._evCache.stale;
  return out;
}
{
  const r = await failing(UsageHistory, 'a');
  ok(gateOf(r.kept) && r.workers === 1 && r.warns.length === 1 && verdictOf(/rebuild failed \(.*was rewritten.*\): planted: the shard could not be read — the previous cache keeps serving; next try in 60 s/.test(r.warns[0])), `⑤ the previous cache kept (whole, the same rows), ONE worker, ONE line: ${r.warns[0]}`);
  ok(gateOf(r.e) && r.e.code === 'REBUILD' && verdictOf(/could not be rebuilt after .* \(planted: the shard could not be read\) — the previous figures keep serving; it tries again in \d+ s/.test(r.e.message)), `⑤ a cold-range request inside the wait is told: "${r.e && r.e.message}"`);
  ok(verdictOf(r.recovered), '⑤ after the wait the next ask rebuilds and swaps');
  const noWait = uhSrc.replace('if (this._rbFail && Date.now() < this._rbFail.retryAt) return Promise.reject(this._rbFail.err);', '');
  const R = await failing(M.load(UH_REL, noWait, 'nowait').UsageHistory, 'b');
  ok(noWait !== uhSrc && R.workers >= 3, `control (no retry wait): ${R.workers} failing workers for one repair, ${R.warns.length} lines ⇒ RED`);
  const blank = uhSrc.replace("console.warn(`[usage] the ledger cache rebuild failed", "this._evCache = null; console.warn(`[usage] the ledger cache rebuild failed");
  const B = await failing(M.load(UH_REL, blank, 'blank').UsageHistory, 'c');
  ok(blank !== uhSrc && !B.kept, 'control (a failure drops the cache): the next reader re-parses on the loop ⇒ RED');
}

console.log('⑥ a walk over a stale cache folds the rebuilt one');
{
  const u = new UsageHistory({ dataDir: path.dirname(path.join(copyOf(small, 'm6'), 'usage-history')), homeDir: tmp }); u.warm();
  repair(u, 'cut'); read(u);
  const old = u._evCache, w0 = u._coldWalks || 0;
  const { v: a } = await quiet(() => u.aggregateAsync({ to: NOW }));
  const ref = new UsageHistory({ dataDir: path.dirname(u.dir), homeDir: tmp });
  ok(gateOf(old.stale) && u._evCache !== old && JSON.stringify(a.totals) === JSON.stringify(ref.aggregate({ to: NOW }).totals) && (u._coldWalks || 0) - w0 === 1, `⑥ the walk waited for the rebuild and folded it ONCE (${(u._coldWalks || 0) - w0} fold, ${a.totals.requests} requests = a fresh sync fold)`);
}

// ── §T THE TWIN HOLDS THE MEASUREMENT (B-7e49, 主开发 r2460: a leg cannot fall between the two files) ─────────────────────────
// ⑦ moved VERBATIM to the heavy twin scripts/test-ledger-rebuild-measure.mjs: its seconds ARE its measure (a 79.1 MB / 164 515-row
// real-shape ledger built, then its rebuild timed twice — the base's rule and the worker). This file runs none of it.
{
  const twinRel = 'scripts/test-ledger-rebuild-measure.mjs';
  const twin = fs.existsSync(path.join(REPO, twinRel)) ? fs.readFileSync(path.join(REPO, twinRel), 'utf-8') : '';
  const here = fs.readFileSync(new URL(import.meta.url), 'utf-8');
  const MOVED = ['// ── ⑦ THE MEASUREMENT ─', "const big = shape('big', 0.2);", 'ctl.longest >= 400 && ctl.parses >= big.rows', 'fix.longest <= 50 && fix.parses === 0', 'fix.swapCpu !== null && fix.swapCpu <= 20', 'fix.same && fix.rows === big.rows',
    "uhSrc.replace('if (this._rebuildInWorker(why, c)) continue; yield* this._loadSteps(chunkBytes, trimBatch); return;', 'this._evCache = null; yield* this._loadSteps(chunkBytes, trimBatch); return;')"];
  const holds = (t) => MOVED.every((h) => t.includes(h));
  // ⑦'s own texts stand here only in this list, and nothing here meters a loop turn. The base-rule copy (MOVED's last) is not
  // counted: ①'s census control plants the same rule
  const runsNone = (t) => MOVED.slice(0, 6).every((h) => t.split(h).length === 2) && !/loopMeter\(|await measure\(/.test(t);
  ok(gateOf(holds(twin)) && verdictOf(runsNone(here)), `§T the heavy twin holds ⑦ — its heading, its real-shape ledger, its control's rule and bound, its three bounds — and this file runs none of it`);
  ok(verdictOf(/\{ name: 'test-ledger-rebuild-measure', tier: 'heavy',/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8'))), '§T the twin is a HEAVY row of the tier');
  ok(!holds(twin.replace('ctl.longest >= 400', 'ctl.longest >= 100')), 'RED CONTROL — a twin whose control bound was loosened (≥ 400 → ≥ 100) is no longer the moved ⑦: §T goes red');
  ok(!runsNone(here + '\n' + twin.slice(Math.max(0, twin.indexOf(MOVED[0])))), 'RED CONTROL — this file with the twin\'s ⑦ planted back runs the measure again: §T goes red');
}

console.log(fail ? `✗ ${fail} failed, ${pass} passed` : `ALL PASS ${pass} passed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
