#!/usr/bin/env node
// test-user-state-echo-rounds — the HEAVY twin of test-user-state-echo (B-7e49, lane bl-tests-e, 主开发 r2522): its largest
// deterministic worlds, moved VERBATIM — §13 page loss (master by construction; batches commute), §14 every request carries
// what the page has not seen confirmed, §18 the page speaks only when it takes something back, §19 the clock mark taken at boot,
// §20 the rendered rows show it before a word, §23 the fork-title road — each a world of real pages over the real route on a
// virtual clock, with its patched copies. The declarations they read are carried here as they are. The fast file keeps every
// other section and pins (§T) that this file holds these. Selected, as a heavy row, by the files its worlds load (the page code
// src/lib/sidebar-state.js, src/user-state-ops.js, the persistence route …), and run in every whole heavy tier. In-process.
// Run: node scripts/test-user-state-echo-rounds.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const UO = require(path.join(REPO, 'src/user-state-ops.js'));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ueo-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
const J = (x) => JSON.parse(JSON.stringify(x));

// ── a seeded PRNG (mulberry32) ──
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** the server's ORDER of a state (round 7: a restored file takes the counter back — a new life): (its life, by first sight, then
 *  its rev) — the walk orders writes and what a page has seen by it, never by the bare counter */
const grevOf = (w, st) => { const ep = UO.epochOf(st) || (st && typeof st.epoch === 'string' ? st.epoch : ''); if (!w.lives.has(ep)) w.lives.set(ep, w.lives.size); return w.lives.get(ep) * 1e9 + (UO.revOf(st) || Math.max(0, Math.floor(Number(st && st.rev) || 0))); };   // (a state: stateRev / stateEpoch; an answer: rev / epoch)

// ── SLOTS: the harness's OWN reading of a state (independent of applyOps): every fact a person can change, one per slot ──
function slotsOf(state) {
  const v = UO.viewOf(state), m = new Map();
  for (const k of UO.SET_KEYS) for (const x of v[k]) m.set(`${k}|${x}`, true);
  for (const k of UO.VALUE_KEYS) for (const [i, x] of Object.entries(v[k])) m.set(`${k}|${i}`, JSON.stringify(x));
  for (const k of UO.MEMBER_KEYS) for (const [i, list] of Object.entries(v[k])) { m.set(`${k}|${i}|∃`, true); for (const x of Array.isArray(list) ? list : []) m.set(`${k}|${i}|${x}`, true); }
  for (const k of UO.FIELD_KEYS) for (const [i, cfg] of Object.entries(v[k])) for (const [f, x] of Object.entries(cfg && typeof cfg === 'object' ? cfg : {})) m.set(`${k}|${i}|.${f}`, JSON.stringify(x));
  return m;
}
const slotDiff = (a, b) => { const out = []; for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) out.push(k); return out; };
const keyOfSlot = (s) => s.split('|')[0];

