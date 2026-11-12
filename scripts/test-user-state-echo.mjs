#!/usr/bin/env node
// AN ECHO NEVER UNDOES WHAT THE PERSON DID AFTER IT WAS ASKED (lane sidebar-echo-order — the owner's incident inc-mwbn2xp8-ks0b,
// 2026-11-11: «我的批量操作一直在回滚»). 122 inline Archive clicks in 55 s on a hub whose loop lagged ~1.9 s: the FIRST
// user-state-updated echo reached the page 44.3 s after the first click (107 clicks made by then), and 73 echoes followed
// over 76 s. Each echo REPLACED the page's whole archived set with what the server held when THAT echo was made (its own echo
// included), and the next click PATCHed the rolled-back list WHOLE — archived conversations came back on the screen, and were
// then erased on the server too. Fixed by src/user-state-ops.js (PURE, shared by the route and the page): the server gives
// every write the next `stateRev`; the page shows the newest server state + its own acts not yet confirmed; a push carries
// what the person changed per item (and per member / per field inside a group / a conversation's config), one batch in
// flight, exactly once by its batch id; a failing write stays shown, is retried and said; a reload keeps what was not confirmed.
// PINS, on the REAL route handlers (src/routes/persistence.js, a temp data dir, a stub socket) and the REAL page code
// (src/lib/sidebar-state.js + sidebar-workbench.js's Manage batch, DOM-free scratch copies), on a VIRTUAL clock:
//   §1 the pure ops · §2 the route (the counter, the two PATCH shapes, exactly once, the refusals, the export, the hook)
//   §3 THE OWNER'S SCENE — 120 archive clicks at 2–5 a second, the server takes nothing for 44 s, echoes in bursts
//   §4 THE WALK — seeded: 2–3 pages, every act kind, delays, reorders, a dropped answer, a reconnect, a page waking with a
//      stale copy, an old whole-key client among them · §5 the Manage-mode batch · §6 a reload before the answer
//   §7 a failure is said · §8 the mutants (the echo applied wholesale; the whole-key push) — RED by name
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const UO = require(path.join(REPO, 'src/user-state-ops.js'));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
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

// ════════ §1 THE PURE OPS ════════
console.log('§1 the ops (src/user-state-ops.js): per item, per member, per field — only what changed');
{
  const before = { archivedSessions: ['claude:a'], customNames: { 'claude:a': 'A' }, sessionConfigs: { 'claude:a': { model: 'opus', effort: 'high' } }, sessionGroups: { g: ['claude:a'] }, groupFolders: { g: ['/p'] } };
  const after = J(before);
  after.archivedSessions.push('claude:b'); after.sessionConfigs['claude:a'].effort = 'low'; after.sessionGroups.g.push('claude:b'); after.customNames['claude:b'] = 'B';
  const ops = UO.diffOps(before, after);
  ok(JSON.stringify(ops) === JSON.stringify([
    { key: 'archivedSessions', item: 'claude:b', value: true }, { key: 'customNames', item: 'claude:b', value: 'B' },
    { key: 'sessionGroups', item: 'g', member: 'claude:b', value: true }, { key: 'sessionConfigs', item: 'claude:a', field: 'effort', value: 'low' }]),
  'diffOps names what changed and nothing else: one archive, one name, ONE MEMBER of a group, ONE FIELD of a config', ops);
  // B-fe9c inside one conversation: another page's model (or the server's own writer) set meanwhile survives this page's effort change
  const server = { archivedSessions: ['claude:a', 'claude:z'], sessionConfigs: { 'claude:a': { model: 'sonnet', effort: 'high', modelLock: 'x' } }, sessionGroups: { g: ['claude:a', 'claude:w'] }, customNames: { 'claude:z': 'Z' } };
  const got = UO.applyOps(server, ops);
  ok(got.sessionConfigs['claude:a'].model === 'sonnet' && got.sessionConfigs['claude:a'].modelLock === 'x' && got.sessionConfigs['claude:a'].effort === 'low'
    && JSON.stringify(got.sessionGroups.g) === '["claude:a","claude:w","claude:b"]' && JSON.stringify(got.archivedSessions) === '["claude:a","claude:z","claude:b"]' && got.customNames['claude:z'] === 'Z',
  'applyOps on what the server HOLDS: a stale page\'s effort change leaves the model another page set standing (B-fe9c inside one conversation), its group add leaves another member, its archive leaves another archive', got);
  ok(JSON.stringify(server.sessionConfigs['claude:a']) === '{"model":"sonnet","effort":"high","modelLock":"x"}', '…and never changes the state it was given (a new object)');
  const del = UO.diffOps({ sessionConfigs: { c: { model: 'm' } }, sessionGroups: { g: ['x'], h: [] }, starredSessions: ['s'] }, { sessionConfigs: {}, sessionGroups: { h: [] }, starredSessions: [] });
  ok(JSON.stringify(del) === JSON.stringify([{ key: 'starredSessions', item: 's', value: false }, { key: 'sessionGroups', item: 'g', value: false }, { key: 'sessionConfigs', item: 'c', field: 'model', value: null }]),
    'a removal is per item too: an unstar, a deleted group, a config emptied FIELD BY FIELD (never «delete the conversation\'s whole config»)', del);
  const emptied = UO.applyOps({ sessionConfigs: { c: { model: 'm' } } }, [{ key: 'sessionConfigs', item: 'c', field: 'model', value: null }]);
  ok(!('c' in emptied.sessionConfigs), 'a config whose last field goes is removed (as setSessionConfig did)');
  const probs = [{ key: 'nope', item: 'x', value: true }, { key: 'archivedSessions', item: '', value: true }, { key: 'archivedSessions', item: 'x', value: 'yes' }, { key: 'sessionConfigs', item: 'x', value: 1 }, { key: 'sessionGroups', item: 'g', member: 'm' }, 5].map(UO.opProblem);
  ok(probs.every(Boolean) && UO.opProblem({ key: 'sessionModes', item: 'x', value: null }) === null, 'opProblem refuses by name: an unknown key, an empty item, a non-boolean set value, a config op without its field, a member op without true/false, a non-object', probs);
  ok(JSON.stringify(UO.parseBatch('pgabc123:7')) === '{"page":"pgabc123","seq":7}' && UO.parseBatch('x:1') === null && UO.parseBatch('pgabc123:0') === null, 'a batch id is <page>:<seq> (seq ≥ 1)');
  ok(!('stateRev' in UO.personKeys({ stateRev: 9, archivedSessions: [] })) && UO.revOf({ stateRev: '12' }) === 12 && UO.revOf({}) === 0, 'stateRev is the server\'s: personKeys drops it, revOf reads it');
}

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
    ["import { t as tr } from './i18n.js'; // sidebar cluster convention", "const tr = (s, p) => String(s).replace(/\\{(\\w+)\\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m));"],
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

/** a world: the real route over a temp data dir, a stub socket, pages, and a virtual clock with a queue of events */
function createWorld({ seed = 1, sessions, lag = null } = {}) {
  const R = rng(seed);
  const dataDir = fs.mkdtempSync(path.join(TMP, 'w-'));
  const P = freshPersistence();
  const clients = new Set();
  const hookSaw = [];
  let now = 0, evSeq = 0;
  const T0 = 1794400000000;   // the world's wall clock at its start (the route's facts and the page's ages read it) — declared BEFORE the setup: the route takes its clock at boot (round 9)
  let w = null;
  P.setup({ dataDir, wss: { clients }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, onUserStateWrite: (st) => hookSaw.push((st.archivedSessions || []).length), userStateClock: () => T0 + now + ((w && w.serverStep) || 0), userStateMono: () => now });
  const H = { get: handlerOf(P.router, 'get', '/api/user-state'), post: handlerOf(P.router, 'post', '/api/user-state'), patch: handlerOf(P.router, 'patch', '/api/user-state'), ops: handlerOf(P.router, 'patch', '/api/user-state/batches'), exp: handlerOf(P.router, 'post', '/api/config/export') };
  const call = (h, body) => { let status = 200, out = null; const res = { status(c) { status = c; return res; }, json(o) { out = J(o); return res; } }; try { h({ body: body === undefined ? undefined : J(body), query: {}, params: {}, headers: {} }, res, () => { }); } catch (e) { status = 500; out = { error: String(e && e.message) }; } return { status, body: out }; };   // (a handler that throws = a 500, as express answers it)
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
/** a reload: the same tab in the same browser, a NEW page (nothing of the old page's acts carries over but what it put on the wire) */
async function reloadPage(w, Sb, p, name = p.__name) { endPage(w, p); return addPage(w, Sb, name, { browser: p.__browser, ss: p.__ss }); }
/** into the back-forward cache (pagehide, persisted) and back (pageshow): the page lives on with what it holds in memory */
function hidePage(w, p) { for (const fn of p.__hide || []) { try { fn(); } catch { } } p.__asleep = true; w.disconnect(p); }
function showPage(w, p) { p.__asleep = false; w.connect(p); p._fetchUserState(); }
/** a background tab: its timers once a minute (Chrome's intensive throttling) — and back */
function freeze(p) { p.__frozen = true; }
function wake(p) { p.__frozen = false; }
/** batch ids the server applied in more than one write (a re-carried batch answered as a duplicate is NOT one) */
const twiceOf = (w) => { const n = new Map(); for (const wr of w.writes) for (const id of wr.pairs || wr.batchesApplied || (wr.batch ? [wr.batch] : [])) n.set(id, (n.get(id) || 0) + 1); return [...n].filter(([, c]) => c > 1).map(([id]) => id); };   // (round 7: one OP applied twice — a batch may apply in parts)
const pageIdOf = (p) => (p && typeof p._userSync === 'function' ? p._userSync().pageId : 'none:' + (p && p.__name));

// ════════ §2 THE ROUTE ════════
console.log('§2 the route (src/routes/persistence.js): the server\'s counter, ops per item, exactly once, the old body, the refusals');
{
  const w = createWorld({ seed: 2, sessions: mkSessions(4) });
  const said = [];
  w.clients.add({ readyState: 1, send: (j) => said.push(JSON.parse(j)) });
  const [a, b, c] = w.sessions.map((s) => s.sessionKey);
  const r0 = w.call(w.H.get).body;
  const r1 = w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgtest01:1', ops: [{ key: 'archivedSessions', item: a, value: true }] }] });
  const r2 = w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgtest01:2', ops: [{ key: 'archivedSessions', item: b, value: true }] }] });
  ok(UO.revOf(r0) === 0 && r1.body.rev === 1 && r2.body.rev === 2 && said.length === 2 && UO.revOf(said[1].state) === 2, 'every write answers the rev that took it (+1 each) and its broadcast carries the same stateRev', { r1: r1.body, r2: r2.body, said: said.map((m) => UO.revOf(m.state)) });
  const again = w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgtest01:2', ops: [{ key: 'archivedSessions', item: b, value: true }] }] });   // (its own re-send: the SAME ops — round 9)
  // round 5: a request carries every batch its page has not seen confirmed — one applied already (a duplicate) and a new one
  // that changes nothing on what the server holds (smaller 2: no write, no new rev, no broadcast)
  const both = w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgtest01:2', ops: [{ key: 'archivedSessions', item: b, value: true }] }, { batch: 'pgtest01:3', ops: [{ key: 'archivedSessions', item: a, value: true }] }] });
  ok(JSON.stringify(again.body.held) === JSON.stringify(['pgtest01:2']) && again.body.rev === 2 && JSON.stringify(both.body.held) === JSON.stringify(['pgtest01:2']) && JSON.stringify(both.body.applied) === JSON.stringify(['pgtest01:3']) && both.body.rev === 2 && said.length === 2 && w.hookSaw.length === 2 && JSON.stringify(w.call(w.H.get).body.archivedSessions) === JSON.stringify([a, b]),
    'EXACTLY ONCE: a re-sent batch is its own page\'s duplicate (held — its slot was last decided by it); a request carrying it beside a new batch applies only the new one, in the body\'s order — and one that changes no value writes no new rev, no broadcast, no hook (its facts alone)', [again.body, both.body, said.length]);
  const old = w.call(w.H.patch, { customNames: { [c]: 'old page' } });
  ok(old.body.rev === 3 && w.call(w.H.get).body.customNames[c] === 'old page' && JSON.stringify(w.call(w.H.get).body.archivedSessions) === JSON.stringify([a, b]), 'an OLD body (whole top-level keys, no ops) merges as before — and is a write like any other (rev 3)', old.body);
  const post = w.call(w.H.post, { ...w.call(w.H.get).body, stateRev: 999 });
  ok(post.body.rev === 4 && UO.revOf(w.call(w.H.get).body) === 4, 'stateRev is the SERVER\'s: a whole-state POST (a restore) that carries one gets the next number, never its own', post.body);
  // smaller 1: a batch the server refuses is refused ON ITS OWN, by name — its request's other batches apply — and the page's
  // floor moves past it (no hole is kept: a re-send of it is a duplicate)
  const bad = w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgtest01:4', ops: [{ key: 'archivedSessions', item: a, value: true }, { key: 'sessionConfigs', item: a, value: 'x' }] }, { batch: 'pgtest01:5', ops: [{ key: 'archivedSessions', item: b, value: true }] }, { batch: 'pgtest01:6', ops: [] }] });
  const badAgain = w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgtest01:4', ops: [{ key: 'archivedSessions', item: a, value: true }, { key: 'sessionConfigs', item: a, value: 'x' }] }] });   // the same refused batch again
  const shapes = [
    { batches: [{ batch: 'nope', ops: [] }] },
    { batches: [{ batch: 'pgtest09:2', ops: [] }, { batch: 'pgtest09:1', ops: [] }] },
    { batches: [{ batch: 'pgtest09:1', ops: [] }, { batch: 'pgtestXX:2', ops: [] }] },
    { batches: [] },
    { ops: [{ key: 'archivedSessions', item: a, value: false }], batch: 'pgtest09:1' },
    { batches: [{ batch: 'pgtest09:1', ops: [{ key: 'archivedSessions', item: a, value: false }] }], archivedSessions: [] },
  ].map((body) => w.call(w.H.ops || w.H.patch, body));
  // round 6, MUST 3: the whole-key door takes no ops at all (a page of this release never sends it any)
  const oldDoor = w.call(w.H.patch, { batches: [{ batch: 'pgtest09:1', ops: [{ key: 'archivedSessions', item: a, value: false }] }], born: 1, seq: 1 });
  ok(bad.status === 200 && JSON.stringify(bad.body.applied) === JSON.stringify(['pgtest01:5']) && bad.body.refused.length === 2 && bad.body.refused[0].batch === 'pgtest01:4' && /^op 1: a field key names its field/.test(bad.body.refused[0].error) && /non-empty list of ops/.test(bad.body.refused[1].error)
    && (badAgain.body.refused || []).length === 1 && badAgain.body.refused[0].batch === 'pgtest01:4' && shapes.every((r) => r.status === 400) && /'<page>:<seq>'/.test(shapes[0].body.error) && /oldest first/.test(shapes[1].body.error) && /ONE page/.test(shapes[2].body.error) && /non-empty list/.test(shapes[3].body.error) && /whole top-level keys beside batches \(ops, batch\)/.test(shapes[4].body.error) && /whole top-level keys beside batches/.test(shapes[5].body.error) && oldDoor.status === 400 && /ops go to PATCH \/api\/user-state\/batches/.test(oldDoor.body.error)
    && UO.revOf(w.call(w.H.get).body) === 4 && JSON.stringify(w.call(w.H.get).body.archivedSessions) === JSON.stringify([a, b]),
    'a refusal names its batch and its op — refused ON ITS OWN (the good batch beside it applies; sent again, it is refused again, by name); a malformed body is refused whole, by name (a bad id, not oldest first, two pages, none, the round-4 {ops} body, whole keys beside batches); the whole-key door takes no ops', [bad.body, badAgain.body, shapes.map((r) => r.body.error), oldDoor.body]);
  const cfg = w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgtest02:1', ops: [{ key: 'sessionConfigs', item: a, field: 'model', value: 'opus' }] }] });
  const cfg2 = w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgtest03:1', ops: [{ key: 'sessionConfigs', item: a, field: 'effort', value: 'low' }] }] });
  ok(cfg.body.rev === 5 && cfg2.body.rev === 6 && JSON.stringify(w.call(w.H.get).body.sessionConfigs[a]) === '{"model":"opus","effort":"low"}', 'two pages\' field ops on ONE conversation\'s config both stand (B-fe9c inside a conversation)', w.call(w.H.get).body.sessionConfigs);
  ok(w.hookSaw.length === 6 && w.hookSaw[0] === 1 && w.hookSaw[1] === 2, 'the server\'s own hook (onUserStateWrite — an archive ends its groups\' waits) fires for an ops write exactly as for a whole write', w.hookSaw);
  // the counter survives a restart (the file holds it); the export carries the person's keys only
  const P2 = freshPersistence();
  P2.setup({ dataDir: w.dataDir, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, userStateClock: () => (w.T0 || 0) + w.now() + (w.serverStep || 0), userStateMono: () => w.now() });
  const after = w.call((handlerOf(P2.router, 'patch', '/api/user-state/batches') || handlerOf(P2.router, 'patch', '/api/user-state')), { batches: [{ batch: 'pgtest04:1', ops: [{ key: 'starredSessions', item: a, value: true }] }] });
  ok(after.body.rev === 7, 'a restart continues the counter from the file (7 after 6), never from zero', after.body);
  let exported = null;
  await new Promise((resolve) => { handlerOf(P2.router, 'post', '/api/config/export')({ body: { sections: ['userState'] }, query: {}, params: {}, headers: {}, app: { locals: {} } }, { status() { return this; }, json(o) { exported = o; resolve(); }, setHeader() { }, send(o) { exported = typeof o === 'string' ? JSON.parse(o) : o; resolve(); }, end() { resolve(); } }, () => resolve()); setTimeout(resolve, 2000); });
  const us = exported && (exported.sections ? exported.sections.userState : (exported.file && exported.file.sections && exported.file.sections.userState));
  ok(!!us && Array.isArray(us.archivedSessions) && !('stateRev' in us), 'the config export carries the person\'s keys and never stateRev', us ? Object.keys(us) : exported);
}

// ════════ §3 THE OWNER'S SCENE ════════
/** 120 inline Archive clicks at 2–5 a second; the server takes NOTHING for 44 s (its loop saturated) and then one request at
 *  a time; echoes reach the page in bursts. Returns the measured world + whether the law broke. */
async function ownerScene(stateText, { seed = 7, clicks = 120, stall = 44000, gap = [200, 300], reverses = false, phone = false, drop = null } = {}) {
  const Sb = await loadPage(stateText);
  const w = createWorld({ seed, sessions: mkSessions(clicks + 10) });
  let serverFree = 0, burstAt = 0;
  w.defaultLag = () => { const t = Math.max(w.now() + 20, serverFree) - w.now(); serverFree = Math.max(w.now(), serverFree) + 300; return { toServer: t, toPage: 40 + Math.floor(w.R() * 200), drop: false }; };
  w.defaultEcho = () => { const t = w.now(); while (burstAt < t) burstAt += 3000; return burstAt - t + Math.floor(w.R() * 30); };   // echoes delivered in bursts every 3 s
  const page = await addPage(w, Sb, 'owner'), other = phone ? await addPage(w, Sb, 'phone') : null;
  await w.run(1000);   // the page has loaded: its first GET is answered BEFORE the hub stalls (as in the incident)
  serverFree = burstAt = 1000 + stall;   // the stall starts now: the hub takes nothing for `stall` ms, then one request per 300 ms
  // round 6: the saturated loop DROPS the page's socket in the middle; it reconnects at once and its GET waits in the stall too
  if (drop != null) w.at(1000 + drop, () => { w.disconnect(page); w.connect(page); page._fetchUserState(); }, 'socket drop + reconnect');
  const archived = new Set();
  let rolledBack = null, t = 1000, acts = 0;
  for (let i = 0; i < clicks; i++) {
    t += gap[0] + Math.floor(w.R() * gap[1]);
    const s = w.sessions[i];
    w.at(t, () => { page.toggleArchive(s); archived.add(s.sessionKey); acts++; }, 'click');
    if (reverses && i % 10 === 9) { const r = w.sessions[i - 5]; w.at(t + 100, () => { page.toggleArchive(r); archived.delete(r.sessionKey); acts++; }, 'reverse'); }
  }
  const check = () => { if (rolledBack) return; for (const k of archived) if (!page._archivedIds.has(k)) { rolledBack = { at: w.now(), key: k, shown: page._archivedIds.size, done: archived.size }; return; } };
  await w.run(Infinity, check);
  const server = w.serverState();
  const per = new Map();
  for (const wr of w.writes) for (const o of wr.ops || []) { const k = o.key + '|' + o.item + '|' + o.value; per.set(k, (per.get(k) || 0) + 1); }
  const twice = [...per.values()].filter((n) => n > 1).length;
  const said = (re) => page.__toasts.filter((x) => re.test(x.text)).length;
  return { w, page, other, archived, rolledBack, server, acts, twice, requests: w.requests, patches: w.patches, notSaved: said(/Not saved yet/), saved: said(/^Saved/), whole: w.wholeRequests };
}
console.log('§3 THE OWNER\'S SCENE: 120 archive clicks at 2–5 a second, the hub takes nothing for 44 s (the page loaded before), then its echoes in bursts — and the verifier\'s: 300 clicks, 90 s, 30 reversed');
{
  const r = await ownerScene(STATE_SRC);
  ok(!r.rolledBack, 'at NO moment does the page show a conversation the person archived as unarchived again (checked after every request, answer and echo)', r.rolledBack);
  ok(r.server.archivedSessions.length === 120 && r.page._archivedIds.size === 120 && r.archived.size === 120 && r.server.archivedSessions.every((k) => r.page._archivedIds.has(k)), 'at rest the server and the page hold all 120 archives', { server: r.server.archivedSessions.length, page: r.page._archivedIds.size });
  ok(r.patches >= 120 && r.patches <= 130 && !r.twice && pendingOf(r.page) === 0 && [...r.archived].every((k) => r.server.archivedSessions.includes(k)) && r.notSaved === 0 && r.saved === 0 && !r.page.__toasts.length,
    `every act on the wire at the act: ${r.patches} PATCHes for 120 clicks — the base's count (one request a click), each body ONE op instead of the whole list; the late ones re-sent one at a time (a paced probe), never a second copy of each; each applied once; NOTHING said (round 9: no word about waiting, none about arriving — ${r.page.__toasts.length} words); the server ends with exactly the person's 120 acts`, { patches: r.patches, twice: r.twice, notSaved: r.notSaved, saved: r.saved });
  const v = await ownerScene(STATE_SRC, { seed: 901, clicks: 300, stall: 90000, gap: [125, 375], reverses: true, phone: true });
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  ok(!v.rolledBack && same(v.server.archivedSessions, v.archived) && same(v.page._archivedIds, v.archived) && same(v.other._archivedIds, v.archived) && !v.twice && pendingOf(v.page) === 0 && v.patches >= v.acts && v.patches <= v.acts + 15 && v.notSaved === 0 && v.saved === 0 && !v.page.__toasts.length,
    `THE VERIFIER'S SCENE — 300 clicks at 2–8 a second, 30 of them reversed inside the burst, the hub's first answer 90 s late: no rollback; ${v.patches} PATCHes for ${v.acts} acts (${v.patches >= v.acts ? `one per act, as on the base, + ${v.patches - v.acts} paced re-sends — at most one per 15 s bound while the hub is behind` : `${v.acts - v.patches} acts never got a request of their own`}), each body one op instead of the whole list; each applied once; nothing said (${v.page.__toasts.length} words); the server, the page and the phone end with exactly the person's ${v.archived.size} archives`, { rolledBack: v.rolledBack, patches: v.patches, acts: v.acts, twice: v.twice, notSaved: v.notSaved, saved: v.saved, server: v.server.archivedSessions.length, want: v.archived.size });
}

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
console.log('§4 THE WALK: seeded — 2–3 pages, every act kind, delays, reorders, dropped answers, reconnects, a stale waker, an old whole-key client');
{
  const SEEDS = Number(process.env.UEO_SEEDS) || 24, SEED0 = Number(process.env.UEO_SEED0) || 1000;
  const reds = [];
  let dups = 0, olds = 0, writes = 0;
  for (let i = 0; i < SEEDS; i++) {
    const r = await walk(STATE_SRC, SEED0 + i);
    dups += r.dup; olds += r.oldClient ? 1 : 0; writes += r.writes;
    if (r.violations.length || r.serverOff.length || r.pagesOff.length || r.twice.length) reds.push({ seed: r.seed, v: r.violations.slice(0, 2), serverOff: r.serverOff.slice(0, 4), pagesOff: r.pagesOff.slice(0, 2), twice: r.twice });
  }
  ok(!reds.length, `the walk holds over ${SEEDS} seeds from ${SEED0} (${writes} server writes, ${dups} re-sent batches answered once, ${olds} worlds with an old whole-key client): no page ever shows an older value after its own newer act; the server = every slot's last write in its order; every page converges, nothing pending; no batch applied twice — a red prints UEO_SEED0=<seed> UEO_SEEDS=1`, reds.slice(0, 3));
  ok(dups > 0 && olds > 0, 'the walk REACHED its hard roads: dropped answers re-sent and answered once, and old whole-key clients', { dups, olds });
}

// ════════ §5 THE MANAGE-MODE BATCH ════════
console.log('§5 the Manage-mode batch (sidebar-workbench.js _applyManageMarks: ONE push for N marks)');
{
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 5, sessions: mkSessions(12) });
  const p = await addPage(w, Sb, 'manage');
  await w.run(500);
  w.defaultLag = () => ({ toServer: 4000, toPage: 50, drop: false });
  w.defaultEcho = () => 30;
  p._manageMarks = new Map(w.sessions.slice(0, 8).map((s) => [s.sessionKey, { archive: true }]));
  const r0 = w.requests;
  await p._applyManageMarks();
  let shownAll = true;
  await w.run(Infinity, () => { if (w.sessions.slice(0, 8).some((s) => !p._archivedIds.has(s.sessionKey))) shownAll = false; });
  const st = w.serverState();
  ok(w.requests - r0 === 1 && w.writes.length === 1 && !!w.writes[0].ops && w.writes[0].ops.length === 8 && st.archivedSessions.length === 8 && shownAll, 'eight marks = ONE request carrying eight ops; shown archived throughout, all eight on the server', { requests: w.requests - r0, ops: w.writes[0] && w.writes[0].ops && w.writes[0].ops.length });
}

