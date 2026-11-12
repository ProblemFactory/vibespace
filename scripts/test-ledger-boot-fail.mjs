#!/usr/bin/env node
// THE FAILING FIRST LOAD'S ROAD (lane ledger-boot-load round 2 + its follow-up — split from test-ledger-boot-load under the
// fast tier's 10 s): the hub's ledger takes its first load in the fold worker (firstLoadInWorker), and NOTHING WAITS ON A
// LOAD THAT IS FAILING. Through the REAL scan (transcripts walked into their own homes) and the REAL route handler
// (account-usage-routes on a fake app):
//   ⑦ a worker that throws on every try — the route and the rid lookup answer LOADING with the cause and the next try, the
//      hub's own turns reach the ledger, no scan left pending; the heal lands and the figures equal the release's road.
//      RED: the wait unbounded (round 1)
//   ⑧ the edges (the follow-up): a try that HANGS — answered LOADING at the try's deadline (the scan's wait and the reader's
//      share ONE budget); a PERSON'S Retry tries now and REPLACES the re-arm timer; LOADING a state in the Usage window (its
//      words, its re-ask, nothing a closed window awaited asks — the real page's leg: test-usage-window-pivots §7); the
//      gate's words for the failure and the heal; each with its planted RED
// Run: node scripts/test-ledger-boot-fail.mjs (no network)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { scratchDir } from './scratch.mjs';
import { writeBootShape } from './boot-shape.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { UsageHistory } = require('../src/usage-history.js');
const EST = require('../src/usage-estimator.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const tmp = scratchDir('ledger-boot-fail');
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
const UH_REL = 'src/usage-history.js', uhSrc = fs.readFileSync(path.join(REPO, UH_REL), 'utf8');
const M = mutantCopies('ledger-boot-fail', REPO);
const quiet = async (fn) => { const l = console.log, w = console.warn, said = []; console.log = (...a) => said.push(a.join(' ')); console.warn = (...a) => said.push('WARN ' + a.join(' ')); try { return { v: await fn(), said }; } finally { console.log = l; console.warn = w; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) return false; await sleep(5); } return true; };
const NOW = Date.now();
// the real SHAPE (scripts/boot-shape.mjs), as test-ledger-boot-load builds it
const fx = (() => { const d = path.join(tmp, 'shape'); const r = writeBootShape({ dataDir: d, homeDir: tmp, scale: 0.012, now: NOW, only: 'ledger' }); return { dir: d, rows: r.rows.ledger }; })();
let copies = 0;
const copyOf = () => { const d = path.join(tmp, 'c' + (++copies)); fs.cpSync(fx.dir, d, { recursive: true }); return d; };
const ledgerDir = (d) => path.join(d, 'usage-history');
const shards = (d) => fs.readdirSync(ledgerDir(d)).filter((f) => /^events-\d{4}-\d{2}\.ndjson$/.test(f)).sort();
const hub = (UH, d, extra = {}) => Object.assign(new UH({ dataDir: d, homeDir: tmp, firstLoadInWorker: true }), extra);
const base = (UH, d) => new UH({ dataDir: d, homeDir: tmp });
const rowsOf = (u) => [...u._events(null, null)];
let stubs = 0;
const stub = (pre) => { const f = path.join(tmp, `worker-${++stubs}.cjs`); fs.writeFileSync(f, `'use strict';\nconst { UsageHistory } = require(${JSON.stringify(path.join(REPO, 'src/usage-history.js'))});\n${pre}\nrequire(${JSON.stringify(path.join(REPO, 'src/usage-cold-worker.js'))});\n`); return f; };
const DIES = { 'throws': { file: () => stub("UsageHistory.prototype._packWhole = function () { throw new Error('planted: the shard could not be read'); };") } };
console.log(`fixture: a real-shape ledger, ${fx.rows} rows`);