// ════════ THE WORLD: the real route + the real page code on a virtual clock ════════
const freshPersistence = () => {
  for (const k of Object.keys(require.cache)) if (k.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[k];
  return require(path.join(REPO, 'src/routes/persistence.js'));
};
const handlerOf = (router, method, p) => { const l = router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l && l.route.stack[0].handle; };
const { mutantCopies } = await import('./mutant-copy.mjs');
const MC = mutantCopies('user-state-echo', REPO);
const STATE_SRC = read('src/lib/sidebar-state.js'), WB_SRC = read('src/lib/sidebar-workbench.js');
const domFree = (s) => {
  const reps = [
    ["import { getSessionKey, backendFeatureCaps } from './agent-meta.js';", 'const getSessionKey = (s) => (s && s.sessionKey) || null, backendFeatureCaps = (b) => (globalThis.__UEO_CAPS ? globalThis.__UEO_CAPS(b) : {});'],
    ["import { showToast, showInputDialog } from './utils.js';", 'const showInputDialog = async (o) => (globalThis.__UEO_DIALOG ? globalThis.__UEO_DIALOG(o) : null);'],   // (round 13: a leg may answer the dialog and name a harness's caps)
    ["import { t as tr } from './i18n.js';", "const tr = (s, p) => String(s).replace(/\\{(\\w+)\\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m));"],
  ];
  for (const [a, b] of reps) { if (!s.includes(a)) throw new Error('domFree anchor gone: ' + a); s = s.replace(a, b); }
  s = s.replace(/^import \{ reportOwnerPage \} from '\.\/owner-facts\.js';.*$/m, 'const reportOwnerPage = () => null;')
    .replace(/^import \{ sessionRowOf, placeOf, settingsPolicy \} from '\.\.\/attention-model\.js';.*$/m, 'const sessionRowOf = () => null, placeOf = () => 0, settingsPolicy = () => null;');
  const n0 = (s.match(/fetch\('\/api\/user-state'/g) || []).length, n1 = (s.match(/localStorage\./g) || []).length, n2 = (s.match(/showToast\(/g) || []).length;
  if (!n0 || !n1) throw new Error('domFree doors gone');   // (no createSync = the pre-lane page: the harness still drives it — its reds are the point)
  void n2;
  return s.replace(/fetch\('\/api\/user-state(\/batches)?'/g, "this.__fetch('/api/user-state$1'").replace(/localStorage\./g, 'this.__ls.').replace(/sessionStorage\./g, 'this.__ss.').replace(/showToast\(/g, 'this.__toast(')
    .replace('const sync = createSync({', 'const sync = createSync({ ...(this.__doors || {}),');   // the page's timers on the virtual clock (the only seam)
};
const wbDomFree = (s) => {
  const reps = [
    // lane ui-language: the workbench imports `tc` beside `tr` (a button's «Done» is tc('select', 'Done'))
    ["import { t as tr, tc } from './i18n.js'; // sidebar cluster convention", "const tr = (s, p) => String(s).replace(/\\{(\\w+)\\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m)), tc = (c, s, p) => tr(s, p);"],
    ["import { agoText, escHtml, hostStateChip, showConfirmDialog, showToast, stripCwdHostLabel, sessionMatchesFilter } from './utils.js';", 'const agoText = () => "", escHtml = (x) => String(x), hostStateChip = () => "", showConfirmDialog = async () => true, showToast = () => {}, stripCwdHostLabel = (x) => x, sessionMatchesFilter = () => true;'],
    ["import { passesAgentKindFilter } from './agent-meta.js';", 'const passesAgentKindFilter = () => true;'],
  ];
  for (const [a, b] of reps) { if (!s.includes(a)) throw new Error('wbDomFree anchor gone: ' + a); s = s.replace(a, b); }
  return s;
};
let copyN = 0;
const pageClasses = new Map();   // (one compiled page class per source text — a module copy is written and imported once; every page is its own instance)
const loadPage = async (stateText) => {
  if (pageClasses.has(stateText)) return pageClasses.get(stateText);
  const Sb = await loadPageFresh(stateText);
  pageClasses.set(stateText, Sb);
  return Sb;
};
const loadPageFresh = async (stateText) => {
  const tag = 'p' + (++copyN);
  const { installSidebarState } = await import(MC.write('src/lib/sidebar-state.js', domFree(stateText), tag, { esm: true }));
  const { installSidebarWorkbench } = await import(MC.write('src/lib/sidebar-workbench.js', wbDomFree(WB_SRC), tag, { esm: true }));
  class Sb {
    constructor(world, browser, name, ss = fakeLs()) {
      const ls = browser.ls;
      this.__world = world; this.__ls = ls; this.__ss = ss; this.__browser = browser; this.__name = name; this.__toasts = []; this.__hide = [];
      this._starredIds = new Set(JSON.parse(ls.getItem('starredSessions') || '[]'));
      this._archivedIds = new Set(JSON.parse(ls.getItem('archivedSessions') || '[]'));
      this._archivedFolders = new Set(JSON.parse(ls.getItem('archivedFolders') || '[]'));
      this._customNames = JSON.parse(ls.getItem('sessionCustomNames') || '{}');
      this._sessionModes = JSON.parse(ls.getItem('sessionModes') || '{}');
      this._sessionConfigs = JSON.parse(ls.getItem('sessionConfigs') || '{}');
      this._sessionGroups = JSON.parse(ls.getItem('sessionGroups') || '{}');
      this._groupFolders = JSON.parse(ls.getItem('groupFolders') || '{}');
      this._allSessions = world.sessions;
      this.app = { updateTaskbar() { }, isMobile: false, killSession() { }, killPid() { }, syncSessionName() { }, renameBackendSession() { }, settings: null };
      // a THROTTLED page (a background tab: Chrome's intensive throttling) fires its timers once a minute, at the minute's edge
      const due = (fn) => () => { if (this.__dead) return; if (this.__frozen) { world.timer(due(fn), this.__wakeAt > world.now() ? this.__wakeAt - world.now() : 60000 - (world.now() % 60000) || 60000); return; } /* (a lid shut until a known wake: one look then) */ fn(); };
      this.__doors = {
        setTimer: (fn, ms) => world.timer(due(fn), ms), clearTimer: (t) => world.cancel(t), onHide: (fn) => this.__hide.push(fn), now: () => world.T0 + world.now() + (this.__skew || 0), mono: () => world.now() + (this.__monoSkew || 0),
        // the PRE-ROUND-3 page's tab store on the same clock (run on 75fde4c05 its reds are the point; round 3's code has no tab
        // store and ignores this door): its beats are background events, throttled like every timer of a background tab
        tabs: { now: () => world.now(), beatTimer: (fn, ms) => world.beat(due(fn), ms), clearBeat: (t) => world.cancel(t), claimTimer: (fn, ms) => world.timer(due(fn), ms), onHide: (fn) => this.__hide.push(fn), locks: null },
      };
    }
    __fetch(url, opts) { return this.__world.fetch(this, url, opts || {}); }
    __toast(text, o) { this.__toasts.push({ text, type: (o && o.type) || null }); }
    _render() { }
  }
  installSidebarState(Sb);
  installSidebarWorkbench(Sb);
  return Sb;
};
// the page's shown state and its unconfirmed count — read the same way off the pre-lane page (no _userStateView / _userSync
// there: run on 05082bbd0's code the suite goes RED, not dead)
const viewOfPage = (p) => ({ starredSessions: [...p._starredIds], archivedSessions: [...p._archivedIds], archivedFolders: [...(p._archivedFolders || [])], customNames: p._customNames, sessionModes: p._sessionModes, sessionConfigs: p._sessionConfigs, sessionGroups: p._sessionGroups, groupFolders: p._groupFolders });
const pendingOf = (p) => (typeof p._userSync === 'function' ? p._userSync().pending() : 0);
const fakeLs = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m }; };
/** a BROWSER = one localStorage every tab of it shares (round 3: it holds the display copy only — nothing about an act) */
const newBrowser = () => ({ ls: fakeLs() });

// B-0248 (c): the route's stores are THE STORE WRITER's (src/store-hold.js owe/after) — this suite's world lands each write AT ITS CALL (the writer's contract, no latency: its bytes written whole, then onWritten, and every answer at once), as the release's write at the call did; the off-loop laws are test-store-write-census ⑭'s
const landingWriter = () => ({ dirty(lwFile, o) { const b = o.produce(), parts = Array.isArray(b) ? b : [b], lwTmp = lwFile + '.lw.tmp'; for (let i = 0; i < parts.length; i++) fs.writeFileSync(lwTmp, parts[i], { flag: i ? 'a' : 'w' }); fs.renameSync(lwTmp, lwFile); if (o.onWritten) o.onWritten(true, null); }, durable(lwFile, o) { if (o && o.answer) o.answer(true); return Promise.resolve(true); }, pending: () => false, flushSync: () => ({ written: [], left: [] }), whyNotDurable: () => null });
/** a world: the real route over a temp data dir, a stub socket, pages, and a virtual clock with a queue of events */
function createWorld({ seed = 1, sessions, lag = null, landMs = null, persistence = null } = {}) {
  const R = rng(seed);
  const dataDir = fs.mkdtempSync(path.join(TMP, 'w-'));
  const P = persistence ? persistence() : freshPersistence();   // (B-0248 (c) §24: a copy's route, for its red)
  const clients = new Set();
  const hookSaw = [];
  let now = 0, evSeq = 0;
  const T0 = 1794400000000;   // the world's wall clock at its start (the route's facts and the page's ages read it) — declared BEFORE the setup: the route takes its clock at boot (round 9)
  let w = null;
  // B-0248 (c) §24: `landMs` — the list's writes LAND LATER, on this world's clock: one version of the file in flight at a time, its
  // bytes made when it starts (the latest state), landed landMs later; then its waiters (a version at or before it), then onWritten,
  // then the next version starts — a burst of acts lands as ONE write and ONE frame, an answer may come after a later frame
  const clocked = !landMs ? null : (() => {
    const S = new Map(), stats = { landings: 0, versions: [] };
    const st = (f) => { if (!S.has(f)) S.set(f, { v: 0, wv: 0, flight: null, dirty: false, o: null, waiters: [] }); return S.get(f); };
    const start = (ckFile, s) => {
      if (s.flight || !s.dirty) return;
      s.dirty = false;
      const b = s.o.produce();
      s.flight = { v: s.v, from: s.wv, parts: Array.isArray(b) ? b : [b] };
      at(now + landMs, () => {
        const fl = s.flight; s.flight = null;
        const ckTmp = ckFile + '.ck.tmp';
        for (let i = 0; i < fl.parts.length; i++) fs.writeFileSync(ckTmp, fl.parts[i], { flag: i ? 'a' : 'w' });
        fs.renameSync(ckTmp, ckFile);
        stats.landings++; stats.versions.push(fl.v - fl.from); s.wv = fl.v;
        const keep = []; for (const x of s.waiters) { if (x.want <= s.wv) x.cb(true); else keep.push(x); } s.waiters = keep;
        try { if (s.o.onWritten) s.o.onWritten(true, null); } catch { }
        start(ckFile, s);
      }, 'landing');
    };
    const W = {
      dirty(ckFile, o) { const s = st(ckFile); s.o = o; s.v++; s.dirty = true; start(ckFile, s); },
      durable(ckFile, { answer = null } = {}) { const s = S.get(ckFile); if (!s || (!s.dirty && !s.flight)) { if (answer) answer(true); return Promise.resolve(true); } const want = s.v; return new Promise((res) => s.waiters.push({ want, cb: (ok) => { if (answer) answer(ok); res(ok); } })); },
      pending: (ckFile) => { const s = S.get(ckFile); return !!s && (s.dirty || !!s.flight); },
      flushSync: () => ({ written: [], left: [] }), whyNotDurable: () => null,
    };
    return { W, stats };
  })();
  P.setup({ writer: clocked ? clocked.W : landingWriter(), dataDir, wss: { clients }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, onUserStateWrite: (st) => hookSaw.push((st.archivedSessions || []).length), userStateClock: () => T0 + now + ((w && w.serverStep) || 0), userStateMono: () => now });
  const H = { get: handlerOf(P.router, 'get', '/api/user-state'), post: handlerOf(P.router, 'post', '/api/user-state'), patch: handlerOf(P.router, 'patch', '/api/user-state'), ops: handlerOf(P.router, 'patch', '/api/user-state/batches'), exp: handlerOf(P.router, 'post', '/api/config/export') };
  // (B-0248 (c): an answer may come LATER — after its write landed, on this world's clock: `pending` until then, `onAnswer` runs at it)
  const call = (h, body) => { let status = 200, out = null, answered = false; const r = { status: 200, body: null, pending: false, onAnswer: null }; const res = { status(c) { status = c; return res; }, json(o) { out = J(o); answered = true; r.status = status; r.body = out; if (r.onAnswer) { const f = r.onAnswer; r.onAnswer = null; f(); } return res; } }; try { h({ body: body === undefined ? undefined : J(body), query: {}, params: {}, headers: {} }, res, () => { }); } catch (e) { status = 500; out = { error: String(e && e.message) }; answered = true; } if (answered) { r.status = status; r.body = out; } r.pending = !answered; return r; };   // (a handler that throws = a 500, as express answers it)
  const q = [];
  const at = (t, fn, label) => { const e = { t: Math.max(t, now), s: ++evSeq, fn, label, dead: false }; q.push(e); return e; };
  w = {
    R, P, H, dataDir, clients, hookSaw, sessions, call, pages: [], T0,
    now: () => now,
    writes: [], // every write the server took, in its order: {rev, writer, kind: 'ops'|'whole', ops?, whole?, batch?}
    dup: 0, requests: 0, patches: 0, violations: [], lastRev: 0, lives: new Map(), oldBatches: new Set(), heldBatches: new Set(), refusedBatches: 0, noopApplied: 0, handled: [], opsRequests: 0, wholeRequests: 0, down: false, superseded: 0, appliedSet: new Set(), falseDup: [],
    timer: (fn, ms) => at(now + ms, fn, 'timer'),
    beat: (fn, ms) => at(now + ms, fn, 'beat'),
    cancel: (e) => { if (e) e.dead = true; },
    at,
    /** a request from a page: reaches the server per the world's lag model, answered after a delay (or dropped) */
    fetch(page, url, opts) {
      const method = String(opts.method || 'GET').toLowerCase();
      const body = opts.body ? JSON.parse(opts.body) : undefined;
      w.requests++;
      if (method === 'patch') w.patches++;
      const issuedAt = now;
      if (w.down) return Promise.reject(new TypeError('Failed to fetch'));   // the hub is DOWN: the request never arrives
      return new Promise((resolve, reject) => {
        // a request's `signal` aborts it as a browser does — the promise rejects at once, whatever the hub does later (round 12)
        if (opts.signal) { if (opts.signal.aborted) return reject(new TypeError('The operation was aborted')); opts.signal.addEventListener('abort', () => reject(new TypeError('The operation was aborted')), { once: true }); }
        const reach = (page.__lag || lag || w.defaultLag)(method, body);
        at(now + reach.toServer, () => {
          // round 15 (the .397 hosted mirror): a CLOSED tab's request still on its way is CANCELLED by the browser — unless it is a keepalive
          // request, which the browser completes after the tab is gone. Rounds 4–14 let every one land here, and only real Chrome on a slower
          // machine showed it (the last one to three of five acts lost at a close)
          if (page.__dead && !opts.keepalive) { w.cancelled = (w.cancelled || 0) + 1; return; }
          const opsDoor = method === 'patch' && /\/api\/user-state\/batches$/.test(url);
          const h = method === 'get' ? H.get : method === 'post' ? H.post : opsDoor ? H.ops : H.patch;
          if (method === 'patch') { if (body && body.batches) w.opsRequests++; else w.wholeRequests++; }   // counted by what the body IS
          const r = h ? call(h, body) : { status: 404, body: { error: 'Cannot PATCH ' + url } };   // a route with no ops door (an older VibeSpace)
          const finish = () => {   // (B-0248 (c): run at the answer — at once, or at its write's landing on this world's clock)
          if (method === 'patch' && r.status !== 503) w.handled.push({ page: page.__name, issuedAt, at: now });
          if (method !== 'get' && r.status === 200) {
            const wrote = grevOf(w, r.body) > w.lastRev;   // a request that changes nothing writes nothing (round 5, smaller 2)
            if (wrote) w.lastRev = grevOf(w, r.body);
            for (const o of (r.body && r.body.old) || []) w.oldBatches.add(o.batch);   // round 7: an act older than a week, named
            for (const id of (r.body && r.body.held) || []) w.heldBatches.add(id);   // round 8: held = on disk (its own duplicate, or a week-old act the state already holds)
            if (body && body.batches) {   // round 5: every batch the page has not seen confirmed, oldest first, under its own ids
              const rb = r.body.batches && !Array.isArray(r.body.batches) ? r.body.batches : r.body;   // (round 3's answer shape too, for its tree)
              const got = rb.applied || [];
              w.dup += (rb.held || rb.duplicate || []).length;
              w.superseded += (rb.superseded || []).length;
              for (const id of rb.applied || []) w.appliedSet.add(id);
              const dropped = new Map((rb.dropped || []).map((d) => [d.batch, new Set(d.ops)]));
              w.refusedBatches += (rb.refused || []).length;
              if (!wrote) w.noopApplied += got.length;
              const parts = body.batches.filter((b) => got.includes(b.batch)).map((b) => ({ id: b.batch, n: b.ops.length, bytes: Buffer.byteLength(JSON.stringify(b.ops)) }));
              const appliedOps = body.batches.filter((b) => got.includes(b.batch)).flatMap((b) => b.ops.filter((o, k) => !(dropped.get(b.batch) || new Set()).has(k)));
              const pairs = body.batches.filter((b) => got.includes(b.batch)).flatMap((b) => b.ops.filter((o, k) => !(dropped.get(b.batch) || new Set()).has(k)).map((o) => b.batch + '#' + JSON.stringify([o.key, o.item, o.member, o.field])));
              const madeBy = body.batches.filter((b) => got.includes(b.batch)).flatMap((b) => b.ops.filter((o, k) => !(dropped.get(b.batch) || new Set()).has(k)).map((o) => ({ op: o, made: now - Math.max(0, Number(b.age) || 0) })));   // (round 8: each applied op with its act's time as the hub dates it)
              if (got.length) w.writes.push({ madeBy, rev: r.body.rev, grev: grevOf(w, r.body), issuedAt, writer: page.__name, kind: 'ops', ops: appliedOps, whole: null, batch: got[0], batchesApplied: got, pairs, parts, wrote, at: now, requestBytes: Buffer.byteLength(JSON.stringify(body)) });
            } else if (r.body.duplicate) w.dup++;
            else w.writes.push({ rev: r.body.rev, grev: grevOf(w, r.body), writer: page.__name, kind: body && body.ops ? 'ops' : 'whole', ops: body && body.ops, whole: body && !body.ops ? body : null, batch: body && body.batch, at: now });
          }
          if (method === 'get' && r.status === 200) page.__seenRev = Math.max(page.__seenRev || 0, grevOf(w, r.body));
          const answer = reach.toPage;
          if (page.__dead) return;   // a reloaded / closed tab: its request may land, nothing answers it
          if (reach.drop) { at(now + answer, () => { if (!page.__dead) reject(new Error('the connection dropped')); }, 'drop'); return; }
          at(now + answer, () => { if (!page.__dead) resolve({ ok: r.status < 400, status: r.status, json: async () => J(r.body) }); }, 'answer');
          };
          if (r.pending) r.onAnswer = finish; else finish();
        }, 'server ' + method);
      });
    },
    defaultLag: () => ({ toServer: 5 + Math.floor(R() * 60), toPage: 5 + Math.floor(R() * 60), drop: false }),
    /** a page's socket: the server's broadcasts, in order, after the world's echo delay (per page) */
    connect(page) {
      let last = 0;
      const client = { readyState: 1, send(json) {
        if (page.__asleep) return;   // a page that sleeps misses every broadcast (a closed laptop)
        const msg = JSON.parse(json);
        const d = (page.__echo || w.defaultEcho)(msg);
        last = Math.max(last, now + d);
        at(last, () => { if (page.__asleep || client.__gone) return; page.__seenRev = Math.max(page.__seenRev || 0, grevOf(w, msg.state)); if (msg.type === 'user-state-updated' && msg.state) { if (page._applyServerState(msg.state) === false) return; page._render(); } }, 'echo');
      } };
      clients.add(client);
      page.__client = client;
      return client;
    },
    disconnect(page) { if (page.__client) { page.__client.__gone = true; clients.delete(page.__client); page.__client = null; } },
    defaultEcho: () => 5 + Math.floor(R() * 80),
    /** run every event up to `until` (or until the queue is empty), checking the law after each */
    async run(until = Infinity, check = null) {
      while (q.length) {
        q.sort((a, b) => a.t - b.t || a.s - b.s);
        if (q[0].t > until) break;
        if (until === Infinity && q.every((x) => x.dead || x.label === 'beat')) break;   // at rest: only the tabs' background beats left
        const e = q.shift();
        if (e.dead) continue;
        now = e.t;
        const r = e.fn();
        if (r && typeof r.then === 'function') await r;   // an act that awaits (the Manage batch's confirm) finishes inside its event
        for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
        if (check) check(e);
      }
      if (until !== Infinity) now = Math.max(now, until);
    },
    serverState: () => call(H.get).body,
    writerStats: () => (clocked ? clocked.stats : null),
  };
  return w;
}
const mkSessions = (n, folders = 4) => Array.from({ length: n }, (_, i) => ({ sessionKey: `claude:${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, backend: 'claude', cwd: `/w/p${i % folders}` }));
async function addPage(w, Sb, name, { browser = newBrowser(), ss = fakeLs(), fetchFirst = true } = {}) {
  const p = new Sb(w, browser, name, ss);
  if (typeof p._userSync === 'function') p._userSync();   // what the Sidebar constructor does (sidebar.js)
  w.pages.push(p);
  w.connect(p);
  if (fetchFirst) p._fetchUserState();
  return p;
}
/** the tab goes (closed, or reloaded): its pagehide runs, its page is dead (what it put on the wire still lands; nothing answers it, its timers never fire) */
function endPage(w, p) { for (const fn of p.__hide || []) { try { fn(); } catch { } } p.__dead = true; p.__asleep = true; w.disconnect(p); w.pages = w.pages.filter((x) => x !== p); }
/** into the back-forward cache (pagehide, persisted) and back (pageshow): the page lives on with what it holds in memory */
function hidePage(w, p) { for (const fn of p.__hide || []) { try { fn(); } catch { } } p.__asleep = true; w.disconnect(p); }
function showPage(w, p) { p.__asleep = false; w.connect(p); p._fetchUserState(); }
function wake(p) { p.__frozen = false; }
const pageIdOf = (p) => (p && typeof p._userSync === 'function' ? p._userSync().pageId : 'none:' + (p && p.__name));

// ════════ §4 THE WALK ════════
/** seeded: 2–3 pages (+ sometimes an OLD whole-key client), every act kind, random delays and reorders, a dropped answer, a
 *  reconnect, a page that sleeps and wakes with a stale copy. Law (a) after every event: a page shows its own newest act on an
 *  item unless the server took a LATER write to that item from someone else and the page has seen it. At rest: the server
 *  holds every slot's last write in the server's order (the harness's own slot replay, not applyOps), and every page
 *  converges on it with nothing pending. */
async function walk(stateText, seed, { nActs = 40, hard = false } = {}) {
  const Sb = await loadPage(stateText);
  const w = createWorld({ seed, sessions: mkSessions(10, 3) });
  const R = w.R;
  const nPages = 2 + Math.floor(R() * 2);
  const pages = [];
  // round 2: a seeded share of the worlds put pages 0 and 1 in ONE browser (one shared localStorage; Web Locks or not)
  const shared = R() < 0.5 ? newBrowser() : null;
  for (let i = 0; i < nPages; i++) pages.push(await addPage(w, Sb, 'page' + i, { browser: shared && i < 2 ? shared : newBrowser() }));
  const allPages = pages.slice();   // the closed ones too: what a closed page put on the wire is still its own acts
  await w.run(500);
  w.defaultLag = () => ({ toServer: 10 + Math.floor(R() * 900), toPage: 10 + Math.floor(R() * 900), drop: R() < 0.08 });
  w.defaultEcho = () => 10 + Math.floor(R() * 1500);
  const oldClient = R() < 0.5 ? { name: 'old', copy: w.serverState() } : null;
  const expected = new Map();   // page → Map(slot → its newest act there)
  const acts = [];              // EVERY act, in the order the person made it: {page, slot, value, rev (the write that took it), n, act}
  let actSeq = 0;
  for (const p of pages) expected.set(p, new Map());
  const keys = w.sessions.map((s) => s.sessionKey);
  const doAct = async (p) => {
    if (p.__dead) return;
    const idsBefore = new Set(typeof p._userSync === 'function' ? p._userSync().unconfirmed().map((x) => x.batch) : []);
    const before = slotsOf(viewOfPage(p));
    const s = w.sessions[Math.floor(R() * w.sessions.length)], k = s.sessionKey, x = R();
    if (x < 0.25) p.toggleArchive(s);
    else if (x < 0.4) p.toggleStar(s);
    else if (x < 0.52) p.setCustomName(s, R() < 0.2 ? '' : 'n' + Math.floor(R() * 99));
    else if (x < 0.6) p.setSessionMode(s, R() < 0.5 ? 'chat' : 'terminal');
    else if (x < 0.75) { const cur = { ...(p.getSessionConfig(s) || {}) }; const f = ['model', 'effort', 'permission'][Math.floor(R() * 3)]; if (R() < 0.25) delete cur[f]; else cur[f] = f + Math.floor(R() * 9); p.setSessionConfig(s, cur); }
    else if (x < 0.87) { const g = 'g' + Math.floor(R() * 2); const grp = p._sessionGroups; const list = Array.isArray(grp[g]) ? grp[g].slice() : []; if (list.includes(k)) grp[g] = list.filter((m) => m !== k); else grp[g] = [...list, k]; if (R() < 0.1) delete grp[g]; p._pushUserState(); }
    else if (x < 0.94) { if (p.isFolderArchived(s.cwd)) p.unarchiveProject(s.cwd); else p.archiveProject(s.cwd, w.sessions.filter((y) => y.cwd === s.cwd)); }
    else { p._manageMarks = new Map(keys.slice(0, 3).map((kk) => [kk, { archive: true }])); await p._applyManageMarks(); }
    const after = slotsOf(viewOfPage(p));
    const actNo = ++actSeq;   // every slot of ONE act shares its act number (a group deleted = its group + each member)
    // the batch each slot rides in (the page's own id for the act): its requests may land in any order, so a write is credited by
    // its BATCH, never by its place among the page's writes
    const fresh = typeof p._userSync === 'function' ? p._userSync().unconfirmed().filter((x) => !idsBefore.has(x.batch)) : [];
    for (const slot of slotDiff(before, after)) { const carrier = fresh.find((x) => opIsFor(x, slot)); const a = { page: p.__name, slot, value: after.get(slot), rev: null, n: acts.length, act: actNo, batch: carrier ? carrier.batch : null, t: w.now() }; acts.push(a); expected.get(p).set(slot, a); }
  };
  const opWrites = (o, slot) => {
    const base = `${o.key}|${o.item}`, kind = UO.kindOf(o.key);
    if (kind === 'set' || kind === 'value') return slot === base;
    if (kind === 'field') return slot === `${base}|.${o.field}`;
    if (o.member === undefined) return o.value ? slot === `${base}|∃` : slot.startsWith(base + '|');
    return slot === `${base}|${o.member}` || (o.value && slot === `${base}|∃`);
  };
  // the op a page's diff makes FOR a slot (an act's own op): a member add is the member's, never its group's (the group's own
  // op is there only when the act made the group)
  const opIsFor = (o, slot) => {
    const base = `${o.key}|${o.item}`, kind = UO.kindOf(o.key);
    if (kind === 'member' && o.member !== undefined) return slot === `${base}|${o.member}`;
    return opWrites(o, slot);
  };
  // the server's write ledger → each page's own acts get the rev that took them
  const ledgerSeen = { n: 0 };
  const settleRevs = () => {
    for (; ledgerSeen.n < w.writes.length; ledgerSeen.n++) {
      const wr = w.writes[ledgerSeen.n];
      // an act belongs to the PAGE whose batch id carries it (a closed page's requests included)
      const p = allPages.find((x) => wr.batch && wr.batch.startsWith(pageIdOf(x) + ':')) || allPages.find((x) => x.__name === wr.writer);
      if (!p || wr.kind !== 'ops') continue;
      // an act whose batch is known takes the rev of THE write of its batch
      const viaBatch = (a) => a.batch && (wr.batch === a.batch || (wr.batchesApplied || []).includes(a.batch)) && (wr.ops || []).some((o) => opWrites(o, a.slot));   // (round 7: the write APPLIED an op for this slot)
      for (const a of acts) if (a.batch && a.page === p.__name && viaBatch(a)) { if (a.rev == null) a.rev = wr.grev; if (a.lastRev == null || wr.grev > a.lastRev) a.lastRev = wr.grev; }   // (round 9: re-applied over a factless writer's omission — the reference takes its LATEST application, the live check its first)
      // (an act with no batch of its own — none on this page's code — takes ONE write of this page there, oldest first)
      const open = acts.filter((a) => a.page === p.__name && a.rev == null && !a.batch);
      for (const slot of new Set(open.map((a) => a.slot))) {
        const c = wr.ops.filter((o) => opIsFor(o, slot)).length;
        open.filter((a) => a.slot === slot).slice(0, c).forEach((a) => { a.rev = wr.grev; });
      }
    }
  };
  // ROUND 7, a GROUP DELETE judged per slot: a slot of it (a member, the group itself) whose last change before the delete was
  // ANOTHER writer's, made after the delete was made — as the server can know that: the act's time + its request's transit — stays
  const keptByLater = (a, sl) => {
    if (a.rev == null || !acts.some((x) => x.act === a.act && x.slot.endsWith('|∃') && x.value === undefined)) return false;
    const wrD = w.writes.find((wr) => wr.grev === a.rev && (wr.batchesApplied || []).includes(a.batch));
    if (!wrD || wrD.issuedAt == null) return false;
    const madeAt = a.t + (wrD.at - wrD.issuedAt);
    const before = w.writes.filter((wr) => wr.grev < a.rev && (wr.kind === 'whole' ? Object.prototype.hasOwnProperty.call(wr.whole || {}, keyOfSlot(sl)) : (wr.ops || []).some((o) => opWrites(o, sl))));
    const lastW = before[before.length - 1];
    // (round 8: a fact is dated by its ACT — the rival's make time as the hub dated it, not when it landed)
    const rivalMade = !lastW ? -Infinity : lastW.kind === 'whole' || !lastW.madeBy ? lastW.at : Math.max(...lastW.madeBy.filter((x) => opWrites(x.op, sl)).map((x) => x.made), -Infinity);
    return !!lastW && lastW.writer !== a.page && rivalMade > madeAt;
  };
  const slotWrites = (slot) => w.writes.filter((wr) => (wr.kind === 'whole' ? Object.prototype.hasOwnProperty.call(wr.whole, keyOfSlot(slot)) : wr.ops.some((o) => opWrites(o, slot))));
  const check = () => {
    settleRevs();
    for (const p of pages) {
      if (p.__asleep) continue;
      const shown = slotsOf(viewOfPage(p));
      for (const [slot, e] of expected.get(p)) {
        if (shown.get(slot) === e.value) continue;
        const mineW = (wr) => !!(wr.batch && wr.batch.startsWith(pageIdOf(p) + ':'));
        // (round 7: an act never applied — superseded — expects a later write by another writer, made after it and seen by the page)
        // (round 7: an act older than a week is not applied — named in its answer, undone and said)
        if (e.batch && w.oldBatches.has(e.batch)) { expected.get(p).delete(slot); continue; }
        if (keptByLater(e, slot)) { expected.get(p).delete(slot); continue; }   // (a group delete's slot another writer changed later)
        const later = slotWrites(slot).filter((wr) => (e.rev == null ? (wr.at ?? 0) >= e.t : wr.grev > e.rev) && !mineW(wr) && wr.grev <= (p.__seenRev || 0));
        if (!later.length) { w.violations.push({ seed, page: p.__name, slot, shown: shown.get(slot), expected: e, at: w.now() }); expected.get(p).delete(slot); }
      }
    }
  };
  let t = 600;
  const sleeper = nPages > 2 || R() < 0.5 ? pages[pages.length - 1] : null;
  for (let i = 0; i < nActs; i++) {
    t += 50 + Math.floor(R() * 700);
    const p = pages[Math.floor(R() * pages.length)];
    w.at(t, () => doAct(p), 'act');
    if (R() < 0.06) w.at(t + 5, () => { w.disconnect(p); w.connect(p); p._fetchUserState(); }, 'reconnect');
    if (oldClient && R() < 0.12) w.at(t + 7, () => {
      const kk = keys[Math.floor(R() * keys.length)];
      const list = oldClient.copy.archivedSessions.includes(kk) ? oldClient.copy.archivedSessions.filter((y) => y !== kk) : [...oldClient.copy.archivedSessions, kk];
      oldClient.copy.archivedSessions = list;
      w.fetch({ __name: 'old', __lag: null }, '/api/user-state', { method: 'PATCH', body: JSON.stringify({ archivedSessions: list }) }).catch(() => { });
    }, 'old client');
    if (oldClient && R() < 0.1) w.at(t + 9, () => { oldClient.copy = w.serverState(); }, 'old client refresh');
  }
  // ROUND 5 — THE HARD WALK (the verifier's UEO_HARD, r4/v1/walk.mjs): a 5xx streak of 2–22 s, one request a page that never
  // answers (it never arrives), a back-forward-cache hide / show; the closed tab below may close inside them
  if (hard) {
    let down = 0;
    const wrapDown = () => { const door = w.H.ops ? 'ops' : 'patch', real = w.H[door]; w.H[door] = (req, res) => (w.now() < down ? res.status(503).json({ error: 'busy' }) : real(req, res)); };   // (the page's ops go to the ops door)
    wrapDown();
    if (R() < 0.7) { const t5 = 600 + Math.floor(R() * t); w.at(t5, () => { down = w.now() + 2000 + Math.floor(R() * 20000); }, '5xx streak'); }
    // ROUND 6: the hub RESTARTS (0–2 times; the same file) — every page's socket drops and comes back with a GET: a batch handled
    // before a restart (a no-op one included) is a duplicate after it, never applied again
    const nRestarts = R() < 0.6 ? 1 + Math.floor(R() * 2) : 0;
    for (let k = 0; k < nRestarts; k++) { const tr = 700 + Math.floor(R() * t); w.at(tr, () => { restartWorld(w); wrapDown(); w.restarts = (w.restarts || 0) + 1; for (const p of pages) if (!p.__dead && !p.__asleep) { w.disconnect(p); w.connect(p); p._fetchUserState(); } }, 'hub restart'); }
    // ROUND 7: a RESTORE — the file put back with its counter LOWER (a truncated / restored copy of the same state): every page heals
    if (R() < 0.35) { const tr = 700 + Math.floor(R() * t); w.at(tr, () => { const d = onDisk(w); restartWorld(w, { ...d, [UO.REV_KEY]: Math.max(1, UO.revOf(d) - 1 - Math.floor(R() * 12)) }); wrapDown(); w.restores = (w.restores || 0) + 1; for (const p of pages) if (!p.__dead && !p.__asleep) { w.disconnect(p); w.connect(p); p._fetchUserState(); } }, 'a restored file'); }
    for (const p of pages) {
      const f = p.__fetch.bind(p);
      let hung = R() < 0.3 ? 1 : 0;
      p.__fetch = (url, opts) => { if (hung && opts && opts.method === 'PATCH' && R() < 0.3) { hung = 0; w.requests++; return new Promise(() => { }); } return f(url, opts); };
    }
    const bf = pages.length > 1 && R() < 0.5 ? pages[pages.length - 1] : null;
    if (bf && bf !== sleeper) for (let k = 0; k < 1 + Math.floor(R() * 4); k++) { const th = 700 + Math.floor(R() * t); w.at(th, () => { if (!bf.__dead && !bf.__asleep) hidePage(w, bf); }, 'bfcache hide'); w.at(th + 500 + Math.floor(R() * 8000), () => { if (!bf.__dead && bf.__asleep) showPage(w, bf); }, 'bfcache show'); }
  }
  // a tab CLOSED mid-walk (maybe with requests on the wire), and a NEW tab in its browser later
  const victim = pages.length > 1 && R() < (hard ? 0.7 : 0.4) ? pages[0] : null;
  if (victim) {
    const tc = 600 + Math.floor(R() * t * 0.6);
    w.at(tc, () => { if (!victim._userSync().hasBase()) return; endPage(w, victim); const i = pages.indexOf(victim); if (i >= 0) pages.splice(i, 1); }, 'a tab closes');
    w.at(tc + 2000 + Math.floor(R() * 6000), async () => { const nt = await addPage(w, Sb, 'page-new', { browser: victim.__browser }); pages.push(nt); allPages.push(nt); expected.set(nt, new Map()); }, 'a new tab in its browser');
  }
  if (sleeper) {
    const t1 = 600 + Math.floor(R() * t / 2);
    // ROUND 7 (hard): a laptop that sleeps PAST ANY HORIZON — 8–9 days, its timers stopped, its socket gone; its acts not yet
    // confirmed are a week old when it wakes (named, undone, said); what it does next lands
    const nap = hard && R() < 0.35 ? 8 * 86400000 + Math.floor(R() * 86400000) : 3000 + Math.floor(R() * 4000);
    if (nap > 86400000) w.deepSleeps = (w.deepSleeps || 0) + 1;
    w.at(t1, () => { sleeper.__asleep = true; if (nap > 86400000) { sleeper.__frozen = true; sleeper.__wakeAt = t1 + nap; w.disconnect(sleeper); } }, 'sleep');
    w.at(t1 + nap, () => { sleeper.__asleep = false; sleeper.__frozen = false; return doAct(sleeper); }, 'wake and act on a stale copy');
    w.at(t1 + nap + 6000, () => { w.disconnect(sleeper); w.connect(sleeper); sleeper._fetchUserState(); }, 'the sleeper reconnects');
    // …and the pages that stayed OPEN those days (connected, hearing every broadcast, no act of their own) act again: they land
    if (nap > 86400000) for (let k = 0; k < 2 + Math.floor(R() * 4); k++) w.at(t1 + nap + 9000 + k * 700, () => { const live = pages.filter((p) => !p.__dead && !p.__asleep && p !== sleeper); return live.length ? doAct(live[Math.floor(R() * live.length)]) : null; }, 'an open page acts after the long night');
  }
  await w.run(Infinity, check);

  // at rest: every page reconnects once (a closed socket drops nothing it owes) and the world drains
  w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
  for (const p of pages) { w.disconnect(p); w.connect(p); p._fetchUserState(); }
  await w.run(Infinity, check);
  // THE REFERENCE — the harness's own: every slot = the value of the LAST ACT on it in the server's order (a page's act at the rev of
  // the write that took it; the old client's whole-key write = an act on every slot of its key). A page's COPY is never an act.
  settleRevs();
  // an act that never reached the server. In the HARD walk it is excused only where master loses it too: master's every PATCH
  // carried every key changed since its last snapshot, so master keeps an act iff a LATER request of its page reached the
  // route's real handler (not a 503) — the same driver's requests decide it here
  const reachedLater = (a) => w.handled.some((h) => h.page === a.page && h.issuedAt >= a.t);
  // (round 7: an act SUPERSEDED — another writer changed its slot after it was made — is the later act winning, not a loss)
  const supersededBy = (a) => w.writes.some((wr) => wr.writer !== a.page && (wr.at ?? 0) >= a.t && (wr.kind === 'whole' ? Object.prototype.hasOwnProperty.call(wr.whole || {}, keyOfSlot(a.slot)) : (wr.ops || []).some((o) => opWrites(o, a.slot))));
  const lostAll = acts.filter((a) => a.rev == null && !supersededBy(a) && !(a.batch && w.oldBatches.has(a.batch)) && !(a.batch && w.heldBatches.has(a.batch)));   // (round 8: a batch answered held is on disk)
  // (round 9: the 7-day sentence is said only where what a page shows changed — never by a page that had no week-old act)
  const oldFalse = allPages.filter((p) => p.__toasts.some((x) => /more than 7 days ago/.test(x.text)) && !acts.some((a) => a.page === p.__name && a.batch && w.oldBatches.has(a.batch)));
  if (oldFalse.length) w.violations.push({ seed, oldFalse: oldFalse.map((p) => p.__name) });
  const lost = hard ? lostAll.filter(reachedLater) : lostAll;
  const lostAsMaster = hard ? lostAll.length - lost.length : 0;
  const actLogFor = (sl) => acts.filter((x) => x.slot === sl);
  const last = new Map();
  const take = (slot, value, rev, n) => { const cur = last.get(slot); if (!cur || rev > cur.rev || (rev === cur.rev && n > cur.n)) last.set(slot, { value, rev, n }); };
  // ROUND 4, THE LAW (not the route's code): two acts of ONE page commute — an act a LATER act of the same page decided is not
  // in the final state, whichever request arrived first (same slot; a member under a later act on its group; a group deleted
  // under a later act on one of its members)
  const memberKeysR = new Set(UO.MEMBER_KEYS);
  const groupOf = (sl) => { const q = sl.split('|'); return memberKeysR.has(q[0]) ? `${q[0]}|${q[1]}|` : null; };
  // (round 6: only a LATER act the server TOOK supersedes — a later act lost with its page, as on master, leaves the earlier standing)
  const superseded = new Set(acts.filter((a) => acts.some((b) => b.page === a.page && b.act > a.act && b.rev != null && (b.slot === a.slot
    || (groupOf(a.slot) && groupOf(a.slot) === groupOf(b.slot) && !a.slot.endsWith('|∃') && b.slot.endsWith('|∃') && b.value === undefined)))));   // a member under a later DELETE of its group
  // a group DELETED by an act, a member of it decided by a LATER act of the same page: the delete stands for every other member
  // (and for the group, unless that later act keeps it) — so only the delete's own member slots the later act decided are superseded
  for (const a of acts) if (a.rev != null && !superseded.has(a) && !keptByLater(a, a.slot)) take(a.slot, a.value, a.lastRev ?? a.rev, a.n);
  // a group's two implied facts (the server's member semantics): a member added makes its group exist; a deleted group loses
  // every member, known to the deleting page or not
  const memberKeys = new Set(UO.MEMBER_KEYS);
  const knownSlots = () => new Set([...last.keys(), ...slotsOf(w.serverState()).keys()]);
  for (const a of acts) {
    if (a.rev == null || !memberKeys.has(keyOfSlot(a.slot))) continue;
    const parts = a.slot.split('|'), groupSlot = `${parts[0]}|${parts[1]}|∃`;
    // a member ADDED makes its group exist — in the page's order even when a later act of the page took the member out again;
    // only a later act on the GROUP itself overrules that
    if (parts[2] !== '∃' && a.value === true && !acts.some((b) => b.page === a.page && b.act > a.act && b.rev != null && b.slot === groupSlot)) take(groupSlot, true, a.rev, a.n);
    // a group DELETED: every member the server holds goes at its rev, but those a LATER act of the same page decided — whether or
    // not a later act decided the group itself
    if (parts[2] === '∃' && a.value === undefined) { for (const sl of knownSlots()) if (sl.startsWith(`${parts[0]}|${parts[1]}|`) && sl !== groupSlot && !acts.some((b) => b.page === a.page && b.act > a.act && b.rev != null && b.slot === sl) && !keptByLater(a, sl)) take(sl, undefined, a.rev, a.n); continue; }
    if (superseded.has(a)) continue;
    if (parts[2] === '∃' && a.value === undefined) for (const sl of knownSlots()) if (sl.startsWith(`${parts[0]}|${parts[1]}|`) && sl !== groupSlot) take(sl, undefined, a.rev, a.n);
  }
  for (const wr of w.writes) if (wr.writer === 'old') {
    const mine = slotsOf(wr.whole);
    const keysW = Object.keys(wr.whole);
    const slotsHere = new Set([...mine.keys(), ...acts.map((a) => a.slot), ...[...last.keys()]].filter((sl) => keysW.includes(keyOfSlot(sl))));
    for (const sl of slotsHere) take(sl, mine.get(sl), wr.grev, 1e9);
  }
  const ref = new Map();
  for (const [slot, v] of last) if (v.value !== undefined) ref.set(slot, v.value);
  const server = slotsOf(w.serverState());
  const serverOff = slotDiff(server, ref);
  const pagesOff = pages.map((p) => ({ page: p.__name, off: slotDiff(slotsOf(viewOfPage(p)), server), pending: pendingOf(p) })).filter((x) => x.off.length || x.pending);
  const batches = new Map();
  for (const wr of w.writes) for (const id of wr.pairs || wr.batchesApplied || (wr.batch ? [wr.batch] : [])) batches.set(id, (batches.get(id) || 0) + 1);
  // (round 9: a waiting act re-sent over an OMISSION by a writer that carries no facts — an old whole-key client — applies again
  // by the law; only a second application with no such omission between is «twice»)
  const omittedBetween = (pair) => {   // (by the ORDER of writes: a no-op re-application keeps the rev the omission gave)
    const at = w.writes.map((wr, i) => ((wr.pairs || []).includes(pair) ? i : -1)).filter((i) => i >= 0);
    const key = JSON.parse(pair.slice(pair.indexOf('#') + 1))[0];
    for (let k = 1; k < at.length; k++) if (!w.writes.slice(at[k - 1] + 1, at[k]).some((wr) => wr.kind === 'whole' && Object.prototype.hasOwnProperty.call(wr.whole || {}, key))) return false;
    return true;
  };
  const twice = [...batches].filter(([id, n]) => n > 1 && !(String(id).includes('#') && omittedBetween(id)));
  if (process.env.UEO_DEBUG) for (const sl of serverOff) console.log('DEBUG', sl, JSON.stringify({ server: server.get(sl), ref: ref.get(sl), acts: actLogFor(sl), writes: w.writes.filter((wr) => wr.kind === 'whole' ? Object.prototype.hasOwnProperty.call(wr.whole, keyOfSlot(sl)) : wr.ops.some((o) => opWrites(o, sl))).map((wr) => ({ rev: wr.rev, writer: wr.writer, ops: wr.ops && wr.ops.filter((o) => opWrites(o, sl)) })) }));
    if (lost.length) serverOff.push(...lost.slice(0, 3).map((a) => `an act that never reached the server: ${a.page} ${a.slot}`));
  return { seed, w, violations: w.violations, serverOff, pagesOff, twice, writes: w.writes.length, dup: w.dup, oldClient: !!oldClient, pages: nPages, lostAsMaster, streak: hard, acts, ref, deepSleeps: w.deepSleeps || 0, restores: w.restores || 0, olds: w.oldBatches.size };
}
const restartWorld = (w, writeFile = null) => {
  { const t0 = Date.now(), r0 = performance.now(); while (Date.now() === t0 && performance.now() - r0 < 5) { } }   // a new life starts LATER than the one before (its epoch carries its start); bounded on the REAL clock (a scene may hold Date.now on the world's)
  if (writeFile) fs.writeFileSync(path.join(w.dataDir, 'user-state.json'), JSON.stringify(writeFile, null, 2));
  const P2 = freshPersistence();
  P2.setup({ writer: landingWriter(), dataDir: w.dataDir, wss: { clients: w.clients }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, userStateClock: () => (w.T0 || 0) + w.now() + (w.serverStep || 0), userStateMono: () => w.now() });
  w.H.get = handlerOf(P2.router, 'get', '/api/user-state'); w.H.post = handlerOf(P2.router, 'post', '/api/user-state'); w.H.patch = handlerOf(P2.router, 'patch', '/api/user-state'); w.H.ops = handlerOf(P2.router, 'patch', '/api/user-state/batches'); w.older = false;
  return P2;
};


// ════════ §13 ROUND 4 — EVERY ACT IS HANDED TO THE NETWORK AT THE ACT (as on master); TWO BATCHES OF ONE PAGE COMMUTE ════════
console.log('§13 round 4: page loss = master by construction; batches of one page commute (every arrival order, twice, across a restart); no act waits');
// MASTER'S page code for the two functions this lane changed, frozen here (05082bbd0's src/lib/sidebar-state.js, verbatim): the
// same driver runs both pages — the route serves master's whole-key body exactly as master did
const MASTER_APPLY_PUSH = `  proto._applyServerState = function(state) {
    if (state.starredSessions) this._starredIds = new Set(state.starredSessions);
    if (state.archivedSessions) this._archivedIds = new Set(state.archivedSessions);
    if (state.archivedFolders) this._archivedFolders = new Set(state.archivedFolders);
    if (state.customNames) this._customNames = { ...state.customNames };
    if (state.sessionModes) this._sessionModes = { ...state.sessionModes };
    if (state.sessionConfigs) this._sessionConfigs = { ...state.sessionConfigs };
    if (state.sessionGroups) this._sessionGroups = { ...state.sessionGroups };
    if (state.groupFolders) this._groupFolders = { ...state.groupFolders };
    // snapshot what the SERVER said — _pushUserState diffs against it so a
    // stale tab can only ever send the keys it actually changed (B-b87b)
    this._serverStateJson = {};
    for (const k of ['starredSessions', 'archivedSessions', 'archivedFolders', 'customNames', 'sessionModes', 'sessionConfigs', 'sessionGroups', 'groupFolders']) {
      if (state[k] !== undefined) this._serverStateJson[k] = JSON.stringify(state[k]);
    }
    this._writeUserStateToLocalStorage({
      starredSessions: [...this._starredIds], archivedSessions: [...this._archivedIds],
      archivedFolders: [...(this._archivedFolders || [])],
      customNames: this._customNames, sessionModes: this._sessionModes, sessionConfigs: this._sessionConfigs,
      sessionGroups: this._sessionGroups, groupFolders: this._groupFolders,
    });
  };

  proto._pushUserState = async function() {
    const state = {
      starredSessions: [...this._starredIds], archivedSessions: [...this._archivedIds],
      archivedFolders: [...(this._archivedFolders || [])],
      customNames: this._customNames, sessionModes: this._sessionModes, sessionConfigs: this._sessionConfigs,
      sessionGroups: this._sessionGroups, groupFolders: this._groupFolders,
    };
    this._writeUserStateToLocalStorage(state);
    // CLOBBER BELT (B-b87b): the full-doc POST let a tab acting on a STALE
    // mirror (open all day, missed broadcasts) silently revert every key it
    // never touched — stars/renames/configs made in other tabs vanished. Diff
    // against the last server-applied snapshot and PATCH only the changed
    // top-level keys; unchanged keys can't travel, so stale damage is bounded
    // to the key actually edited. No snapshot yet (pre-first-fetch legacy
    // path) → full POST as before.
    try {
      const snap = this._serverStateJson;
      if (snap) {
        const delta = {};
        for (const [k, v] of Object.entries(state)) {
          if (snap[k] !== JSON.stringify(v)) delta[k] = v;
        }
        if (!Object.keys(delta).length) return;
        await fetch('/api/user-state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(delta) });
        return;
      }
      await fetch('/api/user-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
    } catch {}
  };
`;
const ROUND4_APPLY_PUSH = STATE_SRC.slice(STATE_SRC.indexOf('  proto._applyServerState = function(state) {\n    return this._userSync().apply(state);'), STATE_SRC.indexOf('  // ── Star / Archive / Rename ──'));
const BASE_SRC = STATE_SRC.replace(ROUND4_APPLY_PUSH, MASTER_APPLY_PUSH + '\n');
ok(ROUND4_APPLY_PUSH.length > 100 && BASE_SRC !== STATE_SRC && BASE_SRC.includes('CLOBBER BELT (B-b87b)'), 'the BASE page for the comparisons: master\'s _applyServerState / _pushUserState laid into the same page code');
/** a page acts and goes; the hub answers each request `delay` ms after it arrives (in order, a little jitter); → acts lost */
async function pageLoss(src, { acts, leaveAfter = 50, delay = 200, kill = false, seed = 1, room = 65536 }) {
  const Sb = await loadPage(src);
  const need = Math.max(...acts.map((x) => (x.kind === 'archive' ? x.from + x.n : x.i + 1))) + 2;   // a world the size of its acts
  const w = createWorld({ seed, sessions: mkSessions(need, 4) });
  const p = await addPage(w, Sb, 'leaver');
  // the browser's keepalive room (the verifier's model): a keepalive body that does not fit `room` (64 KiB less what the page's
  // other keepalive requests hold — the telemetry beacon) is refused at once with a TypeError; a plain request is not bounded
  const plain = p.__fetch.bind(p);
  p.__fetch = (url, opts) => (opts && opts.keepalive && Buffer.byteLength(String(opts.body || '')) > room ? Promise.reject(new TypeError('Failed to fetch (keepalive body over the room)')) : plain(url, opts));
  await w.run(500);
  w.defaultLag = () => ({ toServer: delay + Math.floor(w.R() * 40), toPage: 20, drop: false });
  const want = [];
  for (const a of acts) {
    w.at(500 + a.at, () => {
      if (a.kind === 'archive') { const list = w.sessions.slice(a.from, a.from + a.n); p.archiveSessions(list); want.push(...list.map((x) => ['archivedSessions', x.sessionKey])); }
      else { const x = w.sessions[a.i]; p.toggleStar(x); want.push(['starredSessions', x.sessionKey]); }
    }, 'act');
  }
  const lastAct = Math.max(...acts.map((a) => a.at));
  w.at(500 + lastAct + leaveAfter, () => { if (kill) { p.__hide = []; } endPage(w, p); }, 'leave');   // kill = no pagehide at all
  await w.run(Infinity);
  const st = w.serverState();
  return want.filter(([k, v]) => !st[k].includes(v)).length;
}
{
  // THE VERIFIER'S TABLE: 5 acts within 100 ms / 1 s / 5 s of the leave × the hub answering after 0.2 / 2 / 20 s — the leave
  // both ways: the tab CLOSED (pagehide runs) and the tab KILLED (no pagehide: a crash, a discarded background page). An act
  // that waits in the page behind another request is lost with a killed page; an act on the wire at the act is not
  for (const kill of [false, true]) {
    const rows = [];
    for (const spread of [100, 1000, 5000]) for (const delay of [200, 2000, 20000]) {
      const acts = Array.from({ length: 5 }, (_, k) => ({ kind: 'star', i: k, at: Math.floor((spread * k) / 5) }));
      const tip = await pageLoss(STATE_SRC, { acts, delay, kill, seed: spread + delay }), base = await pageLoss(BASE_SRC, { acts, delay, kill, seed: spread + delay });
      rows.push({ spread, delay, tip, base });
    }
    ok(rows.every((r) => !(r.base === 0 && r.tip > 0)) && rows.every((r) => r.tip === 0),
      `PAGE LOSS = MASTER — 5 acts within 100 ms / 1 s / 5 s of the leave × the hub answering after 0.2 / 2 / 20 s, the tab ${kill ? 'KILLED (no pagehide)' : 'closed'}: lost ${rows.map((r) => r.tip).join('/')} here, ${rows.map((r) => r.base).join('/')} on master's page`, rows);
  }
  // THE VERIFIER'S SIZE SCENES (accept-seo r3 d3-leave, the same steps on this driver): a 600 / 900 / 5 000 select-all before
  // and after a star, the telemetry beacon holding 20 KiB of the keepalive room, a phone tab killed with no pagehide — and the
  // two controls it ran beside them (5 000 alone; three acts, pagehide)
  const scenes = [
    ['select-all 900 in flight, then a star, the reload 300 ms later (hub 2 s)', [{ kind: 'archive', from: 0, n: 900, at: 0 }, { kind: 'star', i: 5050, at: 100 }], { delay: 2000, leaveAfter: 200 }],
    ['a star in flight, then select-all 900, the reload 300 ms later (hub 2 s)', [{ kind: 'star', i: 5050, at: 0 }, { kind: 'archive', from: 0, n: 900, at: 100 }], { delay: 2000, leaveAfter: 200 }],
    ['select-all 600 in flight, then a star (fits 64 KiB)', [{ kind: 'archive', from: 0, n: 600, at: 0 }, { kind: 'star', i: 5050, at: 100 }], { delay: 2000, leaveAfter: 200 }],
    ['select-all 600 in flight + a star; the telemetry beacon holds 20 KiB', [{ kind: 'archive', from: 0, n: 600, at: 0 }, { kind: 'star', i: 5050, at: 100 }], { delay: 2000, leaveAfter: 200, room: 65536 - 20480 }],
    ['select-all 5 000 in flight + a star', [{ kind: 'archive', from: 0, n: 5000, at: 0 }, { kind: 'star', i: 5050, at: 100 }], { delay: 2000, leaveAfter: 200 }],
    ['select-all 5 000 alone, the reload 300 ms later', [{ kind: 'archive', from: 0, n: 5000, at: 0 }], { delay: 2000, leaveAfter: 300 }],
    ['three stars, the phone tab KILLED 500 ms later with no pagehide (hub 3 s)', [{ kind: 'star', i: 1, at: 0 }, { kind: 'star', i: 2, at: 100 }, { kind: 'star', i: 3, at: 200 }], { delay: 3000, leaveAfter: 300, kill: true }],
    ['three stars, pagehide 500 ms later (hub 3 s)', [{ kind: 'star', i: 1, at: 0 }, { kind: 'star', i: 2, at: 100 }, { kind: 'star', i: 3, at: 200 }], { delay: 3000, leaveAfter: 300 }],
  ];
  const got = [];
  for (const [name, acts, o = {}] of scenes) got.push({ name, tip: await pageLoss(STATE_SRC, { acts, ...o, seed: 77 }), base: await pageLoss(BASE_SRC, { acts, ...o, seed: 77 }) });
  // round 15: the browser now CANCELS a closed tab's plain request still on its way (this harness models it — the .397 hosted mirror);
  // a request that fits 48 KiB goes keepalive and lands. So: never more lost than on master's page; what fits survives a kill or a
  // close (three stars: 0 here, 3 on master's); a star sent BEFORE a select-all survives it (the select-all's request is past the
  // budget: plain, lost as on master's); a change riding a request past the budget is lost with it (named)
  ok(got.every((g) => g.tip <= g.base) && got[6].tip === 0 && got[7].tip === 0 && got[6].base === 3 && got[1].tip === got[1].base - 1,
    `PAGE LOSS ≤ MASTER — the verifier's size scenes (its seven + its pagehide control), a closed tab's plain request cancelled, a request that fits keepalive: lost ${got.map((g) => g.tip).join('/')} here (${got.map((g) => g.base).join('/')} on master's page)`, got);
}
{
  // ARRIVAL: every permutation of 4 batches of ONE page issued together — acts on the SAME item among them — each also delivered
  // twice, with a restart between two of them ⇒ the state is the PAGE'S order, each applied once
  const K = 'claude:00000001-0000-4000-8000-000000000000', Y = 'claude:00000002-0000-4000-8000-000000000000', Z = 'claude:00000003-0000-4000-8000-000000000000';
  const B = [
    { batch: 'pgarrive01:1', ops: [{ key: 'archivedSessions', item: K, value: true }, { key: 'sessionGroups', item: 'g', member: K, value: true }] },
    { batch: 'pgarrive01:2', ops: [{ key: 'archivedSessions', item: K, value: false }, { key: 'customNames', item: Y, value: 'first' }] },
    { batch: 'pgarrive01:3', ops: [{ key: 'archivedSessions', item: K, value: true }, { key: 'sessionGroups', item: 'g', member: K, value: false }, { key: 'sessionConfigs', item: Z, field: 'model', value: 'm1' }] },
    { batch: 'pgarrive01:4', ops: [{ key: 'customNames', item: Y, value: 'second' }, { key: 'sessionConfigs', item: Z, field: 'model', value: 'm2' }] },
  ];
  // the second set: a GROUP made with a member, deleted, made again with another, and a member added — the delete arriving
  // late must still remove what no later act decided, and never what one did
  const G2 = [
    { batch: 'pgarrive02:1', ops: [{ key: 'sessionGroups', item: 'h', value: true }, { key: 'sessionGroups', item: 'h', member: K, value: true }] },
    { batch: 'pgarrive02:2', ops: [{ key: 'sessionGroups', item: 'h', value: false }] },
    { batch: 'pgarrive02:3', ops: [{ key: 'sessionGroups', item: 'h', value: true }, { key: 'sessionGroups', item: 'h', member: Y, value: true }] },
    { batch: 'pgarrive02:4', ops: [{ key: 'sessionGroups', item: 'h', member: Z, value: true }] },
  ];
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r])));
  const R = rng(4242);
  const bad = [];
  let worlds = 0;
  // ROUND 5: what a page SENDS — each request carries every batch it has not seen confirmed, oldest first. Two shapes:
  //   (A) four acts while no answer has come: [1] [1 2] [1 2 3] [1 2 3 4] — in every order;
  //   (B) the answer to [1] came before the third act: [1] first, then [1 2] [2 3] [2 3 4] in every order.
  const SHAPES = [
    { name: 'none answered', reqs: [[0], [0, 1], [0, 1, 2], [0, 1, 2, 3]], fixedFirst: false },
    { name: '[1] answered before the third act', reqs: [[0], [0, 1], [1, 2], [1, 2, 3]], fixedFirst: true },
  ];
  for (const SET of [B, G2]) for (const shape of SHAPES) for (const order of (shape.fixedFirst ? perms([1, 2, 3]).map((o) => [0, ...o]) : perms([0, 1, 2, 3]))) for (const twice of [false, true]) {
    worlds++;
    const want = slotsOf(SET.reduce((st, b) => UO.applyOps(st, b.ops), {}));
    const w = createWorld({ seed: worlds, sessions: mkSessions(3) });
    // another page's member in group h before it all (the page's own delete takes it, in the page's order)
    w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgotherpg1:1', ops: [{ key: 'sessionGroups', item: 'h', member: 'claude:other', value: true }] }] });
    const reqOf = (r) => ({ batches: shape.reqs[r].map((i) => SET[i]) });
    const deliveries = order.map((r) => reqOf(r));
    if (twice) for (const r of order) { const at = deliveries.findIndex((d) => JSON.stringify(d) === JSON.stringify(reqOf(r))); deliveries.splice(Math.min(deliveries.length, at + 1 + Math.floor(R() * 4)), 0, reqOf(r)); }
    const restartAt = 1 + Math.floor(R() * (deliveries.length - 1));
    const appliedIds = [];
    let h = w.H.ops || w.H.patch;
    for (let k = 0; k < deliveries.length; k++) {
      if (k === restartAt) { const P2 = freshPersistence(); P2.setup({ writer: landingWriter(), dataDir: w.dataDir, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, userStateClock: () => (w.T0 || 0) + w.now() + (w.serverStep || 0), userStateMono: () => w.now() }); h = handlerOf(P2.router, 'patch', '/api/user-state/batches') || handlerOf(P2.router, 'patch', '/api/user-state'); w.H.get = handlerOf(P2.router, 'get', '/api/user-state'); }
      const r = w.call(h, deliveries[k]);
      if (r.status === 200) appliedIds.push(...(r.body.applied || []));
    }
    const got = slotsOf(w.serverState());
    const wantHere = new Map(want); if (SET === B) wantHere.set('sessionGroups|h|∃', true), wantHere.set('sessionGroups|h|claude:other', true);
    const off = slotDiff(got, wantHere);
    const once = appliedIds.length === 4 && new Set(appliedIds).size === 4;
    if (off.length || !once) bad.push({ set: SET === B ? 'items' : 'groups', shape: shape.name, order: order.map((i) => i + 1).join(''), twice, restartAt, appliedIds, off: off.slice(0, 4) });
  }
  ok(bad.length === 0, `ARRIVAL — the requests a page sends (each carrying every batch not yet confirmed, oldest first: none answered, or the first answered before the third act), in every order, plain and each delivered twice, with a restart between two of them — two sets (archive / un-archive / archive the same conversation, a rename twice, a member in and out, a config field twice; a group made, deleted, made again, a member added, with another page's member in it): ${worlds} worlds, the state is the page's order and each batch is applied ONCE`, bad.slice(0, 4));
}
{
  // NO ACT EVER WAITS, AND EVERY REQUEST CARRIES EVERYTHING NOT YET CONFIRMED: three acts while the first request is still out ⇒
  // three requests at once, the third carrying all three, oldest first. Two mutants, each RED by name: a request that carries
  // only its own act (round 5's law broken), and an act held back while another request is in flight (round 4's)
  const run = (M) => {
    const sent = [];
    const sync = M.createSync({ send: (b) => { sent.push(b.batches.map((x) => x.batch.split(':')[1]).join('+')); return new Promise(() => { }); }, pageId: 'pgqueue001', setTimer: () => 0, clearTimer: () => { } });
    sync.apply({ stateRev: 1, stateEpoch: 'epQueue1', archivedSessions: [] });
    for (const k of ['a', 'b', 'c']) sync.record([{ key: 'archivedSessions', item: 'claude:' + k, value: true }]);
    return sent;
  };
  const real = run(UO);
  const SRC = read('src/user-state-ops.js');
  const mutant = (from, to, name) => {
    // B-0d3e: the anchor judged BY NAME — a moved or doubled anchor is a red row naming it and the file. The copy is still
    // written (§14 builds on its folder: nothing crashes); a moved anchor leaves it unpatched, hit: false, and the «hit their
    // anchors» row below reds too (a doubled one is patched at its first: hit stays true, the ANCHOR row is the red)
    const n = SRC.split(from).length - 1;
    if (n !== 1) ok(false, `ANCHOR (${name}, src/user-state-ops.js): ${JSON.stringify(from).slice(0, 100)} — found ${n} times, one meant: the mutant is not the control it says`);
    const MUT = editAnchor(SRC, from, to, "src/user-state-ops.js");
    const dir = fs.mkdtempSync(path.join(TMP, name + '-'));
    fs.writeFileSync(path.join(dir, 'user-state-ops.cjs'), MUT);
    return { hit: MUT !== SRC, M: MUT !== SRC ? require(path.join(dir, 'user-state-ops.cjs')) : null, dir };
  };
  const OWN_ONLY = mutant('    for (const b of pool) { if (batches.length && (bytes + b.bytes > maxRequestBytes || nOps + b.ops.length > maxRequestOps || nVals + b.vchars > maxRequestValueChars)) break;', "    for (const b of pool.slice(-1)) { if (batches.length && (bytes + b.bytes > maxRequestBytes || nOps + b.ops.length > maxRequestOps || nVals + b.vchars > maxRequestValueChars)) break; /* MUTANT: a request carries only its own (newest) act */", 'own-only');
  const HOLD = mutant("      probesLeft = probesMax;\n      issue('act');", "      probesLeft = probesMax;\n      if (!reqs.size) issue('act');   // MUTANT: hold an act behind the one in flight", 'hold');
  ok(OWN_ONLY.hit && HOLD.hit, 'MUTANTS (a request that carries only its own act; an act held back while another request is in flight) hit their anchors');
  const own = OWN_ONLY.hit ? run(OWN_ONLY.M) : [], hold = HOLD.hit ? run(HOLD.M) : [];
  ok(real.join() === '1,1+2,1+2+3' && own.join() === '1,2,3' && hold.length === 1,
    `NO ACT EVER WAITS, AND EACH REQUEST CARRIES EVERYTHING NOT YET CONFIRMED: three acts with the first unanswered = three requests at once (${real.join(' · ')}); the own-act mutant sends ${own.join(' · ')}, the holding mutant ${hold.length} request — both RED by name here and in d8 below`, { real, own, hold });
  globalThis.__UEO_MUTANTS = { OWN_ONLY, HOLD };
}

// ════════ §14 ROUND 5 — EVERY REQUEST CARRIES EVERYTHING THE PAGE HAS NOT SEEN CONFIRMED ════════
console.log('§14 round 5: every request carries everything the page has not seen confirmed, oldest first — d8, d4, the file, the backlog past one request, the hard walk');
const OWN_DIR = globalThis.__UEO_MUTANTS.OWN_ONLY.dir;
const withOps = (src, dir) => src.replace("from '../user-state-ops.js'", `from '${pathToFileURL(path.join(dir, 'user-state-ops.cjs')).href}'`);
const OWN_SRC = withOps(STATE_SRC, OWN_DIR);
/** the first PATCH of the page fails (503 / a network error / never answers — it never arrives); the rest go. A network error fails
 *  every PATCH until it is reported too (round 15: the page's plain fetch, tried in the same send after the refused keepalive, meets
 *  the same dead network) */
const failFirst = (w, p, fail, after = 30) => {
  const f = p.__fetch.bind(p);
  let first = true, failedAt = null;
  p.__fetch = (url, opts) => {
    if (fail === 'neterr' && failedAt != null && w.now() <= failedAt + after && opts && opts.method === 'PATCH') { w.requests++; return Promise.reject(new TypeError('Failed to fetch')); }
    if (first && opts && opts.method === 'PATCH') {
      first = false; w.requests++; failedAt = w.now();
      if (fail === 'hang') return new Promise(() => { });
      return new Promise((res, rej) => w.at(w.now() + after, () => (fail === 'neterr' ? rej(new TypeError('Failed to fetch')) : res({ ok: false, status: Number(fail) || 503, json: async () => ({ error: 'busy' }) })), 'fail'));
    }
    return f(url, opts);
  };
};
{
  // THE VERIFIER'S d8 (r4/v1/d8-fail-then-close): archive X — its request fails (503 / a network error / hangs); 500 ms later a
  // second act (archive Y / star Y) whose request goes; the tab closes 300 ms after — before the paced re-send and before any
  // answer or echo (each would send what no request carries: the failed act — the mutant below would hide behind it)
  const scene = async (src, fail, second) => {
    const Sb = await loadPage(src);
    const w = createWorld({ seed: 5, sessions: mkSessions(10) });
    const p = await addPage(w, Sb, 'tab');
    await w.run(800);
    w.defaultLag = () => ({ toServer: 20, toPage: 400, drop: false });   // the hub answers after the tab is gone (the incident's loop lagged 1.9 s)
    w.defaultEcho = () => 400;   // (round 13: an ECHO sends what no request carries, too — it arrives after the tab is gone, as the answer does)
    failFirst(w, p, fail);
    const x = w.sessions[1], y = w.sessions[2];
    p.toggleArchive(x);
    await w.run(w.now() + 500);
    if (second === 'archive') p.toggleArchive(y); else p.toggleStar(y);
    await w.run(w.now() + 300);
    endPage(w, p);
    await w.run(w.now() + 60000);
    const st = w.serverState();
    return (st.archivedSessions.includes(x.sessionKey) ? 0 : 1) + ((second === 'archive' ? st.archivedSessions : st.starredSessions).includes(y.sessionKey) ? 0 : 1);
  };
  const cells = [];
  for (const fail of ['503', 'neterr', 'hang']) for (const second of ['archive', 'star']) cells.push({ fail, second, tip: await scene(STATE_SRC, fail, second), base: await scene(BASE_SRC, fail, second), own: await scene(OWN_SRC, fail, second) });
  ok(cells.every((c) => c.tip === 0 && c.base === 0) && cells.every((c) => c.own > 0),
    `THE VERIFIER'S d8 — an act whose request fails (503 / a network error / a hang), a second act 500 ms later that goes, the tab closed 300 ms after: lost ${cells.map((c) => c.tip).join('/')} here, ${cells.map((c) => c.base).join('/')} on master's page — the later request carries the earlier act; the mutant whose request carries only its own act loses ${cells.map((c) => c.own).join('/')} (RED by name)`, cells);
}
{
  // THE VERIFIER'S d4 (r4/v1/d4-selectall): a star whose request is held 3 s / answered 502 / fails, then a select-all of K (and
  // three acts of 1 500): the star is kept in every cell, as master; nothing is answered «duplicate» that was not applied;
  // «Saved» is said only for what the server holds
  const scene = async (src, { K, how, parts = 1 }) => {
    const Sb = await loadPage(src);
    const w = createWorld({ seed: 11, sessions: mkSessions(K + 20) });
    const p = await addPage(w, Sb, 'tab');
    await w.run(800);
    let n = 0;
    w.defaultLag = (m) => { if (m === 'get') return { toServer: 20, toPage: 20, drop: false }; n++; return { toServer: n === 1 && how === 'held' ? 3000 : 20, toPage: 20, drop: false }; };
    if (how !== 'held') failFirst(w, p, how === 'fail502' ? '502' : 'neterr', 50);
    const star = w.sessions[K + 5];
    p.toggleStar(star);
    await w.run(w.now() + 200);
    for (let q = 0; q < parts; q++) { p.archiveSessions(w.sessions.slice((q * K) / parts, ((q + 1) * K) / parts)); await w.run(w.now() + 300); }
    await w.run(w.now() + 120000);
    const st = w.serverState();
    const starOn = st.starredSessions.includes(star.sessionKey), saved = p.__toasts.some((x) => /^Saved/.test(x.text));
    return { K, how, parts, starOn, starPage: p._starredIds.has(star.sessionKey), archived: st.archivedSessions.length, falseDup: w.falseDup.length, savedTrue: !saved || (starOn && st.archivedSessions.length === K) };
  };
  const grid = [];
  for (const how of ['held', 'fail502', 'neterr']) for (const K of [4097, 5000, 5001]) grid.push({ K, how });   // (round 12: the batch bound is 5 000 — 4 000 / 4 096 / 4 500 sit inside one batch now: the edge 5 000 / 5 001 kept, 4 097 for master's rows; a select-all of 20 000 is the bounds suite's)
  for (const how of ['held', 'fail502', 'neterr']) grid.push({ K: 4500, how, parts: 3 });
  const rows = [];
  for (const c of grid) rows.push(await scene(STATE_SRC, c));
  const baseRows = [];
  for (const c of grid.filter((c) => c.K === 4097 || c.parts === 3)) baseRows.push(await scene(BASE_SRC, c));
  const good = (r) => r.starOn && r.starPage && r.archived === r.K && !r.falseDup && r.savedTrue;
  ok(rows.every(good) && baseRows.every((r) => r.starOn),
    `THE VERIFIER'S d4 — a star held 3 s / answered 502 / failed, then a select-all of 4 097 / 5 000 / 5 001, or three acts of 1 500: the star kept in all ${rows.length} cells (server and page) and every archive landed; nothing answered «duplicate» that was not applied; no «Saved» at all (round 9) — master's page keeps the star in its ${baseRows.length} cells too`, rows.filter((r) => !good(r)).concat(baseRows.filter((r) => !r.starOn)));
}
{
  // A BACKLOG LARGER THAN ONE REQUEST — the bound stated and pinned against master by the same driver. A request carries at most
  // MAX_BODY_BYTES (2 MiB, round 12) and MAX_OPS_PER_REQUEST ops; master's whole-key body is bounded by its route (express.json,
  // 50 MB). At the real sizes a fast-tier world is too large, so both bounds are scaled by ONE factor (1/1024): this page's request
  // 2 KiB, master's route 50 MiB / 1024 (express.json '50mb' is 50 × 1024²).
  const F = 1024, TIP_REQ = UO.MAX_BODY_BYTES / F, MASTER_LIMIT = Math.floor((50 * 1024 * 1024) / F);   // (a batch's own bounds scale too: 1 MiB / 64, 20 000 / 64 ops)
  const scene = async (src, { K, closeAfter, preArchived = 0 }) => {
    const Sb = await loadPage(src);
    const w = createWorld({ seed: 31, sessions: mkSessions(K + preArchived + 10) });
    if (preArchived) w.call(w.H.patch, { archivedSessions: w.sessions.slice(K, K + preArchived).map((x) => x.sessionKey) });
    const p = await addPage(w, Sb, 'tab');
    if (typeof p._userSync === 'function') {   // the engine again, with the scaled bounds (a batch and a request)
      p.__doors = { ...(p.__doors || {}), maxRequestBytes: TIP_REQ, maxBytes: UO.MAX_BATCH_BYTES / F, maxOps: Math.floor(UO.MAX_OPS_PER_BATCH / F) };
      p.__userSync = null; p._userSync();
      p._fetchUserState();
    }
    await w.run(800);
    const f = p.__fetch.bind(p);
    p.__fetch = (url, opts) => (opts && opts.method === 'PATCH' && Buffer.byteLength(String(opts.body || '')) > MASTER_LIMIT ? (w.requests++, Promise.resolve({ ok: false, status: 413, json: async () => ({ error: 'request entity too large' }) })) : f(url, opts));
    w.defaultLag = (m) => ({ toServer: m === 'get' ? 20 : 2000, toPage: 20, drop: false });   // the hub answers after 2 s
    p.archiveSessions(w.sessions.slice(0, K));
    if (closeAfter != null) { await w.run(w.now() + closeAfter); endPage(w, p); }
    await w.run(w.now() + (closeAfter != null ? 120000 : 400000));   // (a page that stays: long enough for every scaled request — round 12's 5 000-op / 2 MiB bounds scale to 4 ops a batch, 2 KB a request)
    const st = w.serverState();
    return w.sessions.slice(0, K).filter((x) => !st.archivedSessions.includes(x.sessionKey)).length;
  };
  // (a) a select-all whose ops pass this page's request bound, its whole key under master's: the page closed before the hub
  //     answers loses the part past the bound — its first request fits the keepalive budget and lands (round 15: master's whole key,
  //     a plain request still on its way, is cancelled with the tab — all lost there); a page that stays lands all of it
  const a = { K: 600, closeAfter: 300 };
  const aTip = await scene(STATE_SRC, a), aBase = await scene(BASE_SRC, a), aStay = await scene(STATE_SRC, { K: 600 });
  // (b) a hub whose WHOLE archived list is past master's body bound: master's every archive click is refused (it carries the
  //     whole key); this page sends the change alone
  const b = { K: 50, preArchived: 1120 };
  const bTip = await scene(STATE_SRC, b), bBase = await scene(BASE_SRC, b);
  const perOp = Buffer.byteLength(JSON.stringify({ key: 'archivedSessions', item: 'claude:00000000-0000-4000-8000-000000000000', value: true })) + 1;
  ok(aTip > 0 && aTip < a.K && aBase === a.K && aStay === 0 && bTip === 0 && bBase === b.K,
    `A BACKLOG LARGER THAN ONE REQUEST (both bounds scaled by 1/${F}: this page's request ${TIP_REQ} B, master's route ${MASTER_LIMIT} B): a select-all of ${a.K} closed 300 ms into a 2 s answer loses ${aTip} here (the part past one request; the first, keepalive, lands) and ${aBase} on master's page (its plain whole key cancelled with the tab); kept whole when the page stays (${aStay} lost). Where master's WHOLE key is past its bound (${b.preArchived} archived), master loses all ${bBase} of a ${b.K} select-all, this page ${bTip}. At the real bounds: a request carries ${UO.MAX_BODY_BYTES} B ≈ ${Math.floor(UO.MAX_BODY_BYTES / perOp)} archive ops; master's 50 MB ≈ 1.1 M ids`, { aTip, aBase, aStay, bTip, bBase });
}
{
  // THE HARD WALK (the verifier's UEO_HARD: 22 reds in 300 seeds on round 4): 5xx streaks, hung requests, tabs closed in them —
  // 0 reds wherever master keeps the act (a later request of its page reached the route); the own-act mutant RED
  const SEEDS = Number(process.env.UEO_HARD_SEEDS) || 16, SEED0 = Number(process.env.UEO_HARD_SEED0) || 72000;
  const reds = [];
  let asMaster = 0, streaks = 0, restarts = 0, deep = 0, restores = 0, olds = 0;
  for (let i = 0; i < SEEDS; i++) {
    const r = await walk(STATE_SRC, SEED0 + i, { hard: true });
    asMaster += r.lostAsMaster; restarts += r.w.restarts || 0; deep += r.deepSleeps; restores += r.restores; olds += r.olds;
    if (r.violations.length || r.serverOff.length || r.pagesOff.length || r.twice.length) reds.push({ seed: r.seed, v: r.violations.slice(0, 2), serverOff: r.serverOff.slice(0, 3), pagesOff: r.pagesOff.slice(0, 2), twice: r.twice.slice(0, 2) });
  }
  let mutReds = 0;
  for (let i = 0; i < 8; i++) { const r = await walk(OWN_SRC, SEED0 + i, { hard: true }); if (r.serverOff.length || r.violations.length) mutReds++; }
  ok(!reds.length && mutReds > 0 && restores > 0 && deep > 0, `THE HARD WALK over ${SEEDS} seeds from ${SEED0} (5xx streaks of 2–22 s, a request a page that never arrives, back-forward-cache hides, tabs closed in them, ${restarts} hub restarts, ${restores} restored files with the counter back, ${deep} laptops asleep 8–9 days — ${olds} week-old acts named and undone — said where the page showed them): ${reds.length} red worlds, ${reds.filter((r) => r.twice.length).length} with a batch applied twice — every lost act (${asMaster}) is one master loses too (no later request of its page reached the route); the own-act mutant is RED in ${mutReds} of 8`, reds.slice(0, 3));
}
function onDisk(w) { try { return JSON.parse(fs.readFileSync(path.join(w.dataDir, 'user-state.json'), 'utf8')); } catch { return {}; } }   // (hoisted: the hard walk's restores read it)
/** every word the page says, with whether what it is about is on disk at that moment */
const hearing = (p, w, held) => { const f = p.__toast.bind(p); p.__said = []; p.__toast = (text, o) => { p.__said.push({ text, at: w.now(), held: held() }); return f(text, o); }; };
/** a world on the virtual wall clock, a page in it; `skew` = the page's device clock against the hub's (an age is a difference) */
const r7page = async (w, Sb, name, { skew = 0 } = {}) => { const p = await addPage(w, Sb, name); p.__skew = skew; return p; };
const DAY_MS = 86400000;

// ════════ §18 ROUND 8 — «SAVED» ONLY OF WHAT IS ON DISK; A FACT'S TIME IS THE ACT'S; THE CLOCKS; THE WORD AT 15 s; SHAPES; THE COST ════════
console.log('§18 rounds 8–9: the page speaks only when it takes something back; a fact is dated by its act; the clock steps; shapes refused by name; a write encodes only the facts it changed');
/** a page whose PATCHes are answered `status` until `until()` says otherwise (the hub's disk full, a relay) */
const refusing = (w, p, until, status = 503) => { const f = p.__fetch.bind(p); p.__fetch = (u, o) => (o && o.method === 'PATCH' && until() ? new Promise((r) => w.at(w.now() + 40, () => r({ ok: false, status, json: async () => ({ error: 'busy' }) }), 'refused')) : f(u, o)); };
{
  // ROUND 9, MUST 1 — THE STREAK CELLS: the page speaks ONLY when it takes something back on the screen. P's act waits (answered 503 for
  // 4 s, or never answered for 20 s, or answered 401 until a sign-in at 30 s), with or without a next act 6 s on; its fate: APPLIED,
  // BEATEN by Q's later act (1 s or 30 s later), or REFUSED by the hub (a code) ⇒ the only words in any cell: one refusal, said once,
  // of an act the page then shows undone
  const scene = async (streak, fate, gap, next) => {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 400, sessions: mkSessions(3) });
    const P = await r7page(w, Sb, 'P'), Q = await r7page(w, Sb, 'Q');
    await w.run(500);
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const X = w.sessions[0], Y = w.sessions[1];
    let until = -1, signedIn = false;
    const f = P.__fetch.bind(P);
    P.__fetch = (u, o) => {
      if (!o || o.method !== 'PATCH') return f(u, o);
      if (fate === 'refused' && w.now() >= until && /customNames/.test(o.body || '') && /P-name/.test(o.body || '')) return new Promise((r) => w.at(w.now() + 40, () => r({ ok: false, status: 400, json: async () => ({ error: 'op 0: …', code: 'not-a-name' }) }), 'refuse'));
      if (streak === '503' && w.now() < until) return new Promise((r) => w.at(w.now() + 40, () => r({ ok: false, status: 503, json: async () => ({ error: 'busy' }) }), '503'));
      if (streak === 'hang' && w.now() < until) return new Promise(() => { });
      if (streak === '401' && !signedIn) return new Promise((r) => w.at(w.now() + 40, () => r({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) }), '401'));
      return f(u, o);
    };
    const T0 = w.now() + 500;
    w.at(T0, () => { until = w.now() + (streak === 'hang' ? 20000 : 4000); P.setCustomName(X, 'P-name'); }, 'P acts');
    if (fate === 'beaten') w.at(T0 + gap, () => Q.setCustomName(X, 'Q-name'), 'Q acts later');
    if (next) w.at(T0 + 6000, () => P.setCustomName(Y, 'P-other'), 'P acts again');
    if (streak === '401') w.at(T0 + 30000, () => { signedIn = true; P._fetchUserState(); }, 'signed in');
    await w.run(T0 + gap + 120000);
    const disk = w.serverState().customNames[X.sessionKey] || null, shown = P._customNames[X.sessionKey] || null;
    return { streak, fate, gap, next, disk, shown, said: P.__toasts.map((x) => x.text) };
  };
  const cells = [];
  for (const streak of ['503', 'hang', '401']) for (const next of [false, true]) {
    cells.push(await scene(streak, 'applied', 0, next));
    for (const gap of [1000, 30000]) cells.push(await scene(streak, 'beaten', gap, next));
    cells.push(await scene(streak, 'refused', 0, next));
  }
  const want = (c) => c.fate === 'refused' ? c.said.length === 1 && c.said[0] === 'The server refused a change (a name it does not keep), so it was undone here' && c.shown === null && c.disk === null
    : !c.said.length && c.shown === c.disk && c.disk === (c.fate === 'applied' ? 'P-name' : c.streak === '503' && c.gap === 30000 ? 'Q-name' : 'Q-name');
  ok(cells.every(want),
    `THE STREAK CELLS (round 9, MUST 1): ${cells.length} cells — a 503 streak / a hang / a 401 until a sign-in, ± a next act, P's act applied, beaten 1 s or 30 s later, or refused ⇒ ${cells.filter((c) => !c.said.length).length} cells say NOTHING (applied and beaten alike — the screen follows the server), ${cells.filter((c) => c.said.length === 1).length} say the refusal ONCE, in the page's words, of an act it then shows undone; no «not saved yet», no «saved» anywhere`, cells.filter((c) => !want(c)));
}
{
  // …and THE 7-DAY RULE, ONE NEUTRAL SENTENCE (round 9): (a) P's rename APPLIED, its answer lost, asleep 8 days while another device
  // writes (the fact swept by the week) ⇒ NOTHING said (the page already shows what the server holds); (b) the rename never left (the
  // lid shut at the act) ⇒ «a change made more than 7 days ago was not kept — this page now shows the server's», once; (c) APPLIED on
  // day 0, BEATEN by Q's rename half a day later, P's waiting copy re-sent on day 8 (the beater's fact aged out) ⇒ the same sentence,
  // once — true of both: the page takes back what it showed and shows the server's
  const trio = async (how) => {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 410, sessions: mkSessions(6) });
    const P = await r7page(w, Sb, 'P'), Q = await r7page(w, Sb, 'Q');
    await w.run(800);
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const X = w.sessions[1];
    let asleep = how === 'never';
    const f = P.__fetch.bind(P);
    if (how !== 'never') P.__lag = (m) => ({ toServer: 20, toPage: 20, drop: m === 'patch' });   // reaches the hub; the answer lost
    P.__fetch = (u, o) => (asleep ? new Promise(() => { }) : f(u, o));
    P.setCustomName(X, 'P-name');
    await w.run(w.now() + 200);
    P.__lag = null; asleep = true;
    w.disconnect(P); P.__frozen = true; P.__wakeAt = w.now() + 8 * DAY_MS;
    if (how === 'beaten') { await w.run(w.now() + DAY_MS / 2); Q.setCustomName(X, 'Q-name'); }
    const t0 = P.__wakeAt - 8 * DAY_MS;
    for (let k = 1; k <= 16; k++) { await w.run(t0 + (k * DAY_MS) / 2 - 2000); Q.toggleStar(w.sessions[2 + (k % 3)]); await w.run(w.now() + 500); }   // another device writes every half day up to the wake (its writes sweep the week — the beater's fact too)
    await w.run(P.__wakeAt);
    asleep = false; P.__frozen = false;
    w.connect(P); P._fetchUserState();
    await w.run(w.now() + 60000);
    return { how, disk: w.serverState().customNames[X.sessionKey] || null, shown: P._customNames[X.sessionKey] || null, said: P.__toasts.map((x) => x.text) };
  };
  const a = await trio('applied'), b = await trio('never'), c = await trio('beaten');
  const S1 = "A change made more than 7 days ago was not kept — this page now shows the server's";
  ok(a.disk === 'P-name' && a.shown === 'P-name' && !a.said.length && b.disk === null && b.shown === null && b.said.join() === S1 && c.disk === 'Q-name' && c.shown === 'Q-name' && c.said.join() === S1,
    `THE 7-DAY RULE, ONE NEUTRAL SENTENCE: applied with its answer lost, 8 days asleep ⇒ ${a.said.length} words (it is on disk, the page shows it); never left ⇒ «${b.said.join(' · ')}» (the page shows the server's: none); applied, beaten half a day later, re-sent on day 8 ⇒ «${c.said.join(' · ')}» (it shows Q's) — the sentence true of both, said only where what the page shows changed`, { a, b, c });
}
{
  // SMALLER 1 — A FACT'S TIME IS THE ACT'S TIME (refute-2/drv/s1-outage.mjs): P renames X, Q renames X `gap` LATER, both while the hub
  // is unreachable (a relay answering 502, or the hub restarting — each page's socket back at its own moment) ⇒ Q's later act stands
  // in every cell, whoever lands first
  const scene = async (mode, down, gap, pFirst) => {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 420, sessions: mkSessions(3) });
    const P = await r7page(w, Sb, 'P'), Q = await r7page(w, Sb, 'Q');
    await w.run(800);
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const X = w.sessions[1], t0 = w.now();
    let up = false;
    if (mode === 'relay') { for (const p of [P, Q]) { const f = p.__fetch.bind(p); p.__fetch = (u, o) => (!up ? new Promise((r) => w.at(w.now() + 40, () => r({ ok: false, status: 502, json: async () => null }), 'relay')) : f(u, o)); } }
    else { w.down = true; w.disconnect(P); w.disconnect(Q); }
    P.setCustomName(X, 'P-earlier');
    w.at(t0 + gap, () => Q.setCustomName(X, 'Q-later'), 'Q acts');
    w.at(t0 + down, () => { up = true; if (mode === 'restart') { w.down = false; restartWorld(w); } }, 'the hub is back');
    if (mode === 'restart') { const [a, b] = pFirst ? [P, Q] : [Q, P]; w.at(t0 + down + 100, () => { w.connect(a); a._fetchUserState(); }, 'first back'); w.at(t0 + down + 400, () => { w.connect(b); b._fetchUserState(); }, 'second back'); }
    await w.run(t0 + down + 120000);
    return { mode, down, gap, pFirst, disk: w.serverState().customNames[X.sessionKey] || null };
  };
  const cells = [];
  for (const [down, gap] of [[6500, 1000], [12000, 4000], [40000, 10000]]) { cells.push(await scene('relay', down, gap, true)); cells.push(await scene('restart', down, gap, true)); cells.push(await scene('restart', down, gap, false)); }
  ok(cells.every((c) => c.disk === 'Q-later'),
    `SMALLER 1 — A FACT'S TIME IS THE ACT'S TIME: P renames, Q renames later, both while the hub is unreachable (a relay's 502, or a restart with P's socket back first or second) ⇒ Q's LATER act stands in ${cells.filter((c) => c.disk === 'Q-later').length} of ${cells.length} cells, whoever lands first`, cells.filter((c) => c.disk !== 'Q-later'));
}
{
  // SMALLER 2 — CLOCK STEPS, the two cheap directions. (a) the HUB's clock steps back 1 h after Q's rename; P's later rename, answered
  // 503 for 4 s, is re-sent with its age ⇒ P's later act stands (the hub's clock never goes behind its mark: it runs on from it);
  // (b) P's DEVICE clock steps back 2 min between P's rename and its re-send; Q renamed X 1 s after P ⇒ Q's later act stands (the age
  // is the monotonic difference where the wall one went back)
  const serverBack = async () => {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 430, sessions: mkSessions(3) });
    const P = await r7page(w, Sb, 'P'), Q = await r7page(w, Sb, 'Q');
    await w.run(800);
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const X = w.sessions[1];
    Q.setCustomName(X, 'Q-earlier');
    await w.run(w.now() + 500);
    w.serverStep = -3600000;   // the hub's clock goes back an hour
    await w.run(w.now() + 500);
    let refuseUntil = w.now() + 4000;
    refusing(w, P, () => w.now() < refuseUntil);
    P.setCustomName(X, 'P-later');
    await w.run(w.now() + 60000);
    return w.serverState().customNames[X.sessionKey];
  };
  const deviceBack = async () => {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 431, sessions: mkSessions(3) });
    const P = await r7page(w, Sb, 'P'), Q = await r7page(w, Sb, 'Q');
    await w.run(800);
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const X = w.sessions[1];
    let refuseUntil = w.now() + 4000;
    refusing(w, P, () => w.now() < refuseUntil);
    P.setCustomName(X, 'P-earlier');
    await w.run(w.now() + 500);
    P.__skew = (P.__skew || 0) - 120000;   // the device's wall clock goes back 2 min
    await w.run(w.now() + 500);
    Q.setCustomName(X, 'Q-later');
    await w.run(w.now() + 60000);
    return w.serverState().customNames[X.sessionKey];
  };
  const a = await serverBack(), b = await deviceBack();
  ok(a === 'P-later' && b === 'Q-later',
    `SMALLER 2 — CLOCK STEPS: the hub's clock stepped back 1 h between two renames, the later one re-sent with its age ⇒ the later act stands («${a}»: the hub's clock runs on from its high-water mark); the device's clock stepped back 2 min between an act and its re-send ⇒ the later act of another device stands («${b}»: the age is the monotonic difference)`, { a, b });
}
{
  // ROUND 9 — W4's RATE × LATENCY TABLE (words8/drv/w4.mjs; round 8's «15 s from the oldest act» withdrawn): P archives a new conversation
  // 1 / 2 / 3 / 5 times a second for 20 s against a hub that hangs, holds everything 44 s, answers 503 at once, applies at once and
  // answers 14 s later, takes each 14 s late, or answers out of order within 12 s ⇒ NO word in any cell, and every act on disk
  const cells = [];
  for (const mode of ['hang', 'stall44', '503', 'late14a', 'late14b', 'ooo']) for (const rate of [1, 2, 3, 5]) {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 440 + rate, sessions: mkSessions(160) });
    const p = await r7page(w, Sb, 'P');
    await w.run(500);
    const T0 = w.now(), R = rng(7 + rate);
    w.defaultLag = (m) => {
      if (m === 'get') return { toServer: 20, toPage: 20, drop: false };
      if (mode === 'hang') return { toServer: w.now() < T0 + 40000 ? 1e9 : 20, toPage: 20, drop: false };
      if (mode === 'stall44') return { toServer: Math.max(20, T0 + 44000 - w.now()), toPage: 20, drop: false };
      if (mode === 'late14a') return { toServer: 20, toPage: 14000, drop: false };
      if (mode === 'late14b') return { toServer: 14000, toPage: 20, drop: false };
      if (mode === 'ooo') return { toServer: 20, toPage: Math.floor(R() * 12000), drop: false };
      return { toServer: 20, toPage: 20, drop: false };
    };
    if (mode === '503') refusing(w, p, () => w.now() < T0 + 40000);
    const made = [];
    for (let i = 0; i < rate * 20; i++) w.at(T0 + Math.round((i * 1000) / rate), () => { p.toggleArchive(w.sessions[i]); made.push(w.sessions[i].sessionKey); }, 'click');   // (20 s of clicking: rate × latency past the 32 requests listened to at 3 / s × 14 s)
    await w.run(T0 + 40000);
    if (mode === 'hang' || mode === '503') { p._fetchUserState(); }   // (the hub is back: the next state carries them)
    await w.run(T0 + 120000);
    const st = new Set(w.serverState().archivedSessions);
    cells.push({ mode, rate, words: p.__toasts.length, onDisk: made.filter((k) => st.has(k)).length, made: made.length });
  }
  // …and the sign-in pair (words8/drv/w4s.mjs S1, S2): act A hangs, act B answered 401 at once, acts every 2 s to 30 s, signed in at 60 s;
  // act A answered 401 after 2 s, act B (made before that answer) hangs, signed in at 60 s ⇒ no word, every act on disk
  const signIn = [];
  for (const plan of ['S1', 'S2']) {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 450, sessions: mkSessions(50) });
    const p = await r7page(w, Sb, 'P');
    await w.run(500);
    const T0 = w.now();
    let signed = false;
    const f = p.__fetch.bind(p);
    p.__fetch = (u, o) => {
      if (!o || o.method !== 'PATCH' || signed) return f(u, o);
      const t = w.now() - T0;
      if (plan === 'S1') return t < 500 ? new Promise(() => { }) : new Promise((r) => w.at(w.now() + 20, () => r({ ok: false, status: 401, json: async () => ({}) }), '401'));
      return t < 500 ? new Promise((r) => w.at(w.now() + 2000, () => r({ ok: false, status: 401, json: async () => ({}) }), '401')) : new Promise(() => { });
    };
    const acts = plan === 'S1' ? [0, 1000, 3000, 5000, 7000, 9000, 11000, 13000, 15000, 17000, 19000, 21000, 23000, 25000, 27000, 29000] : [0, 1000];
    const made = [];
    for (const t of acts) w.at(T0 + t, () => { const x = w.sessions[made.length]; p.toggleArchive(x); made.push(x.sessionKey); }, 'click');
    w.at(T0 + 60000, () => { signed = true; p._fetchUserState(); }, 'signed in');
    await w.run(T0 + 200000);
    const st = new Set(w.serverState().archivedSessions);
    signIn.push({ plan, words: p.__toasts.map((x) => x.text), onDisk: made.filter((k) => st.has(k)).length, made: made.length });
  }
  ok(cells.every((c) => c.words === 0 && c.onDisk === c.made) && signIn.every((c) => !c.words.length && c.onDisk === c.made),
    `W4's RATE × LATENCY TABLE (round 9): ${cells.length} cells — hang / a 44 s stall / 503 / applied, answered 14 s late / taken 14 s late / out of order, at 1–5 clicks a second for 20 s ⇒ ${cells.reduce((n, c) => n + c.words, 0)} words in all, ${cells.reduce((n, c) => n + c.onDisk, 0)} of ${cells.reduce((n, c) => n + c.made, 0)} acts on disk; the sign-in pair ⇒ ${signIn.map((c) => `${c.words.length} words, ${c.onDisk}/${c.made} on disk`).join('; ')} (signing in is the app's, as on master)`, { cells: cells.filter((c) => c.words || c.onDisk !== c.made), signIn });
}
{
  // SMALLER 4 — SHAPES REFUSED BY NAME (facts7/drv/b5-auth.mjs): a batch id taken before arriving with OTHER ops is refused by name (its
  // own re-send is still held); a value nested past the depth bound (4 since round 12 — the product's deepest is 2: a config's tools) is a 400 by name —
  // never a 503 from the write's stack; written from the NUMBER: 5 levels refused, 4 taken
  const w = createWorld({ seed: 450, sessions: mkSessions(2) });
  const first = w.call(w.H.ops, { batches: [{ batch: 'pgshape11:1', age: 0, ops: [{ key: 'archivedSessions', item: 'claude:first', value: true }] }] });
  const other = w.call(w.H.ops, { batches: [{ batch: 'pgshape11:1', age: 0, ops: [{ key: 'archivedSessions', item: 'claude:OTHER', value: true }] }] });
  const again = w.call(w.H.ops, { batches: [{ batch: 'pgshape11:1', age: 0, ops: [{ key: 'archivedSessions', item: 'claude:first', value: true }] }] });
  // a 100 000-deep value as express.json hands it over (parsed — never through a recursive copy)
  const deep = JSON.parse('{"batches":[{"batch":"pgshape03:1","ops":[{"key":"customNames","item":"claude:d","value":' + '['.repeat(100000) + ']'.repeat(100000) + '}]}]}');
  let deepAns = null;
  { const res = { status(c) { deepAns = { status: c }; return res; }, json(o) { deepAns = { ...(deepAns || { status: 200 }), body: o }; return res; } }; try { w.H.ops({ body: deep, query: {}, params: {}, headers: {} }, res, () => { }); } catch (e) { deepAns = { status: 'threw', body: { error: String(e && e.message).slice(0, 80) } }; } }
  const d33 = w.call(w.H.ops, { batches: [{ batch: 'pgshape04:1', age: 0, ops: [{ key: 'customNames', item: 'claude:d33', value: JSON.parse('['.repeat(5) + ']'.repeat(5)) }] }] });
  const d10 = w.call(w.H.ops, { batches: [{ batch: 'pgshape05:1', age: 0, ops: [{ key: 'customNames', item: 'claude:d10', value: JSON.parse('['.repeat(4) + ']'.repeat(4)) }] }] });
  const st = w.serverState();
  ok(first.body.applied.length === 1 && (other.body.refused || []).length === 1 && /taken before with other ops/.test(other.body.refused[0].error) && !st.archivedSessions.includes('claude:OTHER') && (again.body.held || []).includes('pgshape11:1')
    && deepAns && deepAns.status === 400 && /nested deeper than 4 levels/.test(deepAns.body.error) && d33.status === 400 && d10.status === 200 && !('claude:d' in st.customNames) && 'claude:d10' in st.customNames,
    `SMALLER 4 — SHAPES REFUSED BY NAME: a batch id taken before, arriving with other ops ⇒ refused («${((other.body.refused || [])[0] || {}).error}»), its own re-send still held; a value nested 100 000 deep ⇒ ${deepAns && deepAns.status} «${deepAns && deepAns.body && deepAns.body.error}» (5 deep ⇒ ${d33.status}, 4 deep ⇒ ${d10.status})`, { first: first.body, other: other.body, again: again.body, deepAns, d33: d33.status, d10: d10.status });
}
{
  // SMALLER 5 — A WRITE ENCODES ONLY THE FACTS IT CHANGED (round 13, corrected: it still JOINS every kept fact's text — O(facts), the
  // kb's Limits row): at 20 000 facts a one-op write turns ONE fact to text (the store keeps every
  // slot's text from its last change), and its text is the bytes JSON.stringify writes (compact since round 12, as the file); the facts move for the keys the
  // write REPLACED only (an untouched 20 000-id key is not diffed)
  const store = UO.factStore();
  const T = 1794400000000, src = {};
  for (let i = 0; i < 20000; i++) src[UO.slotOf({ key: 'archivedSessions', item: 'claude:' + i })] = UO.factOut({ t: T + i, page: 'pgcost0001', counter: 1 + (i >> 10), prev: [] });
  store.load(src);
  const e0 = store.encoded;
  const dr = store.draft();
  dr.set('s\tclaude:star', { t: T + 99999, page: 'pgcost0002', counter: 7, prev: [] });
  const text = store.text(dr);
  store.commit(dr);
  const perWrite = store.encoded - e0;
  const same = text === JSON.stringify({ ...src, 's\tclaude:star': UO.factOut({ t: T + 99999, page: 'pgcost0002', counter: 7, prev: [] }) });
  let reads = 0;
  const big = Array.from({ length: 20000 }, (_, i) => 'claude:' + i);
  const before = { starredSessions: [] }, after = { starredSessions: ['claude:x'] };
  Object.defineProperty(before, 'archivedSessions', { enumerable: true, get() { reads++; return big; } });
  Object.defineProperty(after, 'archivedSessions', { enumerable: true, get() { reads++; return big; } });
  const moved = UO.moveFacts(new Map(), before, after, T, new Set(), null);
  ok(perWrite === 1 && same && reads <= 2 && moved.size === 1,   // (round 14: ONE — the text made for the file is the one kept; round 13 encoded each changed fact twice)
    `SMALLER 5 — A WRITE ENCODES ONLY THE FACTS IT CHANGED: at 20 000 facts a one-op write turns ${perWrite} fact(s) to text (the others' text kept), its facts text = JSON.stringify's bytes (${same}); the facts move for the replaced key only (the untouched 20 000-id key read ${reads}× — never diffed)`, { perWrite, same, reads, moved: moved.size });
}
{
  // ROUND 9 — THE WORDS: the 7-day sentence and a refusal's reasons in zh / ja (more than 7 days; «not kept»); no answer at all says
  // nothing (no sentence about waiting); a 404 for 20 s neither (round 14 follow-up: only a streak past 3 minutes is said); the
  // not-yet-saved sentence and its taking back exist in zh / ja
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const sentence = (src, key) => { const m = new RegExp(JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*("(?:[^"\\\\]|\\\\.)*")').exec(src); return m ? JSON.parse(m[1]) : null; };
  const k1 = "A change made more than 7 days ago was not kept — this page now shows the server's", kn = "{n} changes made more than 7 days ago were not kept — this page now shows the server's";
  const words = [sentence(zh, k1), sentence(zh, kn), sentence(ja, k1), sentence(ja, kn), sentence(zh, 'The server refused a change ({reason}), so it was undone here'), sentence(ja, 'The server refused a change ({reason}), so it was undone here'), sentence(zh, 'These changes are not saved yet — the server does not take them (it may be restarting or older than this page); they are kept here while this page stays open'), sentence(ja, 'These changes are not saved yet — the server does not take them (it may be restarting or older than this page); they are kept here while this page stays open'), sentence(zh, 'The changes kept on this page are saved now'), sentence(ja, 'The changes kept on this page are saved now')];
  const said = [];
  for (const how of ['404', 'none']) {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 460, sessions: mkSessions(2) });
    const p = await r7page(w, Sb, 'P');
    await w.run(500);
    w.defaultLag = () => ({ toServer: how === 'none' ? 1e9 : 20, toPage: 20, drop: false });
    if (how === '404') refusing(w, p, () => true, 404);
    p.toggleArchive(w.sessions[1]);
    await w.run(w.now() + 20000);
    said.push(p.__toasts.length);
  }
  ok(/超过 7 天/.test(words[0]) && /没有保留/.test(words[0]) && /超过 7 天/.test(words[1]) && /7 日より前/.test(words[2]) && /保持されませんでした/.test(words[2]) && /7 日より前/.test(words[3]) && /\{reason\}/.test(words[4]) && /\{reason\}/.test(words[5]) && /尚未保存/.test(words[6] || '') && /まだ保存されていません/.test(words[7] || '') && !/重新加载/.test(words[6] || '') && !/再読み込み/.test(words[7] || '') && /已保存/.test(words[8] || '') && /保存されました/.test(words[9] || '') && said.join() === '0,0',
    `ROUND 9 — THE WORDS: zh «${words[0]}» / ja «${words[2]}» (MORE than 7 days, «not kept»); a refusal's template carries its reason in both; a 404 for 20 s and no answer say ${said.join(' / ')} words (round 14 follow-up: past 3 min «${words[6]}» / «${words[7]}», taken back «${words[8]}» / «${words[9]}»)`, { words, said });
}

