#!/usr/bin/env node
// test-user-state-bounds (lane sidebar-echo-order, rounds 11–13) — THE OPS DOOR'S BOUNDS, ONE OVER EACH FROM ITS NUMBER; MASTER'S ROADS
// TAKE WHAT MASTER TAKES; EACH DOOR'S WORST LEGAL REQUEST JUDGED BY ITS COUNTED WORK (B-518e — it was timed beside a control
// measured in the same run). Round 13's laws (主开发):
//   1 — MASTER'S ROADS (the whole-key PATCH / POST, the import) take what master takes: a person's export of 500 / 25 000 / 100 000 ids,
//       a value 6 deep, a 20 000-character name, a group of 25 000 imports with every section; an old tab saves over any stored state;
//       an old tab's select-all of 25 000 lands (past 20 000 changed items: ONE record for the key, never a refusal) — their cost is
//       COUNTED here (§W, B-518e), and the kb states it beside master's;
//   2 — THE OPS DOOR is bounded and its bound cannot be stepped around: one byte over, through EVERY spelling the router accepts (any
//       letter case, a trailing slash), with its length, chunked or gzip'd ⇒ 413 «too-large» before the handler (server.js skips its
//       50 MB parser by the door parser's OWN match); every other bound one over refused by name;
//   A — the ops door's worst legal request (was: under 1.5× the control, the largest legal import of 12 MiB of config values; a
//       quadratic at 5 000 ops reads seconds — the kb states the law's numbers);
//   B — what the product's pages send: a select-all of 2 000 and of 20 000 (four requests, in act order, no part sent twice — also with
//       its own answers and echoes coming back), the largest group, an import at 10× the owner's store in ONE request (was: each
//       request under 2× the control).
//   B-518e (a fast leg's verdict is a count or an order, never a ratio of two wall clocks — these ratios were red ALONE on the serial
//       lane): every request of A and B, master's roads and §6's select-all of 25 000 is judged by its WORK in §W — counted in a child
//       (Set / Map inserts, the elements an includes / indexOf walked, the store's writes), linear in the items it carries and the
//       keys it touches, ONE write; an old tab's one change on a big store a constant; three patched copies red. Times are printed.
// THE NUMBERS ARE LITERALS here (2 097 152, 5 000, 524 288, 16 384, 4 096, depth 4, 20 000, a field name of 200, a batch of 1 048 576):
// a constant that moves, or a bound removed, turns its leg red BY NAME — no leg hangs, runs out of memory or throws (every body past a
// bound is streamed or small). No time is judged (B-518e): the control's import and every request's time are printed beside its work.
// Round 14 (主开发: «an act is taken back only for a reason about ITS OWN item»): past 20 000 changed items the key's record keeps the
// digests of the slots the write changed — an earlier act on an item it never touched still lands (§7); a stale whole key that only
// OMITS takes back nothing at any size; the record survives a restart, keeps each write's time, and its runs past a week go.
//   §T §1 (the control, law A), §2 (law B), §4 (the ops door one over each bound — its group leg reads §2's group), §6 (master's
//      roads) and §W (their work counted in a child) moved VERBATIM to the heavy twin scripts/test-user-state-bounds-work.mjs (B-7e49, r2522); this file keeps §3, §5, §7
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const UO = require(path.join(REPO, 'src/user-state-ops.js'));
const express = require('express');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ueb-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 900) : '')); } };
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

