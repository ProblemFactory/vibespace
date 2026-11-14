#!/usr/bin/env node
// test-user-state-bounds (lane sidebar-echo-order, rounds 11–13) — THE OPS DOOR'S BOUNDS, ONE OVER EACH FROM ITS NUMBER; MASTER'S ROADS
// TAKE WHAT MASTER TAKES; EACH DOOR'S WORST LEGAL REQUEST TIMED BESIDE A CONTROL MEASURED IN THIS RUN. Round 13's laws (主开发):
//   1 — MASTER'S ROADS (the whole-key PATCH / POST, the import) take what master takes: a person's export of 500 / 25 000 / 100 000 ids,
//       a value 6 deep, a 20 000-character name, a group of 25 000 imports with every section; an old tab saves over any stored state;
//       an old tab's select-all of 25 000 lands (past 20 000 changed items: ONE record for the key, never a refusal) — their cost is
//       measured here against the control, and the kb states it beside master's;
//   2 — THE OPS DOOR is bounded and its bound cannot be stepped around: one byte over, through EVERY spelling the router accepts (any
//       letter case, a trailing slash), with its length, chunked or gzip'd ⇒ 413 «too-large» before the handler (server.js skips its
//       50 MB parser by the door parser's OWN match); every other bound one over refused by name;
//   A — the ops door's worst legal request under 1.5× the control (the largest legal import, 12 MiB of config values — ≈ 90–150 ms on
//       the lane's box: the 100 ms floor's order; a quadratic at 5 000 ops reads seconds — the kb states the law's numbers);
//   B — what the product's pages send: a select-all of 2 000 and of 20 000 (four requests, in act order, no part sent twice — also with
//       its own answers and echoes coming back), the largest group, an import at 10× the owner's store in ONE request — each request
//       under 2× the control (the 250 ms order).
// THE NUMBERS ARE LITERALS here (2 097 152, 5 000, 524 288, 16 384, 4 096, depth 4, 20 000, a field name of 200, a batch of 1 048 576):
// a constant that moves, or a bound removed, turns its leg red BY NAME — no leg hangs, runs out of memory or throws (every body past a
// bound is streamed or small). Every time bound is relative to the control (scripts/wall-clock-census.mjs).
// Round 14 (主开发: «an act is taken back only for a reason about ITS OWN item»): past 20 000 changed items the key's record keeps the
// digests of the slots the write changed — an earlier act on an item it never touched still lands (§7); a stale whole key that only
// OMITS takes back nothing at any size; the record survives a restart, keeps each write's time, and its runs past a week go.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const UO = require(path.join(REPO, 'src/user-state-ops.js'));
const express = require('express');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ueb-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 900) : '')); } };

// the bounds, AS NUMBERS (round 12: «the one-over legs are written from the numbers»)
const OPS_BODY = 2097152, OPS = 5000, MOVES = 20000, GROUP = 20000, VALUES = 524288, VALUE = 16384, NAME = 4096, DEPTH = 4, FIELD = 200, BATCH_BYTES = 1048576;
const BIG = 12582912;   // (a size for master's roads' rows — round 13: no bound there)