// ════════ §19 ROUND 9 — THE MARK AT BOOT; JUDGING A REQUEST COSTS ITS OPS; AN OMISSION IS NOT AN ACT; AN ID IS ITS OPS; THE MARK'S FRACTIONS ════════
console.log('§19 round 9: the clock mark taken at boot; judging a request costs its ops (work); a factless writer\'s omission is not an act; an id is its ops; the mark keeps its fractions');
{
  // MUST 2 — THE HUB'S CLOCK MARK IS TAKEN AT BOOT: Q renames X; the hub restarts; 60 s / 600 s with no ops request (the pages' GETs
  // only); the wall clock steps back an hour; P renames X, answered 503 for 4 s, re-sent with its age ⇒ P's LATER act stands
  const scene = async (idle) => {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 470, sessions: mkSessions(3) });
    const P = await r7page(w, Sb, 'P'), Q = await r7page(w, Sb, 'Q');
    await w.run(800);
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const X = w.sessions[1];
    Q.setCustomName(X, 'Q-earlier');
    await w.run(w.now() + 1000);
    restartWorld(w);
    for (const p of [P, Q]) { w.disconnect(p); w.connect(p); p._fetchUserState(); }
    await w.run(w.now() + idle);
    w.serverStep = -3600000;
    let until = w.now() + 4000;
    refusing(w, P, () => w.now() < until);
    P.setCustomName(X, 'P-later');
    await w.run(w.now() + 60000);
    return w.serverState().customNames[X.sessionKey];
  };
  const a = await scene(60000), b = await scene(600000);
  ok(a === 'P-later' && b === 'P-later',
    `MUST 2 — THE MARK IS TAKEN AT BOOT: a restart, ${60} s / ${600} s with no ops request, the wall stepped back an hour, P's later rename carried with its age ⇒ «${a}» / «${b}» — the hub's clock runs on from boot, never from the first write`, { a, b });
}
{
  // MUST 3 — JUDGING A REQUEST COSTS ITS OPS (in WORK — scripts/work-meter.mjs in a child): judging one request of n one-op batches is LINEAR in
  // n (round 8 spread the draft's changes per batch: n × changes); n week-old batches are judged by their OWN slots — BOUNDED in the
  // store (round 8 re-applied the request's ops and compared the whole touched key per old batch)
  const { judgeInChild, LINEAR_BOUND } = await import('./work-meter.mjs');
  const mod = path.join(REPO, 'src/user-state-ops.js');
  const many = judgeInChild({ module: mod, kind: 'linear', n: 2000,
    mk: "(n) => ({ batches: Array.from({ length: n }, (_, i) => ({ batch: 'pgcostmany1:' + (i + 1), age: 0, ops: [{ key: 'archivedSessions', item: 'claude:' + i, value: true }] })) })",
    run: '(M, x) => { const d = M.factStore().draft(); const r = M.parseRequest(x.batches); if (r.error) return 0; return M.judgeRequest(d, r.page, r.list, {}, 1794400000000).ops.length; }' });
  // (round 10: an old act the state holds is held — judged by its own slots, a set key's members read ONCE per request: 2 000 week-old
  // batches cost the same against n or 2n conversations; round 8 compared the store per batch)
  const old = judgeInChild({ module: mod, kind: 'bounded', n: 2000,
    mk: "(n) => { const ids = Array.from({ length: n }, (_, i) => 'claude:' + i); const facts = new Map(ids.map((k, i) => ['a\\t' + k.length + ':' + k, { t: 1794400000000 - 9 * 86400000, page: 'pgsomeone01', counter: 1 + (i % 7), prev: [] }])); return { facts, state: { archivedSessions: ids }, batches: Array.from({ length: 2000 }, (_, i) => ({ batch: 'pgcostold01:' + (i + 1), age: 8 * 86400000, ops: [{ key: 'archivedSessions', item: 'claude:' + i, value: false }] })) }; }",
    run: '(M, x) => { const r = M.parseRequest(x.batches); if (r.error) return 0; return M.judgeRequest(x.facts, r.page, r.list, x.state, 1794400000000).verdicts.length; }' });
  ok(many.ok && old.ok,
    `MUST 3 — JUDGING A REQUEST COSTS ITS OPS, counted in work: n one-op batches in one request ×${Number(many.r).toFixed(2)} for ×2 n (≤ ${LINEAR_BOUND}: linear); 2 000 week-old batches against a store of n vs 2n conversations ×${Number(old.r).toFixed(2)} (bounded: each judged by its own slots, the store read once a request — never once a batch)`, { many, old });
}
{
  // MUST 4 — OMISSION BY A WRITER THAT CARRIES NO FACTS IS NOT AN ACT (others8/drv/x2-stale.mjs S1): the hub stalls 30 s; N (this
  // release) archives N1..N10, one a second; M (a tab still on .392's bundle — whole keys; its copy has none of N's acts: no echo in
  // the stall) archives Y at 5.5 s; the hub runs the requests in send order: N1..N5, M's whole key, N6..N10 ⇒ on disk N1..N10 AND Y
  // (round 8: M's omission was recorded as «removed by nobody, now» and N's waiting N1..N5 came back superseded — lost; master keeps them)
  const SbN = await loadPage(STATE_SRC), SbM = await loadPage(BASE_SRC);
  const w = createWorld({ seed: 480, sessions: mkSessions(14) });
  const N = await r7page(w, SbN, 'N'), M = await addPage(w, SbM, 'M');
  await w.run(800);
  const T0 = w.now();
  w.defaultLag = (m) => (m === 'get' ? { toServer: 20, toPage: 20, drop: false } : { toServer: Math.max(20, T0 + 30000 - w.now()), toPage: 20, drop: false });
  const Ns = w.sessions.slice(0, 10), Y = w.sessions[12];
  for (let i = 0; i < 10; i++) w.at(T0 + 1000 * (i + 1), () => N.toggleArchive(Ns[i]), 'N archives');
  w.at(T0 + 5500, () => M.toggleArchive(Y), 'M (a .392 tab) archives Y');
  await w.run(T0 + 30000 + 60000);
  w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
  for (const p of [N, M]) { w.disconnect(p); w.connect(p); p._fetchUserState(); }
  await w.run(w.now() + 30000);
  const st = new Set(w.serverState().archivedSessions);
  const onN = Ns.filter((x) => st.has(x.sessionKey)).length;
  ok(onN === 10 && st.has(Y.sessionKey) && Ns.every((x) => N._archivedIds.has(x.sessionKey)),
    `MUST 4 — AN OMISSION IS NOT AN ACT (the stale tab, X2's S1): N archives N1..N10 through a 30 s stall, a .392 tab's whole key (Y, none of N's) lands between N5 and N6 ⇒ on disk ${onN} of N1..N10 AND Y (${st.has(Y.sessionKey)}); N shows them all`, { onN, Y: st.has(Y.sessionKey) });
}
{
  // ROUND 10 — THE OMISSION BY THE POST DOOR TOO: the same scene, M (a .392 tab) acting BEFORE its first fetch answered — its page
  // POSTs its whole copy (master's pre-fetch road), none of N's acts in it ⇒ still an omission: N1..N10 AND Y on disk
  const SbN = await loadPage(STATE_SRC), SbM = await loadPage(BASE_SRC);
  const w = createWorld({ seed: 481, sessions: mkSessions(14) });
  const N = await r7page(w, SbN, 'N'), M = await addPage(w, SbM, 'M');
  await w.run(800);
  const T0 = w.now();
  w.defaultLag = (m) => (m === 'get' ? { toServer: 20, toPage: 20, drop: false } : { toServer: Math.max(20, T0 + 30000 - w.now()), toPage: 20, drop: false });
  const Ns = w.sessions.slice(0, 10), Y = w.sessions[12];
  let posts = 0;
  const f = M.__fetch.bind(M);
  M.__fetch = (u, o) => { if (o && o.method === 'POST') posts++; return f(u, o); };
  for (let i = 0; i < 10; i++) w.at(T0 + 1000 * (i + 1), () => N.toggleArchive(Ns[i]), 'N archives');
  w.at(T0 + 5500, () => { M._serverStateJson = null; M.toggleArchive(Y); }, 'M (a .392 tab, its first fetch not answered) archives Y');
  await w.run(T0 + 30000 + 60000);
  w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
  for (const p of [N, M]) { w.disconnect(p); w.connect(p); p._fetchUserState(); }
  await w.run(w.now() + 30000);
  const st = new Set(w.serverState().archivedSessions);
  const onN = Ns.filter((x) => st.has(x.sessionKey)).length;
  ok(posts === 1 && onN === 10 && st.has(Y.sessionKey) && Ns.every((x) => N._archivedIds.has(x.sessionKey)),
    `ROUND 10 — THE OMISSION BY THE POST DOOR TOO: a .392 tab before its first fetch POSTs its whole copy (${posts} POST) between N5 and N6 ⇒ on disk ${onN} of N1..N10 AND Y (${st.has(Y.sessionKey)}); N shows them all`, { posts, onN, Y: st.has(Y.sessionKey) });
}
{
  // SMALLER 1 — AN ID IS THE SAME ACT ONLY WITH THE SAME OPS (a digest kept with its trace): its re-send ⇒ held; the same id with a
  // shared slot and another op ⇒ refused by name (nothing applied); a different value on the shared slot ⇒ refused (never «held»)
  const w = createWorld({ seed: 490, sessions: mkSessions(2) });
  const A = { key: 'archivedSessions', item: 'claude:dig-a', value: true }, B = { key: 'archivedSessions', item: 'claude:dig-b', value: true };
  const first = w.call(w.H.ops, { batches: [{ batch: 'pgdigest01:1', age: 0, ops: [A] }] });
  const same = w.call(w.H.ops, { batches: [{ batch: 'pgdigest01:1', age: 0, ops: [A] }] });
  const more = w.call(w.H.ops, { batches: [{ batch: 'pgdigest01:1', age: 0, ops: [A, B] }] });
  const flip = w.call(w.H.ops, { batches: [{ batch: 'pgdigest01:1', age: 0, ops: [{ ...A, value: false }] }] });
  const st = w.serverState();
  const code = (r) => ((r.body.refused || [])[0] || {}).code;
  ok(first.body.applied.length === 1 && (same.body.held || []).includes('pgdigest01:1') && code(more) === 'reused-id' && code(flip) === 'reused-id' && !st.archivedSessions.includes('claude:dig-b') && st.archivedSessions.includes('claude:dig-a'),
    `SMALLER 1 — AN ID IS ITS OPS: its own re-send held; the same id with a shared slot + another op ⇒ ${code(more)}; a different value on the shared slot ⇒ ${code(flip)} (never «held», nothing written)`, { same: same.body, more: more.body, flip: flip.body });
}
{
  // SMALLER 2 — THE HIGH-WATER CLOCK KEEPS ITS FRACTIONS: the wall stepped back an hour, then 2 000 ops requests 0.6 ms apart on the
  // monotonic clock ⇒ the hub's clock ran on ~1 200 ms (round 8 floored each delta: it stood still)
  const dir = fs.mkdtempSync(path.join(TMP, 'frac-'));
  let wall = 1794400000000, mono = 0;
  const P2 = freshPersistence();
  P2.setup({ writer: landingWriter(), dataDir: dir, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, userStateClock: () => wall, userStateMono: () => mono });
  const ops = handlerOf(P2.router, 'patch', '/api/user-state/batches');
  const callIt = (body) => { let out = null; const res = { status() { return res; }, json(o) { out = o; return res; } }; ops({ body, query: {}, params: {}, headers: {} }, res, () => { }); return out; };
  callIt({ batches: [{ batch: 'pgfrac0001:1', age: 0, ops: [{ key: 'starredSessions', item: 'claude:f0', value: true }] }] });
  wall -= 3600000;
  for (let i = 0; i < 2000; i++) { mono += 0.6; callIt({ batches: [{ batch: 'pgfrac0002:' + (i + 1), age: 0, ops: [{ key: 'starredSessions', item: 'claude:f' + (i % 3), value: i % 2 === 0 }] }] }); }
  const facts = JSON.parse(fs.readFileSync(path.join(dir, 'user-state.json'), 'utf8'))[UO.FACTS_KEY] || {};
  const ts = Object.values(facts).map((v) => UO.factIn(v).t);
  const ran = Math.max(...ts) - 1794400000000;
  ok(ran >= 1100 && ran <= 1300,
    `SMALLER 2 — THE MARK KEEPS ITS FRACTIONS: the wall stepped back an hour, 2 000 requests 0.6 ms apart ⇒ the hub's clock ran on ${ran} ms (≈ 1 200; a floored delta per call stood still)`, { ran });
}