// ── ⑦ NOTHING WAITS ON A LOAD THAT IS FAILING (round 2) ───────────────────────────────────────────────────────────────────
// Through the REAL scan (a transcript walked, its rows appended) and the route's own sequence (GET /api/usage-stats:
// scan(); await scanSettled(); aggregateAsync — the rid lookup the same) — ④ stubs the scan, which is what hid it: a first
// load whose tries fail kept the scan pending for good (it awaited a wait that resolved only when a try LANDED).
console.log('⑦ nothing waits on a load that is failing: the real scan and route answer LOADING within a try, the hub\'s turns land, then the heal');
async function failRoute(UH, { routes = 3, heal = true } = {}) {
  const d = copyOf(), home = path.join(tmp, 'home-fr' + (++copies)), slug = path.join(home, '.claude', 'projects', '-w-fr');
  fs.mkdirSync(slug, { recursive: true });
  const tl = (k) => JSON.stringify({ type: 'assistant', uuid: 'fr' + k, parentUuid: null, sessionId: '33333333-4444-4555-8666-7777777777f' + k, timestamp: new Date(NOW - 60e3 + k * 1000).toISOString(), requestId: 'req_fr' + k, cwd: '/w/fr', message: { id: 'msg_fr' + k, model: 'claude-opus-5-5', role: 'assistant', type: 'message', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 5, output_tokens: 6, cache_creation_input_tokens: 0, cache_read_input_tokens: 7 } } });
  fs.writeFileSync(path.join(slug, 'fr.jsonl'), tl(0) + '\n');
  const u = Object.assign(new UH({ dataDir: d, homeDir: home, firstLoadInWorker: true }), { rebuildWorkerFile: DIES.throws.file() });
  const inLedger = (rid) => shards(d).some((f) => fs.readFileSync(path.join(ledgerDir(d), f), 'utf8').includes(`"rid":"${rid}"`));
  const ka = setInterval(() => { }, 50); // the store writer is an unref'd thread: the suite's own loop stays alive while a scan's cursor write is in flight
  const o = { routes: [] };
  try {
    const { said } = await quiet(async () => {
      u.scan(); await u.scanSettled(); // the boot's own order (server.js +8 s): the scan of a cold ledger …
      u.warmStepped(); rowsOf(u); // … then the boot warm / the first sweep's ask: try 1
      await until(() => u._boot && !u._boot.job && u._boot.fails >= 1, 15000);
      o.boot0 = inLedger('req_fr0');
      for (let k = 1; k <= routes; k++) { // the route sequences, the throttle passed each time, a new local turn before each
        fs.appendFileSync(path.join(slug, 'fr.jsonl'), tl(k) + '\n');
        u._lastScanAt = Date.now() - 16000;
        const t0 = Date.now();
        const route = (async () => { const s = u.scan(); await u.scanSettled(); return { s, v: await u.aggregateAsync({ to: NOW + 1e3 }) }; })().then((x) => ({ ok: true, skipped: !!(x.s && x.s.skipped) }), (e) => ({ ok: false, code: e.code, msg: String(e.message) }));
        const rid = u.eventForRid('req_fr' + k).then(() => ({ ok: true }), (e) => ({ ok: false, code: e.code }));
        const r = await Promise.race([Promise.all([route, rid]), sleep(700).then(() => null)]); // a try here fails in tens of ms: a route still pending past 0.7 s waits on more than a try
        o.routes.push({ k, ms: Date.now() - t0, route: r ? r[0] : 'pending', rid: r ? r[1] : 'pending', landed: inLedger('req_fr' + k), scanning: !!u._scanning, fails: u._boot && u._boot.fails });
      }
      if (!heal) return;
      u.rebuildWorkerFile = null; u._boot.retryAt = Date.now() - 1; // the storage answers again
      fs.appendFileSync(path.join(slug, 'fr.jsonl'), tl(4) + '\n'); u._lastScanAt = Date.now() - 16000;
      const t1 = Date.now();
      const healed = await Promise.race([(async () => { u.scan(); await u.scanSettled(); try { return await u.aggregateAsync({ to: NOW + 1e3 }); } catch (e) { if (e.code !== 'LOADING') throw e; await u.bootLoadSettled(); return u.aggregateAsync({ to: NOW + 1e3 }); } })(), sleep(15000).then(() => null)]);
      o.healMs = Date.now() - t1; o.healed = !!healed; o.loadingAfter = u.ledgerLoading();
      if (healed) { const ref = base(UsageHistory, d); o.equal = JSON.stringify(healed.totals) === JSON.stringify((await ref.aggregateAsync({ to: NOW + 1e3 })).totals); o.totals = healed.totals && healed.totals.requests; o.refRows = ref._evCountUpTo(Infinity); o.rows = u._evCountUpTo(Infinity); }
      o.turnRows = [0, 1, 2, 3, 4].filter((k) => inLedger('req_fr' + k)).length;
    });
    o.warns = said.filter((l) => l.startsWith('WARN'));
  } finally { clearInterval(ka); }
  return o;
}
{
  const r = await failRoute(UsageHistory), R = r.routes, loadingWords = (x) => x && x.code === 'LOADING' && /the usage ledger is still loading — its first load in the fold worker failed \(planted: the shard could not be read\); it is tried again (in|at the next ask after) \d+ s/.test(x.msg || '');
  ok(R.length === 3 && R.every((x) => x.route !== 'pending' && loadingWords(x.route) && x.rid !== 'pending' && x.rid.code === 'LOADING'), `⑦ a worker that throws on every try: GET /api/usage-stats's sequence answers LOADING with the reason and the next try, three times (${R.map((x) => x.ms).join(' / ')} ms — never pending past a try), the rid lookup LOADING too`);
  ok(r.boot0 && R.every((x) => x.landed && !x.scanning), `⑦ the hub's own turns reach the ledger while the load fails: the boot scan's row and each new local turn appended (${R.filter((x) => x.landed).length} of 3), no scan left pending`);
  ok(r.healed && r.equal && r.loadingAfter === null && r.turnRows === 5 && r.rows === r.refRows, `⑦ the worker heals: the next try lands (${r.healMs} ms) and the route answers figures equal to the release's road (${r.totals} requests, ${r.rows} rows = ${r.refRows}); all 5 local turns in it once`);
  // RED: the wait unbounded again (round 1: the scan waits for whenWarm, which resolved only when a try LANDED)
  const unb = uhSrc.replace("try { if (this._booting()) { const b = this._boot; if (b && b.job) await this._withinTry(b.job, () => null, b); } else await this.whenWarm(); } catch { }", 'try { await this.whenWarm(); } catch { }')
    .replace("    if (b.job) return this._withinTry(b.job, () => null); // never rejects: its two handlers return (follow-up: a hung try is waited for BOOT_READER_WAIT_MS at most)\n    this._bootRearm(b);\n    return b.next || (b.next = new Promise((r) => { b.nextR = r; }));\n", '    this._bootRearm(b); return b.done;\n');
  const RR = unb !== uhSrc ? await failRoute(M.load(UH_REL, unb, 'unbounded').UsageHistory, { routes: 1, heal: false }) : null;
  ok(!!RR && RR.routes.length === 1 && RR.routes.every((x) => x.route === 'pending'), `control (the wait unbounded again — round 1): the route ${RR && RR.routes.map((x) => x.route === 'pending' ? 'pending' : x.route.code).join(' / ')} past 0.7 s ⇒ RED`);
}