console.log('§3 law C at the ops door: its bound binds what is READ, through every spelling the router accepts — refused by name before the handler');
{
  const h = await served();
  // server.js's chain (round 13): the ops door is skipped by its parser's OWN match — the router's (any letter case, a trailing slash),
  // never a second expression (round 12's regex missed '/api/user-state/batches/' and '/API/USER-STATE/BATCHES': a 41 MB ops request
  // landed); the whole-key doors and the import go through server.js's parser, as on master
  const SPELL = ['/api/user-state/batches', '/api/user-state/batches/', '/API/USER-STATE/BATCHES', '/Api/User-State/Batches/'];
  const own = SPELL.every((p) => h.P.router.ownsBody(p)) && !h.P.router.ownsBody('/api/user-state') && !h.P.router.ownsBody('/api/user-state/') && !h.P.router.ownsBody('/api/config/import') && /persistenceRouter\.ownsBody\(req\.path\)/.test(SERVER_SRC);
  ok(gateOf(own) && JSON_LIMIT === '50mb', `server.js leaves the ops door — every spelling the router takes: ${SPELL.join(' · ')} — to its own parser, by that parser's own match (${own}); the whole-key doors and the import on master's ${JSON_LIMIT}`, { own, JSON_LIMIT });
  await send(h.port, 'patch', '/api/user-state/batches', { text: JSON.stringify({ batches: [{ batch: 'pgparseseed:1', age: 0, ops: [{ key: 'starredSessions', item: k(1), value: true }] }] }) });
  // 2 097 152 bytes as read ⇒ taken; one more — with its length, chunked with none, gzip inflating to it — through EVERY spelling ⇒ 413
  // (a body of exactly n bytes: folder names of 2 000 characters, as many as leave room for the last, which takes the remainder)
  const opsAt = (seq, n) => { const op = (item) => ({ key: 'archivedFolders', item, value: true }); const items = [], per = JSON.stringify(op('/'.padEnd(2000, 'x'))).length + 1;
    for (let used = 120; used + per + 300 < n; used += per) items.push(('/p' + seq + '/' + items.length + '/').padEnd(2000, 'x'));
    return exact((pad) => ({ batches: [{ batch: `pgparseops${seq}:1`, age: 0, ops: [...items, '/pad' + seq + '/' + pad].map(op) }] }), n); };
  const at = opsAt(1, OPS_BODY), over = opsAt(2, OPS_BODY + 1), atZ = opsAt(3, OPS_BODY), overZ = opsAt(4, OPS_BODY + 1);
  const chunks = (t) => function* () { for (let i = 0; i < t.length; i += 65536) yield t.slice(i, i + 65536); };
  const rev0 = h.rev();
  const rows = [];
  for (const p of SPELL) {
    const oLen = await send(h.port, 'patch', p, { text: over }), oChunk = await send(h.port, 'patch', p, { gen: chunks(over) }), oZip = await send(h.port, 'patch', p, { text: overZ, gzip: true });
    rows.push({ p, len: oLen.status + ' ' + codeOf(oLen), chunk: oChunk.status + ' ' + codeOf(oChunk), gz: oZip.status + ' ' + codeOf(oZip) });
  }
  const rev1 = h.rev();
  const aLen = await send(h.port, 'patch', '/API/USER-STATE/BATCHES/', { text: at }), aZip = await send(h.port, 'patch', '/api/user-state/batches', { gen: chunks(atZ), gzip: true });
  const rev2 = h.rev();
  ok(at.length === 2097152 && over.length === 2097153 && gateOf(rows.every((x) => [x.len, x.chunk, x.gz].every((v) => v === '413 too-large'))) && rev1 === rev0 && aLen.status === 200 && aZip.status === 200 && rev2 > rev1,
    `the ops door, as read, at every spelling: ${over.length} B ⇒ ${rows.map((x) => `${x.p} ${x.len} / chunked ${x.chunk} / gzip ${x.gz}`).join('; ')} — nothing written (rev ${rev0} → ${rev1}); ${at.length} B ⇒ ${aLen.status} (at '/API/USER-STATE/BATCHES/'), gzip-streamed ${aZip.status}`, { rows, aLen, aZip, rev0, rev1, rev2 });
  // MASTER'S ROADS keep master's parser: a whole key past 12 MiB (13.6 MB of renames) through the whole-key door ⇒ taken, as master takes it
  const w0 = h.rev();
  const big13 = JSON.stringify({ customNames: Object.fromEntries(Array.from({ length: MOVES }, (_, i) => [k(i), 'w'.padEnd(680, 'n')])) });
  const wBig = await send(h.port, 'patch', '/api/user-state', { text: big13 });
  ok(big13.length > BIG && wBig.status === 200 && h.rev() === w0 + 1, `master's road: a whole key of ${(big13.length / 1048576).toFixed(1)} MiB through PATCH /api/user-state ⇒ ${wBig.status}, written (as master)`, { wBig, w0 });
  // bigv's object (refute-store10-0) AT ITS OWN SIZE, streamed with no length to the ops door ⇒ 413 by name; MADE TO FIT it ⇒ the value
  // bound, by name
  const b0 = h.rev();
  const objGen = (n, page) => function* () { yield `{"batches":[{"batch":"${page}:1","age":0,"ops":[{"key":"sessionConfigs","item":"${k(2)}","field":"blob","value":{`; for (let i = 0; i < n; i += 4096) { let t = ''; for (let j = i; j < Math.min(n, i + 4096); j++) t += (j ? ',' : '') + '"k' + j + '":' + (j % 10); yield t; } yield '}}]}]}'; };
  const bigObj = await send(h.port, 'patch', '/api/user-state/batches/', { gen: objGen(1700000, 'pgbigvpage1') });
  const fitObj = await send(h.port, 'patch', '/api/user-state/batches', { gen: objGen(150000, 'pgbigvpage2') });
  ok(bigObj.status === 413 && codeOf(bigObj) === 'too-large' && codeOf(fitObj) === 'too-large-value' && h.rev() === b0,
    `bigv at its own size: an object of 1.7 M keys chunked to '/api/user-state/batches/' ⇒ ${bigObj.status} «${codeOf(bigObj)}»; made to fit (150 000 keys, 1.9 MiB) ⇒ «${codeOf(fitObj)}» — nothing written`, { bigObj, fitObj });
  await h.close();
}