// ════════ §20 ROUND 10 — THE ROWS FIRST, THEN THE WORD; «THE SERVER'S» IS THE SERVER'S; AN IMPORT IS AN ACT; A REQUEST'S OP BOUND ════════
console.log('§20 round 10: the rendered rows show it before a word; the 7-day rule never of what the state holds; an import is an act; the request\'s op bound; the smaller five');
/** a page whose RENDERED rows are watched: every _render snapshots what the DOM would draw for `read`; every word records it */
const watchRows = (p, read) => {
  p.__rendered = read(p);
  p._render = function () { p.__rendered = read(p); };
  const f = p.__toast.bind(p);
  p.__words = [];
  p.__toast = (text, o) => { p.__words.push({ text, rendered: p.__rendered, data: read(p) }); return f(text, o); };
};
{
  // MUST 1 — THE SCREEN SHOWS IT BEFORE A WORD SAYS IT (words9/drv/w2dom.mjs, w2sup.mjs): after EVERY event the rendered rows equal the
  // data; a word finds the rows already showing what it speaks of. A refusal; the 7-day sentence; a superseded act with the socket up
  // (echo 20 ms and 3 s); a superseded act with the socket down, then the GET
  const scene = async (kind) => {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 500, sessions: mkSessions(4) });
    const P = await r7page(w, Sb, 'P'), Q = await r7page(w, Sb, 'Q');
    await w.run(600);
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    if (kind === 'echo3s') w.defaultEcho = () => 3000;
    const X = w.sessions[1], key = X.sessionKey;
    const read = (p) => (p._customNames || {})[key] || null;
    watchRows(P, read);
    let mism = 0;
    const check = () => { if (P.__rendered !== read(P)) mism++; };
    if (kind === 'refusal') {
      const f = P.__fetch.bind(P);
      P.__fetch = (u, o) => (o && o.method === 'PATCH' && /P-name/.test(o.body || '') ? new Promise((r) => w.at(w.now() + 30, () => r({ ok: false, status: 400, json: async () => ({ error: '…', code: 'not-a-name' }) }), 'refuse')) : f(u, o));
      P.setCustomName(X, 'P-name');
    } else if (kind === 'old') {
      let asleep = true;
      const f = P.__fetch.bind(P);
      P.__fetch = (u, o) => (asleep && o && o.method === 'PATCH' ? new Promise(() => { }) : f(u, o));
      P.setCustomName(X, 'P-name');
      w.disconnect(P); P.__frozen = true; P.__wakeAt = w.now() + 8 * DAY_MS;
      await w.run(P.__wakeAt, check);
      asleep = false; P.__frozen = false; w.connect(P); P._fetchUserState();
    } else {
      let until = w.now() + 4000;
      refusing(w, P, () => w.now() < until);
      if (kind === 'down') w.disconnect(P);
      P.setCustomName(X, 'P-name');
      await w.run(w.now() + 1000, check);
      Q.setCustomName(X, 'Q-name');   // a LATER act: P's waiting rename is beaten
    }
    await w.run(w.now() + 60000, check);
    const words = P.__words.map((x) => ({ text: x.text.slice(0, 40), rendered: x.rendered }));
    return { kind, mism, end: { rendered: P.__rendered, data: read(P) }, words, disk: w.serverState().customNames[key] || null };
  };
  const cells = [];
  for (const kind of ['refusal', 'old', 'echo20', 'echo3s', 'down']) cells.push(await scene(kind));
  const want = (c) => c.mism === 0 && c.end.rendered === c.end.data && (c.kind === 'refusal' || c.kind === 'old' ? c.words.length === 1 && c.words[0].rendered === null : !c.words.length && c.end.rendered === 'Q-name');
  ok(cells.every(want),
    `MUST 1 — THE ROWS FIRST, THEN THE WORD: a refusal, the 7-day sentence, a beaten act with the socket up (echo 20 ms / 3 s) and down (then the GET) ⇒ after every event the rendered rows = the data (${cells.map((c) => `${c.kind} ${c.mism} gaps`).join(', ')}); each word found its act already undone on screen; a beaten act ends showing the other device's name`, cells.filter((c) => !want(c)));
}
{
  // MUST 2 — THE 7-DAY RULE NEVER SPEAKS OF AN ACT THE STATE HOLDS (words9/drv/w2b-stale.mjs): P's rename LANDED, its answer and echo
  // lost (the lid closed); 8 days pass, another device writes every half day (P's fact swept); P wakes and (i) its paced re-send, (ii) a
  // click on another item, (iii) the reconnect GET reaches the hub first ⇒ no word, and the row shows P's name at EVERY instant. The
  // true case: P's rename never left, another device renamed X on day 3, P missed that state ⇒ the sentence once, and at that
  // instant the row already shows the other device's name — also when P clicks on waking, its socket back only 10 s later (its
  // answer comes BEFORE any state: the page fetches the state first and only then takes the act back — MUST 2 b); masked: P renames X again on waking (the old act is
  // taken back where nothing it shows changes ⇒ no word). Every cell: the rendered rows = the data after every event
  const scene = async (order) => {
    const never = order === 'true' || order === 'true-click' || order === 'masked';
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 510, sessions: mkSessions(6) });
    const P = await r7page(w, Sb, 'P'), Q = await r7page(w, Sb, 'Q');
    await w.run(800);
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const X = w.sessions[1], key = X.sessionKey, Z = w.sessions[5];
    const read = (p) => (p._customNames || {})[key] || null;
    let asleep = never;
    const f = P.__fetch.bind(P);
    if (!never) P.__lag = (m) => ({ toServer: 20, toPage: 20, drop: m === 'patch' });
    P.__fetch = (u, o) => (asleep ? new Promise(() => { }) : f(u, o));
    P.setCustomName(X, 'P-name');
    await w.run(w.now() + 200);
    P.__lag = null; asleep = true;
    w.disconnect(P); P.__frozen = true; P.__wakeAt = w.now() + 8 * DAY_MS;
    const t0 = P.__wakeAt - 8 * DAY_MS;
    for (let k = 1; k <= 16; k++) { await w.run(t0 + (k * DAY_MS) / 2 - 2000); if (never && k === 6) Q.setCustomName(X, 'Q-day3'); else Q.toggleStar(w.sessions[2 + (k % 3)]); await w.run(w.now() + 500); }
    await w.run(P.__wakeAt);
    watchRows(P, read);
    let flash = 0, gaps = 0;
    const want = never ? null : 'P-name';
    asleep = false; P.__frozen = false;
    P.__lag = (m) => ({ toServer: order === 'get-first' && m === 'patch' ? 2000 : 20, toPage: m === 'get' && order !== 'get-first' ? 3000 : 20, drop: false });
    if (order === 'true-click') w.at(w.now() + 10000, () => w.connect(P), 'P\'s socket back 10 s after it woke'); else w.connect(P);   // (true-click: no echo before the answer)
    P._fetchUserState();
    if (order === 'click' || order === 'true-click') P.toggleArchive(Z);
    if (order === 'masked') P.setCustomName(X, 'P-new');
    await w.run(w.now() + 60000, () => { if (want && P.__rendered !== want) flash++; if (P.__rendered !== read(P)) gaps++; });
    return { order, flash, gaps, said: P.__words.map((x) => ({ text: x.text.slice(0, 44), rendered: x.rendered })), shown: P.__rendered, disk: w.serverState().customNames[key] || null,
      z: P._archivedIds.has(Z.sessionKey) && (w.serverState().archivedSessions || []).includes(Z.sessionKey) };
  };
  const rows = [];
  for (const order of ['probe', 'click', 'get-first', 'true', 'true-click', 'masked']) rows.push(await scene(order));
  const good = (r) => r.gaps === 0 && (r.order === 'true' || r.order === 'true-click' ? r.said.length === 1 && /more than 7 days ago/.test(r.said[0].text) && r.said[0].rendered === 'Q-day3' && r.shown === 'Q-day3' && r.disk === 'Q-day3' && (r.order === 'true' || r.z)
    : r.order === 'masked' ? !r.said.length && r.shown === 'P-new' && r.disk === 'P-new'
    : !r.said.length && r.flash === 0 && r.shown === 'P-name' && r.disk === 'P-name');
  ok(rows.every(good),
    `MUST 2 — THE 7-DAY RULE NEVER OF WHAT THE STATE HOLDS: P's landed rename, its answer and echo lost, 8 days, the fact swept ⇒ probe first / a click first / the GET first: no word, the row P's name at every instant (${rows.slice(0, 3).map((r) => `${r.order} ${r.flash} flashes`).join(', ')}); never left + another device's rename on day 3 ⇒ «${(rows[3].said[0] || {}).text || '—'}…» ONCE, said with the row already showing «${(rows[3].said[0] || {}).rendered}»; the same with a click on waking, the socket still down — its answer before any state: the page fetches first, then «${(rows[4].said[0] || {}).text || '—'}…» once over «${(rows[4].said[0] || {}).rendered}», the click kept; masked by P's own rename on waking: ${rows[5].said.length} words, «${rows[5].shown}»; rendered rows = data throughout (${rows.map((r) => r.gaps).join('/')} gaps)`, rows.filter((r) => !good(r)));
}
{
  // ROUND 11, MUST 1 — THE DEFERRAL'S TWO HOLES (both found by the lane on a0112bbf4, met by the panel: w2nobase, w3.13, stuck.cjs).
  // (a) NO BASE: P's network flaps at load (its first state never comes), P renames X, the lid shuts; Q renames X on day 3; P wakes 8
  //     days on with its socket still down and clicks Z 1.5 s later — the answer names the rename too old BEFORE any state ⇒ the page
  //     defers, asks, and says the sentence ONCE, after the rows show Q's name (round 10: at once, over the local display copy).
  // (b) THE ASK, PACED: P has a base; the same scene, its socket down for good, and its GETs HANG / answer 503 (twice each) / answer an
  //     OLDER state first ⇒ it asks again (2 s, 5 s …) and takes the act back when the state comes — the sentence once, after the rows,
  //     the GETs counted (round 10 asked once: the act stayed on the row).
  // (c) THE LATCH: the asks of a deferral all fail (the GET door down 12 min: the count spent); later P's rename of X2 is beaten by Q's
  //     ⇒ the page asks AGAIN — and takes both back, the sentence once
  const scene = async (kind) => {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 540, sessions: mkSessions(6) });
    const Q = await r7page(w, Sb, 'Q');
    const P = await addPage(w, Sb, 'P', { fetchFirst: false });
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const X = w.sessions[1], key = X.sessionKey, Z = w.sessions[5], X2 = w.sessions[2];
    const read = (p) => (p._customNames || {})[key] || null;
    let asleep = false, woke = false, gets = 0, stale = null, downUntil = 0, unsigned = 0, inflight = 0, maxInflight = 0, takenAt = null;
    const calls = [];
    const fus = P._fetchUserState.bind(P);
    P._fetchUserState = (opt) => { if (woke) calls.push(opt && opt.tries); return fus(opt); };   // (round 11: the paced ask passes ONE try)
    const f = P.__fetch.bind(P);
    P.__fetch = (u, o) => {
      const get = !(o && o.method);
      if (get && woke && !(o && o.signal)) unsigned++;   // (each paced GET is given up after 15 s: it carries a signal)
      if (get && kind === 'nobase' && !woke) return Promise.reject(new TypeError('Failed to fetch'));   // the network flaps at load
      if (get && woke) {
        gets++;
        if (kind === 'slow20') return new Promise((res, rej) => { inflight++; maxInflight = Math.max(maxInflight, inflight); let done = false; const end = () => { if (!done) { done = true; inflight--; } };
          if (o && o.signal) o.signal.addEventListener('abort', () => { end(); rej(new TypeError('The operation was aborted')); }, { once: true });
          w.at(w.now() + 20000, () => { if (done) return; end(); f(u, o).then(res, rej); }, 'a GET answered in 20 s'); });   // (round 12: a hub slower than 15 s)
        if ((kind === 'past40' || kind === 'reset') && w.now() < downUntil) return Promise.resolve({ ok: false, status: 503, json: async () => ({ error: 'unavailable' }) });
        if (kind === 'hang' && gets <= 2) return new Promise((_, rej) => { if (o && o.signal) o.signal.addEventListener('abort', () => rej(new TypeError('The operation was aborted')), { once: true }); });   // (hung — until the engine gives the ask up)
        if (kind === '503' && gets <= 2) return Promise.resolve({ ok: false, status: 503, json: async () => ({ error: 'unavailable' }) });
        if (kind === 'older' && gets === 1) return Promise.resolve({ ok: true, status: 200, json: async () => J(stale) });
        if (kind === 'latch' && w.now() < downUntil) return Promise.resolve({ ok: false, status: 503, json: async () => ({ error: 'unavailable' }) });
      }
      if (asleep && !get) return new Promise(() => { });   // the lid: what P sends never leaves
      return f(u, o);
    };
    P._fetchUserState();
    await w.run(w.now() + 30000);
    asleep = true;
    P.setCustomName(X, 'P-name');
    await w.run(w.now() + 200);
    w.disconnect(P); P.__frozen = true; P.__wakeAt = w.now() + 8 * DAY_MS;
    await w.run(w.now() + 3 * DAY_MS); Q.setCustomName(X, 'Q-day3'); await w.run(w.now() + 500);
    await w.run(w.now() + DAY_MS); stale = w.serverState();   // (a state after Q's rename, before P's click: older than its answer)
    await w.run(P.__wakeAt);
    watchRows(P, read);
    let gaps = 0;
    const tick = () => { if (P.__rendered !== read(P)) gaps++; };
    asleep = false; woke = true; P.__frozen = false;
    if (kind === 'latch' || kind === 'past40' || kind === 'reset') downUntil = w.now() + 12 * 60000;
    if (kind === 'reset') w.at(w.now() + 12 * 60000 + 12000, () => P._applyServerState(J(stale)), 'a state taken (newer than the base, older than the answer)');
    w.at(w.now() + (kind === 'nobase' ? 1500 : 0), () => P.toggleArchive(Z), 'P clicks Z');
    const tick2 = () => { tick(); if (takenAt === null && read(P) === 'Q-day3') takenAt = w.now() - P.__wakeAt; };
    await w.run(w.now() + (kind === 'latch' ? 13 * 60000 : kind === 'past40' ? 16 * 60000 : kind === 'reset' ? 13 * 60000 : kind === 'slow20' ? 120000 : 60000), tick2);
    const at = { gets, said: P.__words.length, shown: P.__rendered };
    if (kind === 'latch') {   // the second deferral: P renames X2 (its send dropped), Q renames X2 later and lands first, P's re-send is beaten
      P.__lag = (m) => ({ toServer: 20, toPage: 20, drop: m === 'patch' });
      P.setCustomName(X2, 'P-x2');
      await w.run(w.now() + 1000, tick);
      Q.setCustomName(X2, 'Q-x2');
      await w.run(w.now() + 1000, tick);
      P.__lag = null;
      await w.run(w.now() + 60000, tick);
    }
    const st = w.serverState();
    return { kind, gaps, gets, at13: at, oneTry: calls.length > 0 && calls.every((t) => t === 1), unsigned, maxInflight, takenAt, said: P.__words.map((x) => ({ text: x.text.slice(0, 44), rendered: x.rendered })), shown: P.__rendered, disk: (st.customNames || {})[key] || null,
      x2: (P._customNames || {})[X2.sessionKey] || null, x2disk: (st.customNames || {})[X2.sessionKey] || null, z: P._archivedIds.has(Z.sessionKey) && (st.archivedSessions || []).includes(Z.sessionKey) };
  };
  const rows = [];
  for (const kind of ['nobase', 'hang', '503', 'older', 'latch', 'slow20', 'past40', 'reset']) rows.push(await scene(kind));
  const once = (r) => r.said.length === 1 && /more than 7 days ago/.test(r.said[0].text) && r.said[0].rendered === 'Q-day3';
  const good = (r) => r.gaps === 0 && once(r) && r.shown === 'Q-day3' && r.disk === 'Q-day3' && r.z && r.oneTry && r.unsigned === 0
    && r.maxInflight <= 1
    && (r.kind === 'nobase' ? r.gets === 1 : r.kind === 'older' ? r.gets === 2 : r.kind === 'latch' ? r.at13.said === 0 && r.at13.shown === 'P-name' && r.x2 === 'Q-x2' && r.x2disk === 'Q-x2'
      : r.kind === 'slow20' ? r.gets >= 2 : r.kind === 'past40' ? r.takenAt > 12 * 60000 && r.takenAt < 16 * 60000 : r.kind === 'reset' ? r.takenAt > 12 * 60000 && r.takenAt < 12 * 60000 + 30000 : r.gets === 3);
  ok(rows.every(good),
    `ROUND 11, MUST 1 — THE DEFERRAL ASKS UNTIL THE STATE COMES: (a) no base, the answer before any state ⇒ «${(rows[0].said[0] || {}).text || '—'}…» once over «${(rows[0].said[0] || {}).rendered}» after ${rows[0].gets} GET; (b) GETs hung / 503 twice ⇒ taken back at the ${rows[1].gets}rd / ${rows[2].gets}rd ask, an older state first ⇒ at the ${rows[3].gets}nd — the sentence once each, after the rows (${rows.map((r) => r.gaps).join('/')} gaps); every paced ask ONE GET with a 15 s signal (${rows.every((r) => r.oneTry && !r.unsigned)}); round 12 — a hub answering the GET in 20 s ⇒ taken back at the ${rows[5].gets}nd ask (the give-up lengthens with the pace: 15 s, 30 s …); past 40 asks it still asks, every 5 min ⇒ taken back at ${Math.round((rows[6].takenAt || 0) / 1000)} s after waking, no reconnect, no broadcast; a state taken after 12 min of failed asks ⇒ an ask at once, taken back at ${Math.round((rows[7].takenAt || 0) / 1000)} s; at most ${Math.max(...rows.map((r) => r.maxInflight))} GET in flight; (c) the latch: 12 min of failed asks (${rows[4].at13.gets} GETs, the row still «${rows[4].at13.shown}», no word), then a beaten rename ⇒ asked again: both taken back («${rows[4].shown}», «${rows[4].x2}»), the sentence once`, rows.filter((r) => !good(r)));
}
{
  // ROUND 11, MUST 2 — ONE VALUE IS BOUNDED (store10 S2, refute-store10-0 bigv.mjs: ONE config field of 1.5 M keys held the hub 9 s, a
  // 24 M-element array 16 s — master 2.9 s / 0.9 s for the same content): a value is at most UO.MAX_VALUE_CHARS of JSON (the owner's
  // largest real value is 139 characters); bigv's two shapes AT the bound are taken, one past it refused by name with the file
  // unchanged — at the route and at the page (alone, said once); the walk that refuses it STOPS at the bound (counted in work over an
  // array of n vs 2n elements); a value of 100 000 keys is refused by name at the ops door and at the whole-key door
  // (round 12: the bound is the NUMBER 16 384 — what the FILE holds: JSON.stringify(value, null, 2) and 8 spaces a line, the value sitting
  // four levels into the indented state; each shape is built by that measure, AT it and one character past it)
  const B = 16384;
  const fileLen = (v) => { const t = JSON.stringify(v, null, 2); return t.length + 8 * (t.split('\n').length - 1); };
  const fill = (mk) => { let lo = 0, hi = 4096; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (fileLen(mk(m, 0)) <= B) lo = m; else hi = m - 1; } const v = mk(lo, 0); const pad = B - fileLen(v); return mk(lo, pad); };
  const objOf = (over) => { const v = fill((n, pad) => { const o = { pad: 'p'.repeat(pad) }; for (let i = 0; i < n; i++) o['k' + i] = i % 10; return o; }); if (over) v.pad += 'p'; return v; };
  const arrOf = (over) => { const v = fill((n, pad) => ['p'.repeat(pad), ...Array.from({ length: n }, () => 0)]); if (over) v[0] += 'p'; return v; };
  const strOf = (over) => 'v'.repeat(B - 2 + (over ? 1 : 0));
  const w = createWorld({ seed: 550, sessions: mkSessions(2) });
  const file = () => fs.readFileSync(path.join(w.dataDir, 'user-state.json'), 'utf8');
  const put = (seq, value) => w.call(w.H.ops, { batches: [{ batch: 'pgvalue0001:' + seq, age: 0, ops: [{ key: 'sessionConfigs', item: 'claude:cfg', field: 'f' + seq, value }] }] }).body;
  const atObj = put(1, objOf(false)), atArr = put(2, arrOf(false)), atStr = put(3, strOf(false));
  const before = file();
  const overObj = put(4, objOf(true)), overArr = put(5, arrOf(true)), overStr = put(6, strOf(true));
  const exact = fileLen(objOf(false)) === B && fileLen(arrOf(false)) === B && fileLen(objOf(true)) === B + 1;
  const unchanged = file() === before;
  const taken = [atObj, atArr, atStr].every((r) => (r.applied || []).length === 1);
  const refused = [overObj, overArr, overStr].every((r) => ((r.refused || [])[0] || {}).code === 'too-large-value');
  // at the page: a rename past the bound beside an archive ⇒ the archive goes, the long value is refused HERE, said once
  const words = [], sent = [];
  const eng = UO.createSync({ pageId: 'pgvalue0002', setTimer: () => 0, clearTimer: () => { }, say: (k, i) => words.push(k + ':' + (i && i.code)), send: (body) => { sent.push(body); return new Promise(() => { }); } });
  eng.apply({ stateRev: 1, stateEpoch: 'epmwvalue0-aaaa', customNames: {} });
  eng.record([{ key: 'archivedSessions', item: 'claude:a', value: true }, { key: 'customNames', item: 'claude:b', value: 'n'.repeat(B + 1) }]);
  const pageOk = words.join() === 'refused:too-large-value' && sent.length === 1 && sent[0].batches[0].ops.length === 1 && sent[0].batches[0].ops[0].key === 'archivedSessions';
  // the refusing walk is bounded before the work (scripts/work-meter.mjs, a child): one op whose value is an array of n vs 2n elements
  const { judgeInChild, BOUNDED_RATIO } = await import('./work-meter.mjs');
  const walk = judgeInChild({ module: path.join(REPO, 'src/user-state-ops.js'), kind: 'bounded', n: 100000,
    mk: "(n) => ({ batches: [{ batch: 'pgvaluework:1', age: 0, ops: [{ key: 'sessionConfigs', item: 'claude:c', field: 'f', value: new Array(n).fill(0) }] }] })",
    run: '(M, x) => { const r = M.parseRequest(x.batches); return r.error ? 0 : r.list.length; }' });
  // one value of 100 000 keys: refused by name at the ops door AND at the whole-key door (round 12, law C: every door holds a value
  // to the same bound)
  // (the handlers alone, the body already parsed — as express.json hands it)
  const wide = {}; for (let i = 0; i < 100000; i++) wide['key' + i] = i;
  // (round 13: the whole-key door is MASTER'S road and takes what master takes — the same value lands there, stored as sent)
  const resBox = () => { const box = { status: 200, body: null }; box.res = { status(c) { box.status = c; return box.res; }, json(o) { box.body = o; return box.res; } }; return box; };
  const wideBox = resBox(), wholeBox = resBox();
  handlerOf(w.P.router, 'patch', '/api/user-state/batches')({ body: { batches: [{ batch: 'pgvalue0001:7', age: 0, ops: [{ key: 'sessionConfigs', item: 'claude:cfg', field: 'f7', value: wide }] }] }, query: {}, params: {}, headers: {} }, wideBox.res, () => { });
  handlerOf(w.P.router, 'patch', '/api/user-state')({ body: { sessionConfigs: { 'claude:cfg2': { f7: wide } } }, query: {}, params: {}, headers: {} }, wholeBox.res, () => { });
  const wideR = wideBox.body, wholeR = wholeBox.body;
  ok(exact && taken && refused && unchanged && pageOk && walk.ok && ((wideR.refused || [])[0] || {}).code === 'too-large-value' && wholeBox.status === 200 && Object.keys(((w.serverState().sessionConfigs || {})['claude:cfg2'] || {}).f7 || {}).length === 100000,
    `ROUND 11, MUST 2 — ONE VALUE IS BOUNDED (${B} characters of JSON): an object of many keys, a long array, a string AT the bound ⇒ taken; one past each ⇒ refused by name («too-large-value»), the file unchanged (${unchanged}); at the page a value past it is refused alone, said once, the archive beside it sent; the refusing walk bounded in work (${walk.n} → ${2 * walk.n} elements ×${(walk.r || 0).toFixed(2)} ≤ ${BOUNDED_RATIO}); a value of 100 000 keys refused by name at the ops door («${((wideR.refused || [])[0] || {}).code}») and TAKEN at the whole-key door (${wholeBox.status} — round 13: master's road takes what master takes)`, { taken, refused, unchanged, pageOk, walk: walk.err || walk, words, wide: wideR, whole: wholeR });
}
{
  // ROUND 11, MUST 2 (the ruling's conditions 1 and 6) — ONE NUMBER, AND THE DIGEST UNCHANGED: the sidebar's own engine splits at the
  // route's bounds (UO.MAX_BODY_BYTES, UO.MAX_OPS_PER_REQUEST — the 413 and the too-many-ops of every user-state door read the same
  // constants); the digest, now fed without building the ops' JSON, is BYTE-IDENTICAL to FNV-1a over JSON.stringify(ops) — over 3 000
  // seeded random op lists (quotes, backslashes, control characters, lone and paired surrogates, U+2028, numbers, nested values,
  // integer-like keys, undefined fields, junk entries)
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 555, sessions: mkSessions(2) });
  const P = await addPage(w, Sb, 'P');
  const b = P._userSync().bounds;
  const same = b.maxRequestBytes === UO.MAX_BODY_BYTES && b.maxRequestOps === UO.MAX_OPS_PER_REQUEST;
  const fnvJson = (ops) => { const t = JSON.stringify(ops); let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
  let seed = 4242; const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const ch = ['a', '"', '\\', '\n', '\u0001', '\u001f', ' ', ' ', '😀', '\ud800', '\udc00', 'é', '\t', '\u007f', '*', '+'];
  const str = () => Array.from({ length: Math.floor(rnd() * 9) }, () => ch[Math.floor(rnd() * ch.length)]).join('');
  const val = (d) => { const x = rnd(); if (d > 2 || x < 0.3) return str(); if (x < 0.45) return Math.floor(rnd() * 1e6) / 7; if (x < 0.5) return rnd() < 0.5; if (x < 0.55) return null; if (x < 0.8) { const o = {}; for (let i = 0; i < 3; i++) o[rnd() < 0.3 ? String(i) : str()] = val(d + 1); return o; } return [val(d + 1), null]; };
  let diff = 0;
  for (let n = 0; n < 3000; n++) {
    const ops = Array.from({ length: 1 + (n % 3) }, () => { const o = { key: 'customNames', item: str() || 'x', value: val(0) }; if (rnd() < 0.2) o.member = str(); if (rnd() < 0.1) o.field = undefined; if (rnd() < 0.1) o['7'] = str(); return o; });
    if (n % 60 === 0) ops.push(null, 3, 'y', [1]);
    if (UO.digestOf(ops) !== fnvJson(ops)) diff++;
  }
  ok(same && diff === 0,
    `ROUND 11, MUST 2 — ONE NUMBER, THE DIGEST UNCHANGED: the sidebar's engine splits at ${b.maxRequestBytes} B / ${b.maxRequestOps} ops = the route's ${UO.MAX_BODY_BYTES} / ${UO.MAX_OPS_PER_REQUEST} (${same}); the digest fed without building the JSON = FNV over JSON.stringify on ${3000 - diff} of 3000 random op lists`, { b, diff });
}
{
  // ROUND 11, MODERATE — NO NAME SPELLS ANOTHER SLOT (store10 S5): an item named '*' renamed, then another page's OLDER waiting rename of
  // X ⇒ applied (round 10: '*' spelled the import's key-wide slot, X came back «superseded»); a member named '+' added to g and taken
  // out again, then an OLDER delete of g ⇒ g goes WHOLE (with '+' spelling g's own slot, the later member fact made the delete
  // «superseded»: g stayed, empty); a member 'b<TAB>' added to group 'a', then an OLDER delete of the group 'a<TAB>b' ⇒ it goes whole
  // (unescaped, the two spell one slot: it stayed, empty)
  const w = createWorld({ seed: 546, sessions: mkSessions(2) });
  const ops = (page, seq, age, list) => w.call(w.H.ops, { batches: [{ batch: `${page}:${seq}`, age, ops: list }] }).body;
  const M = (item, member, value = true) => ({ key: 'sessionGroups', item, member, value });
  ops('pgseedpage1', 1, 0, [{ key: 'customNames', item: 'claude:x', value: 'orig' }, M('g', 'claude:m1'), M('g', 'claude:m2'), M('a\tb', 'claude:m3'), M('a', 'claude:m4')]);
  await w.run(w.now() + 20000);
  ops('pgstarpage1', 1, 0, [{ key: 'customNames', item: '*', value: 'star' }]);
  const q1 = ops('pgolderpag1', 1, 5000, [{ key: 'customNames', item: 'claude:x', value: 'Q-name' }]);
  await w.run(w.now() + 20000);
  ops('pgstarpage1', 2, 0, [M('g', '+')]);
  ops('pgstarpage1', 3, 0, [M('g', '+', false)]);
  const q2 = ops('pgolderpag1', 2, 5000, [{ key: 'sessionGroups', item: 'g', value: false }]);
  await w.run(w.now() + 20000);
  ops('pgstarpage1', 4, 0, [M('a', 'b\t')]);
  const q3 = ops('pgolderpag1', 3, 5000, [{ key: 'sessionGroups', item: 'a\tb', value: false }]);
  const st = w.serverState();
  const gs = st.sessionGroups || {};
  ok(st.customNames['claude:x'] === 'Q-name' && st.customNames['*'] === 'star' && !('g' in gs) && !('a\tb' in gs) && JSON.stringify(gs.a) === '["claude:m4","b\\t"]',
    `ROUND 11, MODERATE — NO NAME SPELLS ANOTHER SLOT: '*' renamed, then an older rename of X ⇒ «${st.customNames['claude:x']}» (${(q1.applied || []).length ? 'applied' : 'not applied'}); '+' added to g and taken out, then an older delete of g ⇒ ${'g' in gs ? 'g stays ' + JSON.stringify(gs.g) : 'g gone whole'}; 'b<TAB>' added to a, then an older delete of 'a<TAB>b' ⇒ ${'a\tb' in gs ? 'it stays ' + JSON.stringify(gs['a\tb']) : 'gone whole'}`, { q1, q2, q3, gs });
}
{
  // ROUND 11, SMALL 1 — THE GROUP AS THE REQUEST LEAVES IT, MEMBER BY MEMBER (store10 S6: the ordered set's member-REMOVE leg was
  // unpinned): g = [m1, m2, m3], another page decided m3 later; ONE request — batch 1 removes m1, batch 2 re-adds it (it goes to the
  // end), batch 3 removes m1 again, batch 4 deletes g (made before the other page's act) ⇒ batch 4 removes ONLY m2 (m1 is out already, m3
  // was decided later): the ops in order, each slot's fact naming the batch that decided it, g = [m3]
  const T = 1794400000000;
  const fs0 = UO.factStore(); fs0.load({}); const d = fs0.draft();
  d.set(UO.slotOf({ key: 'sessionGroups', item: 'g', member: 'claude:m3', value: true }), { t: T - 1000, page: 'pgsomeone01', counter: 1, digest: null, prev: [] });
  const Mo = (member, value) => ({ key: 'sessionGroups', item: 'g', member, value });
  const req = UO.parseRequest([{ batch: 'pgmembers01:1', age: 9000, ops: [Mo('claude:m1', false)] }, { batch: 'pgmembers01:2', age: 8000, ops: [Mo('claude:m1', true)] },
    { batch: 'pgmembers01:3', age: 7000, ops: [Mo('claude:m1', false)] }, { batch: 'pgmembers01:4', age: 3000, ops: [{ key: 'sessionGroups', item: 'g', value: false }] }]);
  const state = { sessionGroups: { g: ['claude:m1', 'claude:m2', 'claude:m3'] } };
  const j = UO.judgeRequest(d, req.page, req.list, state, T);
  const after = UO.applyOps(state, j.ops).sessionGroups.g;
  const counterOf = (m) => { const f = d.get(UO.slotOf({ key: 'sessionGroups', item: 'g', member: m, value: false })); return f && f.counter; };
  const opsTxt = j.ops.map((o) => (o.value ? '+' : '-') + o.member).join(' ');
  ok(opsTxt === '-claude:m1 +claude:m1 -claude:m1 -claude:m2' && JSON.stringify(after) === '["claude:m3"]' && counterOf('claude:m1') === 3 && counterOf('claude:m2') === 4 && counterOf('claude:m3') === 1,
    `ROUND 11, SMALL 1 — THE GROUP AS THE REQUEST LEAVES IT: remove / re-add / remove m1, then a delete of g with m3 kept ⇒ ops «${opsTxt}», g = ${JSON.stringify(after)}, m1 decided by batch ${counterOf('claude:m1')}, m2 by ${counterOf('claude:m2')}, m3 by the other page`, { opsTxt, after });
}
{
  // ROUND 11, SMALL 3 — A REFUSAL IS SAID WHERE THE SCREEN CHANGES (as the 7-day rule): P renames X 'a', then 'b' — the first refused
  // ⇒ nothing said (the row shows 'b' before and after); the second refused instead ⇒ the row goes back to 'a', said once
  const cell = (refuse) => new Promise((done) => {
    const words = [], sends = [];
    const eng = UO.createSync({ pageId: 'pgmasked001', setTimer: () => 0, clearTimer: () => { }, say: (k) => words.push(k), send: (body) => new Promise((res) => sends.push({ body, res })) });
    eng.apply({ stateRev: 1, stateEpoch: 'epmwmask00-aaaa', customNames: {} });
    eng.record([{ key: 'customNames', item: 'claude:x', value: 'a' }]);
    eng.record([{ key: 'customNames', item: 'claude:x', value: 'b' }]);
    const tgt = sends[refuse === 1 ? 0 : 1];
    tgt.res({ ok: true, rev: 2, epoch: 'epmwmask00-aaaa', refused: [{ batch: 'pgmasked001:' + refuse, code: 'bad-value' }], old: [], applied: [], superseded: [] });
    setTimeout(() => done({ words, shown: eng.view().customNames['claude:x'] }), 5);
  });
  const masked = await cell(1), plain = await cell(2);
  ok(!masked.words.length && masked.shown === 'b' && plain.words.join() === 'refused' && plain.shown === 'a',
    `ROUND 11, SMALL 3 — A REFUSAL IS SAID WHERE THE SCREEN CHANGES: the first of two renames refused ⇒ ${masked.words.length} words, «${masked.shown}» on the row; the second refused ⇒ «${plain.words.join()}» once, «${plain.shown}»`, { masked, plain });
}
{
  // MUST 3 — A PERSON'S IMPORT IS AN ACT AT ITS TIME (words9/drv/w5omit.mjs C, store9/drv/s3b-waiting.mjs E2): (C) P archives X — it
  // LANDS, the answer lost; a config import without X at +10 s; P's re-send at +20 s ⇒ disk as the import wrote it. (E2) P's archive of
  // X never landed before the import; re-sent after it ⇒ disk as the import wrote it (the import replaced the key whole). And a stale
  // .392 tab's whole key stays an omission (MUST 4 of round 9, above)
  const scene = async (cell) => {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 520, sessions: mkSessions(4) });
    const P = await r7page(w, Sb, 'P');
    await w.run(600);
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const X = w.sessions[1], I1 = w.sessions[2];
    let hold = true;
    if (cell === 'C') P.__lag = (m) => ({ toServer: 20, toPage: 20, drop: m === 'patch' && hold });
    else P.__lag = (m) => ({ toServer: m === 'patch' && hold ? 1e9 : 20, toPage: 20, drop: false });
    P.toggleArchive(X);
    await w.run(w.now() + 10000);
    const imp = handlerOf(w.P.router, 'post', '/api/config/import');
    const state = { stateVersion: 2, starredSessions: [], archivedSessions: [I1.sessionKey], archivedFolders: [], customNames: {}, sessionModes: {}, sessionConfigs: {}, sessionGroups: {}, groupFolders: {} };
    const r = w.call(imp, { file: { app: 'vibespace-config', sections: { userState: state } }, sections: ['userState'] });
    hold = false; P.__lag = null;
    await w.run(w.now() + 60000);   // P's automatic re-send (the paced probe) at its time
    const st = w.serverState();
    return { cell, import: r.status, archived: st.archivedSessions.slice().sort(), want: [I1.sessionKey] };
  };
  const C = await scene('C'), E2 = await scene('E2');
  ok(C.import === 200 && E2.import === 200 && JSON.stringify(C.archived) === JSON.stringify(C.want) && JSON.stringify(E2.archived) === JSON.stringify(E2.want),
    `MUST 3 — AN IMPORT IS AN ACT AT ITS TIME: an archive that landed (answer lost) and one that never did, both re-sent after a config import without them ⇒ disk as the import wrote it (C ${JSON.stringify(C.archived.length)} item, E2 ${JSON.stringify(E2.archived.length)} item — the import's own)`, { C, E2 });
}
{
  // MUST 4 — NO LEGAL REQUEST HOLDS THE LOOP LONGER THAN MASTER'S WORST: a request is bounded by its ops (20 000 in all — one full
  // select-all batch); one over is refused by name with the file unchanged; a page holding more than one request's worth lands every
  // act, in order, with no word
  const w = createWorld({ seed: 530, sessions: mkSessions(2) });
  const file = () => fs.readFileSync(path.join(w.dataDir, 'user-state.json'), 'utf8');
  w.call(w.H.ops, { batches: [{ batch: 'pgbound0001:1', age: 0, ops: [{ key: 'starredSessions', item: 'claude:s0', value: true }] }] });
  const before = file();
  // (two batches: a full select-all and one more act — the bound counts ops across a request's batches)
  const ops = (n, from) => Array.from({ length: n }, (_, i) => ({ key: 'archivedSessions', item: 'claude:b' + (from + i), value: true }));
  const OPS = 5000;   // (round 12: the bound as a NUMBER — a constant that moves, or a bound removed, is a named red here, never a 1e9-op array)
  const over = w.call(w.H.ops, { batches: [{ batch: 'pgbound0002:1', age: 0, ops: ops(OPS, 0) }, { batch: 'pgbound0002:2', age: 0, ops: ops(1, OPS) }] });
  const unchanged = file() === before;
  // THE BOUND'S WORST REQUEST, TIMED against a CONTROL measured in this run (the lane's bench: 20 000 fields on ONE conversation's
  // config — round 9 copied the config per op, 92 s, ×600 the control; the kb states the ms: 152, master's worst legal request 816):
  // the control is a select-all — ONE batch of 20 000 archives — through the route on a hub of its own
  const fields = (n, from) => Array.from({ length: n }, (_, i) => ({ key: 'sessionConfigs', item: 'claude:cfgworst', field: 'f' + (from + i), value: from + i }));
  const wc = createWorld({ seed: 532, sessions: mkSessions(2) });
  const c0 = process.hrtime.bigint();
  const ctl = wc.call(wc.H.ops, { batches: [{ batch: 'pgboundctl1:1', age: 0, ops: ops(OPS, 0) }] });
  const ctlMs = Number(process.hrtime.bigint() - c0) / 1e6;
  const wb = createWorld({ seed: 531, sessions: mkSessions(2) });   // (its own hub: the page below must not carry a 20 000-field config in its base)
  const t0 = process.hrtime.bigint();
  const atBound = wb.call(wb.H.ops, { batches: [{ batch: 'pgbound0002:1', age: 0, ops: fields(OPS - 1, 0) }, { batch: 'pgbound0002:2', age: 0, ops: fields(1, OPS) }] });
  const worstMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const cfgN = Object.keys(wb.serverState().sessionConfigs['claude:cfgworst'] || {}).length;
  // the page (the engine, its request bound scaled to 50 ops): 130 acts made while the hub takes nothing ⇒ every request ≤ 50 ops, the
  // rest at each answer; all 130 land, in act order, with no word
  const sizes = [], order = [], words = [];
  let down = true;
  const eng = UO.createSync({ pageId: 'pgbound0003', maxRequestOps: 50, setTimer: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), clearTimer: (t) => clearTimeout(t), say: (k) => words.push(k),
    send: (body) => { if (down) return Promise.reject(new TypeError('Failed to fetch')); sizes.push(body.batches.reduce((n, b) => n + b.ops.length, 0)); const r = w.call(w.H.ops, body); order.push(...(r.body.applied || [])); return Promise.resolve({ ok: true, rev: r.body.rev, epoch: r.body.epoch, refused: r.body.refused, old: r.body.old }); } });
  eng.apply(w.call(w.H.get).body);
  for (let i = 0; i < 130; i++) eng.record([{ key: 'customNames', item: 'claude:n' + i, value: 'v' + i }]);
  down = false;
  eng.resend();
  for (let k = 0; k < 2000 && eng.pending(); k++) await new Promise((r) => setImmediate(r));   // (turns of the loop, not sleeps — round 11: 0.3 s of the row)
  const names = w.serverState().customNames;
  const arch = Array.from({ length: 130 }, (_, i) => names['claude:n' + i] === 'v' + i).filter(Boolean).length;
  const inOrder = order.every((id, k) => k === 0 || Number(id.split(':')[1]) > Number(order[k - 1].split(':')[1]));
  ok(over.status === 400 && over.body.code === 'too-many-ops' && unchanged && atBound.status === 200 && atBound.body.applied.length === 2 && cfgN === OPS && ctl.status === 200 && worstMs < 5 * ctlMs && arch === 130 && inOrder && sizes.every((n) => n <= 50) && !words.length,
    `MUST 4 — A REQUEST'S OP BOUND (${UO.MAX_OPS_PER_REQUEST} ops in all): ${UO.MAX_OPS_PER_REQUEST + 1} ⇒ ${over.status} «${over.body.code}», the file unchanged (${unchanged}); ${UO.MAX_OPS_PER_REQUEST} — the worst shape, fields on ONE config — ⇒ ${atBound.status} in ${worstMs.toFixed(0)} ms, ×${(worstMs / ctlMs).toFixed(2)} a select-all's ${ctlMs.toFixed(0)} ms measured beside it (≤ 5; round 9's config copied per op: ×600); a page holding more than a request's worth (130 acts, the bound scaled to 50) sends requests of ${[...new Set(sizes)].join(' / ')} ops and lands all ${arch}, in act order (${inOrder}), no word`, { over: over.body, sizes, arch, inOrder, words });
}
{
  // MUST 4 — THE BOUND'S WORST SHAPES ARE LINEAR (round 10, the lane's own bench, logs/bench/worst10.mjs): 20 000 member adds to ONE group
  // in one request held the hub 23 s — the judge re-applied the whole group per member op; 20 000 week-old member adds the state holds
  // scanned the group per op; a group delete another page kept a member of re-applied the group per member. Counted in WORK (a child):
  // n → 2n of each, together, ×≈2 (the config copied per field op is native work no meter sees: MUST 4's at-bound request, above, is
  // 20 000 fields on one config, TIMED)
  const { judgeInChild, LINEAR_BOUND } = await import('./work-meter.mjs');
  const groupsLin = judgeInChild({ module: path.join(REPO, 'src/user-state-ops.js'), kind: 'linear', n: 1000,
    mk: "(n) => { const M = (m, v = true) => ({ key: 'sessionGroups', item: 'g', member: m, value: v }); const members = Array.from({ length: n }, (_, i) => 'claude:m' + i); const T = 1794400000000;" +
      " return { add: Array.from({ length: n }, (_, i) => ({ batch: 'pgworstadd1:' + (i + 1), age: 0, ops: [M(members[i])] })), held: Array.from({ length: n }, (_, i) => ({ batch: 'pgworstold1:' + (i + 1), age: 8 * 86400000, ops: [M(members[i])] }))," +
      " del: [{ batch: 'pgworstdel1:1', age: 5000, ops: [{ key: 'sessionGroups', item: 'g', value: false }] }], state: { sessionGroups: { g: members } }," +
      " kept: new Map([['g\\t1:g\\t9:claude:m0', { t: T - 1000, page: 'pgsomeone01', counter: 1, prev: [] }]]) }; }",
    run: "(M, x) => { const T = 1794400000000; let n = 0; const one = (facts, list, st) => { const r = M.parseRequest(list); if (r.error) return 0; const j = M.judgeRequest(facts, r.page, r.list, st, T); M.applyOps(st, j.ops); return j.ops.length; };" +
      " n += one(M.factStore().draft(), x.add, {}); n += one(M.factStore().draft(), x.held, x.state); const f = M.factStore(); f.load({}); const d = f.draft(); for (const [k, v] of x.kept) d.set(k, v); n += one(d, x.del, x.state); return n; }" });
  ok(groupsLin.ok,
    `MUST 4 — THE BOUND'S WORST SHAPES ARE LINEAR: n member adds to one group + n week-old adds the state holds + a group of n deleted with a member kept, ${groupsLin.n} → ${2 * groupsLin.n} ⇒ ×${(groupsLin.r || 0).toFixed(2)} in work (≤ ${LINEAR_BOUND}; the group re-applied per op reads ×4)`, groupsLin.err || groupsLin);
}
{
  // SMALL 1 — A VALUE THE ROUTE WOULD REFUSE WHOLE IS REFUSED AT THE PAGE, ALONE (words9/drv/w3deep.mjs): a config value 40 levels deep
  // beside an archive ⇒ the archive lands, the deep value never travels, ONE refusal
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 540, sessions: mkSessions(4) });
  const p = await r7page(w, Sb, 'P');
  await w.run(600);
  w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
  const sent = [];
  const f = p.__fetch.bind(p);
  p.__fetch = (u, o) => { if (o && o.method === 'PATCH') sent.push(o.body); return f(u, o); };
  const deep = JSON.parse('['.repeat(40) + ']'.repeat(40));
  p.toggleArchive(w.sessions[1]);
  p.setSessionConfig(w.sessions[2], { model: deep });
  await w.run(w.now() + 10000);
  const st = w.serverState();
  ok(st.archivedSessions.includes(w.sessions[1].sessionKey) && !sent.some((b) => b.includes('[[[[[[[[[[')) && p.__toasts.length === 1 && /nested too deep/.test(p.__toasts[0].text) && !(st.sessionConfigs[w.sessions[2].sessionKey] || {}).model,
    `SMALL 1 — REFUSED AT THE PAGE, ALONE: a value 40 deep beside an archive ⇒ the archive lands, the deep value never sent, «${(p.__toasts[0] || {}).text}» once`, { toasts: p.__toasts, sent: sent.length });
}
{
  // SMALL 2 — ONE BOUND FOR EVERY FACT THE ROUTE WRITES AND READS (store9/drv/s7-read.mjs, s7b): five 64-character page ids on one slot,
  // 15-digit counters, their digests, an omission mark ⇒ written, read back whole after a restart, and a beaten act's re-send then
  // superseded (never landing over the later change); a counter of 16 digits is refused by name
  const pid = (c) => (c + 'p').repeat(64).slice(0, 64);
  const w = createWorld({ seed: 550, sessions: mkSessions(2) });
  const X = 'claude:xxxx0000-0000-4000-8000-000000000000';
  for (let i = 0; i < 5; i++) { await w.run(w.now() + 1000); w.call(w.H.ops, { batches: [{ batch: `${pid('abcde'[i])}:${999999999999999 - i}`, age: 0, ops: [{ key: 'archivedSessions', item: X, value: i % 2 === 0 }] }] }); }
  const fact = JSON.parse(fs.readFileSync(path.join(w.dataDir, 'user-state.json'), 'utf8'))[UO.FACTS_KEY][UO.slotOf({ key: 'archivedSessions', item: X })];
  restartWorld(w);
  const back = UO.factIn(fact);
  const r = w.call(w.H.ops, { batches: [{ batch: `${pid('b')}:${999999999999999 - 1}`, age: 9000, ops: [{ key: 'archivedSessions', item: X, value: false }] }] });
  const long16 = w.call(w.H.ops, { batches: [{ batch: `${pid('f')}:9999999999999999`, age: 0, ops: [{ key: 'archivedSessions', item: X, value: true }] }] });
  ok(fact.length <= UO.FACT_MAX && back && back.prev.length === 4 && back.prev.every((e) => e[0].length === 64 && e[2]) && (r.body.superseded || []).length === 1 && long16.status === 400,
    `SMALL 2 — ONE BOUND, WRITTEN AND READ: the worst legal fact (${fact.length} characters ≤ ${UO.FACT_MAX}: five 64-character page ids, 15-digit counters, digests) read back whole after a restart; a beaten act's re-send then ${JSON.stringify(r.body.superseded)} superseded; a 16-digit counter ⇒ ${long16.status} by name`, { len: fact.length, back: !!back, r: r.body, long16: long16.body });
}
{
  // ROUND 11 — ONE BOUND FOR A SLOT, WRITTEN AND READ (the writer / reader seam again, found with MUST 2): a group and a member named
  // at the length the route takes (ITEM_MAX each, a tab and a backslash inside — round 12: spelled by their length) ⇒ the member's fact is written AND read back
  // after a restart — the batch's re-send is then «held» (round 10's reader skipped slot keys past 4 200 characters: the fact gone at
  // boot, the re-send applied again over another page's later removal)
  const w = createWorld({ seed: 552, sessions: mkSessions(2) });
  const NAME = 4096;   // (round 12: the bound as a NUMBER)
  const g = ('g\t\\' + 'x'.repeat(NAME)).slice(0, NAME), m = ('m\\\t' + 'y'.repeat(NAME)).slice(0, NAME);
  const add = { batches: [{ batch: 'pglongslot1:1', age: 0, ops: [{ key: 'sessionGroups', item: g, member: m, value: true }] }] };
  const first = w.call(w.H.ops, add);
  const slot = UO.slotOf({ key: 'sessionGroups', item: g, member: m, value: true });
  const onDisk = !!JSON.parse(fs.readFileSync(path.join(w.dataDir, 'user-state.json'), 'utf8'))[UO.FACTS_KEY][slot];
  restartWorld(w);
  const again = w.call(w.H.ops, add);
  // (round 12: a name past 128 characters is spelled by its length and a 64-bit digest — the facts never write a long name: the slot
  // of two 4 096-character names is under 100 characters)
  ok((first.body.applied || []).length === 1 && onDisk && slot.length < 100 && (again.body.held || []).length === 1,
    `ROUND 11 — ONE BOUND FOR A SLOT: a group and a member of ${NAME} characters each (round 12: each spelled by its length and digest — a slot of ${slot.length} characters, < 100) ⇒ its fact written and read back after a restart: the re-send ${(again.body.held || []).length ? 'held' : 'NOT held'}`, { first: first.body, again: again.body, onDisk });
}
{
  // SMALL 3 — A REUSED ID WHOSE ACT'S ONLY SLOT MOVED TO ANOTHER PAGE'S PREV (store9/drv/s4-ids.mjs «owner moved to prev»): P's batch 1
  // archives X; Q's later act on X takes the slot (P:1 into its prev, with its digest); P's id 1 with OTHER ops ⇒ refused by name
  const w = createWorld({ seed: 560, sessions: mkSessions(2) });
  w.call(w.H.ops, { batches: [{ batch: 'pgreuse0001:1', age: 0, ops: [{ key: 'archivedSessions', item: 'claude:rx', value: true }] }] });
  w.call(w.H.ops, { batches: [{ batch: 'pgreuse0002:1', age: 0, ops: [{ key: 'archivedSessions', item: 'claude:rx', value: false }] }] });
  const other = w.call(w.H.ops, { batches: [{ batch: 'pgreuse0001:1', age: 0, ops: [{ key: 'archivedSessions', item: 'claude:ry', value: true }] }] });
  const resend = w.call(w.H.ops, { batches: [{ batch: 'pgreuse0001:1', age: 0, ops: [{ key: 'archivedSessions', item: 'claude:rx', value: true }] }] });
  ok(((other.body.refused || [])[0] || {}).code === 'reused-id' && !w.serverState().archivedSessions.includes('claude:ry') && (resend.body.superseded || []).length === 1,
    `SMALL 3 — A REUSED ID, ITS ACT BEATEN OFF ITS ONLY SLOT: other ops under it ⇒ ${((other.body.refused || [])[0] || {}).code}; its own re-send ⇒ superseded`, { other: other.body, resend: resend.body });
}
// ════════ §23 ROUND 14 — THE PAGE: THE WINDOW'S TITLE REFUSED FIRST TOO; A SERVER WITHOUT THE OPS DOOR SAID ONCE; NO PACE BESIDE A WINDOW ════════
console.log('§23 round 14: the fork-title road refuses before the window\'s title; a server without the ops door is said once; a paced re-send never goes beside a window in flight');
{
  // ROUND 14, small 5(b) — THE FORK-TITLE ROAD REFUSES FIRST TOO (page13 refuse13 R2: setCustomName refused the name at the page, then
  // retitled the open window with it): a name past the bound ⇒ nothing sent, the window's title untouched, the row unchanged, this page's
  // sentence; a short one ⇒ the row, the disk and the title
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 573, sessions: mkSessions(3) });
  const P = await addPage(w, Sb, 'P');
  await w.run(w.now() + 600);
  const X = w.sessions[1];
  const titles = [];
  P.app.syncSessionName = (s, n) => titles.push(n);
  const r0 = w.requests, nameBefore = P.getCustomName(X);
  P.setCustomName(X, 'n'.repeat(16383));
  await w.run(w.now() + 2000);
  const longReqs = w.requests - r0, longTitles = titles.length, longName = P.getCustomName(X), toasts = P.__toasts.map((t) => t.text);
  P.setCustomName(X, 'a fork title');
  await w.run(w.now() + 2000);
  const onDisk = w.serverState().customNames[X.sessionKey];
  ok(longReqs === 0 && longTitles === 0 && longName === nameBefore && toasts.length === 1 && /^This page did not keep a change \(a value larger than any setting\)/.test(toasts[0]) && titles.join() === 'a fork title' && onDisk === 'a fork title',
    `ROUND 14 — THE FORK-TITLE ROAD REFUSES BEFORE THE WINDOW'S TITLE: a fork title of 16 383 characters ⇒ ${longReqs} requests, ${longTitles} window titles, the row «${String(longName).slice(0, 12)}», «${(toasts[0] || '').slice(0, 70)}»; a short one ⇒ the title «${titles.join()}», on disk «${onDisk}»`, { longReqs, longTitles, toasts, titles, onDisk });
}
{
  // ROUND 14, small 5(c) + its follow-up — A SERVER WITHOUT THE OPS DOOR (a downgrade; the minute of an update — page13 roll13 D: 52
  // requests answered 404 over 11 min, the acts shown, never landed, gone at the reload, nothing said). A 404 is not a verdict for 3
  // minutes (the panel's roll14 U: a reloaded tab on the old server for a minute, every act on disk at 60.1 s — round 14 said «reload»
  // at 1.0 s): a streak of a minute says nothing; one past 3 minutes is said ONCE, and taken back when the acts land; a 503 says nothing
  const cell = async (status, forMs) => {
    const words = [], timers = [];
    let sends = 0, clock = 0, up = false, oks = 0;
    const eng = UO.createSync({ pageId: 'pgolder' + status + 'x' + forMs, now: () => clock, mono: () => clock, timeoutMs: 3600000,   // (a send bound apart from the pace's 15 s)
      setTimer: (fn, ms) => { const t = { fn, ms, at: clock + ms }; timers.push(t); return t; }, clearTimer: (t) => { if (t) t.fn = null; }, say: (k) => words.push(k + '@' + Math.round(clock / 1000)),
      send: () => { sends++; if (up) oks++; return Promise.resolve(up ? { ok: true, rev: 9, epoch: 'epmwolder0-aaaa', refused: [], old: [], superseded: [] } : { ok: false, refused: false, status, code: null }); } });
    const settle = async () => { for (let t = 0; t < 3; t++) await new Promise((r) => setImmediate(r)); };
    eng.apply({ stateRev: 1, stateEpoch: 'epmwolder0-aaaa', starredSessions: [] });
    eng.record([{ key: 'starredSessions', item: 'claude:x', value: true }]);
    await settle();
    eng.record([{ key: 'starredSessions', item: 'claude:y', value: true }]);
    await settle();
    let at = null;
    for (let i = 0; i < 80; i++) {   // (the pace's timers fire in their time; the hub has the door again at `forMs`)
      const t = timers.filter((x) => x.fn && x.ms < 3600000).sort((x, y) => x.at - y.at)[0];
      if (!t) break;
      clock = Math.max(clock, t.at);
      if (!up && clock >= forMs) { up = true; at = clock; }
      const fn = t.fn; t.fn = null; fn();
      await settle();
      if (oks) break;
    }
    await settle();
    return { words, sends, landed: oks > 0, at: at && Math.round(at / 1000) };   // (landed: the hub with the door took them — the page keeps them pending until a state that holds them)
  };
  const minute = await cell(404, 60000), long = await cell(404, 300000), c503 = await cell(503, 300000);
  const saidAt = long.words.length ? Number(long.words[0].split('@')[1]) : -1;
  ok(minute.words.length === 0 && minute.landed && long.words.length === 2 && /^not-taken@/.test(long.words[0]) && saidAt >= UO.NOT_TAKEN_WAIT_MS / 1000 && /^taken@/.test(long.words[1]) && long.landed && c503.words.length === 0 && c503.landed,
    `ROUND 14 — A 404 IS NOT A VERDICT FOR ${UO.NOT_TAKEN_WAIT_MS / 60000} MIN: the ops door 404 for a minute ⇒ «${minute.words.join(' | ')}», the acts landed (${minute.landed}); for 5 min ⇒ «${long.words.join(' | ')}» (said at ${saidAt} s, taken back when they landed at ${long.at} s); 503s for 5 min ⇒ ${c503.words.length} words`, { minute, long, c503 });
}
{
  // ROUND 14 FOLLOW-UP — THE WORDS ON THE PAGE (the panel's roll14 U / roll14r): the ops door answers 404 (a tab on the old server) for a
  // minute, then the hub restarts with it ⇒ no word, every act on disk; for 5 minutes ⇒ «These changes are not saved yet …» ONCE, never
  // «reload», then «The changes kept on this page are saved now» once when they land
  const run = async (forMs) => {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 574, sessions: mkSessions(4) });
    const me = await r7page(w, Sb, 'me');
    await w.run(1000);
    w.defaultLag = () => ({ toServer: 30, toPage: 30, drop: false });
    const realOps = w.H.ops;
    w.H.ops = (req, res) => res.status(404).json({ error: 'Cannot PATCH /api/user-state/batches' });
    me.toggleArchive(w.sessions[1]);
    await w.run(w.now() + 500);
    me.toggleStar(w.sessions[2]);
    await w.run(w.now() + forMs);
    w.H.ops = realOps;
    me._fetchUserState();   // (the restart's reconnect GET)
    await w.run(w.now() + 60000);
    const st = w.serverState();
    return { words: me.__toasts.map((x) => x.text).filter((t) => /saved|server|reload/i.test(t)), landed: st.archivedSessions.includes(w.sessions[1].sessionKey) && st.starredSessions.includes(w.sessions[2].sessionKey) && pendingOf(me) === 0 };
  };
  const minute = await run(60000), five = await run(300000);
  ok(minute.words.length === 0 && minute.landed && five.words.length === 2 && /^These changes are not saved yet — the server does not take them \(it may be restarting or older than this page\); they are kept here while this page stays open$/.test(five.words[0]) && five.words[1] === 'The changes kept on this page are saved now' && five.landed,
    `ROUND 14 FOLLOW-UP — THE PAGE NEVER SAYS «RELOAD»: the old server for a minute ⇒ ${minute.words.length} words, every act on disk (${minute.landed}); for 5 minutes ⇒ «${(five.words[0] || '').slice(0, 60)}…», then «${five.words[1] || ''}», every act on disk (${five.landed})`, { minute, five });
}
{
  // ROUND 14, small 5(d) — A PACED RE-SEND NEVER GOES BESIDE A WINDOW IN FLIGHT (page13 split13 e503echo: part 2's 503 armed the pace; an
  // echo re-sent part 2 at once, its answer sent part 3 — and the pace then sent part 4 beside it): one act of 200 in parts of 50, part 2
  // answered 503, a state (an echo) during the pace's wait ⇒ part 2 again; its answer ⇒ part 3; the pace's time passes ⇒ nothing beside
  // it — ONE window in flight throughout, every part sent once more at most
  const sent = [], timers = [];
  let open = 0, maxOpen = 0;
  const eng = UO.createSync({ pageId: 'pgpace50301', maxOps: 50, maxRequestOps: 50, setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: (t) => { if (t) t.fn = null; },
    send: (body) => { open++; maxOpen = Math.max(maxOpen, open); return new Promise((res) => sent.push({ ids: body.batches.map((b) => b.batch).join('+'), res: (r) => { open--; res(r); } })); } });
  const EP = 'epmwpace00-aaaa';
  const settle = async () => { for (let t = 0; t < 4; t++) await new Promise((r) => setImmediate(r)); };
  eng.apply({ stateRev: 1, stateEpoch: EP, archivedSessions: [] });
  eng.record(Array.from({ length: 200 }, (_, i) => ({ key: 'archivedSessions', item: 'claude:a' + i, value: true })));
  sent[0].res({ ok: true, rev: 2, epoch: EP, refused: [], old: [], superseded: [] });
  await settle();
  sent[1].res({ ok: false, refused: false, status: 503, code: null });
  await settle();
  const armed = timers.filter((t) => t.fn && t.ms === UO.RETRY_MS[0]).length;
  eng.apply({ stateRev: 3, stateEpoch: EP, archivedSessions: [] });   // (another page's echo during the pace's wait)
  await settle();
  sent[2].res({ ok: true, rev: 4, epoch: EP, refused: [], old: [], superseded: [] });
  await settle();
  for (const t of timers) if (t.fn && t.ms === UO.RETRY_MS[0]) { const fn = t.fn; t.fn = null; fn(); }   // (the pace's time passes)
  await settle();
  const order = sent.map((x) => x.ids.split('+').length + '@' + x.ids.split('+')[0].split(':')[1]);
  ok(armed === 1 && maxOpen === 1 && sent.length === 4 && sent[1].ids === sent[2].ids,
    `ROUND 14 — NO PACE BESIDE A WINDOW IN FLIGHT: an act of 200 in parts of 50, part 2 answered 503 (the pace armed: ${armed}), an echo in its wait ⇒ requests ${order.join(', ')} — at most ${maxOpen} in flight`, { armed, maxOpen, order });
}

