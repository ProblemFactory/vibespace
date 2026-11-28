#!/usr/bin/env node
// test-pool-pass-reads — B-403e (lane bl-accounts; 主开发 2026-11-18 from the production hub's witness: about forty percent of
// five hours' main-loop holds were the pool pass asking the SAME files on the data mount again and again in one synchronous
// run). THE LAW: within one synchronous run — one pool pass, one stdout record, one session-list broadcast — each file under
// the watched folders is asked of the mount AT MOST ONCE between two writes of this process (src/run-reads.js), a read after
// a write of this process in the same run sees the write, whoever wrote, and a look-again read asks the mount itself.
//   ① THE COUNTING LEG — a stand-in pool (its sizes are PARAMETERS, its members invented): every path-named fs ask counted
//      per file AND kind in one forced pass, a second (steady) pass, one record and one broadcast (the record and the
//      broadcast are MODELS: the key resolver + the reading facts a stdout usage record asks; the member lookup a session-list
//      broadcast makes per conversation). The FLOOR: every member's reading and sign-in file and every conversation's link is
//      asked at least once (the pass ran). TODAY'S ASKS are its RED control: each routed site asking the mount directly (a
//      pass-through copy of the helper — the new routing, so AT LEAST the release's count).
//   ② THE MEMO NEVER OUTLIVES ITS RUN — two asks with an await between them are two asks of the mount.
//   ③ AN ERROR IS AN ANSWER FOR THE RUN — a missing file asked three times in a run is one ask; every asker sees it.
//   ④ BY CONSTRUCTION — a write by a writer nobody listed, a link re-point and a sign-in file written are each seen by the
//      next read in the SAME run; RED: a copy whose drop does nothing, watching the same folders, serves the stale answers.
//   ⑤ THE RATCHET — every Sync function of the RUNNING runtime is a read, a descriptor call, a descriptor write or a path write.
//   ⑥ every path write and every descriptor write between two asks in one run makes the second a new ask (table-driven).
//   ⑦ ONE WRAPPER PER PROCESS — two copies, one write, both memos gone.   ⑧ a tick and a queued continuation share the run.
//   ⑨ no module holds an fs write function from before the wrap (a census by search, its planted control).
//   ⑩ the loop witness installed after keeps the wrapper inside.
//   ⑪ WHAT IS SAID MEMOIZED IS WHAT IS WATCHED — every path the routed readers ask is under a watched folder; RED: an engine
//      that does not watch its readings.
//   ⑫ A SIGN-IN FILE WHOSE STAT ANSWERS KEEPS ITS SIGNATURE (memberLoginState across runs); RED: the signature from the read.
//   ⑬ NOTHING AT LOAD (a child process: require + the harness descriptor leave fs untouched, the first watch wraps) and the
//      helper's own mutants, each in a child (the wrappers are process-wide): every one is caught.
//   ⑭ A LOOK-AGAIN READ ASKS THE MOUNT ITSELF — another process changes a sign-in folder or a link mid-run; every check before
//      a write sees it, while the run's memo still answers the old state (the control in kind).
//   ⑮ dropRun() drops every copy's memo (the hand-off for a write no wrapper sees).
//   ⑯ EVERY SITE THAT ASSIGNS A FUNCTION OF fs, found by parse, is rowed with what its undo does (a new site is red, a planted
//      control counts); after each row's install and undo, run in a fresh process, a watched write still drops the memo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const cleanup = [];
process.on('exit', () => { for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const tmpdir = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); cleanup.push(d); return d; };
const quiet = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };
const turn = () => new Promise((r) => setImmediate(r));

const RRpath = path.join(REPO, 'src/run-reads.js');
const ENGpath = path.join(REPO, 'src/server/usage-pool-engine.js');
const RR = require(RRpath);
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const engMod = require(ENGpath);
const MU = mutantCopies('pool-pass-reads', REPO);
const RR_SRC = fs.readFileSync(RRpath, 'utf8');
const ENG_SRC = fs.readFileSync(ENGpath, 'utf8');
const ASK_FNS = ['readText', 'readlink', 'entryExists', 'readdir', 'facts', 'stat', 'signature'];
/** a copy of a product file with ONE named edit — null when its needle does not hit exactly once (said as a red by the caller) */
const copyOf = (rel, src, from, to, tag) => (src.split(from).length === 2 ? MU.write(rel, editAnchor(src, from, to, "the text handed to copyOf()"), tag) : (() => { throw new Error(`ANCHOR GONE OR NOT UNIQUE (${src.split(from).length - 1} times): ${JSON.stringify(String(from).slice(0, 80))} — the control's anchor is not in the source — move it with the product line (B-0d3e)`); })());
/** swap a copy's asks onto the module every routed site reads through (`RR.readText(…)` is looked up at each call) */
async function withAsks(copy, fn) { const saved = {}; for (const k of ASK_FNS) { saved[k] = RR[k]; RR[k] = copy[k]; } try { return await fn(); } finally { Object.assign(RR, saved); } }
const tok = (k) => ['tok', k, 'x'.repeat(8)].join('-');
const loginBody = (k, live = true) => JSON.stringify({ claudeAiOauth: { accessToken: live ? tok('a' + k) : '', refreshToken: live ? tok('r' + k) : '', expiresAt: live ? Date.now() + 36e5 : 0, refreshTokenExpiresAt: live ? Date.now() + 29 * 86400e3 : 0, subscriptionType: 'max' } });

// ── THE COUNTER: every path-named ask of the mount under a world's root, per resolved path AND kind, and an EPOCH that every
//    write of this process under the root starts (the law holds between two writes: a write drops the memo by construction) ──
const ASKS = ['readFileSync', 'readlinkSync', 'lstatSync', 'statSync', 'readdirSync', 'openSync', 'existsSync', 'accessSync', 'realpathSync'];
let counting = null;   // { root, epoch, by: Map «epoch\0path» → Map kind → n, writes: [] }
const inRoot = (r) => !!counting && (r === counting.root || r.startsWith(counting.root + path.sep));
const writesOpen = (f) => (f == null ? false : typeof f === 'number' ? (f & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0 : /[wa+]/.test(String(f)));
for (const name of new Set([...ASKS, ...Object.keys(RR.WRITES)])) {
  const orig = fs[name];
  if (typeof orig !== 'function') continue;
  const isWrite = Object.prototype.hasOwnProperty.call(RR.WRITES, name);
  fs[name] = function (...a) {
    if (counting) {
      if (isWrite && (name !== 'openSync' || writesOpen(a[1]))) {
        const hit = RR.WRITES[name].map((i) => a[i]).find((p) => typeof p === 'string' && inRoot(path.resolve(p)) && RR.watched(p));   // a write the law names: under a WATCHED folder
        if (hit) { counting.writes.push(`${name.replace('Sync', '')} ${path.relative(counting.root, path.resolve(hit))}`); counting.epoch++; }
      } else if (ASKS.includes(name) && typeof a[0] === 'string') {
        const r = path.resolve(a[0]);
        if (inRoot(r)) { const k = counting.epoch + '\0' + r; const m = counting.by.get(k) || new Map(); m.set(name, (m.get(name) || 0) + 1); counting.by.set(k, m); }
      }
    }
    return orig.apply(this, a);
  };
  for (const k of Reflect.ownKeys(orig)) if (!Object.prototype.hasOwnProperty.call(fs[name], k)) { try { Object.defineProperty(fs[name], k, Object.getOwnPropertyDescriptor(orig, k)); } catch { } }   // realpathSync.native kept
}
/** count the asks of ONE synchronous run */
function countRun(root, fn) {
  counting = { root, epoch: 0, by: new Map(), writes: [] };
  try { quiet(fn); } finally { /* the run's asks are what it asked */ }
  const c = counting; counting = null;
  const rows = [...c.by].map(([k, m]) => ({ epoch: Number(k.slice(0, k.indexOf('\0'))), p: k.slice(k.indexOf('\0') + 1), m, n: [...m.values()].reduce((x, y) => x + y, 0) }));
  const asks = rows.reduce((x, r) => x + r.n, 0);
  const files = new Set(rows.map((r) => r.p)).size;
  const max = Math.max(0, ...rows.map((r) => r.n));   // per file BETWEEN TWO WRITES — the law
  const kindTotals = {};
  for (const r of rows) for (const [k, v] of r.m) kindTotals[k.replace('Sync', '')] = (kindTotals[k.replace('Sync', '')] || 0) + v;
  const worst = rows.sort((x, y) => y.n - x.n).slice(0, 4).map((r) => `${path.relative(root, r.p)} ×${r.n} (${[...r.m].map(([k, v]) => k.replace('Sync', '') + (v > 1 ? '×' + v : '')).join('+')}${c.epoch ? ', after write ' + r.epoch : ''})`);
  const kinds = (rel, kind) => rows.filter((r) => r.p === path.join(root, rel)).reduce((x, r) => x + (r.m.get(kind) || 0), 0);
  return { asks, files, max, worst, writes: c.writes, kinds, kindTotals, rows };
}
const kindsSaid = (r) => Object.entries(r.kindTotals).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none';

// ── THE STAND-IN POOL: S conversations with their own links over M members (invented names, fake tokens built here) ──
function world({ S, M, mods = { AccountManager, engMod } }) {
  const root = tmpdir('vs-pool-reads-');
  const dataDir = path.join(root, 'data');
  const am = new mods.AccountManager({ dataDir });
  if (!am.poolSupported()) return null;
  const ids = [];
  for (let i = 0; i < M; i++) {
    const id = am.createSubscription({ name: `Member ${String.fromCharCode(65 + (i % 26))}${i}` }).id;
    fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), loginBody(i), { mode: 0o600 });
    ids.push(id);
  }
  const P = am.createPool({ name: 'stand-in' }).id;
  am.setPoolTarget(P, ids[0]);
  am.updatePool(P, { auto: true, hot: true });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const nowS = Math.floor(Date.now() / 1000);
  ids.forEach((id, i) => fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60e3, source: 'on-demand', fiveHour: { utilization: 0.1 + 0.05 * (i % 5), resetsAt: nowS + 3600 }, sevenDay: { utilization: 0.2, resetsAt: nowS + 3 * 86400 } })));
  const sessions = new Map();
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = mods.engMod.create({
    app, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { },
    serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
    getAutoResume: () => null, getQuotaProbe: () => null, getUserTodos: () => null,
  });
  for (let k = 0; k < S; k++) {
    const sid = 'conv-' + k;
    sessions.set(sid, { backend: 'claude', mode: 'chat', _webuiId: sid, claudeSessionId: 'cid-' + k, _accountId: P, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), _isStreaming: false, _turnState: 'idle', pty: { write() { } }, name: sid });
    am.ensureSessionPoolLink(P, sid, ids[k % M]);
  }
  return { root, dataDir, am, eng, P, ids, sessions, cacheDir };
}
/** the runs the law names — each its OWN synchronous run (a macrotask between: a record or a broadcast never rides a pass's
 *  answers); the second pass is the STEADY one (nothing changed since the first) */