// ════════ §6 A RELOAD BEFORE THE ANSWER — ROUND 4: EVERY ACT IS ON THE WIRE AT THE ACT ════════
console.log('§6 round 4: a reload (or a closed tab) before the answer — every act was on the wire at the act, so it lands ONCE; the old display copy is never laid over a newer server state');
for (const variant of ['never reached before the reload', 'applied, answer lost', 'two acts 100 ms apart, the hub takes nothing for 60 s']) {
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 6, sessions: mkSessions(5) });
  const p1 = await addPage(w, Sb, 'tab');
  await w.run(500);
  const s = w.sessions[0], s2 = w.sessions[1];
  if (variant === 'applied, answer lost') w.defaultLag = () => ({ toServer: 10, toPage: 60000, drop: false });
  else w.defaultLag = () => ({ toServer: 60000, toPage: 10, drop: false });
  p1.toggleArchive(s);
  if (variant.startsWith('two acts')) { await w.run(w.now() + 100); p1.toggleArchive(s2); }   // its own request, at once (never behind the first)
  await w.run(w.now() + 1000);
  w.defaultLag = () => ({ toServer: 10, toPage: 10, drop: false });   // the hub ANSWERS by the time the page goes
  const p2 = await reloadPage(w, Sb, p1);   // the page goes — its requests are already on the wire; a NEW page (its own id)
  await w.run(Infinity);
  const st = w.serverState();
  const want = variant.startsWith('two acts') ? [s, s2] : [s];
  const appliedTimes = want.map((x) => w.writes.filter((wr) => wr.kind === 'ops' && wr.ops.some((o) => o.item === x.sessionKey)).length);
  const ownWrites = w.writes.filter((wr) => wr.batch && wr.batch.startsWith(pageIdOf(p1) + ':'));
  ok(want.every((x) => st.archivedSessions.includes(x.sessionKey) && p2._archivedIds.has(x.sessionKey)) && appliedTimes.every((n) => n === 1) && ownWrites.length === want.length && pageIdOf(p2) !== pageIdOf(p1),
    `act, reload before the answer (${variant}): each act's OWN request was on the wire at the act — it lands ONCE after the page is gone; the new page (a new id) shows it`, { appliedTimes, server: st.archivedSessions, dup: w.dup });
}
{
  // the hub DOWN when the page goes: the act is lost WITH THE PAGE (the base's own limit) — and the person had been told
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 61, sessions: mkSessions(3) });
  const p1 = await addPage(w, Sb, 'tab');
  await w.run(500);
  const door = w.H.ops ? 'ops' : 'patch', realPatch = w.H[door];   // (round 6: the page's ops go to the ops door)
  w.H[door] = (req, res) => res.status(503).json({ error: 'restarting' });
  p1.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 1000);
  const told = p1.__toasts.length;   // (round 9: no word about waiting — as on master)
  const p2 = await reloadPage(w, Sb, p1);
  await w.run(w.now() + 2000);   // the hub is still down when the page goes
  w.H[door] = realPatch;
  await w.run(Infinity);
  ok(told === 0 && !w.serverState().archivedSessions.includes(w.sessions[1].sessionKey) && pendingOf(p2) === 0 && !p2._archivedIds.has(w.sessions[1].sessionKey),
    'the hub DOWN when the page goes: the act is lost with its page (a named limit, the base\'s own) — nothing said, as on master (round 9); the new page holds nothing of it', { told, toasts: p1.__toasts });
}
{
  // the old display copy: the tab's localStorage says [A, B, C] archived (a week old); the server holds [A] — a click before the
  // first GET returns sends ONE op; the copy never travels and never stands over the server's state
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 8, sessions: mkSessions(5) });
  const [A, B, C, D] = w.sessions.map((x) => x.sessionKey);
  w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgseed001:1', ops: [{ key: 'archivedSessions', item: A, value: true }] }] });
  const browser = newBrowser(); browser.ls.setItem('archivedSessions', JSON.stringify([A, B, C]));
  w.defaultLag = () => ({ toServer: 300, toPage: 300, drop: false });
  const p = await addPage(w, Sb, 'stale-tab', { browser });
  p.toggleArchive(w.sessions[3]);
  await w.run(Infinity);
  const st = w.serverState();
  ok(JSON.stringify(st.archivedSessions.slice().sort()) === JSON.stringify([A, D].sort()) && JSON.stringify([...p._archivedIds].sort()) === JSON.stringify([A, D].sort()),
    'a click before the first GET sends only its own op: the stale localStorage copy (B, C) is replaced by the server\'s state, never pushed over it', { server: st.archivedSessions, page: [...p._archivedIds] });
}

// ════════ §7 A FAILURE IS SAID ════════
console.log('§7 nothing is said done that is not: a failing write stays shown, is retried and SAID; a refusal is undone and said');
{
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 9, sessions: mkSessions(4) });
  const p = await addPage(w, Sb, 'flaky');
  await w.run(500);
  let failing = true;
  const door = w.H.ops ? 'ops' : 'patch', realPatch = w.H[door];   // (round 6: the page's ops go to the ops door)
  w.H[door] = (req, res) => (failing ? res.status(503).json({ error: 'the hub is busy' }) : realPatch(req, res));
  const s = w.sessions[1];
  p.toggleArchive(s);
  await w.run(w.now() + 8000);
  const shownWhileFailing = p._archivedIds.has(s.sessionKey);
  const toastsWhileFailing = p.__toasts.filter((x) => x.type === 'error').length;
  failing = false;
  await w.run(Infinity);
  const st = w.serverState();
  ok(shownWhileFailing && toastsWhileFailing === 0 && st.archivedSessions.includes(s.sessionKey) && !p.__toasts.length && pendingOf(p) === 0,
    'a failing write (503 three times): shown throughout, re-sent on 2 / 5 / 15 s, it lands — NOTHING said (round 9: the page speaks only when it takes something back)', p.__toasts);
  // a refusal is said in the person's words, from the CODE the route sends (never the route's English)
  w.H[door] = (req, res) => res.status(400).json({ error: 'op 0: planted refusal (the route\'s English)', code: 'bad-value' });
  p.toggleStar(s);
  await w.run(Infinity);
  const coded = p.__toasts.slice(-1)[0] || {};
  w.H[door] = (req, res) => res.status(400).json({ error: 'op 0: a refusal with no code' });
  p.toggleStar(w.sessions[2]);
  await w.run(Infinity);
  const bare = p.__toasts.slice(-1)[0] || {};
  ok(!p._starredIds.has(s.sessionKey) && coded.text === 'The server refused a change (a value it does not take), so it was undone here' && bare.text === 'The server refused a change, so it was undone here.' && !p.__toasts.some((x) => /planted|English|no code/.test(x.text)) && p.__toasts.length === 2,
    `a refusal (400) is undone on the page and said ONCE in the page's own words, from its code («${coded.text}»; with no code «${bare.text}») — never the route's English`, p.__toasts);
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const words = ['The server refused a change ({reason}), so it was undone here', 'The server refused a change, so it was undone here.', 'a kind of change it does not keep', 'a name it does not keep', 'a value it does not take', 'a change it could not read', 'an empty change', 'too many changes at once', 'too large to take at once', 'a value nested too deep', 'the id of an earlier change', "A change made more than 7 days ago was not kept — this page now shows the server's", "{n} changes made more than 7 days ago were not kept — this page now shows the server's"];
  const gone = ['Not saved yet — the server did not answer; it is sent again while this page stays open', 'Saved — the changes that were waiting reached the server', 'Not saved — sign in again; this page sends it once you are signed in'];
  const st8 = read('src/lib/sidebar-state.js');
  ok(words.every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')) && gone.every((k) => !zh.includes(JSON.stringify(k)) && !ja.includes(JSON.stringify(k)) && !st8.includes(k)),
    'every sentence the page can say has its zh / ja words — a refusal (its template and the nine reasons), the 7-day rule (one and plural); the waiting / arriving / sign-in sentences are GONE from the page and both languages (round 9)', words.filter((k) => !zh.includes(JSON.stringify(k) + ':') || !ja.includes(JSON.stringify(k) + ':')));
}