{
  // ROUND 14 — AFTER A WHOLE-BODY REFUSAL THE REST GOES AT ONCE (the pace no longer waits beside a request, so the refusal's answer sends
  // what no request carries, as every answer does): one act of 200 in parts of 50; part 1 refused whole (413) ⇒ part 2 is sent at once
  const sent = [];
  const eng = UO.createSync({ pageId: 'pgrefmore01', maxOps: 50, maxRequestOps: 50, setTimer: () => 0, clearTimer: () => { },
    send: (body) => new Promise((res) => sent.push({ ids: body.batches.map((b) => b.batch).join('+'), res })) });
  eng.apply({ stateRev: 1, stateEpoch: 'epmwrefm00-aaaa', archivedSessions: [] });
  eng.record(Array.from({ length: 200 }, (_, i) => ({ key: 'archivedSessions', item: 'claude:r' + i, value: true })));
  sent[0].res({ ok: false, refused: true, status: 413, code: 'too-large' });
  for (let t = 0; t < 4; t++) await new Promise((r) => setImmediate(r));
  ok(sent.length === 2 && sent[1].ids !== sent[0].ids,
    `ROUND 14 — AFTER A WHOLE-BODY REFUSAL THE REST GOES AT ONCE: part 1 refused whole ⇒ ${sent.length - 1} request at once (${sent[1] ? sent[1].ids.split('+')[0] : 'none'})`, { sent: sent.map((x) => x.ids.slice(0, 40)) });
}