async function runs(w) {
  const first = [...w.sessions.values()][0];
  await turn();
  const pass = countRun(w.root, () => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
  await turn();
  const steady = countRun(w.root, () => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
  await turn();
  const record = countRun(w.root, () => { w.eng.resolveUsageKey(first); w.eng.cacheFactsOf(first); });   // a MODEL of one stdout usage record
  await turn();
  const broadcast = countRun(w.root, () => { for (const [sid, s] of w.sessions) { try { w.am.poolMemberOfSession(w.P, s, sid); } catch { } } });   // a MODEL of one broadcast
  return { pass, steady, record, broadcast };
}

console.log('① THE COUNTING LEG — one pass, a steady pass, one record, one broadcast over a stand-in pool (sizes are parameters)');
const TODAY = (() => { const f = copyOf('src/run-reads.js', RR_SRC, 'function ask(kind, p, fn) {\n', 'function ask(kind, p, fn) {\n  return fn();\n', 'today'); return f ? require(f) : null; })();
ok(!!TODAY, 'RED CONTROL: the pass-through copy of the helper (today\'s asks) is built — its needle hits once');
const SIZES = [{ S: 3, M: 2 }, { S: 12, M: 6 }];
const said = [];
for (const { S, M } of SIZES) {
  const w = world({ S, M });
  if (!w) { ok(true, 'pools unsupported on ' + process.platform + ' — SKIPPED (said as a skip, never a pass)'); continue; }
  if (!TODAY) continue;
  const wt = world({ S, M });
  const memo = await runs(w);
  const today = await withAsks(TODAY, () => runs(wt));
  // THE FIRST PASS ON A FRESH DATA DIR runs the estimator's two ONCE-PER-PROCESS reads of data/usage-anchors/rates.json: the
  // seed of the last learned rates (_seedRates, once) and the rates write path's base (a read before the file is REPLACED —
  // direct by design, never the run's answer), and its first write creates the anchors folder (mkdir). Named here, and pinned
  // as once per process: the steady pass asks rates.json NOT AT ALL and writes nothing.
  const ONCE = (r) => r.p.endsWith(path.join('data', 'usage-anchors', 'rates.json'));
  // B-403e follow-up (3): the two kinds IN ORDER — a sign-in file is asked twice only as its signature (a stat, memberLoginState)
  // BEFORE its content (the next reader's open); a signature asked AFTER the content RIDES it (src/run-reads.js signature(): the
  // run's read answers, no ask) — a stat after the open is named, never a «two kinds» pass (r.m keeps the first-ask order)
  const keysOf = (r) => [...r.m.keys()];
  const twoKinds = (r) => r.m.size === 2 && keysOf(r).join() === 'statSync,openSync' && r.p.endsWith('.credentials.json');
  const ridesNot = (r) => r.p.endsWith('.credentials.json') && r.m.has('openSync') && r.m.has('statSync') && keysOf(r).indexOf('statSync') > keysOf(r).indexOf('openSync');
  for (const k of ['pass', 'steady', 'record', 'broadcast']) {
    console.log(`    S=${S} M=${M} ${k}: today at least ${today[k].asks} asks over ${today[k].files} files (max ${today[k].max} per file: ${today[k].worst.join(', ')}) · with the memo ${memo[k].asks} asks over ${memo[k].files} files (max ${memo[k].max}; ${kindsSaid(memo[k])}) · writes in it: ${memo[k].writes.length ? memo[k].writes.join(', ') : 'none'}`);
    // THE LAW, per file AND question: a file is asked each question (its content, its link, its listing, its signature) at
    // most once between two writes — and asked twice only as a sign-in file whose SIGNATURE (memberLoginState, a stat as at
    // the release) came before its content (the next reader's open); a signature asked after the content rides it (no ask)
    const over = memo[k].rows.filter((r) => ([...r.m.values()].some((v) => v > 1) || (r.m.size > 1 && !twoKinds(r))) && !(k === 'pass' && ONCE(r))).map((r) => `${path.relative(w.root, r.p)} ×${r.n} (${[...r.m].map(([q, v]) => q.replace('Sync', '') + '×' + v).join('+')})`);
    ok(!over.length, `S=${S} M=${M}: in ONE ${k} every file is asked each question at most once between two writes (${memo[k].asks} asks over ${memo[k].files} files, ${memo[k].writes.length} write(s); ${memo[k].rows.filter(twoKinds).length} sign-in file(s) asked for a signature before their content${k === 'pass' ? '; the estimator\'s once-per-process rates.json reads named' : ''})`, over);
    ok(!memo[k].rows.some(ridesNot), `S=${S} M=${M}: in ONE ${k} THE SIGNATURE RIDES THE CONTENT ASK — no sign-in file is asked for its signature (a stat) AFTER its content (an open)`, memo[k].rows.filter(ridesNot).map((r) => path.relative(w.root, r.p)));
  }
  // RED CONTROL (follow-up 3): the classifier itself — a sign-in file stat'ed AFTER its open is named «the signature did not ride»
  // and is no «two kinds»; stat-then-open is the one pair allowed; another file's pair is neither
  const planted = (p, ks) => ({ p, m: new Map(ks.map((x) => [x, 1])) }), CR = '/w/subs/m1/.credentials.json';
  ok(gateOf(ridesNot(planted(CR, ['openSync', 'statSync']))) && !twoKinds(planted(CR, ['openSync', 'statSync'])) && gateOf(twoKinds(planted(CR, ['statSync', 'openSync']))) && !ridesNot(planted(CR, ['statSync', 'openSync'])) && !twoKinds(planted('/w/usage-cache/m1.json', ['statSync', 'openSync'])), 'RED CONTROL: a sign-in file asked open-then-stat is NAMED (the signature did not ride the content ask), never counted as the two kinds; stat-then-open is the one allowed pair, and only for a sign-in file');
  const steadyRates = memo.steady.rows.filter(ONCE).reduce((x, r) => x + r.n, 0);
  const sTwo = memo.steady.rows.filter((r) => r.m.size > 1).length;
  const STEADY = { '3x2': 13, '12x6': 38 };   // measured alone on the test machine, both zones (b3de847b3): every file once, no sign-in file twice
  ok(memo.steady.max <= 2 && memo.steady.asks === memo.steady.files + sTwo && steadyRates === 0 && memo.steady.asks === STEADY[`${S}x${M}`] && memo.steady.files === STEADY[`${S}x${M}`] && sTwo === 0, `S=${S} M=${M} THE STEADY PASS (production's): ${memo.steady.asks} asks over ${memo.steady.files} files — every file once per question (${sTwo} sign-in file(s) a signature and a content) — and rates.json not at all (once per process)`, { asks: memo.steady.asks, files: memo.steady.files, sTwo, steadyRates });
  // THE PER-RECORD AND PER-BROADCAST NUMBERS, stated: one stdout usage record (the model) asks its link, its member's sign-in
  // file, that member's .claude.json and its reading — once each; one broadcast asks each conversation's link once
  const rk = memo.record.kindTotals;
  ok(memo.record.files === 4 && rk.readlink === 1 && rk.open === 1 && rk.readFile === 2 && !rk.stat && memo.record.asks === 4 && today.record.asks >= 11, `S=${S} M=${M} ONE RECORD: at least ${today.record.asks} asks today → ${memo.record.asks} with the memo (the link a readlink, the sign-in file an open${rk.stat ? ' and its signature a stat' : ''}, its .claude.json and the reading a read each)`, { memo: rk, today: today.record.asks });
  ok(memo.broadcast.asks === S && memo.broadcast.files === S && memo.broadcast.kindTotals.readlink === S, `S=${S} M=${M} ONE BROADCAST: ${S} asks — each conversation's link once (a readlink)`, memo.broadcast.kindTotals);
  // THE FLOOR: the pass ran — every member's reading and sign-in file and every conversation's link was asked, by its kind
  const rel = (p) => path.relative(w.root, p);
  const missed = [];
  for (const k of ['pass']) {
    for (const id of w.ids) {
      if (memo[k].kinds(rel(path.join(w.cacheDir, id + '.json')), 'readFileSync') < 1) missed.push(`${k}: reading ${id}`);
      if (memo[k].kinds(rel(w.am.subCredsPath(id)), 'openSync') < 1) missed.push(`${k}: sign-in file ${id}`);
    }
    for (const sid of w.sessions.keys()) if (memo[k].kinds(rel(w.am.sessionPoolLinkPath(w.P, sid)), 'readlinkSync') < 1) missed.push(`${k}: link ${sid}`);
  }
  ok(!missed.length, `S=${S} M=${M} THE FLOOR: in the pass every member's reading (a read) and sign-in file (an open) and every conversation's link (a readlink) is asked at least once — the pass ran`, missed.slice(0, 6));
  ok(memo.steady.writes.length === 0, `S=${S} M=${M}: the steady pass writes nothing under the watched folders (a pass that wrote every run would drop its own memo every run)`, memo.steady.writes);
  ok(today.pass.max > 1 && today.pass.asks > memo.pass.asks && today.steady.asks > memo.steady.asks, `S=${S} M=${M} RED CONTROL: today's pass asks the same files again and again — at least ${today.pass.asks} asks (max ${today.pass.max} per file) against ${memo.pass.asks}; steady ${today.steady.asks} against ${memo.steady.asks}`, today.pass.worst);
  said.push(`S=${S} M=${M}: one pass at least ${today.pass.asks} asks today → ${memo.pass.asks} with the memo (${memo.pass.files} files, ${memo.pass.writes.length} write(s) in it); the steady pass ${today.steady.asks} → ${memo.steady.asks}; one record ${today.record.asks} → ${memo.record.asks} (${kindsSaid(memo.record)}); one broadcast ${today.broadcast.asks} → ${memo.broadcast.asks}`);
}
console.log('    THE NUMBERS: ' + said.join(' · '));

console.log('② THE MEMO NEVER OUTLIVES ITS SYNCHRONOUS RUN');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  await turn();
  const one = countRun(w.root, () => { RR.readText(p); RR.readText(p); RR.readText(p); });
  await turn();   // the second half is its OWN run
  counting = { root: w.root, epoch: 0, by: new Map(), writes: [] };
  RR.readText(p);
  await null;   // the run ends at its microtask checkpoint
  RR.readText(p);
  const two = (counting.by.get('0\0' + path.resolve(p)) || new Map()).get('readFileSync') || 0; counting = null;
  ok(one.asks === 1 && two === 2, `three asks in one run are ONE ask of the mount; two asks with an await between them are TWO (${one.asks}, ${two})`);
}

console.log('②b THE CACHE MODULE\'S READ KEEPS THE MEMO (lane lg-store-writes U6.2): the pool reads its readings through src/usage-cache-write.js with run-reads as its «via»');
{
  const UW = require(path.join(REPO, 'src/usage-cache-write.js'));
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  await turn();
  const viaMemo = countRun(w.root, () => { for (let i = 0; i < 3; i++) { UW.readCacheJson(p, { via: RR }); UW.listCacheDir(w.cacheDir, { via: RR }); } });
  await turn();
  const raw = countRun(w.root, () => { for (let i = 0; i < 3; i++) { UW.readCacheJson(p); UW.listCacheDir(w.cacheDir); } });
  ok(viaMemo.asks === 2 && viaMemo.kinds(path.relative(w.root, p), 'readFileSync') === 1 && raw.asks === 6,
    `through the cache module with the memo, three reads of one reading and three listings of the folder in one run are ONE read and ONE listing (${viaMemo.asks} asks); CONTROL: the same door without the memo asks every time (${raw.asks})`, { viaMemo: kindsSaid(viaMemo), raw: kindsSaid(raw) });
}

console.log('③ AN ERROR IS AN ANSWER FOR THE RUN');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, 'never-written.json');
  const codes = [];
  await turn();
  const r = countRun(w.root, () => { for (let i = 0; i < 3; i++) { try { RR.readText(p); codes.push('read'); } catch (e) { codes.push(e.code); } } });
  ok(r.asks === 1 && verdictOf(codes.every((c) => c === 'ENOENT')), `a missing file asked three times in one run is ONE ask, and every asker sees «no such file» (${r.asks}; ${codes.join(',')})`);
}