// ════════ §9 ROUND 3 — A PAGE'S UNCONFIRMED ACTS LIVE AND DIE WITH THE PAGE (the verifier's scenes on ONE browser) ════════
console.log('§9 round 3: no page ever sends, shows or deletes another page\'s acts — nothing about an act in flight is shared');
const sentBy = (w, prefix) => w.writes.filter((wr) => wr.batch && wr.batch.startsWith(prefix + ':'));
const opsApplied = (w, pred) => w.writes.filter((wr) => wr.kind === 'ops').reduce((n, wr) => n + wr.ops.filter(pred).length, 0);
const ownOnly = (w, pages) => w.writes.filter((wr) => wr.batch).every((wr) => { const p = pages.find((x) => wr.batch.startsWith(pageIdOf(x) + ':')); return !!p && p.__name === wr.writer; });
const converged = (w, pages) => { const st = slotsOf(w.serverState()); return pages.every((p) => slotDiff(slotsOf(viewOfPage(p)), st).length === 0 && pendingOf(p) === 0); };
{
  // d1 — a tab THROTTLED 40 s (a background tab: its timers once a minute) with an in-flight hung write and an OPEN batch; tab B acts
  // meanwhile; A comes back and acts again — no act lost, none applied twice, every page converges, nobody sends A's acts but A
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 91, sessions: mkSessions(10) });
  const browser = newBrowser();
  const A = await addPage(w, Sb, 'tabA', { browser }), B = await addPage(w, Sb, 'tabB', { browser });
  await w.run(800);
  let hang = 1;
  A.__lag = (m) => (m === 'patch' && hang-- > 0 ? { toServer: 1e12, toPage: 20, drop: false } : { toServer: 20, toPage: 20, drop: false });
  A.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 50);
  A.toggleArchive(w.sessions[2]); A.toggleArchive(w.sessions[3]);   // the OPEN batch
  freeze(A);
  B.toggleStar(w.sessions[6]);
  await w.run(w.now() + 40000);
  wake(A);
  A.toggleArchive(w.sessions[4]); A.toggleStar(w.sessions[5]);
  await w.run(w.now() + 600000);
  const st = w.serverState();
  const want = [1, 2, 3, 4].every((i) => st.archivedSessions.includes(w.sessions[i].sessionKey)) && st.starredSessions.includes(w.sessions[5].sessionKey) && st.starredSessions.includes(w.sessions[6].sessionKey);
  ok(want && ownOnly(w, [A, B]) && opsApplied(w, (o) => o.key === 'archivedSessions') === 4 && converged(w, [A, B]),
    'd1 — a tab throttled 40 s with a hung write and an OPEN batch: nothing of A\'s is sent but by A; every act once (4 archive ops for 4 acts), nothing lost; both tabs converge', { server: [st.archivedSessions.length, st.starredSessions.length], dup: w.dup });
}
{
  // d2 — a DUPLICATE of a throttled tab (Chrome copies sessionStorage — nothing of ours lives there now): two pages, two ids
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 92, sessions: mkSessions(6) });
  const browser = newBrowser();
  const A = await addPage(w, Sb, 'tabA', { browser });
  await w.run(500);
  A.toggleArchive(w.sessions[1]);
  freeze(A);
  await w.run(w.now() + 30000);   // the original has been a throttled background tab for 30 s when the person duplicates it
  const ssCopy = fakeLs(); for (const [k, v] of A.__ss._m) ssCopy.setItem(k, v);
  const D = await addPage(w, Sb, 'tabA-copy', { browser, ss: ssCopy });
  await w.run(w.now() + 500);
  D.toggleArchive(w.sessions[2]); D.toggleStar(w.sessions[1]);
  await w.run(w.now() + 30000);
  wake(A);
  A.toggleStar(w.sessions[3]);
  await w.run(w.now() + 600000);
  const st = w.serverState();
  ok(pageIdOf(A) !== pageIdOf(D) && !twiceOf(w).length && st.archivedSessions.includes(w.sessions[1].sessionKey) && st.archivedSessions.includes(w.sessions[2].sessionKey) && st.starredSessions.includes(w.sessions[1].sessionKey) && st.starredSessions.includes(w.sessions[3].sessionKey) && ownOnly(w, [A, D]) && converged(w, [A, D]),
    'd2 — a duplicate of a throttled tab is simply another page: its own id (made at its load), no batch id minted twice, every act of both once, both converge', { a: pageIdOf(A), d: pageIdOf(D), twice: twiceOf(w) });
}
{
  // d5 — P1 HIDDEN (into the back-forward cache) → P2 in the same tab acts → back to P1 → P1 acts: its next act is a NEW batch
  // (every act is its own); nothing collides; the answer P1 never saw is settled by the next state it takes
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 95, sessions: mkSessions(6) });
  const browser = newBrowser();
  const P1 = await addPage(w, Sb, 'P1', { browser });
  await w.run(500);
  w.defaultLag = () => ({ toServer: 3000, toPage: 20, drop: false });
  P1.toggleArchive(w.sessions[1]); P1.toggleArchive(w.sessions[2]);
  await w.run(w.now() + 50);
  const openBefore = P1._userSync().unconfirmed().map((x) => x.batch);
  hidePage(w, P1);   // pagehide (into the back-forward cache): its acts are already on the wire
  w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
  const P2 = await addPage(w, Sb, 'P2', { browser, ss: P1.__ss });
  await w.run(w.now() + 500);
  P2.toggleStar(w.sessions[1]);
  await w.run(w.now() + 5000);
  endPage(w, P2);
  showPage(w, P1);   // pageshow (persisted): P1 goes on with what it holds in memory
  P1.toggleStar(w.sessions[3]);
  const after = P1._userSync().unconfirmed().map((x) => x.batch);
  await w.run(w.now() + 600000);
  const st = w.serverState();
  const newBatch = after.filter((id) => !openBefore.includes(id));
  ok(newBatch.length >= 1 && pageIdOf(P1) !== pageIdOf(P2) && [1, 2].every((i) => st.archivedSessions.includes(w.sessions[i].sessionKey)) && [1, 3].every((i) => st.starredSessions.includes(w.sessions[i].sessionKey)) && opsApplied(w, (o) => o.key === 'archivedSessions') === 2 && converged(w, [P1]),
    'd5 — hidden → another page in the same tab → back from the cache: P1\'s next act is a NEW batch; the two pages never share an id; every act once; P1 converges', { openBefore, after, server: [st.archivedSessions.length, st.starredSessions.length] });
}
{
  // THE CENSUS (grep-derived): no localStorage / sessionStorage / BroadcastChannel / Web Lock write that carries ops, a batch id, a
  // beat or a tab id in src/lib or src/user-state-ops.js — a second store of acts is red by name
  const libFiles = (function walk(d) { const out = []; for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = `${d}/${e.name}`; if (e.isDirectory()) out.push(...walk(r)); else if (e.name.endsWith('.js')) out.push(r); } return out; })('src/lib');
  const files = [...libFiles, 'src/user-state-ops.js'];
  const WRITE = /\b(localStorage|sessionStorage)\s*\.\s*setItem\s*\(|new\s+BroadcastChannel\s*\(|\blocks\s*\.\s*request\s*\(|\bnavigator\s*\.\s*locks\b/g;
  const argOf = (src, at) => { const open = src.indexOf('(', at); if (open < 0) return src.slice(at, at + 200); let d = 0; for (let i = open; i < src.length && i < open + 4000; i++) { if (src[i] === '(') d++; else if (src[i] === ')') { d--; if (!d) return src.slice(at, i + 1); } } return src.slice(at, at + 400); };
  const MASTER_STORAGE_WRITES = Object.entries({"src/lib/app.js":["localStorage.setItem|'vs-onboarded'","localStorage.setItem|k","sessionStorage.setItem|key","sessionStorage.setItem|noticeKey"],"src/lib/appearance-panel.js":["localStorage.removeItem|key","localStorage.setItem|'termFontFamily'","localStorage.setItem|'termFontSize'","localStorage.setItem|key"],"src/lib/artifact-card.js":["localStorage.setItem|VIEW_KEY"],"src/lib/browser-live-window.js":["localStorage.setItem|'vibespace.deviceTag'"],"src/lib/browser-trace-view.js":["localStorage.removeItem|SHOW_FITS_KEY","localStorage.setItem|SHOW_FITS_KEY"],"src/lib/channel-account-dialogs.js":["localStorage.removeItem|rememberKey(kind)","localStorage.setItem|rememberKey(kind)"],"src/lib/channel-outbox.js":["localStorage.setItem|DELIVER_KEY"],"src/lib/channel-window.js":["localStorage.setItem|hideKey"],"src/lib/chat-minimap.js":["localStorage.setItem|SHOW_OTHER_KEY"],"src/lib/chat-view.js":["localStorage.setItem|TAUGHT_KEY"],"src/lib/code-editor.js":["localStorage.setItem|'editorSettings'"],"src/lib/design-changes.js":["localStorage.removeItem|storeKey","localStorage.setItem|storeKey"],"src/lib/desktop-app-window.js":["sessionStorage.setItem|prevKey"],"src/lib/desktop-manager.js":["localStorage.removeItem|'taskbarHeight'","localStorage.removeItem|'toolbarHeight'","localStorage.removeItem|'toolbarScale'","localStorage.removeItem|'toolbarScale'","localStorage.setItem|'taskbarHeight'","localStorage.setItem|'toolbarScale'","localStorage.setItem|'toolbarScale'"],"src/lib/desktop-picker.js":["localStorage.setItem|DISPLAYS_KEY","localStorage.setItem|RECENT_KEY"],"src/lib/doc-window-ui.js":["localStorage.removeItem|oldKey","localStorage.setItem|WIDTH_KEY","localStorage.setItem|oldKey"],"src/lib/docx-viewer.js":["localStorage.setItem|ZOOM_PREF_KEY"],"src/lib/file-explorer.js":["localStorage.setItem|'fileExplorerColumnWidths'","localStorage.setItem|'fileExplorerColumns'","localStorage.setItem|'fileExplorerGroupBy'","localStorage.setItem|'fileExplorerSettings'"],"src/lib/i18n.js":["localStorage.removeItem|STORAGE_KEY","localStorage.setItem|STORAGE_KEY"],"src/lib/layout.js":["localStorage.removeItem|'taskbarHeight'","localStorage.removeItem|'toolbarScale'","localStorage.setItem|'taskbarHeight'","localStorage.setItem|'toolbarScale'"],"src/lib/machine-desktop.js":["localStorage.setItem|HDR_KEY","localStorage.setItem|HDR_KEY","localStorage.setItem|RUNS_KEY"],"src/lib/machine-displays.js":["localStorage.setItem|'vibespace.deviceTag'","localStorage.setItem|MODES_KEY"],"src/lib/manage-agents.js":["localStorage.setItem|'vibespace.agentsMachOpen'","localStorage.setItem|'vibespace.agentsTab'","localStorage.setItem|'vibespace.quotaRefreshAck'"],"src/lib/mobile-nav.js":["sessionStorage.setItem|SHOWN_KEY"],"src/lib/nav-log.js":["sessionStorage.removeItem|EXIT_INTENT_KEY","sessionStorage.setItem|EXIT_INTENT_KEY","sessionStorage.setItem|NAV_LOG_KEY"],"src/lib/new-session-form.js":["localStorage.setItem|FOLD_KEY"],"src/lib/path-field.js":["localStorage.setItem|memKey()"],"src/lib/plugin-client.js":["localStorage.removeItem|k","localStorage.removeItem|storagePrefix + String(k)","localStorage.setItem|k","localStorage.setItem|storagePrefix + String(k)"],"src/lib/principal-picker.js":["localStorage.setItem|RECENT_KEY"],"src/lib/resizer.js":["localStorage.setItem|this.storageKey"],"src/lib/settings-ui.js":["localStorage.setItem|'vibespace.settingsNavFolds'","localStorage.setItem|SHOW_ADVANCED_KEY"],"src/lib/settings.js":["localStorage.setItem|'webui-settings'","localStorage.setItem|'webui-settings'"],"src/lib/setup-flows.js":["localStorage.setItem|'vs-onboarded'"],"src/lib/sidebar-rail.js":["localStorage.setItem|'vibespace.railItem'","localStorage.setItem|RAIL_LABELS_KEY"],"src/lib/sidebar-state.js":["localStorage.setItem|'archivedFolders'","localStorage.setItem|'archivedSessions'","localStorage.setItem|'groupFolders'","localStorage.setItem|'sessionConfigs'","localStorage.setItem|'sessionCustomNames'","localStorage.setItem|'sessionGroups'","localStorage.setItem|'sessionModes'","localStorage.setItem|'starredSessions'"],"src/lib/sidebar-workbench.js":["localStorage.setItem|'wbHistoryHost'","localStorage.setItem|'wbRecentHost'","localStorage.setItem|storageKey"],"src/lib/sidebar.js":["localStorage.removeItem|AGENT_KIND_FILTER_KEY","localStorage.setItem|'backendFilter'","localStorage.setItem|'collapsedFolders'","localStorage.setItem|'collapsedFolders'","localStorage.setItem|'expandedFolders'","localStorage.setItem|'expandedFolders'","localStorage.setItem|'hostFilter'","localStorage.setItem|'sessionSort'","localStorage.setItem|'statusFilter'","localStorage.setItem|'vibespace.taskViewFilter'","localStorage.setItem|'vibespace.taskViewSort'","sessionStorage.setItem|AGENT_KIND_FILTER_KEY","sessionStorage.setItem|AGENT_KIND_FILTER_KEY","sessionStorage.setItem|AGENT_KIND_FILTER_KEY","sessionStorage.setItem|LIST_HIDDEN_KEY"],"src/lib/stream-pill.js":["localStorage.setItem|PILL_KEY"],"src/lib/stream-stats.js":["localStorage.setItem|PIN_KEY"],"src/lib/telemetry-client.js":["localStorage.removeItem|PENDING_KEY","localStorage.setItem|PENDING_KEY"],"src/lib/themes.js":["localStorage.setItem|'theme'"],"src/lib/usage-meter.js":["localStorage.setItem|'vibespace.quotaRefreshAck'","localStorage.setItem|'vibespace.usageAccount'","localStorage.setItem|'vibespace.usageAccountCodex'"],"src/lib/user-todos-actions.js":["localStorage.setItem|'vibespace.agentsTab'"],"src/lib/user-todos-panel.js":["localStorage.setItem|HISTORY_SEEN_KEY","localStorage.setItem|NOTICE_FILTER_KEY","sessionStorage.setItem|HOME_ON_KEY"],"src/lib/utils.js":["localStorage.setItem|'vibespace.toastHistory'","localStorage.setItem|'vibespace.toastHistory'"],"src/lib/vault-unlock.js":["localStorage.setItem|'vs-vault-later'","sessionStorage.setItem|LATER_KEY"]}).flatMap(([f, xs]) => xs.map((x) => f + '|' + x));   // e74fabc6b's src/lib, by the extractor below
  // THE STORAGE CENSUS (round 5, smaller 4): every localStorage / sessionStorage WRITE in src/lib — by file, call and the text of
  // its key — compared with the writes master makes (MASTER_STORAGE_WRITES, taken from e74fabc6b by this same code): a write
  // master did not have is red whatever it is called (a counter spelled `vsSeq` included), not by a word list
  const stripMemo = new Map();   // (the same file text stripped once — the planted controls share every other file)
  const stripComments = (s) => { if (stripMemo.has(s)) return stripMemo.get(s); const t = s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length)); stripMemo.set(s, t); return t; };
  const firstArg = (src, open) => { let d = 0, q = null; for (let k = open; k < src.length; k++) { const c = src[k]; if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; } if (c === '"' || c === "'" || c === '`') { q = c; continue; } if (c === '(' || c === '[' || c === '{') d++; else if (c === ')' || c === ']' || c === '}') { d--; if (d === 0) return src.slice(open + 1, k); } else if (c === ',' && d === 1) return src.slice(open + 1, k); } return ''; };
  const storageWritesOf = (texts) => {
    const out = [];
    for (const [f, src0] of texts) {
      if (!f.startsWith('src/lib/')) continue;
      const src = stripComments(src0);
      for (const m of src.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*(setItem|removeItem|clear)\s*\(/g)) out.push(`${f}|${m[1]}.${m[2]}|${firstArg(src, m.index + m[0].length - 1).replace(/\s+/g, ' ').trim()}`);
      for (const m of src.matchAll(/=\s*(?:window\s*\.\s*)?(localStorage|sessionStorage)\b(?!\s*[.[])/g)) out.push(`${f}|${m[1]} alias|`);
    }
    return out.sort();
  };
  const notOnMaster = (list) => { const left = new Map(); for (const x of MASTER_STORAGE_WRITES) left.set(x, (left.get(x) || 0) + 1); const out = []; for (const x of list) { if (left.get(x) > 0) left.set(x, left.get(x) - 1); else out.push(x); } return out; };
  const DISPLAY = ['starredSessions', 'archivedSessions', 'archivedFolders', 'sessionCustomNames', 'sessionModes', 'sessionConfigs', 'sessionGroups', 'groupFolders'];
  const censusMemo = new Map();
  const censusOf = (texts) => {
    const red = [];
    for (const [f, src0] of texts) {
      const src = censusMemo.has(src0) ? censusMemo.get(src0) : censusMemo.set(src0, src0.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))).get(src0);
      const at = (i) => `${f}:${src.slice(0, i).split('\n').length}`;
      // a Web Lock, a BroadcastChannel, IndexedDB, a cookie or a bracket write to a browser store anywhere (master has none in
      // src/lib): a page keeping or telling another page about its acts — a second store of acts
      for (const m of src.matchAll(/new\s+BroadcastChannel\s*\(|navigator\s*(?:&&[^;\n]*?)?\.\s*locks\b|\blocks\s*\.\s*request\s*\(|\bindexedDB\b|\.\s*objectStore\s*\(|\bdocument\s*\.\s*cookie\s*=|\b(?:localStorage|sessionStorage)\s*\[[^\]]*\]\s*=(?!=)/g)) red.push(`${at(m.index)}: ${m[0].slice(0, 60)}`);
      if (f === 'src/user-state-ops.js') {   // the ops module is PURE: no browser store, no store-shaped door
        for (const m of src.matchAll(/\b(localStorage|sessionStorage)\b|\.\s*(setItem|getItem|removeItem)\s*\(/g)) red.push(`${at(m.index)}: ${m[0]} in the ops module`);
        continue;
      }
      if (f === 'src/lib/sidebar-state.js') {   // the user-state page code touches its EIGHT display keys and nothing else
        for (const m of src.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*(\w+)\s*\(\s*([^,)]*)/g)) {
          const key = m[3].trim().replace(/^['"]|['"]$/g, '');
          if (m[1] !== 'localStorage' || !['getItem', 'setItem'].includes(m[2]) || !DISPLAY.includes(key)) red.push(`${at(m.index)}: ${m[0].slice(0, 60)} — not one of the display keys`);
        }
      }
      for (const m of src.matchAll(/\b(?:localStorage|sessionStorage)\s*\.\s*(\w+)\s*=(?!=)/g)) red.push(`${at(m.index)}: ${m[0]} — a property write to a browser store`);
    }
    for (const x of notOnMaster(storageWritesOf(texts))) red.push(`a storage write master does not make: ${x}`);
    return red;
  };
  const texts = files.map((f) => [f, read(f)]);
  const red = censusOf(texts);
  const writes = storageWritesOf(texts);
  ok(red.length === 0 && writes.length === MASTER_STORAGE_WRITES.length, `THE CENSUS: every localStorage / sessionStorage write in src/lib is one master makes (${writes.length} call sites, by file, call and key — smaller 4: not a word list); no BroadcastChannel, Web Lock, IndexedDB, cookie, bracket or property write; the ops module touches no store (${files.length} files)`, red);
  const planted = texts.map(([f, t]) => (f === 'src/lib/sidebar-state.js' ? [f, t + "\nfunction leak(saved) { localStorage.setItem('userStatePending', JSON.stringify({ batches: saved.batches })); }\n"] : [f, t]));
  const plantedOps = texts.map(([f, t]) => (f === 'src/user-state-ops.js' ? [f, t + "\nconst bc = new BroadcastChannel('acts');\n"] : [f, t]));
  const plantedWrap = texts.map(([f, t]) => (f === 'src/lib/sidebar-state.js' ? [f, t + "\nconst wrap = { setItem: (k, v) => localStorage.setItem(k, v) };\n"] : [f, t]));
  const plantIn = (file, line) => texts.map(([f, t]) => (f === file ? [f, t + '\n' + line + '\n'] : [f, t]));
  const more = {
    'a bracket write': plantIn('src/lib/sidebar.js', "localStorage['userStatePending'] = JSON.stringify(ops);"),
    'an IndexedDB put': plantIn('src/lib/sidebar.js', "const tx = indexedDB.open('acts'); tx.onsuccess = () => tx.result.transaction('a', 'readwrite').objectStore('a').put(ops);"),
    'a cookie': plantIn('src/lib/sidebar.js', "document.cookie = 'batch=' + id;"),
    'a sessionStorage seq in another file': plantIn('src/lib/sidebar.js', "sessionStorage.setItem('vs-seq', String(seq));"),
    'a counter spelled vsSeq in a NEW file': [...texts, ['src/lib/us-seq.js', "export function bump(n) { sessionStorage.setItem('vsSeq', String(n)); }\n"]],
    'a store under another name': plantIn('src/lib/sidebar.js', "const st = window.sessionStorage; st.setItem('x', '1');"),
  };
  const moreRed = Object.fromEntries(Object.entries(more).map(([k, v]) => [k, censusOf(v).length]));
  ok(censusOf(planted).length >= 1 && censusOf(plantedOps).length >= 1 && censusOf(plantedWrap).length >= 1 && Object.values(moreRed).every((n) => n >= 1),
    'CONTROL: a planted record of acts in sidebar-state.js, round 2\'s variable-key wrapper, a BroadcastChannel in the ops module, a bracket write, an IndexedDB put, a cookie, a sessionStorage seq in another file, a counter spelled vsSeq in a NEW file and a store under another name are each RED by name', moreRed);
}

// ════════ §10 ROUND 2, LAW 2 — A WRITE THAT DOES NOT ANSWER IS A FAILED WRITE, NOT A WAIT ════════
console.log('§10 round 2 law 2: a send that never settles is a failed send — said, sent again under its id; a reconnect re-sends it');
{
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 101, sessions: mkSessions(6) });
  const A = await addPage(w, Sb, 'page');
  const phone = await addPage(w, Sb, 'phone');
  await w.run(500);
  let hang = 1;   // the FIRST PATCH reaches the server and is applied — its answer never comes (the hub's loop held it)
  w.defaultLag = (method) => { if (method === 'patch' && hang > 0) { hang--; return { toServer: 20, toPage: 1e12, drop: false }; } return { toServer: 20, toPage: 20, drop: false }; };
  A.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 100);
  A.toggleArchive(w.sessions[2]); A.toggleStar(w.sessions[3]);
  await w.run(w.now() + 60000);
  const st = w.serverState();
  const all = [1, 2].every((i) => st.archivedSessions.includes(w.sessions[i].sessionKey)) && st.starredSessions.includes(w.sessions[3].sessionKey);
  ok(all && [1, 2].every((i) => phone._archivedIds.has(w.sessions[i].sessionKey)) && phone._starredIds.has(w.sessions[3].sessionKey) && w.dup >= 1 && !twiceOf(w).length && pendingOf(A) === 0 && !A.__toasts.some((x) => /Not saved yet/.test(x.text)),
    'HANG with a later act (round 5): the next act\'s request CARRIES the act whose request never answered — it lands with it (a duplicate where it had landed — applied once); no act is late, so nothing is said; the server and the phone hold all three', { dup: w.dup, twice: twiceOf(w), toasts: A.__toasts.map((x) => x.text), server: [st.archivedSessions.length, st.starredSessions.length] });
}
{
  // HANG with NO later act: the paced re-send is its road — said at the bound, sent again under its id, said when it lands
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 102, sessions: mkSessions(6) });
  const A = await addPage(w, Sb, 'page');
  await w.run(500);
  let hang = 1;
  w.defaultLag = (method) => { if (method === 'patch' && hang > 0) { hang--; return { toServer: 20, toPage: 1e12, drop: false }; } return { toServer: 20, toPage: 20, drop: false }; };
  A.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 14000);
  const saidBefore = A.__toasts.filter((x) => /Not saved yet/.test(x.text)).length;
  await w.run(w.now() + 2000);   // past the 15 s bound
  const saidAt = A.__toasts.filter((x) => /Not saved yet/.test(x.text)).length;
  await w.run(w.now() + 60000);
  ok(saidBefore === 0 && saidAt === 0 && w.serverState().archivedSessions.includes(w.sessions[1].sessionKey) && w.dup === 1 && !twiceOf(w).length && pendingOf(A) === 0 && !A.__toasts.length,
    'HANG with no later act: the paced re-send carries it again under ITS id after the 15 s bound (answered as a duplicate — applied once); nothing said at any point (round 9)', { saidBefore, saidAt, dup: w.dup, toasts: A.__toasts.map((x) => x.text) });
}
{
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 102, sessions: mkSessions(4) });
  const A = await addPage(w, Sb, 'page');
  await w.run(500);
  let hang = 1;
  w.defaultLag = (method) => { if (method === 'patch' && hang > 0) { hang--; return { toServer: 1e12, toPage: 20, drop: false }; } return { toServer: 20, toPage: 20, drop: false }; };
  A.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 3000);
  w.disconnect(A); w.connect(A); A._fetchUserState();   // the socket comes back after 3 s — before the bound
  await w.run(w.now() + 2000);
  const st = w.serverState();
  ok(st.archivedSessions.includes(w.sessions[1].sessionKey) && pendingOf(A) <= 1, 'HANG: a reconnect re-sends what is IN FLIGHT too (its request lost on the way) — the act lands at the reconnect, not at the 15 s bound', { server: st.archivedSessions });
}