const VNOW = Date.UTC(2026, 10, 11, 12);
let framed = 0;   // (the bytes every hub's socket client was sent)
/** a fresh hub: the real route, a data dir of its own, one clock */
const hub = ({ dir: dirIn = null, clock = null } = {}) => {   // (round 14: a hub on another's data dir — a restart; a clock that moves)
  for (const key of Object.keys(require.cache)) if (key.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[key];
  const P = require(path.join(REPO, 'src/routes/persistence.js'));
  const dir = dirIn || fs.mkdtempSync(path.join(TMP, 'h-'));
  // (one socket client, taking each frame's bytes as a real one does — the broadcast is part of a write's cost)
  P.setup({ dataDir: dir, wss: { clients: new Set([{ readyState: 1, send: (j) => { framed += j.length; } }]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, userStateClock: () => (clock ? clock.t : VNOW), userStateMono: () => (clock ? clock.t : VNOW) });
  const handler = (method, p) => { const l = P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l.route.stack[0].handle; };
  /** one request, timed: the handler alone, its body already parsed (as the door's parser hands it) */
  // (int402: `spinMs` — the suite's own hook that makes a door TRULY slower: the CPU held inside the timed window, after the handler)
  const timed = (method, p, body, { spinMs = 0 } = {}) => {
    let status = 200, out = null;
    const res = { status(c) { status = c; return res; }, json(o) { out = o; return res; } };
    const fn = handler(method, p);
    const t = process.hrtime.bigint();
    fn({ body, query: {}, params: {}, headers: {} }, res, () => { });
    if (spinMs > 0) { const until = process.hrtime.bigint() + BigInt(Math.round(spinMs * 1e6)); while (process.hrtime.bigint() < until) { } }
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
    ok(r.status === 200 && applied === body.batches.length && bytes <= OPS_BODY && r.ms < 1.5 * C,
      `law A, the ops door: ${what} (${(bytes / 1048576).toFixed(2)} MiB) ⇒ ${applied} applied in ${xC(r.ms)} (ceiling 1.5×)`, { status: r.status, code: codeOf(r), applied, ms: r.ms, C });
  }
}
{
  // master's roads, MEASURED (round 13: no bound there — the bench reads each against master's same door; here each against the
  // control, under a regression ceiling of 2×): the whole-key door at ~12 MiB, and an old tab's ONE change on a big store — 10× the owner's, and ~270 000
  // archived ids (round 12 diffed the whole key through two Sets: ×2 master's write for one archive; now the common head and tail
  // are skipped and the change looked up)
  const tabName = (i) => (k(i) + '\t').padEnd(300, i % 2 ? '\t' : '\\');
  const rows = [
    ['config values at their bound', { sessionConfigs: Object.fromEntries(Array.from({ length: nCtl }, (_, i) => [k(i), { blob: OBJ }])) }],
    ['20 000 names of tabs and backslashes', { archivedSessions: Array.from({ length: MOVES }, (_, i) => tabName(i)) }],
    ['20 000 renames of 560 characters', { customNames: Object.fromEntries(Array.from({ length: MOVES }, (_, i) => [k(i), 'r'.repeat(560)])) }],
    ['config values at depth 4 (4 MiB)', { sessionConfigs: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [k(i), { d: Array.from({ length: 60 }, (_, j) => [[[j, 'deep']]]) }])) }],
  ];
  // THE VERDICT OVER ROUNDS (int402 — the .402 prep mirror's fast attempt 1 was red here, «config values at their bound ⇒ 184 ms,
  // ×2.16 the control», on a runner that was not slow; on the box the tip and 2.369.401 read ×1.24–1.52 over ten runs, the same spread:
  // ONE sample of the road against ONE of its control let one moment decide a regression ceiling — B-d24c's ninth). Now ROUNDS rounds,
  // each a control and every road on fresh hubs, back to back; a road's verdict is the MEDIAN of its samples over the MEDIAN of the
  // control's samples taken IN THE SAME ROUNDS. Its controls, through the suite's own hook (timed's spinMs): a road made truly slower
  // than twice its control is RED by name; one round of it delayed alone does not decide (green).
  const ROUNDS = 3;
  const med = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
  const roundsVerdict = (roadMs, ctlMs, ceil) => { const r = med(roadMs), c = med(ctlMs); return { ok: r < ceil * c, r, c, x: r / c }; };
  const texts = rows.map(([, content]) => JSON.stringify(content)), ctlText = JSON.stringify(IMPORT(ctlState));   // (serialized ONCE; each round parses its own fresh copy, as a parser hands it)
  const ctlS = [], roadS = rows.map(() => []), stS = rows.map(() => []);
  for (let rd = 0; rd < ROUNDS; rd++) {
    const ctlBody = JSON.parse(ctlText); ctlS.push(hub().timed('post', '/api/config/import', ctlBody).ms);
    texts.forEach((text, j) => { const b = JSON.parse(text); const r = hub().timed('patch', '/api/user-state', b); roadS[j].push(r.ms); stS[j].push(r.status); });
  }
  const ms0 = (a) => a.map((x) => x.toFixed(0)).join(' / ');
  rows.forEach(([what, content], j) => {
    const bytes = texts[j].length, v = roundsVerdict(roadS[j], ctlS, 2);
    ok(stS[j].every((st) => st === 200) && bytes <= BIG && v.ok,
      `law A, master's road (the whole-key door, measured over ${ROUNDS} rounds): ${what} (${(bytes / 1048576).toFixed(1)} MiB) ⇒ 200 in ${v.r.toFixed(0)} ms (median), ×${v.x.toFixed(2)} the control's median ${v.c.toFixed(0)} ms (a regression ceiling: 2×) — the road ${ms0(roadS[j])}, the control ${ms0(ctlS)}`, { status: stS[j], roadMs: roadS[j], ctlMs: ctlS });
  });
  {
    // THE CEILING STILL BITES, AND ONE SLOW SAMPLE DOES NOT DECIDE — the depth-4 road (the cheapest), through the hook: two rounds of it
    // held past twice the control and two plain ones, measured once and shared — [held, held, plain] is RED by its median (a road truly
    // slower), [held, plain, plain] is green (one slow round)
    const j = rows.length - 1, Cm = med(ctlS);
    const held = [0, 1].map(() => hub().timed('patch', '/api/user-state', JSON.parse(texts[j]), { spinMs: 2.3 * Cm }).ms);
    const plain = [0, 1].map(() => hub().timed('patch', '/api/user-state', JSON.parse(texts[j])).ms);
    const slow = [held[0], held[1], plain[0]], one = [held[0], plain[0], plain[1]];
    const vs = roundsVerdict(slow, ctlS, 2), v1 = roundsVerdict(one, ctlS, 2);
    ok(!vs.ok, `CONTROL: a road truly slower than twice its control (+${(2.3 * Cm).toFixed(0)} ms held in two of ${ROUNDS} rounds) is RED by its median: ×${vs.x.toFixed(2)} — ${ms0(slow)}`, { slow, ctlS });
    ok(v1.ok && held[0] >= 2 * Cm, `CONTROL: one round of the road held past twice the control (${held[0].toFixed(0)} ms) does not decide — the median ×${v1.x.toFixed(2)} stays under the ceiling — ${ms0(one)}`, { one, ctlS });
  }
  const owner10 = { archivedSessions: Array.from({ length: 66670 }, (_, i) => k(i)), customNames: Object.fromEntries(Array.from({ length: 7530 }, (_, i) => [k(i), 'a conversation name of forty characters!'])) };
  // (10× the owner's store is PINNED under the control — round 13's law: within 1.25 of master or under 100 ms there; past it the numbers
  // are the kb's, so ~270 000 ids carries only a ceiling against a regression of its shape: 3×)
  for (const [what, st, n, ceil] of [['10× the owner\'s store', owner10, 66670, 1], ['~270 000 archived ids (≈ 12 MiB)', { archivedSessions: Array.from({ length: 270000 }, (_, i) => k(i)) }, 270000, 3]]) {
    const h = hub();
    h.timed('post', '/api/config/import', parsed(IMPORT(US(st))));
    const r = h.timed('patch', '/api/user-state', parsed({ archivedSessions: [...st.archivedSessions, k(n + 1)] }));
    const onDisk = (JSON.parse(h.file()).archivedSessions || []).length;
    ok(r.status === 200 && onDisk === n + 1 && r.ms < ceil * C,
      `law A, master's road: an old tab archives ONE more on ${what} (its whole key, ${n + 1} ids) ⇒ ${r.status} in ${xC(r.ms)} (ceiling ${ceil}×), ${onDisk} on disk`, { status: r.status, ms: r.ms, C, onDisk });
  }
}

console.log('§2 law B: what the product\'s own pages send — each request under 2× the control (the 250 ms order on the lane\'s box)');
/** the page's engine against a hub: every request the engine sends, timed at the hub, answered — until nothing waits. `echo`: each
 *  answer comes back on a later turn and the hub's state follows it as an echo (round 13: round 12 re-sent the part in flight at every
 *  echo and every answer — 18 requests for a select-all of 20 000) */
const drive = async (h, pageId, ops, echo = false) => {
  const reqs = [], words = [], views = [];
  let inflight = 0, maxInflight = 0;   // (round 13: a backlog past one request goes ONE window at a time)
  // (with answers on a later turn, the engine's own timers run at their own length — squeezed, a 15 s send bound would call a part late
  // while it is being answered, and re-send it)
  const eng = UO.createSync({ pageId, setTimer: (fn, ms) => setTimeout(fn, echo ? ms : Math.min(ms, 5)), clearTimer: (t) => clearTimeout(t), say: (key) => words.push(key), onView: (v, why) => views.push(why),
    send: (body) => { const r = h.timed('patch', '/api/user-state/batches', parsed(body)); reqs.push({ ms: r.ms, ops: body.batches.reduce((n, b) => n + b.ops.length, 0), bytes: JSON.stringify(body).length, ids: body.batches.map((b) => b.batch), applied: (r.body.applied || []).length });
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
  ok(onDisk === n && d.reqs.length === Math.ceil(n / OPS) && d.reqs.every((q) => q.ops <= OPS && q.bytes <= OPS_BODY && q.applied > 0) && d.inOrder && !d.dups && d.maxInflight <= 1 && !d.words.length && d.answers <= d.reqs.length && d.worst < 2 * C,
    `law B: a select-all of ${n}${echo ? ' (its answers and echoes coming back)' : ''} ⇒ ${d.reqs.length} request${d.reqs.length > 1 ? 's' : ''} of ≤ ${OPS} ops (${d.reqs.map((q) => q.ms.toFixed(0)).join(' / ')} ms; the worst ×${(d.worst / C).toFixed(2)} the control), all ${onDisk} on disk in act order, ${d.dups} parts sent twice, at most ${d.maxInflight} in flight, ${d.answers} repaints for ${d.reqs.length} answers, no word`, { reqs: d.reqs.map((q) => ({ ms: q.ms, ops: q.ops, applied: q.applied })), onDisk, words: d.words, answers: d.answers });
}
const groupHub = hub();
{
  // the largest group the product builds: 20 000 members added in one act (the Manage dialog's) — four requests, the last into 15 000
  const d = await drive(groupHub, 'pggroupbig1', Array.from({ length: GROUP }, (_, i) => ({ key: 'sessionGroups', item: 'the big group', member: k(i), value: true })));
  const g = (JSON.parse(groupHub.file()).sessionGroups || {})['the big group'] || [];
  ok(g.length === GROUP && d.reqs.length === 4 && d.inOrder && !d.words.length && d.worst < 2 * C,
    `law B: the largest group (${GROUP} members, one act) ⇒ ${d.reqs.length} requests (${d.reqs.map((q) => q.ms.toFixed(0)).join(' / ')} ms — the last adds 5 000 to a group of 15 000; the worst ×${(d.worst / C).toFixed(2)} the control), ${g.length} members on disk in order, no word`, { reqs: d.reqs.map((q) => ({ ms: q.ms, applied: q.applied })), n: g.length });
}
for (const door of ['patch', 'post']) {
  // an OLD TAB's select-all of 20 000 through its whole key (a page from before the ops door): it lands
  const h = hub();
  const ids = Array.from({ length: MOVES }, (_, i) => k(i));
  const r = h.timed(door, '/api/user-state', parsed(door === 'post' ? US({ archivedSessions: ids }) : { archivedSessions: ids }));
  const onDisk = (JSON.parse(h.file()).archivedSessions || []).length;
  ok(r.status === 200 && onDisk === MOVES && r.ms < 2 * C, `law B: an old tab's select-all of ${MOVES} through its whole key (${door.toUpperCase()} /api/user-state) ⇒ ${r.status}, ${onDisk} on disk, in ${xC(r.ms)}`, { status: r.status, code: codeOf(r), onDisk });
}
{
  // an import at 10× the owner's store (6 667 archived, 753 names, 32 configs — the shape of data/user-state.json, sizes only) in ONE request
  const st = US({ archivedSessions: Array.from({ length: 66670 }, (_, i) => k(i)), customNames: Object.fromEntries(Array.from({ length: 7530 }, (_, i) => [k(i), 'a conversation name of forty characters!'])), sessionConfigs: Object.fromEntries(Array.from({ length: 320 }, (_, i) => [k(i), { model: 'claude-opus-5-5', effort: 'high', account: 'acct-0001' }])) });
  const r = hub().timed('post', '/api/config/import', parsed(IMPORT(st)));
  ok(r.status === 200 && r.ms < 2 * C, `law B: an import at 10× the owner's store (${(JSON.stringify(st).length / 1048576).toFixed(1)} MiB) in one request ⇒ ${r.status} in ${xC(r.ms)}`, { status: r.status, code: codeOf(r) });
}

console.log('§3 law C at the ops door: its bound binds what is READ, through every spelling the router accepts — refused by name before the handler');
{
  const h = await served();
  // server.js's chain (round 13): the ops door is skipped by its parser's OWN match — the router's (any letter case, a trailing slash),
  // never a second expression (round 12's regex missed '/api/user-state/batches/' and '/API/USER-STATE/BATCHES': a 41 MB ops request
  // landed); the whole-key doors and the import go through server.js's parser, as on master
  const SPELL = ['/api/user-state/batches', '/api/user-state/batches/', '/API/USER-STATE/BATCHES', '/Api/User-State/Batches/'];
  const own = SPELL.every((p) => h.P.router.ownsBody(p)) && !h.P.router.ownsBody('/api/user-state') && !h.P.router.ownsBody('/api/user-state/') && !h.P.router.ownsBody('/api/config/import') && /persistenceRouter\.ownsBody\(req\.path\)/.test(SERVER_SRC);
  ok(own && JSON_LIMIT === '50mb', `server.js leaves the ops door — every spelling the router takes: ${SPELL.join(' · ')} — to its own parser, by that parser's own match (${own}); the whole-key doors and the import on master's ${JSON_LIMIT}`, { own, JSON_LIMIT });
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
  ok(at.length === 2097152 && over.length === 2097153 && rows.every((x) => [x.len, x.chunk, x.gz].every((v) => v === '413 too-large')) && rev1 === rev0 && aLen.status === 200 && aZip.status === 200 && rev2 > rev1,
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
  ok(same && names === 1000 && sizes.length > 1 && sizes.every((s) => s.status === 200 && s.bytes <= OPS_BODY && s.vals <= VALUES && s.maxBatch <= BATCH_BYTES),
    `the splitter reads ${b.maxRequestBytes} B / ${b.maxRequestOps} ops / ${b.maxRequestValueChars} characters of values = the route's, a batch of ≤ ${b.maxBytes} B (${same}); ~15 MiB of renames ⇒ ${sizes.length} requests, the largest ${(Math.max(...sizes.map((s) => s.bytes)) / 1048576).toFixed(2)} MiB / ${Math.max(...sizes.map((s) => s.vals))} characters of values, all ${names} renames on disk`, { b, names, sizes: sizes.slice(0, 4) });
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
    ok(r.status === 200 && (st.archivedSessions || []).length === 25000 && facts.length === 1 && facts[0] === keySet('archivedSessions') && runsOf(st, 'archivedSessions').join() === '25000' && r.ms < 1.5 * C,
      `an old tab's select-all of 25 000 through its whole key (${door.toUpperCase()}) ⇒ ${r.status}, ${(st.archivedSessions || []).length} on disk, ${facts.length} fact (the key's record: ${runsOf(st, 'archivedSessions').join('+')} digests) in ${xC(r.ms)}`, { status: r.status, facts: facts.slice(0, 3) });
  }
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
  ok(rows.every((x) => x.w === 200 && x.X && x.Y && x.Z && x.applied === 'pgnewpg001:1+pgnewpg001:3' && x.superseded === 'pgnewpg001:2') && rows[0].nFacts === MOVES && rows[0].record === '' && rows.slice(1).every((x, i) => x.nFacts === 1 && x.record === String([MOVES + 1, 25000, 25000][i])),
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
  ok(rows.every((x) => x.w === 200 && x.record === 0 && x.X && x.applied === 'pgnewpg002:1'),
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
  ok(runs === `${MOVES + 1}+${MOVES + 1}` && !a.has(D1[1]) && a.has(D1[2]) && a.has(D2[3]) && a.has(D1[4]) && ((r.body || {}).applied || []).join('+') === 'pgtworuns1:1',
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
  ok(rec && rec.runs && rec.runs[0].set.n === 2 && j.verdicts[0].verdict === 'superseded',
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

console.log(`\n${fail ? `FAILED (${pass} passed, ${fail} failed)` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
