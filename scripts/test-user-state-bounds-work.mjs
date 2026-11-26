#!/usr/bin/env node
// test-user-state-bounds-work — the HEAVY twin of test-user-state-bounds (B-7e49, lane bl-tests-e, 主开发 r2522): its legs that RUN
// the persistence route over the largest legal stores, moved VERBATIM — §1 the control (the largest legal import) and law A (each
// door's worst legal request), §2 law B (what the product's own pages send), §4 the ops door one over each bound (its group leg
// reads the group §2 built), §6 master's roads, and §W, which counts in a CHILD the work of every request §1, §2 and §6 register
// (one unit). The fast file keeps §3, §5, §7
// and pins (§T) that this file holds these legs. Selected, as a heavy row, by the files its legs load (src/user-state-ops.js, the
// persistence route, server.js's parser chain …), and run in every whole heavy tier. In-process + its counting children.
// Run: node scripts/test-user-state-bounds-work.mjs
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { spawnSync } from 'node:child_process';
import { checker, verdictOf } from './lib/check.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const UO = require(path.join(REPO, 'src/user-state-ops.js'));
const express = require('express');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ueb-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
const CHK = checker();   // B-7e49 r3655 (3): a twin takes the shared checker (scripts/lib/check.mjs), never an inline helper of its own
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof n} — the arguments are swapped`); return CHK.ok(c === true || (c !== false && verdictOf(c)), n, d); };   // the condition coerced as the shared guard does (a promise or a function is red by name)
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

// the bounds, AS NUMBERS (round 12: «the one-over legs are written from the numbers»)
const OPS_BODY = 2097152, OPS = 5000, MOVES = 20000, GROUP = 20000, VALUES = 524288, VALUE = 16384, NAME = 4096, DEPTH = 4, FIELD = 200, BATCH_BYTES = 1048576;
const BIG = 12582912;   // (a size for master's roads' rows — round 13: no bound there)

const VNOW = Date.UTC(2026, 10, 11, 12);
let framed = 0;   // (the bytes every hub's socket client was sent)
// B-0248 (c): the route's stores are THE STORE WRITER's (src/store-hold.js owe/after) — this suite's world lands each write AT ITS CALL (the writer's contract, no latency: its bytes written whole, then onWritten, and every answer at once), as the release's write at the call did; the off-loop laws are test-store-write-census ⑭'s
const landingWriter = () => ({ dirty(lwFile, o) { const b = o.produce(), parts = Array.isArray(b) ? b : [b], lwTmp = lwFile + '.lw.tmp'; for (let i = 0; i < parts.length; i++) fs.writeFileSync(lwTmp, parts[i], { flag: i ? 'a' : 'w' }); fs.renameSync(lwTmp, lwFile); if (o.onWritten) o.onWritten(true, null); }, durable(lwFile, o) { if (o && o.answer) o.answer(true); return Promise.resolve(true); }, pending: () => false, flushSync: () => ({ written: [], left: [] }), whyNotDurable: () => null });
/** a fresh hub: the real route, a data dir of its own, one clock */
const hub = ({ dir: dirIn = null, clock = null } = {}) => {   // (round 14: a hub on another's data dir — a restart; a clock that moves)
  for (const key of Object.keys(require.cache)) if (key.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[key];
  const P = require(path.join(REPO, 'src/routes/persistence.js'));
  const dir = dirIn || fs.mkdtempSync(path.join(TMP, 'h-'));
  // (one socket client, taking each frame's bytes as a real one does — the broadcast is part of a write's cost)
  P.setup({ writer: landingWriter(), dataDir: dir, wss: { clients: new Set([{ readyState: 1, send: (j) => { framed += j.length; } }]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, userStateClock: () => (clock ? clock.t : VNOW), userStateMono: () => (clock ? clock.t : VNOW) });
  const handler = (method, p) => { const l = P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l.route.stack[0].handle; };
  /** one request, timed: the handler alone, its body already parsed (as the door's parser hands it) — its time is PRINTED only (B-518e) */
  const timed = (method, p, body) => {
    let status = 200, out = null;
    const res = { status(c) { status = c; return res; }, json(o) { out = o; return res; } };
    const fn = handler(method, p);
    const t = process.hrtime.bigint();
    fn({ body, query: {}, params: {}, headers: {} }, res, () => { });
    return { ms: Number(process.hrtime.bigint() - t) / 1e6, status, body: out };
  };
  /** one request whose handler answers later (the export) — the answer, once given */
  const answer = (method, p, body) => new Promise((resolve) => { let status = 200; const res = { status(c) { status = c; return res; }, json(o) { resolve({ status, body: o }); return res; }, setHeader() { }, set() { return res; } }; handler(method, p)({ body, query: {}, params: {}, headers: {}, app: { locals: {} } }, res, () => resolve({ status: 404, body: null })); });
  const file = () => { try { return fs.readFileSync(path.join(dir, 'user-state.json'), 'utf8'); } catch { return '{}'; } };   // (no file yet = nothing written: a leg reads it and goes red by name, never throws)
  return { P, dir, timed, answer, file, rev: () => { try { return JSON.parse(file()).stateRev || 0; } catch { return 0; } } };
};
/** a hub served over HTTP through server.js's own body chain: its OWN_BODY_RE (read from server.js) and the ops door parser's own
 *  match skip the 50 MB parser; every other path goes through server.js's own express.json */
const SERVER_SRC = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
const OWN_BODY_RE = new Function('return ' + (SERVER_SRC.match(/OWN_BODY_RE = (\/.+?\/);/) || [])[1])();
const JSON_LIMIT = (SERVER_SRC.match(/const jsonBody = express\.json\(\{ limit: '(\w+)' \}\)/) || [])[1];
const served = async () => {
  const h = hub();
  const app = express();
  const jsonBody = express.json({ limit: JSON_LIMIT });
  app.use((req, res, next) => (OWN_BODY_RE.test(req.path) || (h.P.router.ownsBody && h.P.router.ownsBody(req.path)) ? next() : jsonBody(req, res, next)));   // (server.js's own line, round 13 — pinned in §3)
  app.use(h.P.router);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  return { ...h, port: srv.address().port, close: () => new Promise((r) => srv.close(r)) };
};
/** one HTTP request: `text` (sent with its length, or gzip'd) or `gen` (a generator of chunks: no length — chunked — or gzip-streamed) */
const send = (port, method, p, { text, gen, gzip } = {}) => new Promise((resolve) => {
  const headers = { 'content-type': 'application/json' };
  if (gzip) headers['content-encoding'] = 'gzip';
  let buf = null;
  if (text !== undefined) { buf = gzip ? zlib.gzipSync(text, { level: 1 }) : Buffer.from(text); headers['content-length'] = String(buf.length); }
  const req = http.request({ host: '127.0.0.1', port, method: method.toUpperCase(), path: p, headers }, (r) => {
    const parts = []; r.on('data', (d) => parts.push(d));
    r.on('end', () => { let body = null; try { body = JSON.parse(Buffer.concat(parts).toString()); } catch { } resolve({ status: r.statusCode, body }); });
  });
  req.on('error', (e) => resolve({ status: 0, body: { code: 'socket:' + e.code } }));
  if (buf) { req.end(buf); return; }
  const z = gzip ? zlib.createGzip({ level: 1 }) : null;
  if (z) z.pipe(req);
  const sink = z || req;
  (async () => { for (const c of gen()) if (!sink.write(c)) await new Promise((r) => sink.once('drain', r)); sink.end(); })().catch(() => { });
});
/** a key's whole-key record slot (round 14 — a tree without it names none: its legs go red by name, never a throw) */
const keySet = (key) => (typeof UO.keySetSlotOf === 'function' ? UO.keySetSlotOf(key) : '\u0000no record slot');
/** a key's whole-key record on disk → the digests in each of its runs, newest first ([] when none) */
const runsOf = (st, key) => { const v = ((st || {})[UO.FACTS_KEY] || {})[keySet(key)]; return typeof v === 'string' ? v.split(';').map((r) => (r.length - r.indexOf('=') - 1) / 16) : []; };
const codeOf = (r) => (r && r.body && (r.body.code || ((r.body.refused || [])[0] || {}).code)) || null;
const k = (i) => `claude:${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`;
const US = (o = {}) => ({ stateVersion: 2, starredSessions: [], archivedSessions: [], archivedFolders: [], customNames: {}, sessionModes: {}, sessionConfigs: {}, sessionGroups: {}, groupFolders: {}, ...o });
const IMPORT = (userState) => ({ file: { app: 'vibespace-config', sections: { userState } }, sections: ['userState'] });
const batches = (page, n, opsOf) => ({ batches: Array.from({ length: n }, (_, i) => ({ batch: `${page}:${i + 1}`, age: 0, ops: opsOf(i) })) });
const parsed = (x) => JSON.parse(JSON.stringify(x));   // (as a parser hands it: flat strings, fresh objects)
/** a string of `pad` made so that `make(pad)`'s JSON is exactly `n` bytes (ASCII) */
const exact = (make, n) => { const base = JSON.stringify(make('')).length; return JSON.stringify(make('x'.repeat(n - base))); };
// a config value AT its bound by the file's measure (JSON.stringify(value, null, 2), 8 spaces a line — round 12's one measure)
const fileLen = (v) => { const t = JSON.stringify(v, null, 2); return t.length + 8 * (t.split('\n').length - 1); };
const OBJ = (() => { const mk = (n) => { const o = {}; for (let i = 0; i < n; i++) o['k' + String(i).padStart(5, '0')] = i % 10; return o; }; let lo = 0, hi = 4096; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (fileLen(mk(m)) <= VALUE) lo = m; else hi = m - 1; } return mk(lo); })();

// B-518e — WORK, NEVER THE CLOCK (the coordinator's law: a fast leg's verdict is a count or an order, never a ratio of two wall
// clocks; this suite's ratios were red ALONE on the serial lane, ×3.45 of 3). What a request DID is counted in a CHILD (a fresh
// node, as B-518e's first leg: the wrapped built-ins never touch this process's own Sets): the hub's real route on a scratch
// data dir, the scenario's pre-state imported first (uncounted), then each request with Set.prototype.add, Map.prototype.set,
// the elements each Array.prototype.includes / indexOf walked, and the store's writes (a rename onto user-state.json, or the link that creates it) counted
// around its handler alone — and (the cure's read) the elements the array passes walked (a filter / map / forEach / some /
// every / find / findIndex / reduce / flatMap callback, a slice's cut) and the bytes JSON.stringify made against the bytes
// written to the store. `items` = what the request carries (its ops, or the items of the keys it sends) + what the store held
// in the keys it touches. `ops`: a patched copy of user-state-ops.js the route loads instead (a control).
// BLIND, said: an object spread or Object.keys copy, a regex's own steps, a string built per item, a for…of / spread pass, a
// second whole-state stringify inside the STRINGIFY bound — the old ceilings saw those as time; a count here does not.
// → per scenario, per request: { status, sets, scans, walks, writes, strBytes, wrote, items (= carried + held), carried, held, landed, applied };
// the array carries `.node` (the child's process.version, printed beside the one-change count).
const WORK = [];   // the legs' scenarios, counted together in §W: [{ leg, law, pre, reqs: [[method, path, body]] }]
// `expect`, per request: { applied: n } (the ops door — what the ORIGINAL run applied) or { landed: true } (a whole key or an import —
// what it carries is what the store then holds in those keys): a replay that applied less than the original counts less work, and
// is red (the 07:51Z verdict)
const workLeg = (leg, law, pre, reqs, expect) => WORK.push({ leg, law, pre, reqs, expect });
// an ops-door answer, counted whole (the cure-2 read: `applied` lists BATCH ids — a batch is applied when any one of its ops is,
// and a drive's request is ONE batch of up to 5 000 ops — so the dropped OPS are counted too, and every other verdict)
const verdictsOf = (b) => ({ applied: (b.applied || []).length, held: (b.held || []).length, superseded: (b.superseded || []).length, old: (b.old || []).length, refused: (b.refused || []).length, dropped: (b.dropped || []).reduce((n, d) => n + (((d && d.ops) || []).length), 0) });   // (its source rides into the child)
const workCounts = (scenarios, { ops = null } = {}) => {
  const files = scenarios.map((sc, i) => { const f = path.join(TMP, `work-${i}.json`); fs.writeFileSync(f, JSON.stringify({ pre: sc.pre || null, reqs: sc.reqs })); return f; });
  const code = `const fs = require('fs'), path = require('path'), Module = require('module');
const REPO = ${JSON.stringify(REPO)}, TMP = ${JSON.stringify(TMP)}, VNOW = ${VNOW}, FILES = ${JSON.stringify(files)}, OPS = ${JSON.stringify(ops)};
if (OPS) { const real = path.join(REPO, 'src/user-state-ops.js'), m = new Module(real); m.filename = real; m.loaded = true; m.exports = require(OPS); require.cache[real] = m; }
const verdictsOf = ${verdictsOf.toString()};
const itemsOf = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.values(v).reduce((n, x) => n + 1 + (Array.isArray(x) ? x.length : 0), 0) : 0);
const itemsIn = (p, b, st) => {
  if (p === '/api/user-state/batches') { const ops = (b.batches || []).flatMap((x) => x.ops || []), keys = [...new Set(ops.map((o) => o.key))]; return [ops.length, keys.reduce((n, key) => n + itemsOf(st[key]), 0)]; }
  const u = p === '/api/config/import' ? (((b.file || {}).sections || {}).userState || {}) : b;
  return [Object.keys(u).reduce((n, key) => n + itemsOf(u[key]), 0), Object.keys(u).reduce((n, key) => n + itemsOf(st[key]), 0)];
};
const add = Set.prototype.add, mset = Map.prototype.set, inc = Array.prototype.includes, iof = Array.prototype.indexOf, ren = fs.renameSync, lnk = fs.linkSync, wfs = fs.writeFileSync, str = JSON.stringify, slc = Array.prototype.slice, osy = fs.openSync, wsy = fs.writeSync, csy = fs.closeSync, usFd = Object.create(null);   // (r5185: the store hold's door writes ON A DESCRIPTOR — open, write, sync, close — its bytes counted too; a plain object, never a counted Set)
const CB = ['filter', 'map', 'forEach', 'some', 'every', 'find', 'findIndex', 'reduce', 'flatMap'], cbOrig = CB.map((m) => Array.prototype[m]);
let sets = 0, scans = 0, walks = 0, writes = 0, strBytes = 0, wrote = 0;
const walked = (a, x, from) => { const s0 = Math.max(0, Math.trunc(Number(from) || 0)), i = iof.call(a, x, s0); return i < 0 ? Math.max(0, a.length - s0) : i - s0 + 1; };
const on = () => { Set.prototype.add = function (v) { sets++; return add.call(this, v); }; Map.prototype.set = function (k, v) { sets++; return mset.call(this, k, v); };
  Array.prototype.includes = function (x, from) { scans += walked(this, x, from); return inc.call(this, x, from); }; Array.prototype.indexOf = function (x, from) { scans += walked(this, x, from); return iof.call(this, x, from); };
  fs.renameSync = function (a, b) { if (path.basename(String(b)) === 'user-state.json') writes++; return ren.call(fs, a, b); };
  fs.linkSync = function (a, b) { if (path.basename(String(b)) === 'user-state.json') writes++; return lnk.call(fs, a, b); };   // (B-225b: a list NOT THERE is created exclusively — its first write is a link)
  fs.writeFileSync = function (f, d, o) { if (path.basename(String(f)).startsWith('user-state.json')) wrote += typeof d === 'string' ? d.length : d && d.length ? d.length : 0; return wfs.call(fs, f, d, o); };
  fs.openSync = function (f, ...a) { const fd = osy.call(fs, f, ...a); if (path.basename(String(f)).startsWith('user-state.json')) usFd[fd] = 1; return fd; };
  fs.writeSync = function (fd, ...a) { const n = wsy.call(fs, fd, ...a); if (usFd[fd] === 1) wrote += n; return n; };
  fs.closeSync = function (fd, ...a) { delete usFd[fd]; return csy.call(fs, fd, ...a); };
  JSON.stringify = function (...a) { const t = str.apply(JSON, a); if (typeof t === 'string') strBytes += t.length; return t; };
  CB.forEach((m, j) => { const o = cbOrig[j]; Array.prototype[m] = function (cb, ...a) { const f = typeof cb === 'function' ? function (...x) { walks++; return cb.apply(this, x); } : cb; return o.call(this, f, ...a); }; });
  Array.prototype.slice = function (...a) { const r = slc.apply(this, a); walks += r.length; return r; }; };