// ════════ §11 ROUND 2, LAW 3 — A COUNTER THAT GOES BACK IS A NEW EPOCH, NOT AN OLD ECHO ════════
console.log('§11 round 2 law 3: a restore (an older user-state.json, a LOWER counter) is a new life — every page takes it and replays its own');
/** the hub comes back as 2.369.392 (a rollback, tabs open): its user-state doors on the SAME data dir */
const mountOlder = (w) => {
  const file = path.join(w.dataDir, 'user-state.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { stateVersion: 2, starredSessions: [], archivedSessions: [], archivedFolders: [], customNames: {}, sessionModes: {}, sessionConfigs: {}, sessionGroups: {}, groupFolders: {} }; } };
  const write = (st) => { fs.writeFileSync(file, JSON.stringify(st, null, 2)); for (const c of w.clients) c.send(JSON.stringify({ type: 'user-state-updated', state: st })); };
  w.H.get = (req, res) => res.json(read());
  w.H.patch = (req, res) => { write({ ...read(), ...(req.body || {}) }); res.json({ success: true }); };
  w.H.post = (req, res) => { write({ ...(req.body || {}) }); res.json({ success: true }); };
  w.H.ops = null;
  w.older = true;
};
const restartWorld = (w, writeFile = null) => {
  { const t0 = Date.now(), r0 = performance.now(); while (Date.now() === t0 && performance.now() - r0 < 5) { } }   // a new life starts LATER than the one before (its epoch carries its start); bounded on the REAL clock (a scene may hold Date.now on the world's)
  if (writeFile) fs.writeFileSync(path.join(w.dataDir, 'user-state.json'), JSON.stringify(writeFile, null, 2));
  const P2 = freshPersistence();
  P2.setup({ dataDir: w.dataDir, wss: { clients: w.clients }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, userStateClock: () => (w.T0 || 0) + w.now() + (w.serverStep || 0), userStateMono: () => w.now() });
  w.H.get = handlerOf(P2.router, 'get', '/api/user-state'); w.H.post = handlerOf(P2.router, 'post', '/api/user-state'); w.H.patch = handlerOf(P2.router, 'patch', '/api/user-state'); w.H.ops = handlerOf(P2.router, 'patch', '/api/user-state/batches'); w.older = false;
  return P2;
};
for (const kind of ['restore (a LOWER counter)', 'restart (the SAME file)']) {
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 111, sessions: mkSessions(8) });
  const A = await addPage(w, Sb, 'pageA'), B = await addPage(w, Sb, 'pageB');
  await w.run(500);
  for (let i = 0; i < 5; i++) { A.toggleArchive(w.sessions[i]); await w.run(w.now() + 200); }
  await w.run(w.now() + 600000);   // ten virtual minutes: a page that retried for ever is RED here, not a hang
  const archive = JSON.parse(fs.readFileSync(path.join(w.dataDir, 'user-state.json'), 'utf8'));
  const old = { ...archive, archivedSessions: archive.archivedSessions.slice(0, 2), stateRev: 2 };   // the owner's archive from earlier: 2 archived, counter 2
  for (let i = 5; i < 7; i++) { B.toggleStar(w.sessions[i]); await w.run(w.now() + 200); }
  await w.run(w.now() + 600000);   // ten virtual minutes: a page that retried for ever is RED here, not a hang
  const writes0 = w.writes.length;
  const live = UO.revOf(w.serverState());
  // the hub goes down, B's next act waits unanswered, the hub comes back on the restored (or the same) file
  let down = true;
  const door = w.H.ops ? 'ops' : 'patch', realPatch = w.H[door];   // (round 6: the page's ops go to the ops door)
  w.H[door] = (req, res) => (down ? res.status(503).json({ error: 'restarting' }) : realPatch(req, res));
  B.toggleStar(w.sessions[7]);
  await w.run(w.now() + 1000);
  restartWorld(w, kind.startsWith('restore') ? old : null);
  down = false;
  for (const p of [A, B]) { w.disconnect(p); w.connect(p); p._fetchUserState(); }
  await w.run(w.now() + 120000);   // two virtual minutes (a page that ignored the new life would retry for ever)
  const st = w.serverState();
  const want = kind.startsWith('restore') ? { arch: 2 } : { arch: 5 };
  const conv = [A, B].every((p) => slotDiff(slotsOf(viewOfPage(p)), slotsOf(st)).length === 0);
  ok(st.archivedSessions.length === want.arch && st.starredSessions.includes(w.sessions[7].sessionKey) && conv && pendingOf(A) === 0 && pendingOf(B) === 0 && (kind.startsWith('restore') ? UO.revOf(st) < live : UO.revOf(st) > live),
    `EPOCH — ${kind}: every page takes the server's new life (rev ${live} → ${UO.revOf(st)}), nothing ignored, nothing stuck; B's unanswered act replayed over it; both pages converge on it`, { arch: st.archivedSessions.length, starred: st.starredSessions.length, conv, pending: [pendingOf(A), pendingOf(B)], writes: w.writes.length - writes0 });
}

// ════════ §12 ROUND 2, SMALLER ════════
console.log('§12 round 2, smaller: an older server, a sign-in, the migration, the bounds, exactly once across a restart');
{
  // (1) a page that outlives a rollback to an older server (no ops door): round 7, C1 — never whole keys; kept; round 14 follow-up: a
  // 404 streak past 3 minutes SAID once («These changes are not saved yet …» — kept while the page stays open; never «reload»)
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 121, sessions: mkSessions(4) });
  let oldState = { stateVersion: 2, starredSessions: [], archivedSessions: [], archivedFolders: [], customNames: {}, sessionModes: {}, sessionConfigs: {}, sessionGroups: {}, groupFolders: {} };
  const bodies = [];
  const oldBroadcast = () => { for (const c of w.clients) c.send(JSON.stringify({ type: 'user-state-updated', state: oldState })); };
  w.H.get = (req, res) => res.json(J(oldState));
  w.H.ops = null;   // an OLDER server has no ops door: it answers 404
  w.H.patch = (req, res) => { bodies.push(req.body); oldState = { ...oldState, ...req.body }; oldBroadcast(); res.json({ success: true }); };
  const A = await addPage(w, Sb, 'new-page');
  await w.run(500);
  A.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 600000);   // ten virtual minutes: a page that retried for ever is RED here, not a hang
  oldState = { ...oldState, starredSessions: [w.sessions[2].sessionKey] }; oldBroadcast();   // another (old) page stars #2
  await w.run(w.now() + 600000);   // ten virtual minutes: a page that retried for ever is RED here, not a hang
  ok(bodies.length === 0 && !oldState.archivedSessions.includes(w.sessions[1].sessionKey) && A._archivedIds.has(w.sessions[1].sessionKey) && pendingOf(A) >= 1 && A.__toasts.length === 1 && /^These changes are not saved yet — the server does not take them/.test(A.__toasts[0].text) && !/reload/i.test(A.__toasts[0].text) && A._starredIds.has(w.sessions[2].sessionKey) && Object.keys(oldState).every((k) => !['batches', 'born', 'seq'].includes(k)),
    'OLDER SERVER (round 7, C1): a page of this release NEVER speaks whole keys — its refused ops door is a failure like any other: the act kept on the page and retried within the bounds, its 404 streak said ONCE in twenty minutes, past 3 min and never «reload» (round 14 follow-up), nothing written to the old file (no whole keys, no junk key), no «older VibeSpace» sentence; the other page\'s change is shown', { bodies, toasts: A.__toasts.map((x) => x.text), pending: pendingOf(A) });
}
{
  // (2) 401: «sign in again», never retried as «did not answer» on a timer; sent at the next good GET
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 122, sessions: mkSessions(4) });
  const A = await addPage(w, Sb, 'page');
  await w.run(500);
  const door = w.H.ops ? 'ops' : 'patch', realPatch = w.H[door];   // (round 6: the page's ops go to the ops door)
  let out = true;
  w.H[door] = (req, res) => (out ? res.status(401).json({ error: 'not signed in' }) : realPatch(req, res));
  const r0 = w.requests;
  A.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 60000);
  const tries = w.requests - r0;
  out = false;
  A._fetchUserState();
  await w.run(w.now() + 600000);   // ten virtual minutes: a page that retried for ever is RED here, not a hang
  ok(tries === 1 && !A.__toasts.length && w.serverState().archivedSessions.includes(w.sessions[1].sessionKey),
    'SIGN-IN: a 401 is NOT retried on a timer (1 request in 60 s) and the page says nothing — signing in is the app\'s, as on master (round 9); the next good GET sends it', { tries, toasts: A.__toasts });
}
{
  // (3) the render-time key migration runs on the first SERVER state, never on the display copy (sidebar.js's gate)
  const sbJs = read('src/lib/sidebar.js');
  ok(/if \(this\._userStateFetched && this\._migrateUserStateKeys\(this\._allSessions\)\) \{/.test(sbJs), 'MIGRATION (smaller 3): sidebar.js migrates keys only once a SERVER state was applied (`_userStateFetched && _migrateUserStateKeys(…)`) — never the stale display copy before the first GET');
}
{
  // (4) the bounds, refused by name; applyOps LINEAR (a relative bound, measured in this run); prototype names refused
  const w = createWorld({ seed: 124, sessions: mkSessions(2) });
  const many = Array.from({ length: 5001 }, (_, i) => ({ key: 'archivedSessions', item: 'claude:x' + i, value: true }));   // (round 12: the NUMBER, 5 000 — a moved constant goes red)
  const tooMany = w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgbound01:1', ops: many }] });
  // (the body bound is read at the door's PARSER since round 12 — scripts/test-user-state-bounds.mjs §4 pins it, chunked and gzip)
  const proto = w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgbound03:1', ops: [{ key: 'customNames', item: '__proto__', value: 'x' }] }] });
  // LINEAR in WORK (scripts/work-meter.mjs, in a child: the meter pins the optimizer off for its whole process) — n un-archive
  // ops over n archived, n → 2n (the first build re-scanned a list per op: 100 000 ops held a loop 21 s)
  const { judgeInChild, LINEAR_BOUND } = await import('./work-meter.mjs');
  const lin = judgeInChild({ module: path.join(REPO, 'src/user-state-ops.js'), kind: 'linear', n: 2000,
    mk: "(n) => ({ st: { archivedSessions: Array.from({ length: n }, (_, i) => 'k' + i), customNames: {} }, ops: [...Array.from({ length: n }, (_, i) => ({ key: 'archivedSessions', item: 'k' + i, value: false })), ...Array.from({ length: n }, (_, i) => ({ key: 'sessionGroups', item: 'g', member: 'm' + i, value: true }))] })",
    run: '(M, x) => M.applyOps(x.st, x.ops)' });
  const refusedOf = (r) => (r.body.refused || [])[0] || {};
  ok(tooMany.status === 200 && /5001 ops in one batch — the bound is 5000/.test(refusedOf(tooMany).error) && proto.status === 200 && /"__proto__" is not a name this store keeps/.test(refusedOf(proto).error),
    `BOUNDS (smaller 4): 5 000 ops a batch (5 001 refused on its own, by name); a prototype name refused on its own`, [tooMany.body, proto.body]);
  ok(lin.ok, `applyOps is LINEAR in WORK: n un-archive ops over n archived + n group members, ${lin.n} → ${2 * lin.n} (×${(lin.r || 0).toFixed(2)} ≤ ${LINEAR_BOUND}: ${lin.w1} → ${lin.w2} ops; a list re-scan per op reads ×4)`, lin.err || lin);
  const Sb = await loadPage(STATE_SRC);
  const w2 = createWorld({ seed: 125, sessions: mkSessions(2) });
  const A = await addPage(w2, Sb, 'page');
  await w2.run(500);
  const huge = Array.from({ length: 25000 }, (_, i) => ({ key: 'archivedSessions', item: 'claude:h' + i, value: true }));
  A._userSync().record(huge);
  await w2.run(w2.now() + 600000);
  const batches = w2.writes.filter((wr) => wr.kind === 'ops').flatMap((wr) => wr.parts || []);
  ok(batches.length >= 2 && batches.every((b) => b.n <= UO.MAX_OPS_PER_BATCH && b.bytes <= UO.MAX_BATCH_BYTES) && batches.reduce((a, b) => a + b.n, 0) === 25000 && w2.serverState().archivedSessions.length === 25000,
    `the page SPLITS a 25 000-op act into batches under both bounds (≤ ${UO.MAX_OPS_PER_BATCH} ops, ≤ ${UO.MAX_BATCH_BYTES} B each: ${batches.map((b) => b.n).join(' + ')}), all applied`, batches);
}
{
  // (5) exactly once ACROSS A RESTART: A's batch applied, its answer lost; the hub restarts; B un-archives X; A re-sends → a duplicate
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 126, sessions: mkSessions(4) });
  const A = await addPage(w, Sb, 'pageA'), B = await addPage(w, Sb, 'pageB');
  await w.run(500);
  let lose = 1;
  w.defaultLag = (method) => { if (method === 'patch' && lose > 0) { lose--; return { toServer: 20, toPage: 20, drop: true }; } return { toServer: 20, toPage: 20, drop: false }; };
  A.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 100);   // applied; A saw a dropped connection (its retry waits 2 s)
  restartWorld(w);
  for (const p of [A, B]) { w.disconnect(p); w.connect(p); }
  B._fetchUserState();
  await w.run(w.now() + 300);
  B.toggleArchive(w.sessions[1]);   // B un-archives X after the restart
  await w.run(w.now() + 600000);   // ten virtual minutes: a page that retried for ever is RED here, not a hang
  const st = w.serverState();
  ok(!st.archivedSessions.includes(w.sessions[1].sessionKey) && w.dup >= 1, 'EXACTLY ONCE ACROSS A RESTART (smaller 5): the batch memory rides the same atomic write as stateRev — A\'s re-sent batch is a duplicate after the restart, B\'s later un-archive stands', { server: st.archivedSessions, dup: w.dup });
}

{
  // ROUND 3, smaller 1: the PATCH route loads the state BEFORE it consults the batch memory — the FIRST request of a new process
  // being a re-sent batch is a duplicate (exactly once does not lean on another module's boot read)
  const w = createWorld({ seed: 131, sessions: mkSessions(3) });
  const first = w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgboot001:1', ops: [{ key: 'archivedSessions', item: w.sessions[1].sessionKey, value: true }] }] });
  w.call(w.H.ops || w.H.patch, { batches: [{ batch: 'pgother01:1', ops: [{ key: 'archivedSessions', item: w.sessions[1].sessionKey, value: false }] }] });   // another page un-archives it
  const P2 = freshPersistence();
  P2.setup({ dataDir: w.dataDir, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, userStateClock: () => (w.T0 || 0) + w.now() + (w.serverStep || 0), userStateMono: () => w.now() });
  const again = w.call((handlerOf(P2.router, 'patch', '/api/user-state/batches') || handlerOf(P2.router, 'patch', '/api/user-state')), { batches: [{ batch: 'pgboot001:1', ops: [{ key: 'archivedSessions', item: w.sessions[1].sessionKey, value: true }] }] });
  const st = w.call(handlerOf(P2.router, 'get', '/api/user-state')).body;
  ok(first.body.rev === 1 && JSON.stringify(again.body.superseded) === JSON.stringify(['pgboot001:1']) && !(again.body.applied || []).length && again.body.rev >= 1 && !st.archivedSessions.includes(w.sessions[1].sessionKey),
    'ROUND 3 smaller 1: the FIRST request of a new process, a re-sent batch the later un-archive beat, is answered superseded (round 8: not on disk — never «held») — the route reads the state and its facts before it judges the batch; the later un-archive stands', [first.body, again.body]);
}
{
  // ROUND 3, smaller 2 + 3: an act made before the first GET is sent ONCE, and NOTHING is sent before that GET names the server
  const run = async (stateText) => {
    const Sb = await loadPage(stateText);
    const w = createWorld({ seed: 132, sessions: mkSessions(3) });
    let getAnsweredAt = Infinity;
    w.defaultLag = (method) => (method === 'get' ? { toServer: 2000, toPage: 10, drop: false } : { toServer: 10, toPage: 10, drop: false });
    const A = await addPage(w, Sb, 'early');
    A.toggleArchive(w.sessions[1]);   // before the first GET has answered
    const patchesBefore = [];
    await w.run(Infinity, (e) => { if (e.label === 'answer' && getAnsweredAt === Infinity && A._userStateFetched) getAnsweredAt = w.now(); if (e.label === 'server patch' && getAnsweredAt === Infinity) patchesBefore.push(w.now()); });
    const sends = w.writes.filter((wr) => wr.kind === 'ops').length + w.dup;
    return { patchesBefore: patchesBefore.length, sends, archived: w.serverState().archivedSessions.includes(w.sessions[1].sessionKey) };
  };
  const real = await run(STATE_SRC);
  ok(real.patchesBefore === 1 && real.sends === 1 && real.archived,
    'ROUND 6 smaller 1: an act made before the first GET is ON THE WIRE AT THE ACT (the ops door — an op needs no base on a server that takes ops; an older one says so by its 404) and lands ONCE; the GET that answers later is laid under it', real);
}
{
  // ROUND 3, smaller 4: the page splits a batch by BYTES as well as by count — a batch it builds is never refused by the body bound
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 134, sessions: mkSessions(2) });
  const A = await addPage(w, Sb, 'bytes');
  await w.run(500);
  const fat = Array.from({ length: 1500 }, (_, i) => ({ key: 'customNames', item: 'claude:f' + i, value: 'n'.repeat(1000) }));   // ~1.5 MB of ops in one act (round 12: parts of ≤ 512 KiB of values)
  A._userSync().record(fat);
  await w.run(w.now() + 600000);
  const parts = w.writes.filter((wr) => wr.kind === 'ops').flatMap((wr) => wr.parts || []), sizes = parts.map((x) => x.bytes);
  const reqBytes = w.writes.filter((wr) => wr.kind === 'ops').map((wr) => wr.requestBytes);
  ok(sizes.length >= 3 && sizes.every((n) => n <= UO.MAX_BATCH_BYTES) && reqBytes.every((n) => n <= UO.MAX_BODY_BYTES) && Object.keys(w.serverState().customNames).length === 1500 && !A.__toasts.some((x) => /refused/.test(x.text)),
    `ROUND 3 smaller 4: a 1.5 MB act goes as ${sizes.length} parts of ≤ ${UO.MAX_BATCH_BYTES} B of ops and ≤ 512 KiB of values, in requests of ≤ ${UO.MAX_BODY_BYTES} B (${reqBytes.join(' + ')} B) — none refused, all 1 500 applied`, { sizes, reqBytes });
}


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
      if (k === restartAt) { const P2 = freshPersistence(); P2.setup({ dataDir: w.dataDir, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, userStateClock: () => (w.T0 || 0) + w.now() + (w.serverStep || 0), userStateMono: () => w.now() }); h = handlerOf(P2.router, 'patch', '/api/user-state/batches') || handlerOf(P2.router, 'patch', '/api/user-state'); w.H.get = handlerOf(P2.router, 'get', '/api/user-state'); }
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
    const MUT = SRC.replace(from, to);
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