// ── ⑧ THE FAILING LOAD'S EDGES (the follow-up, 主开发 09:36Z) ─────────────────────────────────────────────────────────────
// Through the REAL route handler (account-usage-routes on a fake app — test-usage-window-pivots's wiring) and the real scan:
// (1) a try that HANGS: every reader waits for it at most BOOT_READER_WAIT_MS (10 s; 300 ms here, `bootReaderWaitMs`), then is
// answered LOADING while it goes on — the scan included; (2) a PERSON'S Retry (retry=1) tries now, never the unattended backoff;
// (3) LOADING is a state: the route carries its time, the window's words and its own re-ask; (4) the gate says the failure
// once with its cause, and the heal
console.log('⑧ the failing load\'s edges: a hung try bounded for a reader, a person\'s Retry tries now, LOADING a state, the gate\'s words');
const routeOf = (u) => { const handlers = {}; const fakeApp = new Proxy({}, { get: (_t, verb) => (pth, ...fns) => { handlers[String(verb).toUpperCase() + ' ' + pth] = fns[fns.length - 1]; } });
  require('../src/server/account-usage-routes.js').create({ app: fakeApp, rootDir: REPO, engine: {}, serverSetting: () => undefined, getUsageHistory: () => u, getAccounts: () => ({}), getHosts: () => ({}), getMounts: () => ({}), getTelemetry: () => ({}), getLoginExpiryWatch: () => null });
  return (query = {}) => new Promise((resolve) => { const res = { statusCode: 200, writableEnded: false, status(c) { this.statusCode = c; return this; }, json(o) { this.writableEnded = true; resolve({ status: this.statusCode, body: o }); }, setHeader() { }, set() { return this; } }; Promise.resolve(handlers['GET /api/usage-stats']({ query, on() { } }, res)).catch((e) => resolve({ status: 'threw', body: String(e) })); }); };