console.log('§5 ONE NUMBER: the page\'s splitter reads the route\'s numbers, and keeps every request within them');
{
  const eng = UO.createSync({ pageId: 'pgsplitter1', setTimer: () => 0, clearTimer: () => { }, send: () => new Promise(() => { }) });
  const b = eng.bounds;
  const same = b.maxRequestBytes === OPS_BODY && b.maxRequestOps === OPS && b.maxRequestValueChars === VALUES && UO.MAX_BODY_BYTES === OPS_BODY && UO.MAX_OPS_PER_REQUEST === OPS && UO.MAX_REQUEST_VALUE_CHARS === VALUES && b.maxBytes === BATCH_BYTES && b.maxOps === OPS;
  // a page holding more than one request's worth (10 acts of 100 renames of 15 KB, ~15 MiB — made with the network down) sends it in
  // requests each within the route's bytes AND values, and the route takes every one
  const h2 = hub();
  const sizes = [];
  let down = true;
  const eng2 = UO.createSync({ pageId: 'pgsplitter2', setTimer: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), clearTimer: (t) => clearTimeout(t),
    send: (body) => { if (down) return Promise.reject(new TypeError('Failed to fetch')); const r2 = h2.timed('patch', '/api/user-state/batches', parsed(body)); sizes.push({ maxBatch: Math.max(...body.batches.map((x) => Buffer.byteLength(JSON.stringify(x.ops)))), bytes: JSON.stringify(body).length, vals: body.batches.reduce((n, x) => n + x.ops.reduce((m, o) => m + JSON.stringify(o.value).length, 0), 0), status: r2.status }); return Promise.resolve({ ok: r2.status === 200, status: r2.status, rev: r2.body.rev, epoch: r2.body.epoch, refused: r2.body.refused, old: r2.body.old, applied: r2.body.applied, held: r2.body.held, superseded: r2.body.superseded, dropped: r2.body.dropped }); } });
  eng2.apply(h2.timed('get', '/api/user-state', {}).body);
  const big = 'n'.repeat(15000);
  for (let a = 0; a < 10; a++) eng2.record(Array.from({ length: 100 }, (_, j) => ({ key: 'customNames', item: k(a * 100 + j), value: big + (a * 100 + j) })));
  await new Promise((res) => setImmediate(res));
  down = false;
  eng2.resend();
  for (let t = 0; t < 2000 && eng2.pending(); t++) await new Promise((res) => setImmediate(res));
  const names = Object.keys(JSON.parse(h2.file()).customNames || {}).length;
  ok(gateOf(same) && names === 1000 && sizes.length > 1 && verdictOf(sizes.every((s) => s.status === 200 && s.bytes <= OPS_BODY && s.vals <= VALUES && s.maxBatch <= BATCH_BYTES)),
    `the splitter reads ${b.maxRequestBytes} B / ${b.maxRequestOps} ops / ${b.maxRequestValueChars} characters of values = the route's, a batch of ≤ ${b.maxBytes} B (${same}); ~15 MiB of renames ⇒ ${sizes.length} requests, the largest ${(Math.max(...sizes.map((s) => s.bytes)) / 1048576).toFixed(2)} MiB / ${Math.max(...sizes.map((s) => s.vals))} characters of values, all ${names} renames on disk`, { b, names, sizes: sizes.slice(0, 4) });
}