console.log('④ A READ AFTER A WRITE OF THIS PROCESS IN THE SAME RUN SEES THE WRITE — BY CONSTRUCTION');
const MAT = require(path.join(REPO, 'src/account-material.js'));
const afterWrites = (rr) => {
  const w = world({ S: 2, M: 2 });
  // a copy watches exactly what the owners watch — an empty watch list memoizes nothing and could prove nothing
  for (const d of [w.cacheDir, path.join(w.dataDir, 'pool-links'), path.join(w.dataDir, 'subs')]) rr.watch(d);
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const creds = w.am.subCredsPath(w.ids[1]);
  let r = null;
  quiet(() => {
    const before = rr.readText(p);
    fs.writeFileSync(p, JSON.stringify({ fetchedAt: 1, marker: 'written-in-the-run' }));   // a writer nobody listed
    const after = rr.readText(p);
    const linkBefore = w.am.poolCurrentFor(w.P, 'conv-0');
    w.am.ensureSessionPoolLink(w.P, 'conv-0', w.ids[1], { why: 'per-session-switch' });   // the link writer re-points
    const linkAfter = w.am.poolCurrentFor(w.P, 'conv-0');
    const tokBefore = JSON.parse(rr.facts(creds).text).claudeAiOauth.accessToken;
    MAT.writePrivateFile(creds, loginBody('again'));   // a sign-in file written (the one 0600 writer: a temp open, its descriptor writes, a rename)
    const tokAfter = JSON.parse(rr.facts(creds).text).claudeAiOauth.accessToken;
    r = { sawWrite: /written-in-the-run/.test(after || '') && before !== after, linkMoved: linkBefore === w.ids[0] && linkAfter === w.ids[1], sawLogin: tokBefore !== tokAfter && tokAfter === tok('aagain') };
  });
  return r;
};
{
  const r = afterWrites(RR);
  ok(verdictOf(r.sawWrite), 'a bare fs.writeFileSync under a watched folder (a writer nobody listed) is seen by the next read in the SAME run', r);
  ok(verdictOf(r.linkMoved), 'a link the link writer re-points is seen by the next read of it in the SAME run', r);
  ok(verdictOf(r.sawLogin), 'a sign-in file written between two asks in the SAME run is seen by the second', r);
  const f = copyOf('src/run-reads.js', RR_SRC, 'clear: () => { if (run) run.clear(); } };', 'clear: () => { } };', 'blind');
  ok(!!f, 'RED CONTROL: the drop\'s needle hits once in a copy of the helper');
  if (f) {
    const blind = require(f);
    const rb = await withAsks(blind, () => afterWrites(blind));
    ok(!rb.sawWrite && !rb.linkMoved && !rb.sawLogin, 'RED CONTROL: a copy whose drop does nothing, watching the same folders, serves the STALE answer after its own write — the reading, the link and the sign-in file all three', rb);
  }
}

console.log('⑤ THE RATCHET — every Sync function of the RUNNING runtime is classed exactly once');
const READS = new Set(['accessSync', 'existsSync', 'globSync', 'lstatSync', 'opendirSync', 'readdirSync', 'readFileSync', 'readlinkSync', 'realpathSync', 'statSync', 'statfsSync']);
const FD_READS = new Set(['closeSync', 'fdatasyncSync', 'fstatSync', 'fsyncSync', 'readSync', 'readvSync']);   // a descriptor call that changes nothing a read sees
const SYNCS = Object.keys(fs).filter((k) => /^[a-z][A-Za-z]*Sync$/.test(k) && typeof fs[k] === 'function');
const unclassed = SYNCS.filter((k) => [READS.has(k), FD_READS.has(k), RR.FD_WRITES.includes(k), Object.prototype.hasOwnProperty.call(RR.WRITES, k)].filter(Boolean).length !== 1);
ok(SYNCS.length > 30 && !unclassed.length, `every Sync function of node ${process.version} (${SYNCS.length}) is a read, a descriptor call, a descriptor write (run-reads FD_WRITES) or a path write (run-reads WRITES) — an unclassed one (a new runtime's) is RED until classed`, unclassed);