{
  // ROUND 15 (the .397 hosted mirror, test-user-state-echo-chrome red on both tries) — A REQUEST THAT FITS GOES KEEPALIVE: the browser
  // completes it after the tab is gone (a plain one still on its way is cancelled — this harness now models that). Five quick acts and the
  // tab closed while every request is still on its way ⇒ all five keepalive, every act on disk, each once; a select-all of 3 000 (one
  // request past the budget) goes plain; the page's keepalive bodies in flight never pass 48 KiB
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 575, sessions: mkSessions(3010, 4) });
  const P = await addPage(w, Sb, 'P');
  await w.run(w.now() + 600);
  w.defaultLag = () => ({ toServer: 400, toPage: 20, drop: false });   // (every request still on its way 400 ms after it leaves)
  const reqs = [];
  let inKeep = 0, maxKeep = 0;
  const f = P.__fetch.bind(P);
  P.__fetch = (url, opts) => {
    const bytes = Buffer.byteLength(String((opts && opts.body) || '')), keep = !!(opts && opts.keepalive);
    if (opts && opts.method === 'PATCH') { reqs.push({ bytes, keep }); if (keep) { inKeep += bytes; maxKeep = Math.max(maxKeep, inKeep); } }
    const done = () => { if (keep && opts.method === 'PATCH') inKeep -= bytes; };
    return f(url, opts).then((r) => { done(); return r; }, (e) => { done(); throw e; });
  };
  const S = w.sessions;
  const r0 = w.serverState(), rev0 = UO.revOf(r0);
  P.toggleArchive(S[1]); P.toggleArchive(S[2]); P.toggleArchive(S[3]); P.toggleStar(S[4]); P.setCustomName(S[5], 'closed at once');
  const five = reqs.slice(), cancelled0 = w.cancelled || 0;
  endPage(w, P);   // the tab closed AT ONCE — every request still on its way
  await w.run(w.now() + 3000);
  const st = w.serverState();
  const landed = [1, 2, 3].every((i) => st.archivedSessions.includes(S[i].sessionKey)) && st.starredSessions.includes(S[4].sessionKey) && st.customNames[S[5].sessionKey] === 'closed at once';
  // a select-all of 3 000 on a fresh page: its one request past the budget goes plain
  const Q = await addPage(w, Sb, 'Q');
  await w.run(w.now() + 600);
  const g = Q.__fetch.bind(Q), big = [];
  Q.__fetch = (url, opts) => { if (opts && opts.method === 'PATCH') big.push({ bytes: Buffer.byteLength(String(opts.body || '')), keep: !!opts.keepalive }); return g(url, opts); };
  Q.archiveSessions(S.slice(10, 3010));
  await w.run(w.now() + 3000);
  ok(five.length === 5 && five.every((x) => x.keep) && landed && UO.revOf(st) - rev0 === 5 && (w.cancelled || 0) === cancelled0 && maxKeep <= 49152 && big.length >= 1 && big[0].bytes > 49152 && !big[0].keep,
    `ROUND 15 — A REQUEST THAT FITS GOES KEEPALIVE: five acts, the tab closed with all five on their way ⇒ ${five.filter((x) => x.keep).length} keepalive (${five.map((x) => x.bytes).join(' / ')} B), every act on disk ${landed}, ${UO.revOf(st) - rev0} writes, ${(w.cancelled || 0) - cancelled0} cancelled; keepalive in flight at most ${maxKeep} B (≤ 49 152); a select-all of 3 000 ⇒ ${big[0] ? big[0].bytes : 0} B plain (${big[0] && !big[0].keep})`, { five, maxKeep, big: big.slice(0, 2), landed });
}