console.log('§7 ROUND 14: a whole key past 20 000 changed items takes back an earlier act on ITS OWN items only; a stale key that only omits takes back nothing');
{
  // THE VERIFIER'S SCENE (acc-397b many.log): an old tab's whole key changes N items (W); another page's acts arrive after it — X (archive
  // of an item W never touched, made 5 s before W), Y (un-archive of an item W archived, made 5 s before W), Z (archive, made after W).
  // At every N: X lands, Y is taken back by W's own change of Y's item (the later act wins), Z lands. Round 13 took X back past 20 000.
  const X = k(900001), Z = k(900002);
  const rows = [];
  const scene = (N, restart) => {
    let h = hub();
    const W = Array.from({ length: N }, (_, i) => k(i)), Y = W[0];
    const w1 = h.timed('patch', '/api/user-state', parsed({ archivedSessions: W }));
    const st0 = JSON.parse(h.file()), nFacts = Object.keys(st0[UO.FACTS_KEY] || {}).length, record = runsOf(st0, 'archivedSessions').join('+');
    if (restart) h = hub({ dir: h.dir });   // (the record read back from disk)
    const r = h.timed('patch', '/api/user-state/batches', parsed({ batches: [
      { batch: 'pgnewpg001:1', age: 5000, ops: [{ key: 'archivedSessions', item: X, value: true }] },
      { batch: 'pgnewpg001:2', age: 5000, ops: [{ key: 'archivedSessions', item: Y, value: false }] },
      { batch: 'pgnewpg001:3', age: 0, ops: [{ key: 'archivedSessions', item: Z, value: true }] }] }));
    const a = new Set(JSON.parse(h.file()).archivedSessions || []);
    return { N: N + (restart ? ' (restarted)' : ''), w: w1.status, nFacts, record, X: a.has(X), Y: a.has(Y), Z: a.has(Z), applied: ((r.body || {}).applied || []).join('+'), superseded: ((r.body || {}).superseded || []).join('+') };
  };
  for (const N of [MOVES, MOVES + 1, 25000]) rows.push(scene(N, false));
  rows.push(scene(25000, true));
  ok(gateOf(rows.every((x) => x.w === 200 && x.X && x.Y && x.Z && x.applied === 'pgnewpg001:1+pgnewpg001:3' && x.superseded === 'pgnewpg001:2')) && rows[0].nFacts === MOVES && rows[0].record === '' && verdictOf(rows.slice(1).every((x, i) => x.nFacts === 1 && x.record === String([MOVES + 1, 25000, 25000][i]))),
    `ROUND 14 — PAST 20 000 AN ACT ON AN UNTOUCHED ITEM LANDS: ${rows.map((x) => `N ${x.N}: ${x.nFacts} fact(s)${x.record ? ` (the key's record, ${x.record} digests)` : ''}, X ${x.X ? 'kept' : 'TAKEN BACK'}, Y ${x.Y ? 'archived (W decided it later)' : 'un-archived'}, Z ${x.Z ? 'kept' : 'lost'}`).join('; ')}`, rows);
}
{
  // THE OMISSION RULE FIRST, AT EVERY SIZE (rebuild B): the person archives N items through the ops door (confirmed); an old tab whose
  // copy has none PATCHes its whole key (it OMITS all N — no act); X, made before it, arrives ⇒ X lands, and the stale key wrote no record.
  // (The N items stay removed — an old tab's stale key over confirmed acts, named in the kb's Limits with its bound)
  const X = k(900001);
  const rows = [];
  for (const N of [MOVES, MOVES + 1, 25000]) {
    const h = hub();
    for (let i = 0; i < N; i += OPS) h.timed('patch', '/api/user-state/batches', parsed(batches('pgperson' + String(i / OPS).padStart(2, '0'), Math.min(OPS, N - i), (j) => [{ key: 'archivedSessions', item: k(i + j), value: true }])));   // (a page a request: its batch ids start at 1)
    const pre = (JSON.parse(h.file()).archivedSessions || []).length;
    const w = h.timed('patch', '/api/user-state', parsed({ archivedSessions: [] }));
    const st = JSON.parse(h.file());
    const r = h.timed('patch', '/api/user-state/batches', parsed({ batches: [{ batch: 'pgnewpg002:1', age: 5000, ops: [{ key: 'archivedSessions', item: X, value: true }] }] }));
    const a = new Set(JSON.parse(h.file()).archivedSessions || []);
    rows.push({ N, pre, w: w.status, record: runsOf(st, 'archivedSessions').length, X: a.has(X), applied: ((r.body || {}).applied || []).join('+') });
  }
  ok(verdictOf(rows.every((x) => x.w === 200 && x.record === 0 && x.X && x.applied === 'pgnewpg002:1')),
    `ROUND 14 — A STALE KEY THAT ONLY OMITS TAKES BACK NOTHING, AT EVERY SIZE: ${rows.map((x) => `N ${x.N} (${x.pre} confirmed, omitted whole ⇒ ${x.w}, ${x.record} record runs): X ${x.X ? 'kept' : 'TAKEN BACK'}`).join('; ')}`, rows);
}
{
  // EACH WRITE KEEPS ITS TIME (two runs): W1 archives 20 001 at t, W2 another 20 001 at t + 60 s; then, at t + 120 s: an un-archive of a
  // W1 item made between them lands (W2 never touched it); one made before W1 is taken back (W1 decided it later); an un-archive of a
  // W2 item made between them is taken back (W2 did)
  const clock = { t: VNOW - 30000 };
  const h = hub({ clock });
  const D1 = Array.from({ length: MOVES + 1 }, (_, i) => k(i)), D2 = Array.from({ length: MOVES + 1 }, (_, i) => k(100000 + i));
  h.timed('patch', '/api/user-state/batches', parsed({ batches: [{ batch: 'pgearly001:1', age: 0, ops: [{ key: 'archivedSessions', item: D1[4], value: false }] }] }));   // (an older fact of D1[4]'s own)
  clock.t = VNOW;
  h.timed('patch', '/api/user-state', parsed({ archivedSessions: D1 }));
  clock.t = VNOW + 60000;
  h.timed('patch', '/api/user-state', parsed({ archivedSessions: [...D1, ...D2] }));
  const runs = runsOf(JSON.parse(h.file()), 'archivedSessions').join('+');
  clock.t = VNOW + 120000;
  const r = h.timed('patch', '/api/user-state/batches', parsed({ batches: [
    { batch: 'pgtworuns1:1', age: 90000, ops: [{ key: 'archivedSessions', item: D1[1], value: false }] },
    { batch: 'pgtworuns1:2', age: 121000, ops: [{ key: 'archivedSessions', item: D1[2], value: false }] },
    { batch: 'pgtworuns1:3', age: 90000, ops: [{ key: 'archivedSessions', item: D2[3], value: false }] },
    { batch: 'pgtworuns1:4', age: 135000, ops: [{ key: 'archivedSessions', item: D1[4], value: false }] }] }));
  const a = new Set(JSON.parse(h.file()).archivedSessions || []);
  ok(runs === `${MOVES + 1}+${MOVES + 1}` && !a.has(D1[1]) && gateOf(a.has(D1[2])) && gateOf(a.has(D2[3])) && gateOf(a.has(D1[4])) && ((r.body || {}).applied || []).join('+') === 'pgtworuns1:1',
    `ROUND 14 — EACH WRITE KEEPS ITS TIME: two whole keys of ${MOVES + 1} new ids 60 s apart ⇒ runs ${runs}; an act between them on a W1 item ${a.has(D1[1]) ? 'TAKEN BACK' : 'lands'}, one before W1 ${a.has(D1[2]) ? 'taken back' : 'LANDS'}, one between them on a W2 item ${a.has(D2[3]) ? 'taken back' : 'LANDS'}; one made after the item's own older fact but before W1 ${a.has(D1[4]) ? 'taken back (the later record wins)' : 'LANDS'}`, { runs, body: r.body });
}
{
  // A RUN PAST A WEEK GOES (no act that old is applied; it would only weigh on every write): at the key's next record, and at the
  // hourly sweep of any write
  const clock = { t: VNOW };
  const h = hub({ clock });
  const D = (o) => Array.from({ length: MOVES + 1 }, (_, i) => k(o + i));
  h.timed('patch', '/api/user-state', parsed({ archivedSessions: D(0) }));
  clock.t = VNOW + 3 * 86400000;
  h.timed('patch', '/api/user-state', parsed({ archivedSessions: [...D(0), ...D(100000)] }));
  const two = runsOf(JSON.parse(h.file()), 'archivedSessions').length;
  clock.t = VNOW + 7 * 86400000 + 7200000;
  h.timed('patch', '/api/user-state', parsed({ starredSessions: [k(7)] }));   // (any write: the hourly sweep)
  const swept = runsOf(JSON.parse(h.file()), 'archivedSessions').length;
  const g = hub({ clock: { t: VNOW } });
  g.timed('patch', '/api/user-state', parsed({ starredSessions: D(0) }));
  g.timed('patch', '/api/user-state', parsed({ starredSessions: [] }));   // (an omission: no record of its own)
  const c2 = { t: VNOW + 8 * 86400000 };
  const g2 = hub({ dir: g.dir, clock: c2 });
  g2.timed('patch', '/api/user-state', parsed({ starredSessions: D(200000) }));   // (the key's next record, a week and a day on)
  const st2 = JSON.parse(g2.file());
  ok(two === 2 && swept === 1 && runsOf(st2, 'starredSessions').join() === String(MOVES + 1),
    `ROUND 14 — A RUN PAST A WEEK GOES: two runs 3 days apart ⇒ ${two}; a write a week and two hours after the first ⇒ ${swept} run left; the key's next record a week and a day on ⇒ runs ${runsOf(st2, 'starredSessions').join('+')}`, { two, swept, st2: runsOf(st2, 'starredSessions') });
}
{
  // A GROUP GONE BY AN ACT PAST THE BOUND KEEPS ITS TOMBSTONE IN THE RECORD (the pure engine; only an act — a writer that does not omit —
  // writes one): a member add made before the delete does not land, even in the group made again since
  const facts = new Map();
  UO.moveFacts(facts, { sessionGroups: { g: ['claude:m1', 'claude:m2'] } }, { sessionGroups: {} }, 1000, new Set(), null, new Map(), false, null, 0);
  const req = UO.parseRequest([{ batch: 'pgtombrec1:1', age: 600, ops: [{ key: 'sessionGroups', item: 'g', member: 'claude:m3', value: true }] }]);
  const j = UO.judgeRequest(facts, req.page, req.list, { sessionGroups: { g: ['claude:n1'] } }, 1500);
  const rec = facts.get(keySet('sessionGroups'));
  ok(gateOf(rec) && gateOf(rec.runs) && rec.runs[0].set.n === 2 && j.verdicts[0].verdict === 'superseded',
    `ROUND 14 — A GROUP DELETED PAST THE BOUND KEEPS ITS TOMBSTONE: the record holds ${rec && rec.runs ? rec.runs[0].set.n : 0} digests (the group and its tombstone); a member add made before it, into the group made again ⇒ ${j.verdicts[0].verdict}`, { verdicts: j.verdicts });
}
{
  // THE RECORD'S CHEAP PATHS ARE THE PLAIN ONES (round 14): a slot's digest fed part by part = the digest of the slot string, over random
  // slots of every kind (tabs, long names past 128, members, fields, tombstones); a wide list change diffed by its MIDDLES = the diff by
  // two whole Sets, over random lists WITH duplicates (archivedFolders keeps them)
  let seed = 11;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 8) % n; };
  const name = () => { const r = rnd(5); return r === 0 ? '\t'.repeat(1 + rnd(200)) : r === 1 ? 'x'.repeat(120 + rnd(20)) : r === 2 ? 'claude:' + rnd(1e6) : r === 3 ? '中😀\\"' + rnd(99) : String(rnd(10)); };
  let slots = 0, slotBad = typeof UO.slotLanes === 'function' && typeof UO.laneOf === 'function' ? 0 : -1;
  for (let i = 0; i < 3000 && slotBad >= 0; i++) {
    const key = UO.KEYS[rnd(UO.KEYS.length)], kind = UO.kindOf(key), op = { key, item: name(), value: true };
    if (kind === 'member' && rnd(2)) op.member = name();
    if (kind === 'field') op.field = name();
    for (const tomb of kind === 'member' ? [false, true] : [false]) {
      UO.lanes(tomb ? UO.tombSlotOf(key, op.item) : UO.slotOf(op, false));
      const want = UO.laneOf().join();
      UO.slotLanes(op, tomb);
      slots++; if (UO.laneOf().join() !== want) slotBad++;
    }
  }
  const whole = (bl, al) => { const out = [], bs = new Set(bl), as = new Set(al); for (const x of bl) if (!as.has(x)) out.push('-' + x); for (const x of al) if (!bs.has(x)) out.push('+' + x); return out.join(','); };
  let lists = 0, listBad = 0;
  for (let w = 0; w < 3000; w++) {
    const U = 2 + rnd(30), bl = Array.from({ length: rnd(40) }, () => 'i' + rnd(U)), al = bl.slice();
    for (let e = rnd(25); e > 0; e--) { const r = rnd(4); if (r === 0 && al.length) al.splice(rnd(al.length), 1); else if (r === 1) al.splice(rnd(al.length + 1), 0, 'i' + rnd(U)); else if (r === 2) al.push('i' + rnd(U)); else al.unshift('i' + rnd(U)); }
    const got = UO.diffOps({ archivedFolders: bl }, { archivedFolders: al }, ['archivedFolders'], false).map((o) => (o.value ? '+' : '-') + o.item).join(',');
    lists++; if (got !== whole(bl, al)) listBad++;
  }
  ok(slots > 3000 && slotBad === 0 && listBad === 0,
    `ROUND 14 — THE RECORD'S CHEAP PATHS ARE THE PLAIN ONES: ${slots} random slots fed part by part, ${slotBad} digests differ from the slot string's; ${lists} random lists with duplicates diffed by their middles, ${listBad} differ from two whole Sets`, { slotBad, listBad });
}