const off = () => { Set.prototype.add = add; Map.prototype.set = mset; Array.prototype.includes = inc; Array.prototype.indexOf = iof; fs.renameSync = ren; fs.linkSync = lnk; fs.writeFileSync = wfs; fs.openSync = osy; fs.writeSync = wsy; fs.closeSync = csy; JSON.stringify = str;
  CB.forEach((m, j) => { Array.prototype[m] = cbOrig[j]; }); Array.prototype.slice = slc; };
// B-0248 (c): the child's route lands each write at its call (the store writer's contract, no latency), as the release's write at the call did
const landingWriter = () => ({ dirty(lwFile, o) { const b = o.produce(), parts = Array.isArray(b) ? b : [b], lwTmp = lwFile + '.lw.tmp'; for (let i = 0; i < parts.length; i++) fs.writeFileSync(lwTmp, parts[i], { flag: i ? 'a' : 'w' }); fs.renameSync(lwTmp, lwFile); if (o.onWritten) o.onWritten(true, null); }, durable(lwFile, o) { if (o && o.answer) o.answer(true); return Promise.resolve(true); }, pending: () => false, flushSync: () => ({ written: [], left: [] }), whyNotDurable: () => null });
const out = [];
for (const f of FILES) {
  const sc = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const key of Object.keys(require.cache)) if (key.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[key];
  const P = require(path.join(REPO, 'src/routes/persistence.js')), dir = fs.mkdtempSync(path.join(TMP, 'w-'));
  P.setup({ writer: landingWriter(), dataDir: dir, wss: { clients: new Set([{ readyState: 1, send() { } }]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, userStateClock: () => VNOW, userStateMono: () => VNOW });
  const handler = (method, p) => { const l = P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l.route.stack[0].handle; };
  const call = (method, p, body) => { let status = 200, o = null; const res = { status(c) { status = c; return res; }, json(x) { o = x; return res; } }; handler(method, p)({ body, query: {}, params: {}, headers: {} }, res, () => { }); return { status, body: o }; };
  if (sc.pre) call('post', '/api/config/import', sc.pre);
  const rs = [];
  for (const [m, p, b] of sc.reqs) {
    const [carried, held] = itemsIn(p, b, call('get', '/api/user-state', {}).body || {}), items = carried + held;
    sets = 0; scans = 0; walks = 0; writes = 0; strBytes = 0; wrote = 0; on();
    let r; try { r = call(m, p, b); } finally { off(); }
    const after = call('get', '/api/user-state', {}).body || {}, landed = itemsIn(p, b, after)[1];
    const u = p === '/api/config/import' ? (((b.file || {}).sections || {}).userState || {}) : b;
    const exact = p === '/api/user-state/batches' ? null : Object.keys(u).every((key) => JSON.stringify(after[key]) === JSON.stringify(u[key]));   // (outside the count)
    rs.push({ status: r.status, sets, scans, walks, writes, strBytes, wrote, items, carried, held, landed, exact, answer: p === '/api/user-state/batches' && r.body ? verdictsOf(r.body) : null, applied: r.body && Array.isArray(r.body.applied) ? r.body.applied.length : null });
  }
  out.push(rs);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
}
process.stdout.write(JSON.stringify({ node: process.version, out }) + '\\n');`;
  const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 26 });
  for (const f of files) { try { fs.unlinkSync(f); } catch { } }
  try { const o = JSON.parse(String(r.stdout || '').trim().split('\n').pop()); return Object.assign(o.out, { node: o.node }); } catch { return { err: `child: exit ${r.status} ${r.signal || ''} ${String(r.stderr || '').slice(-600)}` }; }
};
// THE LAWS (B-518e): a request's work is LINEAR in the items it carries and the items of the keys it touches — at most ITEM_WORK
// inserts or scanned elements per item, beside a constant; a product of two sizes (a whole key into a Set per op, a scan of the
// key per item — the shapes rounds 10 and 12 took out) reads thousands per item at these sizes. And a write that changes the
// store is ONE write. An old tab's ONE change on a big store makes ONE pass over the key it CARRIES (the road's normalize puts
// that key into its own Set once; the few-change diff looks the new item up in the old list once — the first probe on the test
// machine read 66 675 inserts and 66 685 scanned for a key of 66 671) and a constant beyond it (≤ 64) — never round 12's two
// more passes. Measured (the probe, 2026-11-18, inserts + scans): the linear legs read 0.9–82 an item (the worst a 32-value ops
// row, 2 617 for 32), the product-of-sizes controls ~1 000; ITEM_WORK 200 = 2.4 × the worst (at 100 it was 1.3 ×) and the
// array passes ride the same bound. The bytes stringified stay within STRINGIFY_K × the bytes written (a stringify per op or per
// item reads thousands of times the file).
const ITEM_WORK = 200, WORK_SLACK = 256, ONE_WORK = 64, STRINGIFY_K = 8, STRINGIFY_SLACK = 65536;
const workOf = (q) => q.sets + q.scans + q.walks;
const strOk = (q) => q.strBytes <= STRINGIFY_K * q.wrote + STRINGIFY_SLACK;

console.log('§1 the control, and law A: each door\'s worst legal request (this run, this hub code)');
// THE CONTROL — the largest legal import: config values at their bound filling the user-state section's 12 MiB
const nCtl = Math.floor(12000000 / (JSON.stringify(OBJ).length + 80));
const ctlState = US({ sessionConfigs: Object.fromEntries(Array.from({ length: nCtl }, (_, i) => [k(i), { blob: OBJ }])) });
const ctl = hub().timed('post', '/api/config/import', parsed(IMPORT(ctlState)));
const C = ctl.ms;
ok(ctl.status === 200, `the control: an import of ${nCtl} config values at the bound (${(JSON.stringify(ctlState).length / 1048576).toFixed(1)} MiB) ⇒ ${ctl.status} in ${C.toFixed(0)} ms`, { status: ctl.status, body: ctl.body });
const xC = (ms) => `${ms.toFixed(0)} ms, ×${(ms / C).toFixed(2)} the control`;
{
  const rows = [];
  rows.push(['5 000 one-op archives', batches('pgopsarch01', OPS, (i) => [{ key: 'archivedSessions', item: k(i), value: true }])]);
  rows.push(['5 000 one-op member adds to one group', batches('pgopsmemb01', OPS, (i) => [{ key: 'sessionGroups', item: 'g', member: k(i), value: true }])]);
  rows.push(['2 MiB of folder names at 4 096 characters', batches('pgopsname01', Math.floor((OPS_BODY - 8192) / (NAME + 90)), (i) => [{ key: 'archivedFolders', item: ('/f' + i + '/').padEnd(NAME, 'x'), value: true }])]);
  rows.push(['2 MiB of folder names of tabs and backslashes (each escaped once)', batches('pgopstabs01', Math.floor((OPS_BODY - 8192) / (2 * NAME + 90)), (i) => [{ key: 'archivedFolders', item: ('/' + i + '/').padEnd(NAME, i % 2 ? '\t' : '\\'), value: true }])]);
  rows.push(['512 KiB of config values at their bound (32 objects)', batches('pgopsvals01', Math.floor(VALUES / VALUE), (i) => [{ key: 'sessionConfigs', item: k(i), field: 'blob', value: OBJ }])]);
  const dv = (i) => [[[[i % 10, 'deep value ' + String(i).padStart(4, '0')]]]], nDeep = Math.min(OPS, Math.floor(VALUES / fileLen(dv(0))));
  rows.push([`512 KiB of values at depth 4 (${nDeep})`, batches('pgopsdeep01', 1, () => Array.from({ length: nDeep }, (_, i) => ({ key: 'sessionConfigs', item: k(i), field: 'd', value: dv(i) })))]);
  rows.push(['5 000 renames (512 KiB of names)', batches('pgopsrena01', OPS, (i) => [{ key: 'customNames', item: k(i), value: 'a name of about one hundred characters, as long as a person writes one'.padEnd(98, '.') }])]);
  for (const [what, body] of rows) {
    const bytes = JSON.stringify(body).length;
    const r = hub().timed('patch', '/api/user-state/batches', parsed(body));
    const applied = (r.body && r.body.applied || []).length;
    ok(r.status === 200 && applied === body.batches.length && bytes <= OPS_BODY,
      `law A, the ops door: ${what} (${(bytes / 1048576).toFixed(2)} MiB) ⇒ ${applied} applied (${xC(r.ms)} — printed, never judged: its WORK is judged in §W)`, { status: r.status, code: codeOf(r), applied, ms: r.ms, C });
    workLeg(`law A, the ops door: ${what}`, 'linear', null, [['patch', '/api/user-state/batches', body]], [{ answer: verdictsOf(r.body || {}) }]);
  }
}
{
  // master's roads (round 13: no bound there — the bench reads each against master's same door; here, since B-518e, each road's
  // WORK, linear in the key it carries, §W): the whole-key door at ~12 MiB, and an old tab's ONE change on a big store — 10× the owner's
  // (and ~270 000 archived ids below, judged by a COUNT since B-518e: round 12 diffed the whole key through two Sets — ×2 master's write for
  // one archive; now the common head and tail are skipped and the change looked up)
  const tabName = (i) => (k(i) + '\t').padEnd(300, i % 2 ? '\t' : '\\');
  const rows = [
    ['config values at their bound', { sessionConfigs: Object.fromEntries(Array.from({ length: nCtl }, (_, i) => [k(i), { blob: OBJ }])) }],
    ['20 000 names of tabs and backslashes', { archivedSessions: Array.from({ length: MOVES }, (_, i) => tabName(i)) }],
    ['20 000 renames of 560 characters', { customNames: Object.fromEntries(Array.from({ length: MOVES }, (_, i) => [k(i), 'r'.repeat(560)])) }],
    ['config values at depth 4 (4 MiB)', { sessionConfigs: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [k(i), { d: Array.from({ length: 60 }, (_, j) => [[[j, 'deep']]]) }])) }],
  ];
  // (int402 judged these roads over ROUNDS rounds, the median over the control's median — still a ratio of two clocks: B-518e's
  // verdict read such a ratio red ALONE on the serial lane. Each road now runs ONCE here for what it answers and lands, its time
  // printed; its WORK is judged in §W — linear in the key it carries, ONE write)
  rows.forEach(([what, content]) => {
    const text = JSON.stringify(content), bytes = text.length;
    const r = hub().timed('patch', '/api/user-state', JSON.parse(text));
    ok(r.status === 200 && bytes <= BIG, `law A, master's road (the whole-key door): ${what} (${(bytes / 1048576).toFixed(1)} MiB) ⇒ ${r.status} (${xC(r.ms)} — printed, never judged: its WORK in §W)`, { status: r.status, code: codeOf(r) });
    workLeg(`law A, master's road: ${what}`, 'linear', null, [['patch', '/api/user-state', content]], [{ landed: true }]);
  });
  // AN OLD TAB'S ONE CHANGE ON 10× THE OWNER'S STORE (int403's ×1.18 of its 1× ceiling on a hosted run — one sample): it lands,
  // ONE op; its WORK through the whole road is ONE pass over the key it carries and a constant beyond it (§W), never a pass more
  const owner10 = { archivedSessions: Array.from({ length: 66670 }, (_, i) => k(i)), customNames: Object.fromEntries(Array.from({ length: 7530 }, (_, i) => [k(i), 'a conversation name of forty characters!'])) };
  {
    const n10 = owner10.archivedSessions.length, h = hub();
    h.timed('post', '/api/config/import', parsed(IMPORT(US(owner10))));
    const more = { archivedSessions: [...owner10.archivedSessions, k(n10 + 1)] };
    const r = h.timed('patch', '/api/user-state', parsed(more));
    const onDisk = (JSON.parse(h.file()).archivedSessions || []).length;
    ok(r.status === 200 && onDisk === n10 + 1,
      `law A, master's road: an old tab archives ONE more on 10× the owner's store (its whole key, ${n10 + 1} ids) ⇒ ${r.status}, ${onDisk} on disk (${xC(r.ms)} — printed, never judged: its WORK in §W)`, { status: r.status, onDisk });
    workLeg(`law A, master's road: an old tab archives ONE more on 10× the owner's store (${n10 + 1} ids)`, 'one', IMPORT(US(owner10)), [['patch', '/api/user-state', more]], [{ landed: true }]);
  }
  // B-518e (the test machine's wide run under eight lanes read this leg ×3.05 against its 3× ceiling — ONE sample against ONE control,
  // a RATIO OF TWO WALL CLOCKS; the coordinator's law: a fast leg's verdict is a count or an order). What the ceiling guarded is the
  // diff's SHAPE (round 12 put the whole key into two Sets — ×2 master's write): so the verdict is now a COUNT — the items the diff of
  // that one more id puts into Sets (Set.prototype.add wrapped for the one call; `new Set(list)` adds through it) — beside the road's
  // own answer and what lands on disk. Its time is printed, never judged. CONTROL: the round-12 shape (two Sets of the whole key, a
  // patched copy of user-state-ops.js) puts the whole key in, twice.
  // THE COUNT IS TAKEN IN A CHILD (the cure's adversarial read: a Set.prototype.add replaced in THIS process — even restored — may keep
  // every later `new Set(list)` here on V8's slow path, and law B's ratios would lean red): a fresh node requires the module (the
  // tree's, or the round-12 copy), builds the same two keys, and counts every Set.prototype.add AND Map.prototype.set the ONE diffOps
  // call makes (a Map-shaped regression is a regression of the same shape); it answers { n, ops, op }
  const diffCount = (modPath, n) => {
    const code = `const UO = require(${JSON.stringify(modPath)});
const k = (i) => 'claude:' + String(i).padStart(8, '0') + '-0000-4000-8000-000000000000';
const US = (o) => ({ stateVersion: 2, starredSessions: [], archivedSessions: [], archivedFolders: [], customNames: {}, sessionModes: {}, sessionConfigs: {}, sessionGroups: {}, groupFolders: {}, ...o });
const ids = Array.from({ length: ${n} }, (_, i) => k(i)), before = US({ archivedSessions: ids }), after = US({ archivedSessions: [...ids, k(${n} + 1)] });
const add = Set.prototype.add, set = Map.prototype.set; let n = 0;
Set.prototype.add = function (v) { n++; return add.call(this, v); }; Map.prototype.set = function (a, b) { n++; return set.call(this, a, b); };
let out; try { out = UO.diffOps(before, after); } finally { Set.prototype.add = add; Map.prototype.set = set; }
process.stdout.write(JSON.stringify({ n, ops: out.length, op: out[0] }));`;
    const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 20 });
    try { return JSON.parse(r.stdout); } catch { return { err: `child: exit ${r.status} ${String(r.stderr || '').slice(-300)}` }; }
  };
  for (const [what, st, n] of [['~270 000 archived ids (≈ 12 MiB)', { archivedSessions: Array.from({ length: 270000 }, (_, i) => k(i)) }, 270000]]) {
    const h = hub();
    h.timed('post', '/api/config/import', parsed(IMPORT(US(st))));
    const more = { archivedSessions: [...st.archivedSessions, k(n + 1)] };
    const r = h.timed('patch', '/api/user-state', parsed(more));
    const onDisk = (JSON.parse(h.file()).archivedSessions || []).length;
    const d = diffCount(path.join(REPO, 'src/user-state-ops.js'), n);
    const one = (x) => !!x && x.ops === 1 && !!x.op && x.op.key === 'archivedSessions' && x.op.item === k(n + 1) && x.op.value === true;
    ok(r.status === 200 && onDisk === n + 1 && one(d) && d.n <= 64,
      `law A, master's road: an old tab archives ONE more on ${what} (its whole key, ${n + 1} ids) ⇒ ${r.status}, ${onDisk} on disk; its diff is ONE op and puts ${d.n} item(s) into Sets / Maps (≤ 64 — counted in a child, not timed; the request read ${xC(r.ms)})`, { status: r.status, onDisk, d });
    const src12 = fs.readFileSync(path.join(REPO, 'src/user-state-ops.js'), 'utf8'), HEAD = 'function listDiff(bl, al, gone, came) {\n  const nb = bl.length, na = al.length;';
    const p12 = src12.includes(HEAD) ? mutantCopies('user-state-round12', REPO).write('src/user-state-ops.js', editAnchor(src12, HEAD, 'function listDiff(bl, al, gone, came) {\n  { const as = new Set(al), bs = new Set(bl); for (const x of bl) if (!as.has(x)) gone(x); for (const x of al) if (!bs.has(x)) came(x); return; }\n  const nb = bl.length, na = al.length;', "src/user-state-ops.js"), 'two-sets') : null;
    const d12 = p12 ? diffCount(p12, n) : null;
    ok(!!d12 && one(d12) && d12.n >= 2 * n,
      `CONTROL: the round-12 shape (two Sets of the whole key, a patched copy, counted in its own child) gives the same ONE op and puts ${d12 ? d12.n : '?'} items into Sets / Maps (≥ 2 × ${n}) — the count above is red on it`, d12);
  }
}