// ════════ §15 ROUND 6 — «ONCE» IS FOR EVER AND ON DISK BEFORE IT IS SAID; OPS ONLY TO A SERVER THAT SAID SO ════════
console.log('§15 round 6: once is for ever and on disk before it is said; forgetting fails closed; ops only to a server that takes them; the smaller five');
function onDisk(w) { try { return JSON.parse(fs.readFileSync(path.join(w.dataDir, 'user-state.json'), 'utf8')); } catch { return {}; } }   // (hoisted: the hard walk's restores read it)
/** every word the page says, with whether what it is about is on disk at that moment */
const hearing = (p, w, held) => { const f = p.__toast.bind(p); p.__said = []; p.__toast = (text, o) => { p.__said.push({ text, at: w.now(), held: held() }); return f(text, o); }; };
const noFalseSaved = (p) => (p.__said || []).every((x) => !/^Saved/.test(x.text) || x.held);
{
  // MUST 1(a) THE DISK REFUSES (ENOSPC on user-state.json for 0.1 / 5 / 40 s after an archive), the page staying or closed 3 s
  // after the act, then the hub restarts: judged by what is ON DISK and by every word said
  const realWrite = fs.writeFileSync;
  const cells = [];
  for (const outage of [100, 5000, 40000]) for (const leave of [false, true]) {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 160, sessions: mkSessions(4) });
    const p = await addPage(w, Sb, 'tab');
    await w.run(800);
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const X = w.sessions[1].sessionKey;
    const held = () => (onDisk(w).archivedSessions || []).includes(X);
    hearing(p, w, held);
    let full = true;
    fs.writeFileSync = function (f, ...a) { if (full && String(f).startsWith(w.dataDir) && /user-state\.json\.tmp$/.test(String(f))) { const e = new Error('ENOSPC: no space left on device, write'); e.code = 'ENOSPC'; throw e; } return realWrite.call(this, f, ...a); };
    let r503 = null;
    try {
      p.toggleArchive(w.sessions[1]);
      w.at(w.now() + outage, () => { full = false; }, 'the disk frees');
      if (leave) w.at(w.now() + 3000, () => endPage(w, p), 'the page closes');
      const cap = (w.H.ops || w.H.patch);
      r503 = w.call(cap, { batches: [{ batch: 'pgprobe001:1', ops: [{ key: 'starredSessions', item: 'claude:probe', value: true }] }] });   // while full: said by name
      await w.run(w.now() + 120000);
    } finally { fs.writeFileSync = realWrite; }
    restartWorld(w);
    if (!leave) { w.disconnect(p); w.connect(p); p._fetchUserState(); await w.run(w.now() + 60000); }
    cells.push({ outage, leave, onDisk: held(), falseSaved: !noFalseSaved(p), saved: (p.__said || []).filter((x) => /^Saved/.test(x.text)).length, answer: r503 && r503.status, named: r503 && /ENOSPC/.test(String(r503.body && r503.body.error)) });
  }
  ok(cells.every((c) => !c.falseSaved && (c.leave || c.onDisk) && c.answer === 503 && c.named),
    `MUST 1(a) THE DISK REFUSES for 0.1 / 5 / 40 s after an archive, the page staying or closed: «Saved» never said for what is not on disk (${cells.map((c) => `${c.outage / 1000} s ${c.leave ? 'closed' : 'stays'}: ${c.onDisk ? 'on disk' : 'not on disk'}, «Saved» ${c.saved}×`).join('; ')}); a write that fails moves neither the state nor the floor, and is answered 503 by name («ENOSPC»)`, cells);
}
{
  // MUST 1(b) A REQUEST THAT CHANGES NOTHING moves the floor ON DISK: P's batch is a no-op (X already archived by Q), its answer
  // lost; Q un-archives X; the hub restarts; P re-sends — a duplicate, Q's act stands
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 165, sessions: mkSessions(4) });
  const P = await addPage(w, Sb, 'P'), Q = await addPage(w, Sb, 'Q');
  await w.run(800);
  w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
  const X = w.sessions[1];
  w.disconnect(P);   // P hears nothing of Q's acts
  Q.toggleArchive(X); await w.run(w.now() + 500);
  P.__lag = (m) => ({ toServer: 20, toPage: 20, drop: m === 'patch' });
  P.toggleArchive(X); await w.run(w.now() + 300);   // a no-op on what the server holds; the answer is lost
  P.__lag = null;
  P.__fetch = ((f) => (u, o) => (o && o.method === 'PATCH' ? new Promise(() => { }) : f(u, o)))(P.__fetch.bind(P));   // P's re-sends wait (its laptop)
  restartWorld(w);   // the hub restarts BEFORE any other write (nothing else carried the floor to disk)
  w.disconnect(Q); w.connect(Q); Q._fetchUserState();
  await w.run(w.now() + 500);
  Q.toggleArchive(X); await w.run(w.now() + 500);   // Q's LATER act (after the restart): un-archive
  P.__fetch = Sb.prototype.__fetch.bind(P);
  w.disconnect(P); w.connect(P); P._fetchUserState();   // P wakes and re-sends
  await w.run(w.now() + 60000);
  const st = w.serverState();
  ok(!st.archivedSessions.includes(X.sessionKey) && !P._archivedIds.has(X.sessionKey) && !Q._archivedIds.has(X.sessionKey) && !twiceOf(w).length,
    'MUST 1(b) A REQUEST THAT CHANGED NOTHING moved the floor ON DISK (the memory alone written — no rev, no broadcast): after a restart its re-send is a duplicate — another page\'s later un-archive stands on the server and on both pages', { server: st.archivedSessions, P: [...P._archivedIds], twice: twiceOf(w) });
}
{
  // MUST 3 THE INCIDENT WITH A SOCKET DROP: 120 clicks, the hub silent 44 s, the socket dropped and re-made at 20 s with its GET
  // waiting in the stall too ⇒ no whole-key request ever reaches a server that takes ops; 0 lost; no rollback
  const r = await ownerScene(STATE_SRC, { drop: 20000 });
  ok(!r.rolledBack && r.whole === 0 && r.server.archivedSessions.length === 120 && [...r.archived].every((k) => r.server.archivedSessions.includes(k)),
    `MUST 3 — THE INCIDENT WITH A SOCKET DROP (120 clicks, the hub silent 44 s, the socket dropped and re-made at 20 s, its GET in the stall): ${r.whole} whole-key requests reached the server that takes ops, 0 lost, no rollback (${r.patches} PATCHes)`, { whole: r.whole, rolledBack: r.rolledBack, server: r.server.archivedSessions.length });
}
{
  // MUST 3: the junk a .392 hub stored (a top-level `batches`, 465 KB for one select-all) is dropped by this tree's first load
  const w = createWorld({ seed: 177, sessions: mkSessions(3) });
  const junk = { stateVersion: 2, starredSessions: [], archivedSessions: [w.sessions[1].sessionKey], archivedFolders: [], customNames: {}, sessionModes: {}, sessionConfigs: {}, sessionGroups: {}, groupFolders: {}, batches: [{ batch: 'pgjunk0001:1', ops: [] }], born: 3, seq: 1 };
  restartWorld(w, junk);
  const got = w.serverState();
  const disk = onDisk(w);
  ok(!('batches' in got) && !('born' in got) && !('seq' in got) && !('batches' in disk) && !('seq' in disk) && got.archivedSessions.includes(w.sessions[1].sessionKey),
    'MUST 3: the junk a .392 hub stored (top-level batches / born / seq) is gone after ONE load — not in the GET, not on disk (the load rewrites a normalized file); the person\'s keys stay', { got: Object.keys(got), disk: Object.keys(disk) });
}
{
  // SMALLER 1 (the verifier's d6x): the GET answers after 0.5 / 2 / 5 / 20 s; an act at 300 ms; the tab closed or reloaded 50 ms /
  // 1 s / 4 s / 30 s later; another device had archived a different conversation — the act is kept, and so is the other's
  const scene = async (src, { get, after, how }) => {
    const Sb = await loadPage(src);
    const w = createWorld({ seed: 180, sessions: mkSessions(4) });
    w.call(w.H.patch, { archivedSessions: [w.sessions[3].sessionKey] });   // another device's archive, before the page loads
    w.defaultLag = (m) => ({ toServer: m === 'get' ? get : 20, toPage: 20, drop: false });
    const p = await addPage(w, Sb, 'early');
    await w.run(300);
    p.toggleArchive(w.sessions[1]);
    await w.run(w.now() + after);
    if (how === 'close') endPage(w, p); else await reloadPage(w, Sb, p);
    await w.run(w.now() + 60000);
    const st = w.serverState();
    return { kept: st.archivedSessions.includes(w.sessions[1].sessionKey), other: st.archivedSessions.includes(w.sessions[3].sessionKey) };
  };
  let tipKept = 0, tipOther = 0, baseKept = 0, baseOther = 0, n = 0;
  for (const get of [500, 2000, 5000, 20000]) for (const after of [50, 1000, 4000, 30000]) for (const how of ['close', 'reload']) {
    n++;
    const t = await scene(STATE_SRC, { get, after, how }), b = await scene(BASE_SRC, { get, after, how });
    tipKept += t.kept; tipOther += t.other; baseKept += b.kept; baseOther += b.other;
  }
  ok(tipKept === n && tipOther === n,
    `SMALLER 1 — AN ACT BEFORE THE FIRST GET is on the wire at the act (the ops door): kept in ${tipKept} of ${n} cells, the other device's archive kept in ${tipOther} — master's page keeps the act in ${baseKept} and the other device's archive in ${baseOther} (its whole-state POST)`, { tipKept, tipOther, baseKept, baseOther, n });
}
{
  // SMALLER 2: the paced re-send and the requests listened to are BOUNDED BY COUNT — the hub unreachable for an hour
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 185, sessions: mkSessions(80) });
  const p = await addPage(w, Sb, 'tab');
  await w.run(800);
  w.down = true;
  const r0 = w.requests;
  p.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 3600000);
  const tries = w.requests - r0;
  // and requests that never answer: 60 acts, each request hangs — the map listened to stays bounded
  w.down = false;
  const f = p.__fetch.bind(p);
  p.__fetch = (u, o) => (o && o.method === 'PATCH' ? new Promise(() => { }) : f(u, o));
  let most = 0;
  for (let i = 2; i < 62; i++) { p.toggleArchive(w.sessions[i]); most = Math.max(most, p._userSync().inFlight()); await w.run(w.now() + 50); }
  p.__fetch = f;
  p._fetchUserState();   // the hub reachable again: one request at once carries everything
  await w.run(w.now() + 60000);
  const st = w.serverState();
  const PROBES = 40, LISTENED = 32;   // the STATED bounds (kb, the report): a lowered PROBES_MAX / IN_FLIGHT_MAX is red here
  // (round 15: each send is a keepalive request and — refused by the dead network — its plain fallback in the same send: TWO requests an
  // attempt while the hub is unreachable; the attempts are still 1 + the stated paced re-sends)
  ok(tries === 2 * (1 + PROBES) && most === LISTENED && st.archivedSessions.length === 61,
    `SMALLER 2 — BOUNDED BY COUNT: the hub unreachable for an hour ⇒ ${tries} requests (1 + the stated ${PROBES} paced re-sends, each a keepalive and its plain fallback, then none until an act, a reconnect or a state); 60 acts with requests that never answer ⇒ at most ${most} listened to (the stated ${LISTENED}); back online, all 61 land`, { tries, most, archived: st.archivedSessions.length });
}
{
  // SMALLER 4: a refusal with no reason says a whole sentence — never one that ends in «: »
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 195, sessions: mkSessions(3) });
  const p = await addPage(w, Sb, 'tab');
  await w.run(800);
  w.H.ops = (req, res) => res.status(400).json({});
  p.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 3000);
  const t = p.__toasts.map((x) => x.text);
  ok(t.some((x) => x === 'The server refused a change, so it was undone here.') && !t.some((x) => /: $/.test(x) || /:\s*$/.test(x)),
    'SMALLER 4 — a refusal with no reason is said as a whole sentence («… undone here.»), never one ending in «: »', t);
}

// ════════ §16 ROUND 7 — THE LATER ACT WINS; A FACT PER SLOT, NEVER A MEMORY PER PAGE ════════
console.log('§16 round 7: the later act wins (each act carries its age; a fact per slot); C1 ops only; C2 the read path never writes');
/** a world on the virtual wall clock, a page in it; `skew` = the page's device clock against the hub's (an age is a difference) */
const r7page = async (w, Sb, name, { skew = 0 } = {}) => { const p = await addPage(w, Sb, name); p.__skew = skew; return p; };
{
  // TWO DEVICES: the phone renames X; ten seconds later the desktop (its view 44 s behind — its echo has not come) renames it again
  // ⇒ the LATER act stands, as on master
  const scene = async (src) => {
    const Sb = await loadPage(src);
    const w = createWorld({ seed: 300, sessions: mkSessions(3) });
    const phone = await r7page(w, Sb, 'phone', { skew: -5000 }), desk = await r7page(w, Sb, 'desk', { skew: 7000 });
    await w.run(800);
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    w.disconnect(desk);   // the desktop hears nothing (its echoes 44 s behind)
    phone.setCustomName(w.sessions[1], 'from the phone');
    await w.run(w.now() + 10000);
    desk.setCustomName(w.sessions[1], 'from the desktop, later');
    await w.run(w.now() + 5000);
    w.connect(desk); desk._fetchUserState();
    await w.run(w.now() + 60000);
    return w.serverState().customNames[w.sessions[1].sessionKey];
  };
  const tip = await scene(STATE_SRC), base = await scene(BASE_SRC);
  ok(tip === 'from the desktop, later' && base === 'from the desktop, later',
    `TWO DEVICES: the phone renames, the desktop (its view 44 s stale, its clock 12 s apart) renames again 10 s later ⇒ the LATER act stands here («${tip}») and on master («${base}») — no conflict sentence`, { tip, base });
}
{
  // THE SLEEPER (主开发 15:23Z): P renames X and its lid shuts AT the act — the request never leaves the laptop; a second later Q
  // renames X. Two days on P wakes and at once archives Y, before its first echo (its GET 3 s away) ⇒ HERE P's rename is dropped
  // (Q changed X after it was made: P shows Q's name, nothing said); ON MASTER P's stale customNames go whole with the archive and
  // land over Q's (the red control: why this lane exists). Asleep 8 days: its rename is older than a week — not applied, said
  // once, undone. The two devices' clocks are 7 s apart (an age is a difference on ONE device)
  const scene = async (src, days) => {
    const Sb = await loadPage(src);
    const w = createWorld({ seed: 310, sessions: mkSessions(4) });
    const P = await r7page(w, Sb, 'P', { skew: -3000 }), Q = await r7page(w, Sb, 'Q', { skew: 4000 });
    await w.run(800);
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const X = w.sessions[1], Y = w.sessions[2];
    let asleep = true;
    const f = P.__fetch.bind(P);
    P.__fetch = (u, o) => (asleep ? new Promise(() => { }) : f(u, o));   // the lid shut at the act: nothing leaves the laptop
    P.setCustomName(X, 'P, before the sleep');
    w.disconnect(P); P.__frozen = true; P.__wakeAt = w.now() + 1000 + days * 86400000;
    await w.run(w.now() + 1000);
    Q.setCustomName(X, 'Q, a second later');
    await w.run(w.now() + days * 86400000);
    asleep = false; P.__frozen = false;
    P.__lag = (m) => ({ toServer: 20, toPage: m === 'get' ? 3000 : 20, drop: false });   // its first state is 3 s away
    w.connect(P); P._fetchUserState();
    P.toggleArchive(Y);   // at once, before the first echo
    await w.run(w.now() + 60000);
    const st = w.serverState();
    return { name: st.customNames[X.sessionKey], shown: P._customNames[X.sessionKey], y: st.archivedSessions.includes(Y.sessionKey), old: P.__toasts.filter((x) => /more than 7 days ago/.test(x.text)).length, said: P.__toasts.map((x) => x.text) };
  };
  const t2 = await scene(STATE_SRC, 2), b2 = await scene(BASE_SRC, 2), t8 = await scene(STATE_SRC, 8);
  const Qn = 'Q, a second later';
  ok(t2.name === Qn && t2.shown === Qn && t2.y && !t2.said.length && b2.name === 'P, before the sleep' && t8.name === Qn && t8.shown === Qn && t8.y && t8.old === 1 && t8.said.length === 1,
    `THE SLEEPER: P renames X, its lid shut at the act; Q renames X a second later; P wakes 2 days on and archives Y at once ⇒ HERE Q's later name stands («${t2.name}», shown on P too, nothing said) and the archive lands; ON MASTER the sleeper's stale whole customNames land over it («${b2.name}» — RED, the control). Asleep 8 days: the rename is older than a week — not applied, said once («more than 7 days ago»), undone; the archive lands`, { t2, b2, t8 });
}
/** a scene on ONE clock: the hub's Date.now is the world's (round 6's route aged its page memory by Date.now — the forgetting the
 *  holes grew from; this route reads its injected clock, the same one) */