const homeWith = (tag) => { const home = path.join(tmp, 'home-' + tag + (++copies)), slug = path.join(home, '.claude', 'projects', '-w-' + tag); fs.mkdirSync(slug, { recursive: true }); return { home, tr: path.join(slug, tag + '.jsonl') }; };
const tline = (tag, k) => JSON.stringify({ type: 'assistant', uuid: tag + k, parentUuid: null, sessionId: '33333333-4444-4555-8666-7777777777e' + k, timestamp: new Date(NOW - 60e3 + k * 1000).toISOString(), requestId: 'req_' + tag + k, cwd: '/w/' + tag, message: { id: 'msg_' + tag + k, model: 'claude-opus-5-5', role: 'assistant', type: 'message', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 5, output_tokens: 6, cache_creation_input_tokens: 0, cache_read_input_tokens: 7 } } });
async function hung(UH) {
  const d = copyOf(), { home, tr } = homeWith('hg'); fs.writeFileSync(tr, tline('hg', 0) + '\n');
  const u = Object.assign(new UH({ dataDir: d, homeDir: home, firstLoadInWorker: true }), { rebuildWorkerFile: stub('Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20000); // a worker that neither answers nor dies'), bootReaderWaitMs: 400 });
  const inLedger = (rid) => shards(d).some((f) => fs.readFileSync(path.join(ledgerDir(d), f), 'utf8').includes(`"rid":"${rid}"`));
  const route = routeOf(u), ka = setInterval(() => { }, 50), o = {};
  try {
    await quiet(async () => {
      u.scan(); await u.scanSettled(); u.warmStepped(); rowsOf(u); // the boot's order: the try starts — and hangs
      await sleep(300); // the try has run 300 ms of its 400 ms budget when the request comes
      fs.appendFileSync(tr, tline('hg', 1) + '\n'); u._lastScanAt = Date.now() - 16000; // a new local turn; the throttle passed
      const t0 = Date.now();
      o.r = await Promise.race([route({}), sleep(600).then(() => 'pending')]); o.ms = Date.now() - t0; // ONE budget: the scan's wait and the reader's end at the try's deadline (≈ 100 ms left) — in series (2 × 400 ms) it is still pending at 0.6 s
      o.scanning = !!u._scanning; o.turn = inLedger('req_hg1'); o.tryOn = !!(u._boot && u._boot.job);
    });
  } finally { clearInterval(ka); }
  return o;
}
{
  const h = await hung(UsageHistory), b = h.r && h.r.body;
  ok(h.r !== 'pending' && h.r.status === 503 && b.code === 'LOADING' && b.running === true && Number.isFinite(b.nextTryAt) && /the usage ledger is still loading — its first load in the fold worker has run \d+ s and goes on; ask again at \d\d:\d\d:\d\dZ/.test(b.error) && h.tryOn && h.turn && !h.scanning, `⑧ a try that HANGS: the real route answers LOADING at the TRY'S deadline while the try goes on — the scan's wait and the reader's share ONE budget (${h.ms} ms with 100 of 400 ms left; «${b && b.error}»); the scan not held — the new local turn in the ledger, no scan pending`);
  const unb = uhSrc.replace("  _withinTry(p, onLate, b = null) {\n", "  _withinTry(p, onLate, b = null) { return p;\n");
  const H = unb !== uhSrc ? await hung(M.load(UH_REL, unb, 'hang-unbounded').UsageHistory) : null;
  ok(!!H && H.r === 'pending', `control (a reader waits for the hung try itself — bounded by the fold deadline only): the route ${H && (H.r === 'pending' ? 'pending' : H.r.status)} past 0.6 s ⇒ RED`);
  const series = uhSrc.replace("const wait = this.bootReaderWaitMs || BOOT_READER_WAIT_MS, left = b ? Math.max(0, (b.tryAt || b.at || Date.now()) + wait - Date.now()) : wait;", 'const wait = this.bootReaderWaitMs || BOOT_READER_WAIT_MS, left = wait;');
  const S2 = series !== uhSrc ? await hung(M.load(UH_REL, series, 'hang-series').UsageHistory) : null;
  ok(!!S2 && S2.r === 'pending', `control (each wait its own ${'400'} ms — the scan's, then the reader's, in series): the route ${S2 && (S2.r === 'pending' ? 'pending' : S2.r.status)} past 0.6 s ⇒ RED`);
}
async function attended(UH, viaRoute) {
  const d = copyOf(), u = hub(UH, d, { rebuildWorkerFile: DIES.throws.file() }), w0 = u._rebuildWorkers || 0, o = {};
  await quiet(async () => {
    rowsOf(u); await until(() => u._boot && !u._boot.job && u._boot.fails >= 1, 15000); // try 1 failed: a 5 s backoff
    o.backoff = u._boot.retryAt - Date.now();
    u.rebuildWorkerFile = null; // the storage answers again — a person presses Retry inside the backoff
    const t0 = Date.now();
    if (viaRoute) { u.scan = () => ({ skipped: true }); u.scanSettled = () => Promise.resolve({}); o.r = await routeOf(u)({ retry: '1' }); } else o.started = u.retryBootLoad();
    o.tried = (u._rebuildWorkers || 0) - w0;
    o.landed = await until(() => !u._booting(), 700); o.ms = Date.now() - t0; // the backoff is 5 s: a landing inside 0.7 s was the press's own try
  });
  return o;
}
{
  const a = await attended(UsageHistory, false), r = await attended(UsageHistory, true);
  ok(a.backoff > 4000 && a.started === true && a.landed && a.ms < a.backoff, `⑧ A PERSON'S RETRY inside the ${Math.round(a.backoff / 1000)} s backoff tries NOW (a try under way at the press) and lands (${a.ms} ms) — never the unattended backoff`);
  ok(r.r && r.r.status === 200 && r.r.body && r.r.body.totals && r.landed, `⑧ through the route: GET /api/usage-stats?retry=1 inside the backoff tries now and answers the figures (${r.r && r.r.body && r.r.body.totals && r.r.body.totals.requests} requests) — the press was attended`);
  const lazy = uhSrc.replace("    const b = this._boot; if (b && !b.job) { b.retryAt = Date.now(); if (b.timer) { clearTimeout(b.timer); b.timer = null; } } // the press REPLACES the re-arm timer (its failure arms the next at the doubled backoff)\n", "    const b = this._boot;\n");
  const A = lazy !== uhSrc ? await attended(M.load(UH_REL, lazy, 'retry-unattended').UsageHistory, false) : null;
  ok(!!A && A.started === false && !A.landed, `control (the press answered with the unattended backoff): no try at the press, not landed in 0.7 s ⇒ RED`);
}
async function pressTimer(UH) {
  const d = copyOf(), u = hub(UH, d, { rebuildWorkerFile: DIES.throws.file() }), o = {};
  const realClear = globalThis.clearTimeout, cleared = new Set(); globalThis.clearTimeout = (h) => { cleared.add(h); return realClear(h); };
  try {
    await quiet(async () => {
      rowsOf(u); await until(() => u._boot && !u._boot.job && u._boot.fails >= 1, 15000);
      u.bootLoadSettled(); // a waiter (the gate): the re-arm timer set for the backoff's end
      const old = u._boot.timer; o.hadTimer = !!old;
      o.started = u.retryBootLoad(); // a person's press inside the backoff — the storage still refusing
      await until(() => u._boot && !u._boot.job && u._boot.fails >= 2, 5000);
      o.oldCleared = cleared.has(old); o.newTimer = !!u._boot.timer && u._boot.timer !== old; o.backoff2 = u._boot.retryAt - Date.now();
    });
  } finally { globalThis.clearTimeout = realClear; }
  return o;
}
{
  const pt = await pressTimer(UsageHistory);
  ok(pt.hadTimer && pt.started && pt.oldCleared && pt.newTimer && pt.backoff2 > 9000, `⑧ the press REPLACES the re-arm timer: the old one (set for the first backoff's end) cleared at the press, the press's own failure arms the next at the doubled backoff (${Math.round(pt.backoff2 / 1000)} s) — no unattended try at the old time`);
  const keep = uhSrc.replace(" if (b.timer) { clearTimeout(b.timer); b.timer = null; } } // the press REPLACES the re-arm timer", " } // the press REPLACES the re-arm timer");
  const PT = keep !== uhSrc ? await pressTimer(M.load(UH_REL, keep, 'press-keeps-timer').UsageHistory) : null;
  ok(!!PT && PT.started && !PT.oldCleared, `control (the press leaves the old timer): it still fires at its old time — one unattended try before the doubled backoff ⇒ RED`);
}
{ // (3) THE WINDOW: LOADING is a state — its words, its time, its own re-ask; the Retry a person's; no error toast
  const N = await import('../src/lib/usage-ledger-note.js'), now = Date.UTC(2026, 10, 12, 9, 0, 0);
  const s = N.ledgerLoadingOf({ error: 'x', code: 'LOADING', nextTryAt: now + 7000 }, now), rn = N.ledgerLoadingOf({ error: 'x', code: 'LOADING', nextTryAt: now + 10000, running: true }, now);
  const hm = (ms) => { const x = new Date(ms); return [x.getHours(), x.getMinutes(), x.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':'); };
  ok(s && s.words === 'The usage ledger is still loading — next try at {time}' && s.vars.time === hm(now + 7000) && s.reaskInMs === 7000 && rn && rn.words === 'The usage ledger is still loading — its first load is running; asked again at {time}' && rn.reaskInMs === 10000 && N.ledgerLoadingOf({ error: 'usage summary failed — boom; retry', code: 'BUSY' }, now) === null, `⑧ the window's LOADING state: «${s && s.words.replace('{time}', s.vars.time)}», asked again in ${s && s.reaskInMs} ms (running: «${rn && rn.words.replace('{time}', rn.vars.time)}»); a real failure stays a failure`);
  const W = fs.readFileSync(path.join(REPO, 'src/lib/usage-window.js'), 'utf8'), zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const loadAt = W.indexOf('const ldg = ledgerLoadingOf(got);'), toastAt = W.indexOf("showToast(t('Could not load usage: {msg}'");
  ok(loadAt > 0 && toastAt > loadAt && /if \(ldg\) \{ state\.data = null; state\.reaskT = setTimeout\(\(\) => \{ state\.reaskT = null; if \(alive\(\) && state\.ledgerLoading\) load\(\); \}, ldg\.reaskInMs\); \}\n\s+else if \(!got \|\| got\.error\) \{/.test(W) && /const load = async \(\) => \{\n\s+if \(!alive\(\)\) return;/.test(W) && /const got = await fetchJson\('\/api\/usage-stats\?' \+ qs\.toString\(\)\);\n\s+if \(!alive\(\)\) return;/.test(W) && /winInfo\.onClose = \(\) => \{ closed = true;/.test(W) && /body: '\{\}' \}\)\.then\(\(r\) => \{\n\s+if \(!alive\(\)\) return;/.test(W) && (W.match(/again\.onclick = \(\) => \{ state\.attendedRetry = true; load\(\); \};/g) || []).length === 2 && /if \(state\.attendedRetry\) \{ state\.attendedRetry = false; qs\.set\('retry', '1'\); \}/.test(W) && /winInfo\.onClose = \(\) => \{ closed = true; clearTimeout\(state\.reaskT\);/.test(W) && [zh, ja].every((x) => x.includes('"The usage ledger is still loading — next try at {time}"') && x.includes('"The usage ledger is still loading — its first load is running; asked again at {time}"')), `⑧ the window: a LOADING answer is the state (never the error toast — that branch is its else), the re-ask set at its time and cleared at close, the Retry sends retry=1; nothing a closed window awaited asks, arms or draws (alive() after the await, in the re-ask, in the harvest's reply — closed first in onClose; the real page's leg: test-usage-window-pivots §7); zh + ja carry both sentences`);
}
async function gateWords(mutate) {
  const d = copyOf(), u = hub(UsageHistory, d, { rebuildWorkerFile: DIES.throws.file() }), said = [], o = { wholes: 0, sweeps: 0 };
  const est = mutate ? M.load('src/usage-estimator.js', fs.readFileSync(path.join(REPO, 'src/usage-estimator.js'), 'utf8').replace(mutate[0], mutate[1]), 'gate-words') : EST;
  const gate = est.wholeLedgerGate({ ledger: u, log: (m) => said.push(m), onWhole: () => { o.wholes++; } });
  await quiet(async () => {
    o.run = gate.run(() => { o.sweeps++; }); o.held = gate.holds(); // the first sweep (+20 s) and an auto decision: both hold
    await until(() => u._boot && !u._boot.job && u._boot.fails >= 1, 15000); await sleep(30); gate.holds(); gate.holds(); // the decisions keep coming
    u.rebuildWorkerFile = null; u.retryBootLoad(); // the heal
    await until(() => o.sweeps > 0, 8000); await sleep(30);
  });
  o.said = said; return o;
}
{
  const g = await gateWords(null), failLines = g.said.filter((l) => /^the usage ledger's first load is failing \(planted: the shard could not be read; 1 try\) — the automatic pool decisions stay skipped and the anchor sweep waits until it lands; next try at \d\d:\d\d:\d\dZ$/.test(l)), healLines = g.said.filter((l) => /first load landed after its failures — the automatic pool decisions and the anchor sweep resume/.test(l));
  ok(g.held && failLines.length === 1 && healLines.length === 1 && g.sweeps === 1 && g.wholes === 1, `⑧ the gate says the failure ONCE with its cause («${failLines[0] || '—'}») and the heal once; the sweep then runs once and every auto pool is decided again once`);
  const G = await gateWords(["    if (l && l.failed && !failSaid) {", "    if (false) {"]);
  ok(!G.said.some((l) => /first load is failing/.test(l)), `control (the gate's words without the failure): the log says only «${(G.said[0] || '').slice(0, 60)}…» while it fails ⇒ RED`);
}

console.log(fail ? `\n✗ ${fail} failed, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