console.log('§2 law B: what the product\'s own pages send — in act order, every part once; each request\'s WORK judged in §W (B-518e: its time printed, never judged)');
/** the page's engine against a hub: every request the engine sends, timed at the hub, answered — until nothing waits. `echo`: each
 *  answer comes back on a later turn and the hub's state follows it as an echo (round 13: round 12 re-sent the part in flight at every
 *  echo and every answer — 18 requests for a select-all of 20 000) */
const drive = async (h, pageId, ops, echo = false) => {
  const reqs = [], words = [], views = [];
  let inflight = 0, maxInflight = 0;   // (round 13: a backlog past one request goes ONE window at a time)
  // (with answers on a later turn, the engine's own timers run at their own length — squeezed, a 15 s send bound would call a part late
  // while it is being answered, and re-send it)
  const eng = UO.createSync({ pageId, setTimer: (fn, ms) => setTimeout(fn, echo ? ms : Math.min(ms, 5)), clearTimer: (t) => clearTimeout(t), say: (key) => words.push(key), onView: (v, why) => views.push(why),
    send: (body) => { const r = h.timed('patch', '/api/user-state/batches', parsed(body)); reqs.push({ body: parsed(body), answer: verdictsOf(r.body || {}), ms: r.ms, ops: body.batches.reduce((n, b) => n + b.ops.length, 0), bytes: JSON.stringify(body).length, ids: body.batches.map((b) => b.batch), applied: (r.body.applied || []).length });
      const ans = ({ ok: r.status === 200, status: r.status, rev: r.body.rev, epoch: r.body.epoch, refused: r.body.refused, old: r.body.old, applied: r.body.applied, held: r.body.held, superseded: r.body.superseded, dropped: r.body.dropped }); if (!echo) return Promise.resolve(ans); inflight++; maxInflight = Math.max(maxInflight, inflight); return new Promise((res) => setImmediate(() => { inflight--; res(ans); setImmediate(() => { try { eng.apply(h.timed('get', '/api/user-state', {}).body); } catch { } }); })); } });
  eng.apply(h.timed('get', '/api/user-state', {}).body);
  eng.record(ops);
  for (let t = 0; t < 400 && reqs.reduce((n, q) => n + q.ops, 0) < ops.length; t++) await new Promise((r) => setImmediate(r));
  for (let t = 0; t < 40; t++) await new Promise((r) => setImmediate(r));   // (the last answer and its echo taken)
  const order = reqs.flatMap((q) => q.ids);
  const dups = order.length - new Set(order).size;   // (a part sent twice)
  const inOrder = order.every((id, i) => i === 0 || Number(id.split(':')[1]) > Number(order[i - 1].split(':')[1]));
  return { reqs, words, answers: views.filter((w) => w === 'answer').length, inOrder, dups, maxInflight, worst: Math.max(...reqs.map((q) => q.ms)) };
};
for (const [n, echo] of [[2000, false], [20000, false], [20000, true]]) {
  const h = hub();
  const d = await drive(h, 'pgselectal' + (n === 2000 ? '2' : echo ? '4' : '3'), Array.from({ length: n }, (_, i) => ({ key: 'archivedSessions', item: k(i), value: true })), echo);
  const onDisk = (JSON.parse(h.file()).archivedSessions || []).length;
  ok(onDisk === n && d.reqs.length === Math.ceil(n / OPS) && d.reqs.every((q) => q.ops <= OPS && q.bytes <= OPS_BODY && q.applied > 0) && d.inOrder && !d.dups && d.maxInflight <= 1 && !d.words.length && d.answers <= d.reqs.length,
    `law B: a select-all of ${n}${echo ? ' (its answers and echoes coming back)' : ''} ⇒ ${d.reqs.length} request${d.reqs.length > 1 ? 's' : ''} of ≤ ${OPS} ops (${d.reqs.map((q) => q.ms.toFixed(0)).join(' / ')} ms; the worst ×${(d.worst / C).toFixed(2)} the control), all ${onDisk} on disk in act order, ${d.dups} parts sent twice, at most ${d.maxInflight} in flight, ${d.answers} repaints for ${d.reqs.length} answers, no word`, { reqs: d.reqs.map((q) => ({ ms: q.ms, ops: q.ops, applied: q.applied })), onDisk, words: d.words, answers: d.answers });
  workLeg(`law B: a select-all of ${n}${echo ? ' (its answers and echoes coming back)' : ''} — ${d.reqs.length} requests`, 'linear', null, d.reqs.map((q) => ['patch', '/api/user-state/batches', q.body]), d.reqs.map((q) => ({ answer: q.answer })));
}
const groupHub = hub();
{
  // the largest group the product builds: 20 000 members added in one act (the Manage dialog's) — four requests, the last into 15 000
  const d = await drive(groupHub, 'pggroupbig1', Array.from({ length: GROUP }, (_, i) => ({ key: 'sessionGroups', item: 'the big group', member: k(i), value: true })));
  const g = (JSON.parse(groupHub.file()).sessionGroups || {})['the big group'] || [];
  ok(g.length === GROUP && d.reqs.length === 4 && d.inOrder && !d.words.length,
    `law B: the largest group (${GROUP} members, one act) ⇒ ${d.reqs.length} requests (${d.reqs.map((q) => q.ms.toFixed(0)).join(' / ')} ms — the last adds 5 000 to a group of 15 000; the worst ×${(d.worst / C).toFixed(2)} the control), ${g.length} members on disk in order, no word`, { reqs: d.reqs.map((q) => ({ ms: q.ms, applied: q.applied })), n: g.length });
  workLeg(`law B: the largest group (${GROUP} members, one act) — 4 requests, the last into ${GROUP - OPS}`, 'linear', null, d.reqs.map((q) => ['patch', '/api/user-state/batches', q.body]), d.reqs.map((q) => ({ answer: q.answer })));
}
for (const door of ['patch', 'post']) {
  // an OLD TAB's select-all of 20 000 through its whole key (a page from before the ops door): it lands
  const h = hub();
  const ids = Array.from({ length: MOVES }, (_, i) => k(i));
  const r = h.timed(door, '/api/user-state', parsed(door === 'post' ? US({ archivedSessions: ids }) : { archivedSessions: ids }));
  const onDisk = (JSON.parse(h.file()).archivedSessions || []).length;
  ok(r.status === 200 && onDisk === MOVES, `law B: an old tab's select-all of ${MOVES} through its whole key (${door.toUpperCase()} /api/user-state) ⇒ ${r.status}, ${onDisk} on disk (${xC(r.ms)} — printed, never judged: its WORK in §W)`, { status: r.status, code: codeOf(r), onDisk });
  workLeg(`law B: an old tab's select-all of ${MOVES} through its whole key (${door.toUpperCase()})`, 'linear', null, [[door, '/api/user-state', door === 'post' ? US({ archivedSessions: ids }) : { archivedSessions: ids }]], [{ landed: true }]);
}
{
  // an import at 10× the owner's store (6 667 archived, 753 names, 32 configs — the shape of data/user-state.json, sizes only) in ONE request
  const st = US({ archivedSessions: Array.from({ length: 66670 }, (_, i) => k(i)), customNames: Object.fromEntries(Array.from({ length: 7530 }, (_, i) => [k(i), 'a conversation name of forty characters!'])), sessionConfigs: Object.fromEntries(Array.from({ length: 320 }, (_, i) => [k(i), { model: 'claude-opus-5-5', effort: 'high', account: 'acct-0001' }])) });
  const r = hub().timed('post', '/api/config/import', parsed(IMPORT(st)));
  ok(r.status === 200, `law B: an import at 10× the owner's store (${(JSON.stringify(st).length / 1048576).toFixed(1)} MiB) in one request ⇒ ${r.status} (${xC(r.ms)} — printed, never judged: its WORK in §W)`, { status: r.status, code: codeOf(r) });
  workLeg(`law B: an import at 10× the owner's store in one request`, 'linear', null, [['post', '/api/config/import', IMPORT(st)]], [{ landed: true }]);
}