{
  // ROUND 15 — THE KEEPALIVE BUDGET: (c) it binds, in bytes — renames of 1.5 KB (500 three-byte characters) made while the hub answers nothing (every request carries every
  // unconfirmed batch, so they grow) ⇒ keepalive until 48 KiB are in flight, then plain; never more than 48 KiB in flight; (d) it is
  // given back — 400 one-op acts, each answered before the next (~70 KB in all) ⇒ every one keepalive; (e) a keepalive the browser refuses ⇒ the next
  // send plain, then keepalive again once a send succeeds
  const Sb = await loadPage(STATE_SRC);
  const watch = (p, rejectFirstKeep = false) => {
    const seen = { reqs: [], inKeep: 0, maxKeep: 0, refused: 0 };
    const f = p.__fetch.bind(p);
    p.__fetch = (url, opts) => {
      if (!opts || opts.method !== 'PATCH') return f(url, opts);
      const bytes = Buffer.byteLength(String(opts.body || '')), keep = !!opts.keepalive;
      seen.reqs.push({ bytes, keep });
      if (keep && rejectFirstKeep && !seen.refused) { seen.refused++; return Promise.reject(new TypeError('Failed to fetch (the keepalive quota)')); }
      if (keep) { seen.inKeep += bytes; seen.maxKeep = Math.max(seen.maxKeep, seen.inKeep); }
      const done = () => { if (keep) seen.inKeep -= bytes; };
      return f(url, opts).then((r) => { done(); return r; }, (e) => { done(); throw e; });
    };
    return seen;
  };
  const w = createWorld({ seed: 576, sessions: mkSessions(400, 4) });
  const R = await addPage(w, Sb, 'R');
  await w.run(w.now() + 600);
  const c = watch(R);
  w.defaultLag = () => ({ toServer: 120000, toPage: 20, drop: false });   // (the hub takes nothing for two minutes)
  for (let i = 0; i < 40; i++) R.setCustomName(w.sessions[i], '中'.repeat(500) + i);   // (1.5 KB of UTF-8 in 500 characters: the budget counts BYTES)
  const cKeep = c.reqs.filter((x) => x.keep).length, cPlain = c.reqs.length - cKeep, cMax = c.maxKeep;
  await w.run(w.now() + 200000);
  w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
  const S = await addPage(w, Sb, 'S');
  await w.run(w.now() + 600);
  const d = watch(S);
  for (let i = 0; i < 400; i++) { S.toggleStar(w.sessions[i % 400]); await w.run(w.now() + 100); }   // (~70 KB sent in all — past the budget if it were never given back)
  const T = await addPage(w, Sb, 'T');
  await w.run(w.now() + 600);
  const e = watch(T, true);
  T.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 30000);   // (the refused send is re-sent on the pace — plain)
  T.toggleArchive(w.sessions[2]);
  await w.run(w.now() + 3000);
  const eKinds = e.reqs.map((x) => (x.keep ? 'K' : 'P')).join('');
  ok(cKeep >= 5 && cPlain >= 5 && cMax <= 49152 && cMax > 40000 && d.reqs.length >= 400 && d.reqs.every((x) => x.keep) && e.refused === 1 && /^KPK/.test(eKinds),
    `ROUND 15 — THE KEEPALIVE BUDGET: 40 renames of 1.5 KB with the hub answering nothing ⇒ ${cKeep} keepalive then ${cPlain} plain, at most ${cMax} B in flight (≤ 49 152); 400 acts each answered ⇒ ${d.reqs.filter((x) => x.keep).length} of ${d.reqs.length} keepalive (the budget given back: ${d.reqs.reduce((n, x) => n + x.bytes, 0)} B sent in all); a refused keepalive ⇒ «${eKinds}» (the next plain, then keepalive again)`, { cKeep, cPlain, cMax, dKeep: d.reqs.filter((x) => x.keep).length, eKinds });
}