const onWorldClock = async (fn) => {
  const real = Date.now;
  let wRef = null;
  Date.now = () => 1794400000000 + (wRef ? wRef.now() : 0);
  try { return await fn((w) => { wRef = w; return w; }); } finally { Date.now = real; }
};
const DAY_MS = 86400000;
{
  // HOLE 1 (fixups-r7): AN ACT BEFORE THE FIRST GET on a hub that once let a page go — a page acted once and was never heard again;
  // eight days on another device writes; a new page on the slow hub (its GET 5 s away) archives 20 at load ⇒ 20 of 20 kept, nothing
  // said (master keeps 20)
  const scene = (src) => onWorldClock(async (bind) => {
    const Sb = await loadPage(src);
    const w = bind(createWorld({ seed: 320, sessions: mkSessions(40) }));
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const H = await r7page(w, Sb, 'history');
    await w.run(1000);
    H.toggleStar(w.sessions[30]);
    await w.run(w.now() + 2000);
    endPage(w, H);
    await w.run(w.now() + 8 * DAY_MS);
    const O = await r7page(w, Sb, 'other');
    await w.run(w.now() + 1000);
    O.toggleStar(w.sessions[31]);
    await w.run(w.now() + 2000);
    w.defaultLag = (m) => ({ toServer: m === 'get' ? 5000 : 20, toPage: 20, drop: false });
    const E = await r7page(w, Sb, 'early');
    await w.run(w.now() + 300);
    for (let i = 0; i < 20; i++) E.toggleArchive(w.sessions[i]);
    await w.run(w.now() + 60000);
    const st = w.serverState();
    return { kept: w.sessions.slice(0, 20).filter((x) => st.archivedSessions.includes(x.sessionKey)).length, said: E.__toasts.filter((x) => !/^Archived/.test(x.text)).map((x) => x.text) };
  });
  const tip = await scene(STATE_SRC), base = await scene(BASE_SRC);
  ok(tip.kept === 20 && !tip.said.length && base.kept === 20,
    `HOLE 1 — AN ACT BEFORE THE FIRST GET on a hub that once let a page go (8 days silent, then another device's write): 20 archives at load, the GET 5 s away ⇒ ${tip.kept} of 20 kept here, ${tip.said.length} words said; master ${base.kept}`, { tip, base });
}
{
  // HOLE 2: A TAB THAT WAS NEVER AWAY — open, connected, hearing every broadcast, its last sidebar act 8 days ago; another device
  // writes; its next act ⇒ lands, nothing said
  const scene = (src) => onWorldClock(async (bind) => {
    const Sb = await loadPage(src);
    const w = bind(createWorld({ seed: 321, sessions: mkSessions(10) }));
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const I = await r7page(w, Sb, 'idle'), O = await r7page(w, Sb, 'other');
    await w.run(1000);
    I.toggleStar(w.sessions[1]);
    await w.run(w.now() + 2000);
    for (let d = 0; d < 8; d++) { await w.run(w.now() + DAY_MS); }
    O.toggleStar(w.sessions[2]);
    await w.run(w.now() + 2000);
    I.toggleArchive(w.sessions[3]);
    await w.run(w.now() + 10000);
    return { lands: w.serverState().archivedSessions.includes(w.sessions[3].sessionKey), shown: I._archivedIds.has(w.sessions[3].sessionKey), said: I.__toasts.filter((x) => !/^Archived/.test(x.text)).map((x) => x.text) };
  });
  const tip = await scene(STATE_SRC);
  ok(tip.lands && tip.shown && !tip.said.length,
    `HOLE 2 — A TAB THAT WAS NEVER AWAY (connected 8 days, its last act 8 days ago, another device's write since): its next act lands (${tip.lands}), shown, ${tip.said.length} words said`, tip);
}
{
  // HOLE 3: THE COUNTER GOES BACK — the counter climbs past 40, a page made then acts and goes; the file is restored with the counter
  // at 3; eight days on new pages act, before and after a restart ⇒ every act lands, nothing said
  const scene = (src) => onWorldClock(async (bind) => {
    const Sb = await loadPage(src);
    const w = bind(createWorld({ seed: 322, sessions: mkSessions(60) }));
    w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
    const O = await r7page(w, Sb, 'other');
    await w.run(1000);
    for (let i = 0; i < 40; i++) { O.toggleStar(w.sessions[i]); await w.run(w.now() + 50); }
    const B = await r7page(w, Sb, 'born-high');
    await w.run(w.now() + 1000);
    B.toggleArchive(w.sessions[45]);
    await w.run(w.now() + 2000);
    endPage(w, B);
    restartWorld(w, { ...onDisk(w), [UO.REV_KEY]: 3 });   // a truncated / restored file: the counter back to 3
    w.disconnect(O); w.connect(O); O._fetchUserState();
    await w.run(w.now() + 8 * DAY_MS);
    const pages = [O];
    const act = async (p, i) => { p.toggleArchive(w.sessions[i]); await w.run(w.now() + 2000); };
    const F = await r7page(w, Sb, 'fresh1'); pages.push(F); await w.run(w.now() + 1000); await act(F, 50);
    const F2 = await r7page(w, Sb, 'fresh2'); pages.push(F2); await w.run(w.now() + 1000); await act(F2, 51);
    await act(O, 52);
    restartWorld(w);
    for (const p of pages) { w.disconnect(p); w.connect(p); p._fetchUserState(); }
    await w.run(w.now() + 2000);
    await act(F2, 53);
    const F3 = await r7page(w, Sb, 'fresh3'); pages.push(F3); await w.run(w.now() + 1000); await act(F3, 54);
    await w.run(w.now() + 30000);
    const st = w.serverState();
    return { landed: [50, 51, 52, 53, 54].filter((i) => st.archivedSessions.includes(w.sessions[i].sessionKey)).length, said: pages.flatMap((p) => p.__toasts.filter((x) => !/^Archived/.test(x.text)).map((x) => x.text)) };
  });
  const tip = await scene(STATE_SRC);
  ok(tip.landed === 5 && !tip.said.length,
    `HOLE 3 — THE COUNTER GOES BACK (past 40, then a restored file at 3; eight days on, new pages and an old one act, before and after a restart): ${tip.landed} of 5 acts land, ${tip.said.length} words said`, tip);
}
{
  // (4) C2 — NOTHING ON THE READ PATH REPLACES WHAT WAS READ: a hub that boots on a FULL disk, or on a READ-ONLY data dir, with a
  // file the normalizer wants to rewrite (a stored junk key) ⇒ every conversation's state served; nothing lost at the next write
  const realWrite = fs.writeFileSync;
  const rows = [];
  for (const how of ['full disk', 'read-only']) {
    const w = createWorld({ seed: 330, sessions: mkSessions(3) });
    const archived = Array.from({ length: 340 }, (_, i) => 'claude:arch' + i);
    restartWorld(w, { stateVersion: 2, starredSessions: [], archivedSessions: [], archivedFolders: [], customNames: {}, sessionModes: {}, sessionConfigs: {}, sessionGroups: {}, groupFolders: {} });
    const file = path.join(w.dataDir, 'user-state.json');
    realWrite(file, JSON.stringify({ stateVersion: 2, starredSessions: [], archivedSessions: archived, archivedFolders: [], customNames: {}, sessionModes: {}, sessionConfigs: {}, sessionGroups: {}, groupFolders: {}, batches: [{ batch: 'x:1', ops: [] }], [UO.REV_KEY]: 9 }, null, 2));
    let refuse = true;
    fs.writeFileSync = function (f, ...a) { if (refuse && String(f).startsWith(w.dataDir)) { const e = new Error(how === 'full disk' ? 'ENOSPC: no space left on device' : 'EROFS: read-only file system'); e.code = how === 'full disk' ? 'ENOSPC' : 'EROFS'; throw e; } return realWrite.call(this, f, ...a); };
    let served;
    try {
      const P2 = freshPersistence();
      P2.setup({ dataDir: w.dataDir, wss: { clients: w.clients }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, userStateClock: () => w.T0 + w.now() + (w.serverStep || 0), userStateMono: () => w.now() });
      w.H.get = handlerOf(P2.router, 'get', '/api/user-state'); w.H.ops = handlerOf(P2.router, 'patch', '/api/user-state/batches');
      served = w.call(w.H.get).body;
      refuse = false;   // the disk frees: the next write
      w.call(w.H.ops, { batches: [{ batch: 'pgafterboot:1', age: 0, ops: [{ key: 'starredSessions', item: 'claude:s', value: true }] }] });
    } finally { fs.writeFileSync = realWrite; }
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    rows.push({ how, served: (served.archivedSessions || []).length, afterWrite: (after.archivedSessions || []).length, junk: 'batches' in after });
  }
  ok(rows.every((r) => r.served === 340 && r.afterWrite === 340 && !r.junk),
    `C2 — A HUB BOOTING ON A FULL DISK / A READ-ONLY DATA DIR, its file one the normalizer would rewrite: ${rows.map((r) => `${r.how}: ${r.served} of 340 served, ${r.afterWrite} on disk after the next write`).join('; ')} — the read is the state served (the rewrite fails alone, said once), the junk dropped by the first write that lands`, rows);
}
{
  // C1 — THE ROLLBACK CELLS (the verifier's V2) on this page: the hub comes back as 2.369.392 (no ops door) — A: an act after it is up;
  // B: an act while it is down; C: both ⇒ «Not saved yet», kept on the page, NOTHING written to the old file; and a relay's 404 while
  // the hub restarts ⇒ 0 whole-key requests, no false sentence
  const rows = [];
  for (const cell of ['A', 'B', 'C']) {
    const Sb = await loadPage(STATE_SRC);
    const w = createWorld({ seed: 7, sessions: mkSessions(8) });
    const me = await r7page(w, Sb, 'me');
    await w.run(1000);
    w.defaultLag = () => ({ toServer: 30, toPage: 30, drop: false });
    me.toggleArchive(w.sessions[1]); await w.run(w.now() + 1000);
    w.down = true; w.disconnect(me);
    if (cell !== 'A') me.toggleArchive(w.sessions[2]);
    await w.run(w.now() + 1500);
    mountOlder(w); w.down = false;
    await w.run(w.now() + 1000);
    if (cell !== 'B') me.toggleArchive(w.sessions[3]);
    await w.run(w.now() + 2500);
    w.connect(me); me._fetchUserState();
    await w.run(w.now() + 120000);
    const st = onDisk(w);
    const known = ['stateVersion', 'starredSessions', 'archivedSessions', 'archivedFolders', 'customNames', 'sessionModes', 'sessionConfigs', 'sessionGroups', 'groupFolders', UO.REV_KEY, UO.FACTS_KEY, UO.CLOCK_KEY];
    rows.push({ cell, whole: w.wholeRequests, junk: Object.keys(st).filter((k) => !known.includes(k)), notSaved: me.__toasts.filter((x) => /Not saved yet/.test(x.text)).length, older: me.__toasts.some((x) => /saved|server|older|reload/i.test(x.text)), kept: pendingOf(me) });   // (round 14 follow-up: any word on saving or the server — round 7 grepped «older VibeSpace», which no sentence says any more)
  }
  // a relay's 404 during a restart (the hub itself takes ops)
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 8, sessions: mkSessions(4) });
  const me = await r7page(w, Sb, 'me');
  await w.run(1000);
  w.defaultLag = () => ({ toServer: 30, toPage: 30, drop: false });
  const realOps = w.H.ops;
  w.H.ops = (req, res) => res.status(404).json({ error: 'Not Found (a relay, the hub restarting)' });
  me.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 3000);
  w.H.ops = realOps;
  me._fetchUserState();
  await w.run(w.now() + 60000);
  const relay = { whole: w.wholeRequests, older: me.__toasts.some((x) => /saved|server|older|reload/i.test(x.text)), landed: w.serverState().archivedSessions.includes(w.sessions[1].sessionKey) };
  ok(rows.every((r) => r.whole === 0 && !r.junk.length && r.notSaved === 0 && !r.older && r.kept >= 1),
    `C1 — THE OLDER-SERVER ROAD IS GONE: the rollback cells A / B / C (an act after the old hub is up / while it is down / both) keep the acts on the page, nothing said (round 9) (${rows.map((r) => `${r.cell} ${r.kept} kept`).join(', ')}), 0 whole-key requests, the old file gains no key`, rows);
  ok(relay.whole === 0 && !relay.older && relay.landed,
    `C1 — A RELAY'S 404 WHILE THE HUB RESTARTS: 0 whole-key requests (${relay.whole}), no false sentence, the act lands when the hub is back (${relay.landed})`, relay);
}
{
  // THE AGE, HONEST: a negative age is 0; a fact AHEAD of the server's now (a clock set back, a restored file) is read as now — never a
  // lock-out; an act older than 7 days is not applied; a fact older than 7 days is dropped AT A WRITE (never on the read path)
  const facts = new Map();
  const NOW = 1794400000000, DAY = 86400000;
  facts.set(UO.slotOf({ key: 'customNames', item: 'x', value: 'q' }), { t: NOW + 30 * DAY, page: 'pgotherpage', counter: 1, prev: [] });   // ahead of now
  const r1 = UO.judgeRequest(facts, 'pgmine0001', UO.parseRequest([{ batch: 'pgmine0001:1', age: -5000, ops: [{ key: 'customNames', item: 'x', value: 'mine' }] }]).list, {}, NOW);
  const r2 = UO.judgeRequest(new Map(), 'pgmine0002', UO.parseRequest([{ batch: 'pgmine0002:1', age: 7 * DAY + 1, ops: [{ key: 'customNames', item: 'y', value: 'old' }] }]).list, {}, NOW);
  const store = UO.factStore();
  store.load({ 'n\tfresh': UO.factOut({ t: NOW - DAY, page: 'pgaaaaaa', counter: 1, prev: [] }), 'n\tstale': UO.factOut({ t: NOW - 8 * DAY, page: 'pgbbbbbb', counter: 1, prev: [] }) });
  const kept0 = store.size;   // loaded whole (never pruned on the read path)
  const dr = store.draft(); store.sweep(dr, NOW); store.commit(dr);
  const out = JSON.parse(store.text());
  let threw = null;
  try { store.load({ 'n\tok': 'zz:pgcccccc:1::0', bad: 'nope', arr: [1], 'n\tx': 'NaN:x:y:z:w' }); store.load(null); store.load([1, 2]); } catch (e) { threw = e.message; }
  // the page's side: a device clock set BACK 5 s between the act and its send ⇒ the age it sends is 0, never negative
  let clock = NOW;
  const sentAges = [];
  const pg = UO.createSync({ send: (body) => { sentAges.push(...body.batches.map((x) => x.age)); return new Promise(() => { }); }, now: () => clock, mono: () => clock, pageId: 'pgclock001', setTimer: () => 0, clearTimer: () => { } });   // (its monotonic door = its wall clock: a page with no performance.now — both go back)
  pg.apply({ stateRev: 1, stateEpoch: 'epClock1', customNames: {} });
  pg.record([{ key: 'customNames', item: 'x', value: 'a' }]);   // sent at the act: age 0
  clock -= 5000;
  pg.record([{ key: 'customNames', item: 'y', value: 'b' }]);   // the next request carries the first act again — its age would be −5 s
  const routeAge = UO.parseRequest([{ batch: 'pgclock001:1', age: -5000, ops: [{ key: 'customNames', item: 'x', value: 'a' }] }]).list[0].age;
  // the age is the device's WALL clock (主开发: a monotonic page timer stops while a laptop sleeps — a sleeper's act would look fresh):
  // the engine's clock door defaults to Date.now, and the page gives it none of its own (production sets no test seam)
  const opsText = read('src/user-state-ops.js'), stateText = read('src/lib/sidebar-state.js');
  const syncBlock = stateText.slice(stateText.indexOf('proto._userSync = function'), stateText.indexOf('onView: (v) => this._showUserStateView(v)'));
  const wallClock = /now = \(\) => Date\.now\(\)/.test(opsText) && /Math\.max\(t - b\.at, tm - b\.atM\)/.test(opsText) && syncBlock.length > 0 && !/\b(now|mono)\s*:/.test(syncBlock);   // (round 8: max(wall, monotonic) — the wall for a sleeper, the monotonic one where the wall went back)
  ok(r1.verdicts[0].verdict === 'applied' && r2.verdicts[0].verdict === 'old' && kept0 === 2 && 'n\tfresh' in out && !('n\tstale' in out) && !threw && sentAges.every((x) => x === 0) && sentAges.length === 3 && routeAge === 0 && wallClock,
    'THE AGE, HONEST: the age is the device\'s WALL clock (the engine\'s clock door is Date.now; the page passes none — never a timer that stops while a laptop sleeps); a page whose clock goes back between an act and its send sends age 0 and the route reads a negative age as 0; a fact ahead of the server\'s now is read as now (the act applies — never a lock-out); an act older than 7 days is not applied; a fact older than 7 days is dropped when the facts are WRITTEN; a damaged facts store loads and never throws', { r1: r1.verdicts, r2: r2.verdicts, out: Object.keys(out), threw, sentAges, routeAge, wallClock });
}
{
  // THE prev GUARD: an act APPLIED with its answer lost, another page's later change, then the act's copy that sat in a slow path —
  // its age short by its transit, so it reads as «made after» ⇒ HELD (never a second time over the later act)
  const facts = new Map();
  const NOW = 1794400000000;
  const slot = UO.slotOf({ key: 'archivedSessions', item: 'k', value: true });
  facts.set(slot, { t: NOW - 1000, page: 'pglater01', counter: 4, prev: [['pgslow0001', 7]] });   // the later act overrode pgslow0001's act 7
  const r = UO.judgeRequest(facts, 'pgslow0001', UO.parseRequest([{ batch: 'pgslow0001:7', age: 10, ops: [{ key: 'archivedSessions', item: 'k', value: true }] }]).list, {}, NOW);
  const next = UO.judgeRequest(new Map(facts), 'pgslow0001', UO.parseRequest([{ batch: 'pgslow0001:8', age: 10, ops: [{ key: 'archivedSessions', item: 'k', value: false }] }]).list, {}, NOW);
  ok(r.verdicts[0].verdict === 'superseded' && next.verdicts[0].verdict === 'applied',
    'THE prev GUARD: the copy of an act a later one overrode — long in transit, its age reads it as later — is SUPERSEDED (round 8: not on disk, so never «held» — never «Saved»); the same page\'s NEXT act (made after) applies', { r: r.verdicts, next: next.verdicts });
}
{
  // THE SLOW PHONE PATH (主开发 15:27Z, the prev field): the phone renames X — applied, its answer lost; a second later the desktop
  // renames X; the phone stars Y and that request (carrying the rename again) is 3 s on the way — its age (1.5 s) short by those
  // 3 s, so the rename reads as made AFTER the desktop's ⇒ HELD (the phone's act is in the fact's prev): the desktop's later name
  // stands, the star lands; the lost answer is said as any failure («Not saved yet», then «Saved»)
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 335, sessions: mkSessions(4) });
  const P = await r7page(w, Sb, 'phone', { skew: 9000 }), D = await r7page(w, Sb, 'desktop', { skew: -2000 });
  await w.run(800);
  w.defaultLag = () => ({ toServer: 20, toPage: 20, drop: false });
  const X = w.sessions[1], Y = w.sessions[2];
  let n = 0;
  P.__lag = (m) => (m !== 'patch' ? { toServer: 20, toPage: 20, drop: false } : ++n === 1 ? { toServer: 20, toPage: 20, drop: true } : { toServer: 3000, toPage: 20, drop: false });
  P.setCustomName(X, 'from the phone');
  await w.run(w.now() + 1000);
  D.setCustomName(X, 'from the desktop, a second later');
  await w.run(w.now() + 500);
  P.toggleStar(Y);
  await w.run(w.now() + 30000);
  const st = w.serverState();
  const name = st.customNames[X.sessionKey], heldCopies = w.superseded;
  ok(name === 'from the desktop, a second later' && st.starredSessions.includes(Y.sessionKey) && P._customNames[X.sessionKey] === name && !P.__toasts.length && w.superseded >= 1,
    `THE SLOW PHONE PATH: the phone's rename applied with its answer lost, the desktop's a second later, then the phone's next request 3 s on the way carrying the rename (its age short by the transit) ⇒ superseded by the fact's prev (${heldCopies} superseded — not on disk), the desktop's later name stands («${name}»), the star lands; nothing said (round 9 — the beaten rename takes nothing back the page showed as the person's: the screen follows the server)`, { name, starred: st.starredSessions, shown: P._customNames[X.sessionKey], toasts: P.__toasts.map((x) => x.text) });
}
{
  // A GROUP DELETE, JUDGED PER SLOT (the hard walk's seed 72058 at 300 seeds): page A deletes group g0 — but page B put m1 in it
  // AFTER A's delete was made (B's request reached the hub later) ⇒ m1 and the group stay (B's later act), A's own m2 goes. And in
  // ONE request: A adds m2 (batch 1), then deletes the group (batch 2), B's later change to the group between ⇒ m2 goes too (the
  // delete sees the members as batch 1 left them)
  const NOW = 1794400002000, A = 'pggroupA01', B = 'pggroupB01';
  const fact = (t, page, counter) => ({ t, page, counter, prev: [] });
  const g = (m) => UO.slotOf({ key: 'sessionGroups', item: 'g0', member: m, value: false });
  const one = () => {
    const facts = new Map([[g(undefined), fact(NOW - 500, B, 1)], [g('m1'), fact(NOW - 500, B, 1)], [g('m2'), fact(NOW - 1900, A, 1)]]);
    const state = { sessionGroups: { g0: ['m2', 'm1'] } };
    const j = UO.judgeRequest(facts, A, UO.parseRequest([{ batch: A + ':2', age: 1000, ops: [{ key: 'sessionGroups', item: 'g0', value: false }] }]).list, state, NOW);
    return { v: j.verdicts[0].verdict, g0: (UO.applyOps(state, j.ops).sessionGroups || {}).g0 };
  };
  const two = () => {
    const facts = new Map([[g(undefined), fact(NOW - 500, B, 1)], [g('m1'), fact(NOW - 500, B, 1)]]);
    const state = { sessionGroups: { g0: ['m1'] } };
    const j = UO.judgeRequest(facts, A, UO.parseRequest([{ batch: A + ':1', age: 1000, ops: [{ key: 'sessionGroups', item: 'g0', member: 'm2', value: true }] }, { batch: A + ':2', age: 900, ops: [{ key: 'sessionGroups', item: 'g0', value: false }] }]).list, state, NOW);
    return { v: j.verdicts.map((x) => x.verdict).join(), g0: (UO.applyOps(state, j.ops).sessionGroups || {}).g0 };
  };
  // (the hard walk's seed 90244) one act adds m3 and deletes the group, B's later delete of the group reached the hub first ⇒ no group
  const three = () => {
    const facts = new Map([[g(undefined), fact(NOW - 500, B, 2)], [g('m1'), fact(NOW - 500, B, 2)]]);
    const state = { sessionGroups: {} };
    const j = UO.judgeRequest(facts, A, UO.parseRequest([{ batch: A + ':3', age: 1000, ops: [{ key: 'sessionGroups', item: 'g0', member: 'm3', value: true }, { key: 'sessionGroups', item: 'g0', value: false }] }]).list, state, NOW);
    return { v: j.verdicts[0].verdict, has: 'g0' in (UO.applyOps(state, j.ops).sessionGroups || {}) };
  };
  // (90244 again, its root) a member ADDED to a group another page DELETED after the add was made ⇒ the later delete wins: no group
  const four = () => {
    const facts = new Map([[g(undefined), fact(NOW - 500, B, 2)], [g('m1'), fact(NOW - 500, B, 2)]]);
    const state = { sessionGroups: {} };
    const j = UO.judgeRequest(facts, A, UO.parseRequest([{ batch: A + ':4', age: 1000, ops: [{ key: 'sessionGroups', item: 'g0', member: 'm4', value: true }] }]).list, state, NOW);
    return { v: j.verdicts[0].verdict, has: 'g0' in ((j.ops.length ? UO.applyOps(state, j.ops) : state).sessionGroups || {}) };
  };
  const r1 = one(), r2 = two(), r3 = three(), r4 = four();
  ok(r1.v === 'applied' && JSON.stringify(r1.g0) === '["m1"]' && r2.v === 'applied,applied' && JSON.stringify(r2.g0) === '["m1"]' && r3.v === 'superseded' && !r3.has && r4.v === 'superseded' && !r4.has,
    `A GROUP DELETE, JUDGED PER SLOT: another page's later member and the group stay, this page's own member goes (g0 = ${JSON.stringify(r1.g0)}); a member this request's earlier batch added goes with the delete (g0 = ${JSON.stringify(r2.g0)}); an act that adds a member and deletes the group after another page's later delete leaves no group (${r3.has ? 'an empty group stands' : 'none'}); a member added to a group another page deleted LATER is dropped — the delete wins (${r4.v})`, { r1, r2, r3, r4 });
}
{
  // THE FACTS' SIZE at the owner's shape (≈ 2 000 conversations): a busy week — the incident's 122 archives, a select-all of 2 000,
  // 200 renames, 40 stars, 300 config fields — against master's file of the same state
  const w = createWorld({ seed: 340, sessions: mkSessions(2000) });
  const keys = w.sessions.map((x) => x.sessionKey);
  let n = 0;
  const send = (ops) => w.call(w.H.ops, { batches: [{ batch: 'pgowner001:' + (++n), age: 0, ops }] });
  send(keys.slice(0, 122).map((k) => ({ key: 'archivedSessions', item: k, value: true })));
  send(keys.map((k) => ({ key: 'archivedSessions', item: k, value: true })));
  send(keys.slice(0, 200).map((k, i) => ({ key: 'customNames', item: k, value: 'name ' + i })));
  send(keys.slice(0, 40).map((k) => ({ key: 'starredSessions', item: k, value: true })));
  send(keys.slice(0, 300).map((k) => ({ key: 'sessionConfigs', item: k, field: 'model', value: 'opus' })));
  const raw = fs.readFileSync(path.join(w.dataDir, 'user-state.json'), 'utf8');
  const st = JSON.parse(raw);
  const factsB = JSON.stringify(st[UO.FACTS_KEY]).length, master = JSON.stringify(UO.personKeys(st)).length;   // (round 12: the file is compact — as it is written)
  ok(factsB > 0 && Object.keys(st[UO.FACTS_KEY]).length === 2000 + 200 + 40 + 300 && factsB / Object.keys(st[UO.FACTS_KEY]).length < 120,
    `THE FACTS' SIZE at the owner's shape (2 000 conversations, a busy week: a select-all, 200 renames, 40 stars, 300 config fields): ${Object.keys(st[UO.FACTS_KEY]).length} facts, ${factsB} B (${(factsB / Object.keys(st[UO.FACTS_KEY]).length).toFixed(0)} B a fact) beside the state's ${master} B, a file of ${raw.length} B (compact) — the slots changed in the last week, never every slot ever (a fact older than 7 days is dropped at a write)`, { facts: Object.keys(st[UO.FACTS_KEY]).length, factsB, master });
}
{
  // THE PURE VERDICT, SEEDED (主开发's walk): item facts × ops in every arrival order × duplicates × two pages × whole-key writers.
  // Each world: 4–10 acts of two pages on 1–3 items, steps of 0–1.5 s; every act's request carries its page's acts so far, its ages
  // at its send; some bodies read late by a held loop (1–3 s — their ages stale by that), some sent again later (a NEW body, ages
  // fresh), some the SAME body twice (a proxy's retry, 3–7 s late), some again 8 days on (a laptop that slept); 5 % of acts made a
  // week before their request; up to two whole-key writes. Delivered in arrival order to judgeRequest + applyOps + moveFacts.
  // THE LAW, checked from outside: (1) no act applied twice; (2) an act applied never undoes a change ANOTHER writer made after it
  // (by the server's clock, against the act's time as the server can know it: its true time + the shortest transit of its copies
  // so far — two devices inside one transit are ordered by arrival, as on master); nor its own page's later act; (3) an act never
  // applied was dropped for a reason: another writer changed its item after it was made (true time), or its page's later act on
  // the item was applied, or it is a week old; (4) «not applied» is never said of an act that was; (5) the state = the replay
  const DAY = 86400000, T = 1794400000000;
  const walk = (M, worlds, seed0) => {
    let red = 0, first = null;
    for (let seed = seed0; seed < seed0 + worlds; seed++) {
      const R = rng(9000 + seed);
      const pages = ['pgpureA01', 'pgpureB01'], items = ['a', 'b', 'c'].slice(0, 1 + Math.floor(R() * 3));
      const acts = [];
      let t = T;
      const n = 4 + Math.floor(R() * 7);
      for (let i = 0; i < n; i++) {
        t += Math.floor(R() * 1500);
        const page = pages[R() < 0.5 ? 0 : 1], counter = acts.filter((x) => x.page === page).length + 1, old = R() < 0.05;
        acts.push({ i, page, counter, at: old ? t - 8 * DAY : t, item: items[Math.floor(R() * items.length)], value: 'v' + i, old });
      }
      const ds = [];
      for (const a of acts) {
        const carry = acts.filter((x) => x.page === a.page && x.counter <= a.counter);
        const sendAt = (a.old ? a.at + 8 * DAY : a.at) + Math.floor(R() * 300);
        ds.push({ page: a.page, carry, sendAt, arrive: sendAt + (R() < 0.2 ? 1000 + Math.floor(R() * 2000) : Math.floor(R() * 400)) });
        if (R() < 0.3) { const s2 = sendAt + 2000 + Math.floor(R() * 20000); ds.push({ page: a.page, carry, sendAt: s2, arrive: s2 + Math.floor(R() * 400) }); }
        if (R() < 0.15) ds.push({ page: a.page, carry, sendAt, arrive: sendAt + 3000 + Math.floor(R() * 4000) });
        if (R() < 0.04) { const s3 = sendAt + 8 * DAY; ds.push({ page: a.page, carry, sendAt: s3, arrive: s3 + Math.floor(R() * 400) }); }
      }
      const nW = R() < 0.5 ? 1 + Math.floor(R() * 2) : 0;
      for (let k = 0; k < nW; k++) ds.push({ whole: true, arrive: T + Math.floor(R() * (t - T + 2000)), item: items[Math.floor(R() * items.length)], value: 'whole' + k });
      ds.forEach((d, k) => { d.k = k; });
      ds.sort((x, y) => x.arrive - y.arrive || x.k - y.k);
      const facts = new Map(), ref = {}, writes = [], applied = new Map(), minTransit = new Map(), bad = [];
      let state = {};
      for (const d of ds) {
        const now = d.arrive;
        if (d.whole) {
          const before = state;
          state = { ...state, customNames: { ...(state.customNames || {}), [d.item]: d.value } };
          if ((before.customNames || {})[d.item] !== d.value) { writes.push({ item: d.item, t: now, made: now, madeTrue: now, writer: null }); ref[d.item] = d.value; }
          M.moveFacts(facts, before, state, now, new Set(), null);
          continue;
        }
        const list = d.carry.map((x) => ({ id: x.page + ':' + x.counter, seq: x.counter, age: Math.max(0, d.sendAt - x.at), ops: [{ key: 'customNames', item: x.item, value: x.value }], problem: null }));
        for (const a of d.carry) minTransit.set(a.i, Math.min(minTransit.get(a.i) ?? Infinity, d.arrive - d.sendAt));
        const j = M.judgeRequest(facts, d.page, list, state, now);
        const before = state;
        state = j.ops.length ? M.applyOps(state, j.ops) : state;
        M.moveFacts(facts, before, state, now, j.decided, { page: d.page, counter: list[list.length - 1].seq }, j.writers);
        j.verdicts.forEach((v, k) => {
          const a = d.carry[k];
          if (v.verdict === 'old') { if (applied.has(a.i)) bad.push(['«not applied» said of an applied act', a.i]); if (!a.old && d.sendAt - a.at <= M.MAX_ACT_AGE_MS) bad.push(['old though young', a.i]); return; }
          if (v.verdict !== 'applied') return;
          if (a.old) bad.push(['applied though a week old', a.i]);
          applied.set(a.i, (applied.get(a.i) || 0) + 1);
          let last = null;
          for (let q = writes.length - 1; q >= 0 && !last; q--) if (writes[q].item === a.item) last = writes[q];
          // (round 8: a fact's time is the act's — the rival's MAKE time, true, beyond this act's own transit excuse)
          if (last && last.writer !== a.page && last.madeTrue > a.at + minTransit.get(a.i)) bad.push(['applied over a later change', a.i]);
          if (last && last.writer === a.page && last.counter > a.counter) bad.push(['its own later act undone', a.i]);
          writes.push({ item: a.item, t: now, made: now - Math.max(0, d.sendAt - a.at), madeTrue: a.at, writer: a.page, counter: a.counter });
          ref[a.item] = a.value;
        });
      }
      for (const [i, c] of applied) if (c > 1) bad.push(['applied twice', i]);
      for (const a of acts) {
        if (applied.has(a.i) || a.old) continue;
        if (!writes.some((w2) => w2.item === a.item && ((w2.writer !== a.page && w2.made > a.at) || (w2.writer === a.page && w2.counter > a.counter)))) bad.push(['dropped with no later change', a.i]);   // (another writer's act, as the server dated it, after this one was made)
      }
      for (const it of items) if ((state.customNames || {})[it] !== ref[it]) bad.push(['state ≠ replay', it]);
      if (bad.length) { red++; if (!first) first = { seed, bad }; }
    }
    return { red, first };
  };
  const SRC = read('src/user-state-ops.js');
  const mut = (name, from, to) => {
    const MUT = SRC.replace(from, to);
    if (MUT === SRC) return { name, hit: false };
    const dir = fs.mkdtempSync(path.join(TMP, 'pure-' + name + '-'));
    fs.writeFileSync(path.join(dir, 'user-state-ops.cjs'), MUT);
    return { name, hit: true, ...walk(require(path.join(dir, 'user-state-ops.cjs')), 400, 0) };
  };
  const real = walk(UO, 3000, 0);
  const muts = [
    mut('prev of one page', 'const PREV_MAX = 4;', 'const PREV_MAX = 1;'),
    mut('no prev', "  if (f.prev && f.prev.some((e) => e[0] === page && counter <= e[1])) return 'superseded';", '  /* MUTANT */'),
    mut('a loser not remembered', 'facts.set(slot, { ...f, prev: addPrev(f.prev, page, seq, f.page, digest) });', '/* MUTANT */'),
    mut('a whole-key writer moves no fact', '    const slot = slotOf(op, false);\n    move(slot, op.value === false || op.value === null);', '    const slot = slotOf(op, false);\n    if (!fallback) continue; move(slot, op.value === false || op.value === null);'),
    mut('the facts move after the request', '      facts.set(slot, { t: stamp, page, counter: b.seq, digest: b.digest, prev:', '      if (0) facts.set(slot, { t: stamp, page, counter: b.seq, digest: b.digest, prev:'),
    mut('a fact stamped when it LANDED', 'stamp = Math.floor(Math.min(madeAt, now));', 'stamp = now;'),
    mut('«old» before «held»', "      if (b.ops.some((op) => judgeOp(factAt(facts, slotOf(op)), page, b.seq, 0, now) === 'held') || b.ops.every(holds)) {", '      if (false) {'),
  ];
  ok(real.red === 0 && muts.every((m) => m.hit && m.red > 0),
    `THE PURE VERDICT, SEEDED over 3000 worlds (two pages, 4–10 acts on 1–3 items, prefixes in every arrival order, held loops, fresh re-sends, the same body twice, a laptop 8 days asleep, week-old acts, whole-key writers): 0 red — no act applied twice, none over another writer's LATER change, none dropped without one, «not applied» never said of an applied act, the state = the replay. RED by name: ${muts.map((m) => `${m.name} ${m.red}/400`).join(', ')}`, { real, muts: muts.map((m) => ({ name: m.name, hit: m.hit, red: m.red, first: m.first })) });
}

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
  P2.setup({ dataDir: dir, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { }, userStateClock: () => wall, userStateMono: () => mono });
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