// ── §T THE TWIN HOLDS THE MOVED LEGS (B-7e49, lane bl-tests-e, 主开发 r2522: a leg cannot fall between the two files) ─────────────
// §1, §2, §4, §6 and §W moved VERBATIM to the heavy twin scripts/test-user-state-bounds-work.mjs: they drive the persistence route over the largest
// legal stores and count each request's work in a child (§W judges what §1, §2 and §6 register; §4's group leg reads the group §2
// built — one unit). This file runs none of them.
// RED: a twin with §W's heading gone is no longer the moved legs.
console.log('§T the heavy twin holds the moved legs');
{
  const twinRel = 'scripts/test-user-state-bounds-work.mjs';
  const twin = fs.existsSync(path.join(REPO, twinRel)) ? fs.readFileSync(path.join(REPO, twinRel), 'utf-8') : '';
  const here = fs.readFileSync(new URL(import.meta.url), 'utf-8');
  const MOVED = ['§1 the control, and law A: each door', '§2 law B: what the product', '§4 the ops door: one over each bound', '§6 MASTER', '§W B-518e — WORK, NEVER THE CLOCK', 'const WR = workCounts(WORK);', 'const drive = async (h, pageId, ops, echo = false) =>', 'const ctl = hub().timed('];
  const holds = (t) => MOVED.every((h) => t.includes(h));
  ok(gateOf(holds(twin)) && verdictOf(MOVED.every((h) => here.split(h).length === 2)), `§T the heavy twin holds §1, §2, §4, §6 and §W — their headings, the control, the page's engine, the counting child — and this file runs none of them`);
  ok(verdictOf(/\{ name: 'test-user-state-bounds-work', tier: 'heavy',/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8'))), '§T the twin is a HEAVY row of the tier');
  ok(!holds(twin.replace(MOVED[4], '§W (gone)')), 'RED CONTROL — a twin whose §W heading is gone is no longer the moved legs: §T goes red');
}

console.log(`\n${fail ? `FAILED (${pass} passed, ${fail} failed)` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