console.log('§4 the ops door: one over each bound, from its NUMBER — refused by name, nothing written; the bound itself taken');
{
  const h = hub();
  const P = (body) => h.timed('patch', '/api/user-state/batches', parsed(body));
  let seq = 0;
  const one = (ops) => ({ batches: [{ batch: `pgoneover01:${++seq}`, age: 0, ops }] });
  /** each door's answer for one content: every door refuses `over` by `want` with nothing written, and takes `at` */
  const doors = (label, want, cases) => {
    const out = [];
    for (const [door, fn, atC, overC] of cases) {
      const r0 = h.rev();
      const o = fn(overC);
      const r1 = h.rev();
      const a = fn(atC);
      const took = a.status === 200 && (a.body && Array.isArray(a.body.applied) ? a.body.applied.length === 1 : !codeOf(a));
      out.push({ door, over: codeOf(o), wrote: r1 !== r0, at: took ? 'taken' : `${a.status} ${codeOf(a)}` });
    }
    ok(out.every((x) => x.over === want && !x.wrote && x.at === 'taken'),
      `${label}: ${out.map((x) => `${x.door} ⇒ «${x.over}»${x.wrote ? ' WROTE' : ''}, at the bound ${x.at}`).join('; ')}`, out);
  };
  // ops: 5 000 in a request taken, 5 001 refused — two batches of 5 000 + 1, and one batch of 5 001
  {
    const arch = (n, from) => Array.from({ length: n }, (_, i) => ({ key: 'archivedSessions', item: k(from + i), value: true }));
    const r0 = h.rev();
    const two = P({ batches: [{ batch: 'pgopsbound1:1', age: 0, ops: arch(5000, 0) }, { batch: 'pgopsbound1:2', age: 0, ops: arch(1, 5000) }] });
    const oneB = P({ batches: [{ batch: 'pgopsbound2:1', age: 0, ops: arch(5001, 0) }] });
    const r1 = h.rev();
    const at = P({ batches: [{ batch: 'pgopsbound3:1', age: 0, ops: arch(5000, 0) }] });
    ok(two.status === 400 && codeOf(two) === 'too-many-ops' && codeOf(oneB) === 'too-many-ops' && r1 === r0 && (at.body.applied || []).length === 1,
      `ops: 5000 + 1 in one request ⇒ ${two.status} «${codeOf(two)}»; one batch of 5001 ⇒ «${codeOf(oneB)}»; nothing written; 5000 ⇒ taken`, { two: two.body, oneB: oneB.body });
  }
  // the request's values: 524 288 characters taken, 524 289 refused (31 values of 16 384, one of 16 383, and a number of 1 or 2 digits)
  {
    const vals = (last) => [...Array.from({ length: 31 }, (_, i) => ({ key: 'sessionConfigs', item: k(100 + i), field: 'v', value: 'v'.repeat(VALUE - 2) })), { key: 'sessionConfigs', item: k(131), field: 'v', value: 'v'.repeat(VALUE - 3) }, { key: 'sessionConfigs', item: k(132), field: 'n', value: last }];
    const r0 = h.rev();
    const over = P(one(vals(10)));
    const r1 = h.rev();
    const at = P(one(vals(0)));
    ok(codeOf(over) === 'too-large-values' && r1 === r0 && (at.body.applied || []).length === 1, `the request's values: 524289 characters ⇒ «${codeOf(over)}», nothing written; 524288 ⇒ taken`, { over: over.body, at: at.body });
  }
  const sv = (n) => 'v'.repeat(n - 2);   // a string whose value measure is n
  doors('one value: 16384 characters taken, 16385 refused', 'too-large-value', [
    ['ops', (v) => P(one([{ key: 'customNames', item: k(200), value: v }])), sv(VALUE), sv(VALUE + 1)]]);
  // …and a value of QUOTES, each written escaped (two characters): 8 191 of them is 16 384 as the file holds it, 8 192 one pair past
  const sq = (n) => '"'.repeat((n - 2) / 2);
  doors('one value of escaped characters: 16384 taken, 16386 refused', 'too-large-value', [
    ['ops', (v) => P(one([{ key: 'customNames', item: k(210), value: v }])), sq(VALUE), sq(VALUE + 2)]]);
  const nm = (n, c) => (c + '/').padEnd(n, 'n');
  doors('a name: 4096 characters taken, 4097 refused', 'not-a-name', [
    ['ops', (x) => P(one([{ key: 'archivedFolders', item: x, value: true }])), nm(NAME, 'a'), nm(NAME + 1, 'b')]]);
  const deep = (n) => { let v = 1; for (let i = 0; i < n; i++) v = [v]; return v; };
  doors('depth: 4 levels taken, 5 refused', 'too-deep', [
    ['ops', (v) => P(one([{ key: 'sessionConfigs', item: k(300), field: 'd', value: v }])), deep(DEPTH), deep(DEPTH + 1)]]);
  const members = (n, from = 0) => Array.from({ length: n }, (_, i) => k(from + i));
  {
    // the ops door: the group the product built (§2, 20 000 members) grows by one ⇒ refused by name
    const r0 = groupHub.rev();
    const grow = groupHub.timed('patch', '/api/user-state/batches', { batches: [{ batch: 'pggroupbig2:1', age: 0, ops: [{ key: 'sessionGroups', item: 'the big group', member: k(GROUP), value: true }] }] });
    ok(codeOf(grow) === 'too-large-group' && groupHub.rev() === r0, `a group: the ops door ⇒ member ${GROUP + 1} of a group of ${GROUP} ⇒ «${codeOf(grow)}», nothing written`, grow.body);
  }
  // a field name: 200 characters taken, 201 refused (round 13: the bound had no pin — doubled or removed, both suites stayed green)
  {
    const f = (n) => 'f'.padEnd(n, 'x');
    const r0 = h.rev();
    const over = P(one([{ key: 'sessionConfigs', item: k(400), field: f(FIELD + 1), value: 1 }]));
    const r1 = h.rev();
    const at = P(one([{ key: 'sessionConfigs', item: k(400), field: f(FIELD), value: 1 }]));
    ok(codeOf(over) === 'not-a-name' && r1 === r0 && (at.body.applied || []).length === 1, `a field name: 201 characters ⇒ «${codeOf(over)}», nothing written; 200 ⇒ taken`, { over: over.body, at: at.body });
  }
}