// ════════ §21 ROUND 12 — AN OLD ACT AFTER AN IMPORT; A GROUP TAKEN WHOLE IS ONE FACT; A REFUSAL SAID ONCE AN ANSWER ════════
console.log('§21 round 12: an old act after an import is superseded; a group deleted is one tombstone; two refusals in one answer said once');
{
  // ROUND 12 (the old roads) — AN OLD ACT AFTER AN IMPORT IS SUPERSEDED, NEVER HELD (imp11.mjs): P renames X and it LANDS (the answer
  // lost); six days later a config import replaces customNames; a day later P's re-send arrives, now older than 7 days ⇒ «superseded»
  // (round 11 answered «held» — the act's own fact named it — and the page kept its value over the import's without asking)
  const w = createWorld({ seed: 561, sessions: mkSessions(2) });
  const X = w.sessions[0].sessionKey, D = 86400000;
  const act = { batch: 'pgimpold001:1', ops: [{ key: 'customNames', item: X, value: 'mine' }] };
  const first = w.call(w.H.ops, { batches: [{ ...act, age: 0 }] }).body;
  await w.run(w.now() + 6 * D);
  const imp = handlerOf(w.P.router, 'post', '/api/config/import');
  const ri = w.call(imp, { file: { app: 'vibespace-config', sections: { userState: { stateVersion: 2, starredSessions: [], archivedSessions: [], archivedFolders: [], customNames: { [X]: 'imported' }, sessionModes: {}, sessionConfigs: {}, sessionGroups: {}, groupFolders: {} } } }, sections: ['userState'] });
  await w.run(w.now() + D + 60000);
  const again = w.call(w.H.ops, { batches: [{ ...act, age: 7 * D + 60000 }] }).body;
  ok((first.applied || []).length === 1 && ri.status === 200 && (again.superseded || []).includes(act.batch) && !(again.held || []).includes(act.batch) && w.serverState().customNames[X] === 'imported',
    `ROUND 12 — AN OLD ACT AFTER AN IMPORT: a rename that landed, an import 6 days later, its re-send at 7 days ⇒ ${(again.superseded || []).length ? 'superseded' : (again.held || []).length ? 'HELD' : JSON.stringify(again)}, the row «${w.serverState().customNames[X]}» (the import's)`, again);
}
{
  // ROUND 12, MUST 1 (2) — A GROUP TAKEN WHOLE IS ONE FACT, ITS TOMBSTONE (g11.mjs: a group of 400 000 deleted wrote a fact a member,
  // 2.6 s): (a) two pages add members to a NEW group, the older add arriving last ⇒ both land; (b) an add made before the group was
  // deleted and made again, arriving after both ⇒ dropped (the tombstone decides it; the new group keeps its own member); (c) a group
  // of 2 000 deleted ⇒ two facts written (the group's slot and its tombstone), not one a member (round 11: 2 001); (d) an add made AFTER the delete,
  // arriving late ⇒ lands
  const w = createWorld({ seed: 562, sessions: mkSessions(2) });
  const ops = (page, seq, age, list) => w.call(w.H.ops, { batches: [{ batch: `${page}:${seq}`, age, ops: list }] }).body;
  const M = (item, member, value = true) => ({ key: 'sessionGroups', item, member, value });
  const factsOf = () => JSON.parse(fs.readFileSync(path.join(w.dataDir, 'user-state.json'), 'utf8'))[UO.FACTS_KEY] || {};
  ops('pgtombnew01', 1, 0, [M('new', 'claude:a')]);
  ops('pgtombnew02', 1, 3000, [M('new', 'claude:b')]);   // (made 3 s earlier, arriving later)
  const both = (w.serverState().sessionGroups.new || []).slice().sort().join();
  await w.run(w.now() + 20000);
  ops('pgtombdel01', 1, 0, [M('re', 'claude:c')]);
  await w.run(w.now() + 20000);
  ops('pgtombdel01', 2, 0, [{ key: 'sessionGroups', item: 're', value: false }]);
  await w.run(w.now() + 5000);
  ops('pgtombdel01', 3, 0, [M('re', 'claude:d')]);
  const late = ops('pgtombold01', 1, 15000, [M('re', 'claude:e')]);   // (made 10 s before the delete)
  const reG = (w.serverState().sessionGroups.re || []).join();
  const big = Array.from({ length: 2000 }, (_, i) => M('big', 'claude:m' + i));
  ops('pgtombbig01', 1, 0, big);
  await w.run(w.now() + 20000);
  const f0 = factsOf();
  ops('pgtombbig01', 2, 0, [{ key: 'sessionGroups', item: 'big', value: false }]);
  const f1 = factsOf(), grew = Object.keys(f1).filter((k2) => f1[k2] !== f0[k2]).length;   // (facts written: new or changed)
  await w.run(w.now() + 5000);
  const after = ops('pgtombbig02', 1, 2000, [M('big', 'claude:z')]);   // (made 3 s after the delete, arriving later)
  const bigG = (w.serverState().sessionGroups.big || []).join();
  ok(both === 'claude:a,claude:b' && reG === 'claude:d' && (late.superseded || []).length === 1 && grew === 2 && bigG === 'claude:z' && (after.applied || []).length === 1,
    `ROUND 12, MUST 1 (2) — A GROUP DELETED IS ONE FACT: two adds to a new group, the older arriving last ⇒ [${both}]; an add made before a delete, arriving after the group was made again ⇒ ${(late.superseded || []).length ? 'superseded' : 'LANDED'}, the group [${reG}]; a group of 2 000 deleted ⇒ ${grew} facts written (its slot and its tombstone); an add made after the delete ⇒ [${bigG}]`, { both, reG, late, grew, bigG });
}
{
  // ROUND 12, SMALL 6 — TWO REFUSED ACTS ON ONE ITEM IN ONE ANSWER SAY THE SENTENCE ONCE (words11): P renames X twice, both in one
  // request, both refused in its answer ⇒ the row back to the server's value, the sentence once
  const words = [], sends = [];
  const eng = UO.createSync({ pageId: 'pgtworef001', setTimer: () => 0, clearTimer: () => { }, say: (k) => words.push(k), send: (body) => new Promise((res) => sends.push({ body, res })) });
  eng.apply({ stateRev: 1, stateEpoch: 'epmwtwor00-aaaa', customNames: { 'claude:x': 'orig' } });
  eng.record([{ key: 'customNames', item: 'claude:x', value: 'a' }]);
  await new Promise((r) => setImmediate(r));
  sends[0].res({ ok: false, status: 503 });   // (the first request not reached: both acts go in the next one)
  await new Promise((r) => setTimeout(r, 5));
  eng.record([{ key: 'customNames', item: 'claude:x', value: 'b' }]);
  await new Promise((r) => setImmediate(r));
  const two = sends.find((s) => s.body.batches.length === 2);
  if (two) two.res({ ok: true, rev: 2, epoch: 'epmwtwor00-aaaa', refused: two.body.batches.map((b) => ({ batch: b.batch, code: 'bad-value' })), old: [], applied: [], superseded: [] });
  await new Promise((r) => setTimeout(r, 5));
  ok(!!two && words.join() === 'refused' && eng.view().customNames['claude:x'] === 'orig',
    `ROUND 12, SMALL 6 — TWO REFUSALS ON ONE ITEM, ONE ANSWER: two renames of X refused together ⇒ «${words.join()}» (${words.length} sentence), the row «${eng.view().customNames['claude:x']}»`, { words, n: sends.map((s) => s.body.batches.length) });
}