{
  // ROUND 15 — EXACTLY ONCE WHEN A CLOSED TAB'S REQUESTS LAND AFTER A NEWER PAGE'S (主开发's condition 2): P archives X and stars Y and its
  // tab closes with both requests on their way (keepalive, 3 s to the hub); a new page Q of the same person (a new id) loads and archives
  // Z, which lands first; then P's two requests land (the second carries both acts) ⇒ X and Y once each — three writes in all, P's first
  // act carried twice and held once (its batch id) — and Q's view converges on X, Y, Z
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 577, sessions: mkSessions(10) });
  const S = w.sessions;
  const P = await addPage(w, Sb, 'P');
  await w.run(w.now() + 600);
  const rev0 = UO.revOf(w.serverState()), dup0 = w.dup;
  P.__lag = () => ({ toServer: 3000, toPage: 20, drop: false });
  P.toggleArchive(S[1]); P.toggleStar(S[2]);
  endPage(w, P);
  const Q = await addPage(w, Sb, 'Q');
  await w.run(w.now() + 400);
  Q.toggleArchive(S[3]);
  await w.run(w.now() + 8000);
  const st = w.serverState(), k = (i) => S[i].sessionKey;
  const once = st.archivedSessions.filter((x) => x === k(1)).length === 1 && st.starredSessions.filter((x) => x === k(2)).length === 1;
  const qSees = Q._archivedIds.has(k(1)) && Q._starredIds.has(k(2)) && Q._archivedIds.has(k(3));
  ok(once && st.archivedSessions.includes(k(3)) && UO.revOf(st) - rev0 === 3 && w.dup - dup0 === 1 && qSees && pendingOf(Q) === 0,
    `ROUND 15 — EXACTLY ONCE WHEN A CLOSED TAB'S REQUESTS LAND AFTER A NEWER PAGE'S: X archived and Y starred once (${once}), Z kept; ${UO.revOf(st) - rev0} writes, ${w.dup - dup0} held (P's first act, carried twice); the new page shows all three (${qSees})`, { revs: UO.revOf(st) - rev0, dup: w.dup - dup0, qSees });
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