console.log('⑥ EVERY PATH WRITE AND EVERY DESCRIPTOR WRITE between two asks in one run is seen by the second (table-driven)');
{
  const w = world({ S: 1, M: 1 });
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0, gid = typeof process.getgid === 'function' ? process.getgid() : 0;
  const t = new Date();
  const ARGS = {
    writeFileSync: (d) => [path.join(d, 'f'), 'x'], appendFileSync: (d) => [path.join(d, 'f'), 'x'], renameSync: (d) => [path.join(d, 'f'), path.join(d, 'g')],
    copyFileSync: (d) => [path.join(d, 'f'), path.join(d, 'c')], cpSync: (d) => [path.join(d, 'f'), path.join(d, 'c2')], symlinkSync: (d) => ['f', path.join(d, 's')],
    linkSync: (d) => [path.join(d, 'f'), path.join(d, 'h')], unlinkSync: (d) => [path.join(d, 'f')], rmSync: (d) => [path.join(d, 'f')], rmdirSync: (d) => [path.join(d, 'sub')],
    mkdirSync: (d) => [path.join(d, 'n')], mkdtempSync: (d) => [path.join(d, 't-')], mkdtempDisposableSync: (d) => [path.join(d, 'u-')], truncateSync: (d) => [path.join(d, 'f'), 0],
    utimesSync: (d) => [path.join(d, 'f'), t, t], lutimesSync: (d) => [path.join(d, 'f'), t, t], chmodSync: (d) => [path.join(d, 'f'), 0o600],
    chownSync: (d) => [path.join(d, 'f'), uid, gid], lchownSync: (d) => [path.join(d, 'f'), uid, gid], openSync: (d) => [path.join(d, 'o'), 'w'],
  };
  const unseen = [], noArgs = [];
  await turn();
  for (const name of Object.keys(RR.WRITES)) {
    if (typeof fs[name] !== 'function') continue;   // not in this runtime
    if (!ARGS[name]) { noArgs.push(name); continue; }
    const d = path.join(w.cacheDir, 'w-' + name); fs.mkdirSync(path.join(d, 'sub'), { recursive: true }); fs.writeFileSync(path.join(d, 'f'), 'y');
    await turn();
    const r = countRun(w.root, () => {
      RR.readdir(d);
      const out = fs[name](...ARGS[name](d));
      if (name === 'openSync' && typeof out === 'number') fs.closeSync(out);
      RR.readdir(d);
    });
    if (r.kinds(path.relative(w.root, d), 'readdirSync') !== 2) unseen.push(name);   // the folder's own asks: the second is a new one
  }
  // CONTROL (precision): a path write under the world but OUTSIDE the watched folders keeps the memo
  const dk = path.join(w.cacheDir, 'w-precision'); fs.mkdirSync(dk, { recursive: true });
  await turn();
  const keptPath = countRun(w.root, () => { RR.readdir(dk); fs.writeFileSync(path.join(w.dataDir, 'not-watched.json'), 'x'); RR.readdir(dk); });
  ok(!unseen.length && !noArgs.length && keptPath.kinds(path.relative(w.root, dk), 'readdirSync') === 1, `every path write of this runtime (${Object.keys(RR.WRITES).filter((n) => typeof fs[n] === 'function').length}) between two asks of a watched folder in ONE run makes the second a new ask; a write outside the watched folders keeps the memo`, { unseen, noArgs, kept: keptPath.asks });
  // THE DESCRIPTOR WRITES: a write-flagged open under the folder made in an EARLIER run — its descriptor is kept across runs
  const FDARGS = { writeSync: (fd) => [fd, 'x'], writevSync: (fd) => [fd, [Buffer.from('x')]], ftruncateSync: (fd) => [fd, 0], futimesSync: (fd) => [fd, t, t], fchmodSync: (fd) => [fd, 0o600], fchownSync: (fd) => [fd, uid, gid], 'writeFileSync(fd)': (fd) => [fd, 'x'], 'appendFileSync(fd)': (fd) => [fd, 'x'] };
  const d2 = path.join(w.cacheDir, 'fd'); fs.mkdirSync(d2, { recursive: true });
  const fd = fs.openSync(path.join(d2, 'f'), 'w');
  const fdUnseen = [];
  for (const [label, args] of Object.entries(FDARGS)) {
    const fn = fs[label.replace('(fd)', '')];
    if (typeof fn !== 'function') continue;
    await turn();
    const r = countRun(w.root, () => { RR.readdir(d2); fn(...args(fd)); RR.readdir(d2); });
    if (r.kinds(path.relative(w.root, d2), 'readdirSync') !== 2) fdUnseen.push(label);
  }
  fs.closeSync(fd);
  // CONTROL (precision): a descriptor opened for writing OUTSIDE the watched folders drops nothing
  const outside = tmpdir('vs-pool-reads-out-'); const fdo = fs.openSync(path.join(outside, 'f'), 'w');
  await turn();
  const kept = countRun(w.root, () => { RR.readdir(d2); fs.writeSync(fdo, 'x'); RR.readdir(d2); });
  fs.closeSync(fdo);
  ok(!fdUnseen.length && gateOf(RR.FD_WRITES.every((n) => FDARGS[n])) && kept.kinds(path.relative(w.root, d2), 'readdirSync') === 1, `every descriptor write (${RR.FD_WRITES.join(', ')}, and writeFileSync / appendFileSync handed a descriptor) through a descriptor opened for writing under a watched folder makes the next ask new; one opened elsewhere keeps the memo`, { fdUnseen, kept: kept.asks });
}

console.log('⑦ ONE WRAPPER PER PROCESS — a second copy of the module, one write, both memos gone');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const B = require(MU.write('src/run-reads.js', RR_SRC, 'second', { same: true }));
  B.watch(w.cacheDir);
  const G = globalThis[Symbol.for('vibespace.run-reads.writes')];
  await turn();
  const r = countRun(w.root, () => {
    RR.readText(p); B.readText(p); RR.readText(p); B.readText(p);   // each copy's own memo: two asks
    fs.writeFileSync(p, JSON.stringify({ fetchedAt: 2 }));           // ONE write …
    RR.readText(p); B.readText(p);                                   // … drops BOTH: two more asks
  });
  ok(r.asks === 4 && gateOf(G) && G.copies.size >= 2 && gateOf(G.installed.get('writeFileSync')) && fs.writeFileSync === G.installed.get('writeFileSync'), `two copies in one process: one wrapper (found by the process-wide key, not a mark on a function), and one write drops every copy's memo (${r.asks} asks; ${G ? G.copies.size : 0} copies)`, { asks: r.asks });
}

console.log('⑧ A TICK CALLBACK AND AN ALREADY-QUEUED CONTINUATION SHARE THE RUN\'S ANSWERS (nothing outside the process can have been heard)');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const seenBy = [];
  // a run begun in a MACROTASK — where the pool pass (a timer), a record (an I/O callback) and a broadcast run
  await new Promise((done) => setImmediate(() => {
    counting = { root: w.root, epoch: 0, by: new Map(), writes: [] };
    Promise.resolve().then(() => { RR.readText(p); seenBy.push('continuation'); });   // queued BEFORE the run's first ask
    RR.readText(p);                                                                     // the run's first ask: its drop queued after
    process.nextTick(() => { RR.readText(p); seenBy.push('tick'); });
    setImmediate(done);
  }));
  const n = (counting.by.get('0\0' + path.resolve(p)) || new Map()).get('readFileSync') || 0; counting = null;
  ok(n === 1 && seenBy.length === 2, `a nextTick callback of the run and a promise continuation queued before it began read from the run's answers — ONE ask (${n}; ${seenBy.join(', ')})`);
}