console.log('§6 MASTER\'S ROADS TAKE WHAT MASTER TAKES (round 13): a person\'s export imports with every section; an old tab saves over any stored state; an old tab\'s select-all of 25 000 lands');
{
  // each state written through master's road (an old tab's whole key), exported (user state + settings), imported into a fresh hub —
  // every section applied and the user state equal to what was written, as master's own file would hold it; then an old tab on the
  // first hub saves another key (a star) and the same key once more over it
  const deep6 = (() => { let v = 1; for (let i = 0; i < 6; i++) v = [v]; return v; })();
  const scenes = [
    ['500 archived ids', { archivedSessions: Array.from({ length: 500 }, (_, i) => k(i)) }],
    ['25 000 archived ids', { archivedSessions: Array.from({ length: 25000 }, (_, i) => k(i)) }],
    ['100 000 archived ids', { archivedSessions: Array.from({ length: 100000 }, (_, i) => k(i)) }],
    ['a config value 6 deep', { sessionConfigs: { [k(1)]: { tools: deep6 } } }],
    ['a name of 20 000 characters', { customNames: { [k(1)]: 'n'.repeat(20000) } }],
    ['a group of 25 000', { sessionGroups: { g: Array.from({ length: 25000 }, (_, i) => k(i)) } }],
  ];
  const rows = [];
  for (const [what, content] of scenes) {
    const [key] = Object.keys(content);
    const a = hub();
    const w1 = a.timed('patch', '/api/user-state', parsed(content));
    const exp = await a.answer('post', '/api/config/export', { sections: ['userState', 'settings'], includeSensitive: [] });
    const b = hub();
    const imp = exp.status === 200 ? b.timed('post', '/api/config/import', parsed({ file: exp.body, sections: ['userState', 'settings'], includeSensitive: [] })) : { status: 0, body: null };
    const equal = JSON.stringify((JSON.parse(b.file())[key])) === JSON.stringify(content[key]);
    const star = a.timed('patch', '/api/user-state', parsed({ starredSessions: [k(9)] }));
    const again = a.timed('patch', '/api/user-state', parsed({ [key]: content[key] }));
    const starred = (JSON.parse(a.file()).starredSessions || []).includes(k(9));
    rows.push({ what, write: w1.status, export: exp.status, import: imp.status, applied: ((imp.body || {}).applied || []).join('+'), equal, star: star.status, again: again.status, starred });
  }
  ok(rows.every((x) => x.write === 200 && x.export === 200 && x.import === 200 && /userState/.test(x.applied) && /settings/.test(x.applied) && x.equal && x.star === 200 && x.again === 200 && x.starred),
    `a person's export imports, an old tab saves over it — ${rows.map((x) => `${x.what}: written ${x.write}, exported ${x.export}, imported ${x.import} (${x.applied}, equal ${x.equal}), an old tab's star ${x.star}, its key again ${x.again}`).join('; ')}`, rows);
  // the file writer takes a LIST too (round 13: round 12's parts writer read any array as parts — bookmarks.json, a JSON array, threw at
  // every write, and an import of bookmarks answered 500)
  {
    const hb = hub();
    const list = [{ name: 'Imported', url: 'https://example.test/' }, { name: 'Two', url: 'https://example.test/2' }];
    const rb = hb.timed('post', '/api/bookmarks', parsed(list));
    const onDisk = (() => { try { return JSON.parse(fs.readFileSync(path.join(hb.dir, 'bookmarks.json'), 'utf8')); } catch { return null; } })();
    const ri = hb.timed('post', '/api/config/import', parsed({ file: { app: 'vibespace-config', sections: { bookmarks: list.slice(0, 1) } }, sections: ['bookmarks'], includeSensitive: [] }));
    ok(rb.status === 200 && JSON.stringify(onDisk) === JSON.stringify(list) && ri.status === 200, `the file writer takes a list: bookmarks (a JSON array) through their route ⇒ ${rb.status}, the file as sent; an import of bookmarks ⇒ ${ri.status}`, { rb, ri: ri.body, onDisk });
  }
  // an old tab's select-all of 25 000 (past 20 000 changed items): it lands — ONE record for the key (round 14: the digests of the
  // slots it changed), never a refusal
  for (const door of ['patch', 'post']) {
    const h = hub();
    const ids = Array.from({ length: 25000 }, (_, i) => k(i));
    const r = h.timed(door, '/api/user-state', parsed(door === 'post' ? US({ archivedSessions: ids }) : { archivedSessions: ids }));
    const st = JSON.parse(h.file()), facts = Object.keys(st[UO.FACTS_KEY] || {});
    ok(r.status === 200 && (st.archivedSessions || []).length === 25000 && facts.length === 1 && facts[0] === keySet('archivedSessions') && runsOf(st, 'archivedSessions').join() === '25000',
      `an old tab's select-all of 25 000 through its whole key (${door.toUpperCase()}) ⇒ ${r.status}, ${(st.archivedSessions || []).length} on disk, ${facts.length} fact (the key's record: ${runsOf(st, 'archivedSessions').join('+')} digests) (${xC(r.ms)} — printed, never judged: its WORK in §W)`, { status: r.status, facts: facts.slice(0, 3) });
    workLeg(`an old tab's select-all of 25 000 through its whole key (${door.toUpperCase()})`, 'linear', null, [[door, '/api/user-state', door === 'post' ? US({ archivedSessions: ids }) : { archivedSessions: ids }]], [{ landed: true }]);
  }
}

console.log('§W B-518e — WORK, NEVER THE CLOCK: what each request above DID (counted in a child: Set / Map inserts, the elements an includes / indexOf walked, the store\'s writes)');
{
  const WR = workCounts(WORK);
  ok(Array.isArray(WR) && WR.length === WORK.length, `the counting child answered for ${Array.isArray(WR) ? WR.length : 0} of ${WORK.length} scenarios`, Array.isArray(WR) ? undefined : WR);
  // the replay is the original: each ops-door request answered what the original run answered — every verdict counted, the dropped
  // OPS by number; each whole key and import left the store holding exactly what it carries (the same JSON in every key it sends)
  // — never less work counted than the leg names
  const asOriginal = (q, e) => !!e && (e.answer ? !!q.answer && JSON.stringify(q.answer) === JSON.stringify(e.answer) : e.landed === true && q.landed === q.carried && q.exact === true);
  if (Array.isArray(WR)) WORK.forEach((sc, i) => {
    const rs = WR[i] || [], per = rs.map((q) => `${workOf(q)} (${q.sets} inserts, ${q.scans} scanned, ${q.walks} walked) for ${q.items} items, ${q.writes} write${q.writes === 1 ? '' : 's'}, ${q.strBytes} B stringified of ${q.wrote} written`).join(' · ');
    if (sc.law === 'one') {
      const q = rs[0] || {};
      ok(rs.length === 1 && q.status === 200 && asOriginal(q, (sc.expect || [])[0]) && q.sets <= q.carried + ONE_WORK && q.scans <= q.carried + ONE_WORK && workOf(q) <= ITEM_WORK * q.items + WORK_SLACK && strOk(q) && q.writes === 1,
        `${sc.leg}: one Set pass and one scan pass over the ${q.carried} items it carries and a constant — ${q.sets} Set / Map inserts and ${q.scans} scanned elements (each ≤ ${q.carried} + ${ONE_WORK}), never a pass more over the store's ${q.held}; ${q.walks} walked; ${q.strBytes} B stringified of ${q.wrote} written (≤ ${STRINGIFY_K} ×); ONE write`, rs);
    } else {
      ok(rs.length === sc.reqs.length && rs.every((q, j) => q.status === 200 && asOriginal(q, (sc.expect || [])[j]) && workOf(q) <= ITEM_WORK * q.items + WORK_SLACK && strOk(q) && q.writes === 1),
        `${sc.leg}: each request applied what the original did (the replay is the run), its WORK linear in its items (≤ ${ITEM_WORK} an item + ${WORK_SLACK}), its stringify within ${STRINGIFY_K} × what it wrote, ONE write — ${per}`, { expect: sc.expect, rs });
    }
  });
  // THE ONE NEAR-EXACT BOUND (carried + ONE_WORK), its readings by Node — Node 22.23.5 (the probe run 76886378e-20261118062403-box,
  // the second test machine's runner): 66 675 inserts / 66 685 scanned for a key of 66 671. Node 24: read at the box's first run of
  // this tip (the coordinator's ruling 07:56Z: the hub box's fast tier runs Node 24 — the integrator quotes the line below from the
  // train's box run). If the two differ, the bound follows the larger, with its reason.
  if (Array.isArray(WR)) console.log(`  · the one-change count on Node ${WR.node}: ${WORK.map((sc, i) => [sc, i]).filter(([sc]) => sc.law === 'one').map(([, i]) => (WR[i] || [])[0] || {}).map((q) => `${q.sets} inserts / ${q.scans} scanned for ${q.carried}`).join(' · ')}`);
  // THE CONTROLS (each red here): the shapes the laws exist for, in patched copies of user-state-ops.js, counted the same way
  const srcOps = fs.readFileSync(path.join(REPO, 'src/user-state-ops.js'), 'utf8');
  const ORD_ADD = '    add(x) { if (at.has(x)) return; at.set(x, order.length); order.push(x); },';
  const LD_HEAD = 'function listDiff(bl, al, gone, came) {\n  const nb = bl.length, na = al.length;';
  if (srcOps.includes(ORD_ADD)) {
    // (1) a product of sizes ON the member-add road: ordered()'s add looks the member up by scanning the list (an includes),
    // not its Map — 2 000 adds into a group of 2 000 (the first probe's «a Set per op» copy read the tree's own count: that
    // Set is built once per request on this road, so it was no control)
    const pathA = mutantCopies('usb-ordered-scan', REPO).write('src/user-state-ops.js', editAnchor(srcOps, ORD_ADD, ORD_ADD.replace('if (at.has(x)) return;', 'if (order.includes(x)) return;'), "src/user-state-ops.js"));
    const g0 = Array.from({ length: 2000 }, (_, i) => k(i));
    const body = batches('pgworkctl01', 1, () => Array.from({ length: 2000 }, (_, i) => ({ key: 'sessionGroups', item: 'g', member: k(5000 + i), value: true })));
    const sc = { pre: IMPORT(US({ sessionGroups: { g: g0 } })), reqs: [['patch', '/api/user-state/batches', body]] };
    const real = workCounts([sc]), mut = workCounts([sc], { ops: pathA });
    const qr = (real[0] || [])[0] || {}, qm = (mut[0] || [])[0] || {};
    ok(qr.status === 200 && !!qr.answer && !!qm.answer && JSON.stringify(qr.answer) === JSON.stringify(qm.answer) && qr.answer.applied === 1 && qr.answer.dropped === 0 && workOf(qr) <= ITEM_WORK * qr.items + WORK_SLACK && qm.status === 200 && workOf(qm) > ITEM_WORK * qm.items + WORK_SLACK,
      `CONTROL: 2 000 member adds into a group of 2 000 — the tree's ${workOf(qr)} for ${qr.items} items (green); ordered()'s add as a scan of the list (a patched copy) ${workOf(qm)} — RED by the law`, { real, mut });
  } else ok(false, 'CONTROL: ordered()\'s add line is not in src/user-state-ops.js — the control cannot be made', null);
  if (srcOps.includes(LD_HEAD)) {
    // (2) the whole key scanned per item: listDiff as two includes loops — an old tab's whole key of 2 001 over a store of 2 000
    const pathB = mutantCopies('usb-listdiff-scan', REPO).write('src/user-state-ops.js', editAnchor(srcOps, LD_HEAD, 'function listDiff(bl, al, gone, came) {\n  { for (const x of bl) if (!al.includes(x)) gone(x); for (const x of al) if (!bl.includes(x)) came(x); return; }\n  const nb = bl.length, na = al.length;', "src/user-state-ops.js"));
    // (3) round 12's shape: the whole key into two Sets — ONE more id on a store of 66 670
    const pathC = mutantCopies('usb-listdiff-round12', REPO).write('src/user-state-ops.js', editAnchor(srcOps, LD_HEAD, 'function listDiff(bl, al, gone, came) {\n  { const as = new Set(al), bs = new Set(bl); for (const x of bl) if (!as.has(x)) gone(x); for (const x of al) if (!bs.has(x)) came(x); return; }\n  const nb = bl.length, na = al.length;', "src/user-state-ops.js"));
    const ids = Array.from({ length: 2000 }, (_, i) => k(i));
    const scB = { pre: IMPORT(US({ archivedSessions: ids })), reqs: [['patch', '/api/user-state', { archivedSessions: [k(9999), ...ids.slice(0, 1000), k(9998), ...ids.slice(1000)] }]] };
    const ids10 = Array.from({ length: 66670 }, (_, i) => k(i));
    const scC = { pre: IMPORT(US({ archivedSessions: ids10 })), reqs: [['patch', '/api/user-state', { archivedSessions: [...ids10, k(66671)] }]] };
    const realB = workCounts([scB, scC]), mutB = workCounts([scB], { ops: pathB }), mutC = workCounts([scC], { ops: pathC });
    const rb = (realB[0] || [])[0] || {}, rc = (realB[1] || [])[0] || {}, mb = (mutB[0] || [])[0] || {}, mc = (mutC[0] || [])[0] || {};
    ok(rb.status === 200 && rb.landed === rb.carried && rb.exact === true && mb.landed === mb.carried && mb.exact === true && workOf(rb) <= ITEM_WORK * rb.items + WORK_SLACK && mb.status === 200 && workOf(mb) > ITEM_WORK * mb.items + WORK_SLACK,
      `CONTROL: an old tab's whole key of 2 002 over a store of 2 000 (two new ids in its middle) — the tree's ${workOf(rb)} for ${rb.items} items (green); the key scanned per item (listDiff as two includes loops, a patched copy) ${workOf(mb)} — RED by the law`, { realB, mutB });
    ok(rc.status === 200 && rc.landed === rc.carried && rc.exact === true && mc.landed === mc.carried && mc.exact === true && rc.sets <= rc.carried + ONE_WORK && rc.scans <= rc.carried + ONE_WORK && mc.status === 200 && mc.sets > mc.carried + ONE_WORK && mc.sets - rc.sets >= 2 * 66670 - ONE_WORK,
      `CONTROL: ONE more id on a store of 66 670 — the tree's ${rc.sets} inserts and ${rc.scans} scanned for the ${rc.carried} it carries (green); round 12's shape, the whole key into two Sets (a patched copy), ${mc.sets} inserts — two passes more (${mc.sets - rc.sets} beyond the tree's, ≥ 2 × 66 670 − ${ONE_WORK}) — RED by the law`, { rc, mc });
  } else ok(false, 'CONTROL: listDiff\'s head is not in src/user-state-ops.js — the controls cannot be made', null);
}

CHK.report();