// ════════ §22 ROUND 13 — THE PAGE NEVER CONTRADICTS ITSELF; ONE ASK IN FLIGHT ════════
console.log('§22 round 13: what the page refuses it refuses before any road; its words are its own; one sentence a reason; one ask in flight');
{
  // ROUND 13, (3) — A RENAME THIS PAGE WILL NOT SEND IS REFUSED BEFORE ANY ROAD (state12 codex-rename): a harness that writes a rename
  // back (renameWriteback — codex) used to record the op (refused at the page, «the server refused … undone») AND send the ws
  // rename-session, whose server writer (master's road, no bound) stored it — the long name then appeared on the row. Now: nothing
  // leaves, the row keeps its name, the sentence is THIS page's; a short rename goes both roads as before
  const Sb = await loadPage(STATE_SRC);
  const w = createWorld({ seed: 571, sessions: mkSessions(3) });
  const P = await addPage(w, Sb, 'P');
  await w.run(w.now() + 600);
  const X = { ...w.sessions[1], backend: 'codex' };
  const ws = [];
  P.app.renameBackendSession = (s, n) => ws.push(n);
  globalThis.__UEO_CAPS = (b) => (b === 'codex' ? { renameWriteback: true } : {});
  let answer = 'n'.repeat(16383);   // (a value of 16 385 characters as JSON writes it — one past the bound)
  globalThis.__UEO_DIALOG = async () => answer;
  const r0 = w.requests, nameBefore = P.getCustomName(X);
  await P.renameSession(X, 'orig');
  await w.run(w.now() + 2000);
  const longReqs = w.requests - r0, longWs = ws.length, longName = P.getCustomName(X), longToasts = P.__toasts.map((t) => t.text);
  answer = 'a short name';
  await P.renameSession(X, 'orig');
  await w.run(w.now() + 2000);
  delete globalThis.__UEO_CAPS; delete globalThis.__UEO_DIALOG;
  const onDisk = w.serverState().customNames[X.sessionKey];
  ok(longReqs === 0 && longWs === 0 && longName === nameBefore && longToasts.length === 1 && /^This page did not keep a change \(a value larger than any setting\)/.test(longToasts[0]) && ws.join() === 'a short name' && onDisk === 'a short name',
    `ROUND 13 — A RENAME THIS PAGE WILL NOT SEND IS REFUSED BEFORE ANY ROAD: a codex rename of 16 383 characters ⇒ ${longReqs} requests, ${longWs} ws renames, the row «${String(longName).slice(0, 12)}», «${(longToasts[0] || '').slice(0, 70)}»; a short one ⇒ ws «${ws.join()}», on disk «${onDisk}»`, { longReqs, longWs, longToasts, ws, onDisk });
}
{
  // ROUND 13, (3) — TWO REASONS ARE TWO SENTENCES (page12 refuse12 «codes»): X refused unknown-key and Y refused bad-value in one answer
  // ⇒ two sentences, one a reason (round 12 said one, naming the first); two refusals with ONE reason stay one sentence
  const cell = (codes) => new Promise((done) => {
    const words = [], sends = [];
    const eng = UO.createSync({ pageId: 'pgtworsn001', setTimer: () => 0, clearTimer: () => { }, say: (k, i) => words.push(k + ':' + (i && i.code)), send: (body) => new Promise((res) => sends.push({ body, res })) });
    eng.apply({ stateRev: 1, stateEpoch: 'epmwtwrs00-aaaa', customNames: {} });
    eng.record([{ key: 'customNames', item: 'claude:x', value: 'a' }]);
    eng.record([{ key: 'customNames', item: 'claude:y', value: 'b' }]);
    const last = sends[sends.length - 1];
    last.res({ ok: true, rev: 2, epoch: 'epmwtwrs00-aaaa', refused: last.body.batches.map((b, k) => ({ batch: b.batch, code: codes[k] })), old: [], applied: [], superseded: [] });
    setTimeout(() => done(words), 5);
  });
  const two = await cell(['unknown-key', 'bad-value']), same = await cell(['bad-value', 'bad-value']);
  ok(two.join() === 'refused:unknown-key,refused:bad-value' && same.join() === 'refused:bad-value',
    `ROUND 13 — TWO REASONS, TWO SENTENCES: two acts refused for two reasons in one answer ⇒ «${two.join(' | ')}»; for one reason ⇒ «${same.join(' | ')}»`, { two, same });
}
{
  // ROUND 13, (3) — A GROUP PAST ITS BOUND IS REFUSED AT THE PAGE, WHOLE (page12 group12: the splitter's parts landed around the one the
  // route refused — 19 999 of 20 001 kept, under the reasonless sentence): the page holds g at 19 999; an act adding 2 ⇒ refused HERE,
  // nothing sent, «a group larger than 20 000 conversations» as this page's; an act adding 1 ⇒ sent
  const words = [], sent = [];
  const eng = UO.createSync({ pageId: 'pggroupbnd1', setTimer: () => 0, clearTimer: () => { }, say: (k, i) => words.push(k + ':' + (i && i.code) + (i && i.local ? ':local' : '')), send: (body) => { sent.push(body); return new Promise(() => { }); } });
  const GROUP = 20000;
  eng.apply({ stateRev: 1, stateEpoch: 'epmwgrpb00-aaaa', sessionGroups: { g: Array.from({ length: GROUP - 1 }, (_, i) => 'claude:m' + i) } });
  eng.record([{ key: 'sessionGroups', item: 'g', member: 'claude:new1', value: true }, { key: 'sessionGroups', item: 'g', member: 'claude:new2', value: true }]);
  const afterTwo = sent.length;
  eng.record([{ key: 'sessionGroups', item: 'g', member: 'claude:new1', value: true }]);
  ok(afterTwo === 0 && words.join() === 'refused:too-large-group:local' && sent.length === 1 && (eng.view().sessionGroups.g || []).length === GROUP,
    `ROUND 13 — A GROUP PAST ITS BOUND IS REFUSED AT THE PAGE: two more members of a group of ${GROUP - 1} ⇒ ${afterTwo} requests, «${words.join()}»; one more ⇒ ${sent.length} request, the group ${(eng.view().sessionGroups.g || []).length}`, { words, sent: sent.length });
}
{
  // ROUND 13, (4) — ONE ASK IN FLIGHT, ALSO UNDER A SECOND DEFERRAL (page12: askInFlight removed passed 120 of 120 and put two GETs in
  // flight): an old act deferred ⇒ the page asks (the GET hangs); a SECOND act, beaten and answered for a newer state, defers too while
  // that GET hangs ⇒ still ONE GET in flight until the give-up
  const asks = [];
  let inflight = 0, maxInflight = 0;
  const timers = [];
  const eng = UO.createSync({ pageId: 'pgoneask001', setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: (t) => { if (t) t.fn = null; },
    send: (body) => new Promise((res) => asks.push({ body, res })),
    refetch: () => { inflight++; maxInflight = Math.max(maxInflight, inflight); return new Promise(() => { }); } });
  eng.apply({ stateRev: 5, stateEpoch: 'epmwoneask-aaaa', customNames: {} });
  eng.record([{ key: 'customNames', item: 'claude:x', value: 'a' }]);
  asks[0].res({ ok: true, rev: 9, epoch: 'epmwoneask-aaaa', old: [{ batch: 'pgoneask001:1', code: 'old' }], refused: [], applied: [], superseded: [] });
  await new Promise((r) => setTimeout(r, 5));
  const firstGets = inflight;
  eng.record([{ key: 'customNames', item: 'claude:y', value: 'b' }]);
  asks[asks.length - 1].res({ ok: true, rev: 11, epoch: 'epmwoneask-aaaa', superseded: ['pgoneask001:2'], refused: [], old: [], applied: [] });
  await new Promise((r) => setTimeout(r, 5));
  ok(firstGets === 1 && maxInflight === 1,
    `ROUND 13 — ONE ASK IN FLIGHT: an old act deferred ⇒ ${firstGets} GET (it hangs); a second act beaten for a newer state while it hangs ⇒ at most ${maxInflight} GET in flight`, { firstGets, maxInflight });
}

{
  // ROUND 13, (4)(a) — A WINDOW NEVER CARRIES A BATCH A REQUEST IN TIME CARRIES (page12 split12: round 12 re-sent the part in flight at
  // every echo and answer): the bounds scaled to 50 ops; 60 one-op acts made with the network down; the network back and one more act ⇒
  // its request is the NEWEST window (in time, hung); then a state comes (an echo) ⇒ the next request carries the OLDEST batches no
  // request in time carries — no batch in two requests in time
  const sent = [];
  let down = true;
  const eng = UO.createSync({ pageId: 'pgwindow001', maxRequestOps: 50, setTimer: () => 0, clearTimer: () => { },
    send: (body) => { if (down) return Promise.reject(new TypeError('Failed to fetch')); sent.push(body.batches.map((b) => b.batch)); return new Promise(() => { }); } });
  eng.apply({ stateRev: 1, stateEpoch: 'epmwwind00-aaaa', customNames: {} });
  for (let i = 0; i < 60; i++) eng.record([{ key: 'customNames', item: 'claude:n' + i, value: 'v' + i }]);
  for (let t = 0; t < 5; t++) await new Promise((r) => setImmediate(r));
  down = false;
  eng.record([{ key: 'customNames', item: 'claude:new', value: 'x' }]);
  eng.apply({ stateRev: 2, stateEpoch: 'epmwwind00-aaaa', customNames: {} });
  for (let t = 0; t < 5; t++) await new Promise((r) => setImmediate(r));
  const ids = sent.flat(), dups = ids.length - new Set(ids).size;
  ok(sent.length === 2 && sent[0].length === 50 && sent[1].length === 11 && dups === 0,
    `ROUND 13 — A WINDOW NEVER CARRIES WHAT A REQUEST IN TIME CARRIES: 61 acts past a 50-op bound ⇒ the act's request the newest ${sent[0] ? sent[0].length : 0} (in time), the echo's the oldest ${sent[1] ? sent[1].length : 0} — ${dups} batches in two requests`, { n: sent.map((x) => x.length), dups });
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
  // given back — 300 one-op acts, each answered before the next ⇒ every one keepalive; (e) a keepalive the browser refuses ⇒ the next
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
  for (let i = 0; i < 300; i++) { S.toggleStar(w.sessions[i]); await w.run(w.now() + 100); }
  const T = await addPage(w, Sb, 'T');
  await w.run(w.now() + 600);
  const e = watch(T, true);
  T.toggleArchive(w.sessions[1]);
  await w.run(w.now() + 30000);   // (the refused send is re-sent on the pace — plain)
  T.toggleArchive(w.sessions[2]);
  await w.run(w.now() + 3000);
  const eKinds = e.reqs.map((x) => (x.keep ? 'K' : 'P')).join('');
  ok(cKeep >= 5 && cPlain >= 5 && cMax <= 49152 && cMax > 40000 && d.reqs.length >= 300 && d.reqs.every((x) => x.keep) && e.refused === 1 && /^KPK/.test(eKinds),
    `ROUND 15 — THE KEEPALIVE BUDGET: 40 renames of 1.5 KB with the hub answering nothing ⇒ ${cKeep} keepalive then ${cPlain} plain, at most ${cMax} B in flight (≤ 49 152); 300 acts each answered ⇒ ${d.reqs.filter((x) => x.keep).length} of ${d.reqs.length} keepalive (the budget given back); a refused keepalive ⇒ «${eKinds}» (the next plain, then keepalive again)`, { cKeep, cPlain, cMax, dKeep: d.reqs.filter((x) => x.keep).length, eKinds });
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

// ════════ §8 THE MUTANTS ════════
console.log('§8 the mutants — each RED by name');
{
  // M1: the echo applied WHOLESALE again (05082bbd0's _applyServerState: the sets REPLACED by whatever the echo held)
  const M1 = STATE_SRC.replace("  proto._applyServerState = function(state) {\n    return this._userSync().apply(state);\n  };",
    "  proto._applyServerState = function(state) {\n    this._userSync().apply(state);\n    if (state.archivedSessions) this._archivedIds = new Set(state.archivedSessions);\n    if (state.starredSessions) this._starredIds = new Set(state.starredSessions);\n    if (state.customNames) this._customNames = { ...state.customNames };\n    if (state.sessionConfigs) this._sessionConfigs = { ...state.sessionConfigs };\n    if (state.sessionGroups) this._sessionGroups = { ...state.sessionGroups };\n    return true;\n  };");
  ok(M1 !== STATE_SRC, 'M1 (the echo applied wholesale) hits its anchor');
  const r1 = await ownerScene(M1);
  ok(!!r1.rolledBack, 'M1 RED: the owner\'s scene sees archived conversations shown unarchived again (the rollback the owner saw)', r1.rolledBack);
  // M2: the push sending the WHOLE KEY again (05082bbd0's _pushUserState: the changed top-level keys whole, as this page holds them)
  const M2 = STATE_SRC.replace("    const sync = this._userSync();\n    // (round 13: the diff reads the engine's view as it stands — no copy of either side — and copies only the values it changed)\n    const ops = diffOps(sync.peek(), this._userStateView(), undefined, false).map((o) => (o.value !== null && typeof o.value === 'object' ? { ...o, value: JSON.parse(JSON.stringify(o.value)) } : o));\n    if (!ops.length) return;\n    await sync.record(ops);",
    "    const sync = this._userSync();\n    const v = this._userStateView(), before = sync.view(), delta = {};\n    for (const k of Object.keys(v)) if (JSON.stringify(before[k]) !== JSON.stringify(v[k])) delta[k] = v[k];\n    if (!Object.keys(delta).length) return;\n    sync.record(diffOps(before, v));\n    try { await fetch('/api/user-state', { method: 'PATCH', headers: {}, body: JSON.stringify(delta) }); } catch { }");
  ok(M2 !== STATE_SRC, 'M2 (the whole-key push) hits its anchor');
  let m2red = null;
  for (let i = 0; i < 12 && !m2red; i++) { const r = await walk(M2, 2000 + i); if (r.serverOff.length || r.pagesOff.length || r.violations.length) m2red = { seed: r.seed, serverOff: r.serverOff.slice(0, 3), pagesOff: r.pagesOff.slice(0, 1) }; }
  ok(!!m2red, 'M2 RED: the walk sees a stale page\'s whole-key push erase what another page did (the server ≠ the acts in its order)', m2red);
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