console.log('⑨ NO MODULE HOLDS AN fs WRITE FUNCTION FROM BEFORE THE WRAP — a census derived by search over src and server.js');
{
  const files = execFileSync('git', ['-C', REPO, 'ls-files', '-z', '--', 'src', 'server.js'], { encoding: 'utf8' }).split('\0').filter((f) => /\.(c|m)?js$/.test(f));
  const W = [...Object.keys(RR.WRITES), ...RR.FD_WRITES, 'closeSync'].join('|');
  const DESTR = /\{([^{}]*)\}\s*=\s*(?:require\(\s*['"](?:node:)?fs['"]\s*\)|fs\b)/g;
  const ALIAS = new RegExp(`=\\s*(?:require\\(\\s*['"](?:node:)?fs['"]\\s*\\)|fs)\\.(?:${W})\\b(?!\\s*\\()`, 'g');
  const scan = (text) => [...[...text.matchAll(DESTR)].filter((m) => new RegExp(`\\b(?:${W})\\b`).test(m[1])).map((m) => `{ ${m[1].trim().slice(0, 60)} }`), ...[...text.matchAll(ALIAS)].map((m) => m[0].slice(0, 60))];
  // the three modules that wrap fs's functions by design hold the function they wrap inside their wrapper: the helper, the
  // loop witness (never undone) and the boot trace (its window's end restores only while outermost, else a pass-through —
  // the original stays inside the helper's chain for the hub's life); ⑯ rows each with its undo
  const BY_DESIGN = new Set(['src/run-reads.js', 'src/server/loop-blame.js', 'src/server/boot-trace.js']);
  const hits = [];
  for (const f of files) {
    if (BY_DESIGN.has(f)) continue;
    let text = ''; try { text = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { continue; }
    for (const h of scan(text)) hits.push(`${f}: ${h}`);
  }
  ok(files.length > 300 && !hits.length, `no module destructures or aliases an fs write function (${files.length} files searched; by design: ${[...BY_DESIGN].join(', ')})`, hits);
  const planted = scan('const { writeFileSync } = require(\'fs\');\nconst w2 = fs.renameSync;\nconst { writeSync: ws } = fs;\n');
  ok(planted.length === 3, `CONTROL: a planted destructured write (from require and from fs), and a planted alias are all found by the census (${planted.length})`, planted);
}

console.log('⑩ THE LOOP WITNESS INSTALLED AFTER THIS MODULE KEEPS ITS WRAPPER INSIDE');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const LB = require(path.join(REPO, 'src/server/loop-blame.js'));
  LB.install({ fsMod: fs });
  await turn();
  const r = countRun(w.root, () => { RR.readText(p); fs.writeFileSync(p, JSON.stringify({ fetchedAt: 3 })); RR.readText(p); });
  ok(gateOf(LB.isWrapped(fs.writeFileSync)) && r.asks === 2, `with the witness wrapped around it, a write still drops the memo (${r.asks} asks)`);
}

console.log('⑪ WHAT IS SAID MEMOIZED IS WHAT IS WATCHED — every path the routed readers ask in a pass, a record and a broadcast is under a watched folder');
async function routedPaths(mods) {
  const w = world({ S: 3, M: 2, mods });
  const seen = new Set();
  const rec = {};
  for (const k of ASK_FNS) { const f = RR[k]; rec[k] = (p, ...r) => { if (typeof p === 'string') seen.add(path.resolve(p)); return f(p, ...r); }; }
  await withAsks(rec, () => runs(w));
  const mine = [...seen].filter((p) => p.startsWith(w.root + path.sep));
  const folders = [...new Set(mine.map((p) => path.relative(w.root, p).split(path.sep).slice(0, 2).join('/')))].sort();
  return { n: mine.length, folders, unwatched: mine.filter((p) => !RR.watched(p)).map((p) => path.relative(w.root, p)) };
}
{
  const real = await routedPaths({ AccountManager, engMod });
  ok(real.n > 10 && gateOf(['data/pool-links', 'data/subs', 'data/usage-cache'].every((f) => real.folders.includes(f))) && !real.unwatched.length, `the routed readers asked ${real.n} paths in ${real.folders.join(', ')} — every one under a folder its owner watches`, real.unwatched.slice(0, 6));
  const f = copyOf('src/server/usage-pool-engine.js', ENG_SRC, '  RR.watch(USAGE_CACHE_DIR);', '  void USAGE_CACHE_DIR;', 'unwatched');
  ok(!!f, 'RED CONTROL: the engine\'s watch line hits once in a copy of it');
  if (f) {
    const red = await routedPaths({ AccountManager, engMod: require(f) });
    ok(verdictOf(red.unwatched.some((p) => p.startsWith('data/usage-cache' + path.sep))), `RED CONTROL: an engine that does not watch its readings (a5bab1744) routes ${red.unwatched.length} reading path(s) nobody watches — red by name`, red.unwatched.slice(0, 3));
  }
}

console.log('⑫ A SIGN-IN FILE WHOSE STAT ANSWERS KEEPS ITS SIGNATURE — memberLoginState across runs, exactly as at the release');
/** the mount's moment: an open of `fp` for reading fails (EIO) while its stat still answers */
const failOpen = (fp, fn) => {
  const o = fs.openSync;
  fs.openSync = function (p, f, ...r) { if (typeof p === 'string' && path.resolve(p) === path.resolve(fp) && !writesOpen(f)) throw Object.assign(new Error(`EIO: i/o error, open '${p}'`), { code: 'EIO', errno: -5, syscall: 'open', path: p }); return o.call(this, p, f, ...r); };
  try { return fn(); } finally { fs.openSync = o; }
};
async function loginScenes(mod) {
  const mods = { AccountManager, engMod: mod };
  // SCENE ONE: a live member; then its open fails for a moment while the stat answers (unchanged)
  const w1 = world({ S: 1, M: 1, mods });
  const id1 = w1.ids[0], fp1 = w1.am.subCredsPath(id1);
  await turn(); const a = quiet(() => w1.eng.memberLoginState(id1));
  await turn(); const b = failOpen(fp1, () => quiet(() => w1.eng.memberLoginState(id1)));
  // SCENE TWO: a missing sign-in file; then it is written and cannot be read
  const w2 = world({ S: 1, M: 1, mods });
  const id2 = w2.ids[0], fp2 = w2.am.subCredsPath(id2);
  const body = fs.readFileSync(fp2, 'utf8'); fs.unlinkSync(fp2);
  await turn(); const c = quiet(() => w2.eng.memberLoginState(id2));
  fs.writeFileSync(fp2, body);
  await turn(); const d = failOpen(fp2, () => quiet(() => w2.eng.memberLoginState(id2)));
  return { one: [a && a.state, b && b.state], two: [c && c.state, d && d.state] };
}
{
  const r = await loginScenes(engMod);
  ok(r.one[0] === 'live' && r.one[1] === 'live', `scene one: a live member whose open fails for a moment while its stat answers stays «live» (the release's answer: the signature did not move) — ${r.one.join(' → ')}`);
  ok(r.two[0] === 'missing' && r.two[1] === 'unreadable', `scene two: a missing sign-in file that appears and cannot be read is «unreadable», never the remembered «missing» — ${r.two.join(' → ')}`);
  const f = copyOf('src/server/usage-pool-engine.js', ENG_SRC, 'try { const st = RR.signature(fp); sig = `${st.mtimeMs}:${st.size}`; } catch (e) { if (e && Number.isFinite(e.mtimeMs)) sig = `${e.mtimeMs}:${e.size}`; }', 'try { const st = RR.facts(fp); sig = `${st.mtimeMs}:${st.size}`; } catch { }', 'sig-from-read');
  ok(!!f, 'RED CONTROL: the signature line hits once in a copy of the engine');
  if (f) {
    const red = await loginScenes(require(f));
    ok(red.one[1] !== 'live' && red.two[1] === 'missing', `RED CONTROL: with the signature taken from the read (a5bab1744) the healthy member reads ${red.one[1]} for that run and the unreadable file stays «${red.two[1]}»`, red);
  }
}

console.log('⑬ NOTHING AT LOAD, AND THE HELPER\'S OWN MUTANTS — each in a child process (the wrappers are process-wide)');
{
  const dir = tmpdir('vs-pool-reads-child-');
  const probeFile = path.join(dir, 'probe.cjs');
  fs.writeFileSync(probeFile, `'use strict';
const fs = require('fs'); const path = require('path');
const [rrPath, probe, dir, extra] = process.argv.slice(2);
const out = (o) => process.stdout.write(JSON.stringify(o));
const names = Object.keys(fs).filter((k) => typeof fs[k] === 'function');
const before = new Map(names.map((k) => [k, fs[k]]));
const same = () => names.every((k) => fs[k] === before.get(k));
const RR = require(rrPath);
if (probe === 'load') {
  const untouched = same() && !globalThis[Symbol.for('vibespace.run-reads.writes')];
  if (extra) require(extra);
  const descriptor = same();
  RR.watch(dir);
  out({ pass: untouched && descriptor && ['writeFileSync', 'renameSync', 'openSync', 'writeSync', 'closeSync'].every((k) => fs[k] !== before.get(k)), untouched, descriptor });
  return;
}
if (probe === 'tracer') {   // a wrapper installed BEFORE the first watch and taken off AFTER it (the boot trace's window)
  const unwrap = require(extra).wrapSync({ ops: [], now: () => 0 });
  RR.watch(dir);
  const G = globalThis[Symbol.for('vibespace.run-reads.writes')];
  unwrap();
  const kept = ['writeFileSync', 'appendFileSync', 'renameSync', 'openSync'].filter((k) => fs[k] === G.installed.get(k));
  const g = path.join(dir, 'g'); fs.writeFileSync(g, 'one');
  const a = RR.readText(g); fs.writeFileSync(g, 'two'); const b = RR.readText(g);
  out({ pass: kept.length === 4 && a === 'one' && b === 'two', kept, a, b });
  return;
}
RR.watch(dir);
const f = path.join(dir, 'f'); fs.writeFileSync(f, 'one');
let n = 0; const r0 = fs.readFileSync; fs.readFileSync = function (...a) { if (typeof a[0] === 'string') n++; return r0.apply(this, a); };
if (probe === 'open-write') { const a = RR.readText(f); const fd = fs.openSync(f, 'w'); fs.writeSync(fd, 'two'); fs.closeSync(fd); const b = RR.readText(f); out({ pass: a === 'one' && b === 'two', a, b }); }
else if (probe === 'sibling') { const s = dir + '-sib'; fs.mkdirSync(s, { recursive: true }); const g = path.join(s, 'g'); fs.writeFileSync(g, 'x'); n = 0; RR.readText(g); RR.readText(g); fs.rmSync(s, { recursive: true, force: true }); out({ pass: n === 2, n }); }
else if (probe === 'stat-on-error') { const o = fs.openSync; fs.openSync = function (p, fl, ...r) { if (p === f) throw Object.assign(new Error('EIO'), { code: 'EIO' }); return o.call(this, p, fl, ...r); }; let e = null; try { RR.facts(f); } catch (x) { e = x; } fs.openSync = o; out({ pass: !!e && e.code === 'EIO' && Number.isFinite(e.mtimeMs) && e.size === 3 }); }
else if (probe === 'not-a-link') { out({ pass: RR.entryExists(f) === true && RR.entryExists(path.join(dir, 'nope')) === false }); }
else if (probe === 'listing-copy') { const a = RR.readdir(dir); a.push('planted'); const b = RR.readdir(dir); out({ pass: !b.includes('planted') }); }
else out({ pass: false, err: 'unknown probe ' + probe });
`);
  const child = (rr, probe, extra = path.join(REPO, 'src/harnesses/claude.js')) => { try { return JSON.parse(execFileSync(process.execPath, [probeFile, rr, probe, fs.mkdtempSync(path.join(dir, 'p-')), extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) { return { pass: false, err: String(e.stderr || e.message).slice(0, 200) }; } };
  const MUTANTS = [
    ['load', 'module.exports = {', 'arm();\nmodule.exports = {', 'a require wraps fs (the wrap at load, a5bab1744)'],
    ['open-write', 'lchownSync: [0], openSync: [0],', 'lchownSync: [0],', 'the write-flagged open\'s row removed'],
    ['sibling', 'r.startsWith(root + path.sep)', 'r.startsWith(root)', 'the folder test without its separator (a sibling folder with the same prefix)'],
    ['stat-on-error', 'try { const st = fs.statSync(p); e.mtimeMs = st.mtimeMs; e.size = st.size; } catch { }', 'try { } catch { }', 'the stat dropped from an ask\'s error'],
    ['not-a-link', 'catch (e) { return !!(e && e.code === \'EINVAL\'); }', 'catch (e) { return false; }', '«not a link» read as «no entry»'],
    ['listing-copy', 'fs.readdirSync(p)).slice();', 'fs.readdirSync(p));', 'the folder listing returned without its copy'],
  ];
  const real = {}, caught = [], missed = [];
  for (const [probe, from, to, what] of MUTANTS) {
    real[probe] = child(RRpath, probe);
    const f = copyOf('src/run-reads.js', RR_SRC, from, to, 'mut-' + probe);
    if (!f) { missed.push(`${probe}: needle moved`); continue; }
    const m = child(f, probe);
    (m.pass ? missed : caught).push(`${what}${m.pass ? '' : ''}`);
  }
  ok(gateOf(real.load) && verdictOf(real.load.pass), 'NOTHING AT LOAD: in a fresh process, requiring the helper — and the claude harness descriptor the device agent\'s bundle loads — leaves every fs function the runtime\'s own; the first watch() wraps the writes', real.load);
  ok(verdictOf(MUTANTS.every(([p]) => real[p] && real[p].pass)), 'the real helper passes every probe (an open for writing, a sibling folder, a failed open\'s stat, a non-link entry, a listing\'s copy)', real);
  ok(!missed.length && caught.length === MUTANTS.length, `RED CONTROLS: every mutant of the helper is caught by its probe — ${caught.join(' · ')}`, missed);
  // THE BOOT TRACE'S WINDOW (VIBESPACE_BOOT_TRACE=1): it wraps fs's writes BEFORE the first watch and takes its wrappers off
  // ~90 s later — its undo must leave the helper's wrappers (installed around it) in place
  const BT = path.join(REPO, 'src/server/boot-trace.js'), BT_SRC = fs.readFileSync(BT, 'utf8');
  const tr = child(RRpath, 'tracer', BT);
  ok(verdictOf(tr.pass), 'a tracer installed before the first watch and taken off after it leaves the helper\'s four wrappers outermost — a write still drops the memo', tr);
  const btf = copyOf('src/server/boot-trace.js', BT_SRC, 'undo.push(() => { if (obj[name] === w) obj[name] = orig; });', 'undo.push(() => { obj[name] = orig; });', 'bt-restore');
  const trRed = btf ? child(RRpath, 'tracer', btf) : null;
  ok(!!trRed && !trRed.pass, 'RED CONTROL: the release\'s undo (the original put back whatever wraps it) strips the helper\'s wrappers — the write goes unseen', trRed);
}

console.log('⑭ A LOOK-AGAIN READ ASKS THE MOUNT ITSELF — another process changes a sign-in folder or a link in the middle of a run');
{
  const otherProcess = (code) => execFileSync(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
  const writes = (p, text) => otherProcess(`const fs = require('fs'); fs.mkdirSync(require('path').dirname(${JSON.stringify(p)}), { recursive: true }); fs.writeFileSync(${JSON.stringify(p)}, ${JSON.stringify(text)})`);
  const refused = (fn) => { try { fn(); return 'written'; } catch (e) { return /not logged in/.test(e.message) ? 'refused' : 'threw: ' + e.message; } };
  const SITES = [
    ['ensureSessionPoolLink — a billing link written to a member another process just signed out', (w) => {
      const m = w.ids[1];
      return { prime: () => w.am.readSubCreds(m).loggedIn, change: () => writes(w.am.subCredsPath(m), loginBody('gone', false)), act: () => refused(() => w.am.ensureSessionPoolLink(w.P, 'conv-0', m, { why: 'leg' })), want: 'refused' };
    }],
    ['setPoolTarget — the pool default written to a member another process just signed out', (w) => {
      const m = w.ids[1];
      return { prime: () => w.am.readSubCreds(m).loggedIn, change: () => writes(w.am.subCredsPath(m), loginBody('gone', false)), act: () => refused(() => w.am.setPoolTarget(w.P, m)), want: 'refused' };
    }],
    ['discardPendingSignin — a row removed that another process just signed in', (w) => {
      const id = w.am.createSubscription({ signinPending: true }).id;
      return { prime: () => w.am.readSubCreds(id).loggedIn, change: () => writes(w.am.subCredsPath(id), loginBody('late')), act: () => (w.am.discardPendingSignin(id) ? 'removed' : 'kept'), want: 'kept' };
    }],
    ['pendingSignin — a row handed to a new sign-in that another process just signed in', (w) => {
      const id = w.am.pendingSignin().id;
      return { prime: () => w.am.readSubCreds(id).loggedIn, change: () => writes(w.am.subCredsPath(id), loginBody('late')), act: () => (w.am.pendingSignin().id === id ? 'handed out again' : 'a new row'), want: 'a new row' };
    }],
    ['reloginResolve — a login another process just completed', (w) => {
      const id = w.am.createSubscription({ signinPending: true }).id;
      return { prime: () => w.am.readSubCreds(id).loggedIn, change: () => writes(w.am.subCredsPath(id), loginBody('late')), act: () => w.am.reloginResolve(id).outcome, want: 'same' };
    }],
    ['the ledger\'s «from» before a link re-point — a link another process just re-pointed', (w) => {
      const link = w.am.sessionPoolLinkPath(w.P, 'conv-0'), to = w.am.subDir(w.ids[1]);
      return {
        prime: () => w.am.poolCurrentFor(w.P, 'conv-0'),
        change: () => otherProcess(`const fs = require('fs'); const t = ${JSON.stringify(link + '.other')}; try { fs.unlinkSync(t); } catch { } fs.symlinkSync(${JSON.stringify(to)}, t); fs.renameSync(t, ${JSON.stringify(link)});`),
        act: () => { w.am.ensureSessionPoolLink(w.P, 'conv-0', w.ids[0], { why: 'leg' }); const rows = w.am.slotTransitions.all(); return rows.length ? rows[rows.length - 1].from : null; },
        want: w.ids[1],
      };
    }],
  ];
  const siteRun = async (mods, make) => {
    const w = world({ S: 1, M: 2, mods });
    const s = make(w);
    await turn();
    let r = null;
    quiet(() => { const before = s.prime(); s.change(); const memo = s.prime(); const got = s.act(); r = { before, memo, got, want: s.want }; });   // ONE synchronous run
    return r;
  };
  for (const [label, make] of SITES) {
    const r = await siteRun({ AccountManager, engMod }, make);
    ok(r.got === r.want && r.memo === r.before, `${label}: the check looks again (${JSON.stringify(r.got)}) while the run's memo still answers the old state (${JSON.stringify(r.memo)} — the control in kind)`, r);
  }
  // RED CONTROL: the look-again WITHOUT its forget (both doors: _lookAgain and the slot writers' table) — every site acts on
  // the run's stale answer
  const ACC_SRC = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  const N1 = '  _lookAgain(id) { RR.forget(this.subDir(id)); return this.readSubCreds(id); }', N2 = '} if (d) RR.forget(d); }';
  const hits = ACC_SRC.split(N1).length === 2 && ACC_SRC.split(N2).length === 2;
  ok(verdictOf(hits), 'RED CONTROL: both forget needles hit once in a copy of src/accounts.js');
  if (hits) {
    const blindAM = require(MU.write('src/accounts.js', editAnchor(editAnchor(ACC_SRC, N1, '  _lookAgain(id) { return this.readSubCreds(id); }', "src/accounts.js"), N2, '} void d; }', "src/accounts.js"), 'no-forget')).AccountManager;
    const stale = [];
    for (const [label, make] of SITES) { const r = await siteRun({ AccountManager: blindAM, engMod }, make); if (r.got !== r.want) stale.push(label.split(' — ')[0] + ': ' + JSON.stringify(r.got)); }
    ok(stale.length === SITES.length, `RED CONTROL: with the look-again's forget removed, EVERY site (${stale.length} of ${SITES.length}) acts on the run's stale answer — ${stale.join(' · ')}`);
  }
  // B-403e FOLLOW-UP (1): a folder the look-again cannot NAME drops the whole run's memo. The hotfix named every folder in ONE
  // try: one throw skipped EVERY forget, the run was never dropped, and the writer acted on the run's stale answer. Planted: the
  // member's folder cannot be named once (the look-again's own call — the writer's later calls answer) while another process
  // signs the member out; the writer must still refuse it
  const throwOnce = (o, k) => { const f = o[k]; let n = 0; o[k] = function (...a) { if (n++ === 0) throw new Error('this folder cannot be named (planted)'); return f.apply(this, a); }; };
  const UNNAMED = (w) => { const m = w.ids[1]; return { prime: () => w.am.readSubCreds(m).loggedIn, change: () => writes(w.am.subCredsPath(m), loginBody('gone', false)), act: () => { throwOnce(w.am, 'subDir'); return refused(() => w.am.ensureSessionPoolLink(w.P, 'conv-0', m, { why: 'leg' })); }, want: 'refused' }; };
  const UNNAMED_T = (w) => { const m = w.ids[1]; return { prime: () => w.am.readSubCreds(m).loggedIn, change: () => writes(w.am.subCredsPath(m), loginBody('gone', false)), act: () => { throwOnce(w.am, '_acctDir'); return refused(() => w.am.setPoolTarget(w.P, m)); }, want: 'refused' }; };
  const unT = await siteRun({ AccountManager, engMod }, UNNAMED_T);
  ok(unT.got === 'refused' && unT.memo === unT.before, `…and setPoolTarget's: its member's folder cannot be named once — the pool default is NOT re-pointed to the member another process signed out (${JSON.stringify(unT.got)}; the run's memo answered ${JSON.stringify(unT.memo)})`, unT);
  const un = await siteRun({ AccountManager, engMod }, UNNAMED);
  ok(un.got === 'refused' && un.memo === un.before, `a folder the look-again cannot NAME drops the run's memo: the member another process signed out is refused (${JSON.stringify(un.got)}) while the run's memo still answered the old state (${JSON.stringify(un.memo)})`, un);
  // RED CONTROL: the hotfix's ONE try (every folder named together, no drop) — the anchor fails BY NAME when it moves
  const ONE_TRY_FROM = 'for (const nameOf of namers) { let d = null; try { d = nameOf.apply(this, args); } catch { RR.dropRun(); continue; } if (d) RR.forget(d); }';
  const ONE_TRY_TO = 'let dirs = []; try { dirs = namers.map((f) => f.apply(this, args)); } catch { } for (const d of dirs) { try { if (d) RR.forget(d); } catch { } }';
  ok(ACC_SRC.split(ONE_TRY_FROM).length === 2, 'the anchor of the RED CONTROL (the look-again\'s per-folder tries) is in the source (src/accounts.js)');
  if (ACC_SRC.split(ONE_TRY_FROM).length === 2) {
    const oneTryAM = require(MU.write('src/accounts.js', editAnchor(ACC_SRC, ONE_TRY_FROM, ONE_TRY_TO, "src/accounts.js"), 'one-try')).AccountManager;
    const r1 = await siteRun({ AccountManager: oneTryAM, engMod }, UNNAMED);
    const r1T = await siteRun({ AccountManager: oneTryAM, engMod }, UNNAMED_T);
    ok(r1T.got === 'written', `RED CONTROL: …and setPoolTarget under the hotfix's one try re-points the pool default to that member (${JSON.stringify(r1T.got)})`, r1T);
    ok(r1.got === 'written', `RED CONTROL: the hotfix's one try — a folder that cannot be named skips every forget, the run is never dropped, and the billing link is WRITTEN to the member another process signed out (${JSON.stringify(r1.got)})`, r1);
  }
}

console.log('⑮ dropRun() — the hand-off for a write no wrapper sees — drops every copy\'s memo');
{
  const w = world({ S: 1, M: 1 });
  const p = path.join(w.cacheDir, w.ids[0] + '.json');
  const B = require(MU.write('src/run-reads.js', RR_SRC, 'drop-second', { same: true }));
  B.watch(w.cacheDir);
  await turn();
  const r = countRun(w.root, () => { RR.readText(p); B.readText(p); RR.dropRun(); RR.readText(p); B.readText(p); });
  await turn();
  const c = countRun(w.root, () => { RR.readText(p); B.readText(p); RR.readText(p); B.readText(p); });
  ok(r.asks === 4 && c.asks === 2, `two copies, two asks each with dropRun() between: 4 asks of the mount (without it: ${c.asks})`, { r: r.asks, c: c.asks });
}

console.log('⑯ EVERY SITE THAT PUTS A FUNCTION ON fs IS ROWED WITH ITS UNDO — a census by parse; after each undo a watched write still drops the memo');
{
  const acorn = createRequire(path.join(REPO, 'package.json'))('acorn');
  const { walk } = await import('./sync-fs-census.mjs');
  const parse = (src) => { const code = src.replace(/^#!.*/, ''); const o = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true }; try { return acorn.parse(code, { ...o, sourceType: 'script' }); } catch { return acorn.parse(code, { ...o, sourceType: 'module', allowReturnOutsideFunction: false }); } };
  const isFsModule = (n) => !!n && ((n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments[0] && n.arguments[0].type === 'Literal' && /^(?:node:)?fs$/.test(String(n.arguments[0].value))));
  const rootOf = (n) => { while (n && n.type === 'MemberExpression') n = n.object; return n; };
  const isFn = (n) => /^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type);
  /** the sites of ONE source: assignments whose target object is fs or fs-derived — a binding of require('fs') / an fs import,
   *  a member chain of one (fs.Dir.prototype), a parameter defaulted to one, or a parameter some call in the file hands one */
  function fsSites(src) {
    let ast; try { ast = parse(src); } catch { return null; }
    const fsNames = new Set();
    walk(ast, (n) => {
      if (n.type === 'ImportDeclaration' && /^(?:node:)?fs$/.test(String(n.source.value))) for (const s of n.specifiers) if (s.type !== 'ImportSpecifier') fsNames.add(s.local.name);
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && isFsModule(n.init)) fsNames.add(n.id.name);
      if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier' && isFsModule(n.right)) fsNames.add(n.left.name);   // follow-up (2): `let f; f = require('fs')`
    });
    const isFsValue = (v) => !!v && (isFsModule(v) || (v.type === 'Identifier' && fsNames.has(v.name)));
    const fnName = new Map();   // function node → its name (a declaration, or the const it is assigned to)
    walk(ast, (n) => { if (n.type === 'FunctionDeclaration' && n.id) fnName.set(n, n.id.name); if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && isFn(n.init)) fnName.set(n.init, n.id.name); });
    const handed = new Set();   // «name#i»: some call in the file hands an fs binding at argument i
    walk(ast, (n) => { if (n.type === 'CallExpression' && n.callee.type === 'Identifier') n.arguments.forEach((a, i) => { if (a.type === 'Identifier' && fsNames.has(a.name)) handed.add(n.callee.name + '#' + i); }); });
    const fsParams = new Map();   // function node → its fs-derived names (parameters; then member chains of them, below)
    walk(ast, (n) => {
      if (!isFn(n)) return;
      const names = new Set();
      n.params.forEach((p, i) => {
        if (p.type === 'Identifier' && handed.has((fnName.get(n) || '?') + '#' + i)) names.add(p.name);
        if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier' && isFsValue(p.right)) names.add(p.left.name);
        const obj = p.type === 'AssignmentPattern' ? p.left : p;
        if (obj.type === 'ObjectPattern') for (const pr of obj.properties) {
          if (pr.type !== 'Property') continue;
          const v = pr.value;
          if (v.type === 'AssignmentPattern' && v.left.type === 'Identifier' && isFsValue(v.right)) names.add(v.left.name);
        }
      });
      if (names.size) fsParams.set(n, names);
    });
    const derivedAt = (name, parents) => fsNames.has(name) || parents.some((f) => fsParams.has(f) && fsParams.get(f).has(name));
    // member chains of an fs-derived name (fs.Dir.prototype, fsMod.realpathSync): a fixed point over declarators, in scope
    for (let changed = true; changed;) {
      changed = false;
      walk(ast, (n, parents) => {
        // follow-up (2): a declarator OR a later assignment to a bare name; its value a member chain of an fs-derived name, an
        // ALIAS of one (`const f2 = fs`), or a chain rooted at require('fs') itself
        let id = null, val = null;
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) { id = n.id.name; val = n.init; }
        else if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier') { id = n.left.name; val = n.right; }
        if (!id) return;
        const init = val.type === 'LogicalExpression' ? val.left : val;
        if (init.type !== 'MemberExpression' && init.type !== 'Identifier') return;
        const r = init.type === 'Identifier' ? init : rootOf(init);
        if (!r || !((r.type === 'Identifier' && derivedAt(r.name, parents)) || isFsModule(r))) return;
        const f = [...parents].reverse().find(isFn);
        if (!f) { if (!fsNames.has(id)) { fsNames.add(id); changed = true; } return; }
        const set = fsParams.get(f) || new Set();
        if (!set.has(id)) { set.add(id); fsParams.set(f, set); changed = true; }
      });
    }
    const out = [];
    const said = (a, b) => src.slice(a.start, a.end) + ' = ' + src.slice(b.start, Math.min(b.end, b.start + 30)).replace(/\s+/g, ' ');
    walk(ast, (n, parents) => {
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression') {
        const r = rootOf(n.left);
        if (r && ((r.type === 'Identifier' && derivedAt(r.name, parents)) || isFsModule(r))) out.push(said(n.left, n.right));   // follow-up (2): require('fs').x = …
      }
      // Object.defineProperty / Object.assign onto an fs-derived object changes it as an assignment does
      // follow-up (2): Reflect.set / Reflect.defineProperty too
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && n.callee.property.type === 'Identifier' && ((n.callee.object.name === 'Object' && /^(?:defineProperty|defineProperties|assign)$/.test(n.callee.property.name)) || (n.callee.object.name === 'Reflect' && /^(?:set|defineProperty)$/.test(n.callee.property.name)))) {
        const t = n.arguments[0], r = t && rootOf(t);
        if (r && ((r.type === 'Identifier' && derivedAt(r.name, parents)) || isFsModule(r))) out.push(src.slice(n.start, Math.min(n.end, n.start + 60)).replace(/\s+/g, ' '));
      }
    });
    return out;
  }
  // THE ROWS: each site's file, its count, and what its UNDO does (the leg below runs each undo)
  const ROWS = {
    'src/run-reads.js': [1, 'the helper itself: its wrappers are installed once per process at the first watch() and never taken off'],
    'src/server/loop-blame.js': [3, 'the loop witness: wraps every Sync function, realpathSync.native and Dir.readSync (reads) once and NEVER takes a wrapper off'],
    'src/server/boot-trace.js': [2, 'the boot trace (VIBESPACE_BOOT_TRACE=1): its window\'s end restores the original ONLY while its wrapper is the outermost — otherwise it turns into a pass-through'],
  };
  const files = execFileSync('git', ['-C', REPO, 'ls-files', '-z', '--', 'src', 'server.js'], { encoding: 'utf8' }).split('\0').filter((f) => /\.(c|m)?js$/.test(f));
  const FS_TEXT = /require\(\s*['"](?:node:)?fs['"]\s*\)|from\s+['"](?:node:)?fs['"]/;
  const found = {}, unparsed = [];
  for (const f of files) {
    let text = ''; try { text = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { continue; }
    if (!FS_TEXT.test(text)) continue;   // a file that never binds fs holds no fs-derived name
    const s = fsSites(text);
    if (s === null) { unparsed.push(f); continue; }
    if (s.length) found[f] = s;
  }
  const wrong = [...new Set([...Object.keys(found), ...Object.keys(ROWS)])].filter((f) => (found[f] || []).length !== (ROWS[f] ? ROWS[f][0] : 0)).map((f) => `${f}: ${(found[f] || []).length} site(s) (row ${ROWS[f] ? ROWS[f][0] : 'none'}) ${JSON.stringify(found[f] || [])}`);
  ok(!wrong.length && !unparsed.length, `the sites that assign a function of fs, found by parse over every file that binds fs: ${Object.entries(found).map(([f, s]) => `${f} ×${s.length}`).join(', ')} — each rowed with its undo (a new site, or one more, is red)`, { wrong, unparsed });
  const planted = fsSites([
    "const fs = require('fs'); const P = fs.Dir.prototype;",
    'fs.writeFileSync = function () {};',                        // the binding
    'P.readSync = function () {};',                              // a member chain of it
    'function arm(m, k) { const o = m[k]; m[k] = (...a) => o(...a); } arm(fs, "renameSync");',   // a parameter handed fs
    'function install({ fsMod = fs } = {}) { fsMod.openSync = null; const rp = fsMod.realpathSync; Object.defineProperty(rp, "native", { value: 1 }); }',   // a parameter defaulted to fs, a member chain of it
    'const fsAlias = fs; fsAlias.mkdirSync = null;',             // follow-up (2): an ALIAS of the binding
    'require("fs").rmSync = null;',                              // follow-up (2): a require call as the root
    'Reflect.set(fs, "statSync", null);',                        // follow-up (2): the reflect form
    'let later; later = require("fs"); later.readdirSync = null;',   // follow-up (2): an assignment after a bare declaration
    'const console2 = {}; console2.log = () => {}; function other(m) { m.x = 1; } other({});',   // not fs: no site
  ].join('\n'));
  // follow-up (2), a reader's should: each planted form ALONE is its own count (a rule that double-counts one and misses another
  // cannot hide in the total) — the parameter-defaulted install line holds two sites, the negative line none
  const PL = ["const fs = require('fs'); const P = fs.Dir.prototype;",
    'fs.writeFileSync = function () {};',                        // the binding
    'P.readSync = function () {};',                              // a member chain of it
    'function arm(m, k) { const o = m[k]; m[k] = (...a) => o(...a); } arm(fs, "renameSync");',   // a parameter handed fs
    'function install({ fsMod = fs } = {}) { fsMod.openSync = null; const rp = fsMod.realpathSync; Object.defineProperty(rp, "native", { value: 1 }); }',   // a parameter defaulted to fs, a member chain of it
    'const fsAlias = fs; fsAlias.mkdirSync = null;',             // follow-up (2): an ALIAS of the binding
    'require("fs").rmSync = null;',                              // follow-up (2): a require call as the root
    'Reflect.set(fs, "statSync", null);',                        // follow-up (2): the reflect form
    'let later; later = require("fs"); later.readdirSync = null;',   // follow-up (2): an assignment after a bare declaration
    'const console2 = {}; console2.log = () => {}; function other(m) { m.x = 1; } other({});',   // not fs: no site
  ];
  const PER = [null, 1, 1, 1, 2, 1, 1, 1, 1, 0];
  const each = PL.map((l, i) => (i === 0 ? null : (fsSites(PL[0] + '\n' + l) || []).length));
  ok(PL.length === PER.length && verdictOf(each.every((n, i) => n === PER[i])), `CONTROL: each planted form alone — ${each.slice(1).join(', ')} (want ${PER.slice(1).join(', ')})`, each);
  ok(gateOf(Array.isArray(planted)) && planted.length === 9, `CONTROL: a planted assignment to the binding, to a member chain of it, through a parameter handed fs, through one defaulted to fs, a defineProperty on a member of it — and (B-403e follow-up 2) through an alias, onto require('fs') itself, by Reflect.set, and through a bare declaration assigned later — are all found, and none elsewhere (${planted && planted.length})`, planted);
  // EACH ROW'S UNDO, run in a fresh process: after it, a write under a watched folder still drops the memo
  const LB = path.join(REPO, 'src/server/loop-blame.js');
  const undoProbe = path.join(tmpdir('vs-pool-reads-undo-'), 'undo.cjs');
  fs.writeFileSync(undoProbe, `'use strict';
const fs = require('fs'); const path = require('path');
const [rrPath, which, dir, lbPath, btPath] = process.argv.slice(2);
const RR = require(rrPath);
if (which === 'loop-blame-first') require(lbPath).install({ fsMod: fs });     // the witness installed BEFORE the first watch
let unwrap = null; if (which === 'boot-trace') unwrap = require(btPath).wrapSync({ ops: [], now: () => 0 });
RR.watch(dir);
if (which === 'loop-blame-after') require(lbPath).install({ fsMod: fs });     // …and AFTER it
if (unwrap) unwrap();                                                         // the row's undo
const f = path.join(dir, 'f'); fs.writeFileSync(f, 'one');
const a = RR.readText(f); fs.writeFileSync(f, 'two'); const b = RR.readText(f);
const fd = fs.openSync(path.join(dir, 'g'), 'w'); const c = RR.readText(f); fs.writeSync(fd, 'x'); fs.closeSync(fd);
fs.renameSync(path.join(dir, 'g'), f); const d = RR.readText(f);
process.stdout.write(JSON.stringify({ pass: a === 'one' && b === 'two' && c === 'two' && d === 'x', a, b, c, d }));
`);
  const undoRun = (which) => { try { return JSON.parse(execFileSync(process.execPath, [undoProbe, RRpath, which, fs.mkdtempSync(path.join(path.dirname(undoProbe), 'w-')), LB, path.join(REPO, 'src/server/boot-trace.js')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) { return { pass: false, err: String(e.stderr || e.message).slice(0, 200) }; } };
  const UNDOS = [['loop-blame-first', 'src/server/loop-blame.js'], ['loop-blame-after', 'src/server/loop-blame.js'], ['boot-trace', 'src/server/boot-trace.js']];
  const undone = UNDOS.map(([w, f]) => [w, f, undoRun(w)]);
  ok(gateOf(undone.every(([, , r]) => r.pass)) && verdictOf(Object.keys(ROWS).filter((f) => f !== 'src/run-reads.js').every((f) => UNDOS.some(([, uf]) => uf === f))), `after each rowed site's install and undo (the loop witness before and after the first watch, the boot trace's window), a path write, a descriptor write and a rename under a watched folder still drop the memo`, undone.map(([w, , r]) => `${w}: ${JSON.stringify(r)}`));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
