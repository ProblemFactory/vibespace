#!/usr/bin/env node
// A WINDOW NEVER LOSES ITS NAME · UNBUILT IS NOT DROPPED · A DEAD LOCAL SESSION IS A STOPPED ONE · ONE PRESS RESTORES ONE
// DESKTOP — the fast gate of lane layout-stopped-window (the owner 2026-10-30 09:19 PDT «我的个人桌面丢了很多窗口», 2.369.363).
// The ring, measured: 02:55 every dtach session died; at the 04:59 boot each dead LOCAL session's meta was deleted; 09:18:22 the
// owner pressed the resume-all offer: each stopped conversation opened in a NEW window (a new winId, titled with the bare name,
// no identity until its create answered) and resume placement captured it into its desktop's record IN PLACE of the named
// entry it replaced — 个人 was written with seven of its eleven windows nameless (the server's per-id identity carry had no id
// to match); 09:19:35 a new page built none of the seven and dropped them as 'unbuilt' (11 → 4). The records below have the
// measured SHAPES (eleven chat windows, four whose creates answered, seven nameless; a first-message openSpec name that is not
// the title) with invented titles — the public repo carries no word of the owner's.
// No DOM, no ports — the real modules:
//   §1 THE NAME on the REAL ws-handler (registerWsHandler on a fake wss): the 09:18:22 write — eleven new winIds, seven of them
//      nameless, the eleven old ones as 'replaced' — is stored with every window NAMED (the conversation carried, never the old
//      server session); the evidence's `by` pairs where a name cannot (two windows of one name); a nameless newcomer that
//      replaced nothing named is left out of the write and said; PURE keepNames' table.
//   §1b THE DOOR on the real classes: the REAL session-lifecycle resumeSession → createSession (an esbuild bundle, its imports
//      stubbed) over the real DesktopManager + LayoutManager — the resumed window is captured NAMED before its create answers
//      and the record of the desktop it lands on (resume placement's `replaces`) names it; a bare spec-less window moved in
//      place of a named entry takes its name at the writer (mergeDesktopRecord `replaced`); a nameless newcomer on the desktop
//      on show is left out of the write ('nameless' evidence)
//   §2 UNBUILT on the real handler: the 09:19:35 write (11 → 4, seven 'unbuilt') is REFUSED, the seven named by title; PURE
//      shrinkVerdict's rows (a duplicate leaves, a window that is no session stays explained, a LIVE one is the 10-22 'live').
//      On the real classes: the boot restore of that record on a hub whose sessions are all stopped builds ELEVEN windows — four
//      «Session stopped — click to resume» placeholders, seven «Session unavailable» — and the record keeps all eleven past the
//      grace, each entry as it was (identity and all); the press resumes in place; the live record's door (a spec-less session
//      entry ⇒ a placeholder; a newer entry with an openSpec ⇒ rebuilt in place under the same id; a record without it ⇒ it closes)
//   §3 A DEAD LOCAL SESSION (the real boot-restore over a scratch data dir, fake fuser / pgrep that answer «nobody»): a claude
//      session whose transcript exists keeps its meta as `<sock>.json.stopped` (stoppedAt, every field kept); one with no
//      transcript and a shell are deleted; the sidebar's row (the claude store's discovery) is the transcript's either way
//   §4 THE DOOR TO RECOVER (the real persistence router): a rollback row's desktop restores ALONE (`desktop` in the body) — the
//      other desktops as they are now, 'layout-restored' told, the forced point names it; the 06:50 point's 个人 (twelve) restored
//      on a hub whose sessions are stopped builds twelve windows, not 0; the dialog's per-desktop doors and every new word in zh + ja
//   §5 CONTROL: the server's keepNames taken out of the handler ⇒ §1's write is stored nameless (RED)
//   §6 ROUND 2 (the r1 acceptance, each RED on 77dc65619): ① a replay is idempotent — two replays of a desktop's spec-less session
//      entries 50 ms apart (the reads still out) build each window ONCE, nothing outside wm.windows; the restore's own belt too
//      (two overlapping restores); ② the host rides with the name (the CS-separation law) — a resume window's birth name and a
//      carried name keep {backend, backendSessionId, hostId} as one unit, the server's write stores it, a restore views it ON
//      its host, a placeholder names its host and its press resumes there, a live row's recipe keeps its host (and never its
//      display cwd); §3 (③ ④) the dead socket's meta is kept FIRST (atomic, the one delete road) and its transcript looked
//      for OFF the loop (no harness locate on the main thread), a «no transcript» deleting it once answered
//   §7 ROUND 3 (the r2 acceptance, each RED on 5e0cb138e): THE TILE WITH NO PRESS HAS A WAY FORWARD — a nameless entry's tile
//      says why in one line (saved without its conversation / its folder · its conversation's record gone · its machine not
//      paired) and offers three doors: «Restore a previous layout…» (the dialog asks the REAL persistence router for the newest
//      point that still names a conversation for this slot — PURE namedTwinIn — and selects it), «Open the session list» (the
//      REAL Sidebar.showStopped: the Stopped view searched by the window's name) and «Remove», asked first; the ✕ of a nameless
//      tile asks the same confirm (cancel keeps the entry); a remote tile's machine is ITS OWN LINE under a 60-char title
//   §8 ROUND 4 (the r3 acceptance, each RED on 23eaffef5): «Open the session list» opens ALL with the search (the tile's
//      REAL door → the REAL Sidebar showSessionsNamed + _renderInner: a RUNNING row of the name is shown, one match marked,
//      the person's status filter untouched); a second tile's rollback door draws ITS point (the dialog keyed by the slot,
//      the REAL reopenVerdict); a point that holds the slot itself never matches by name (PURE namedTwinIn + the REAL
//      router); the phone switcher's row of a window that asked first goes when it closes (the REAL _buildWindowItem); a
//      group close asks ONE question naming the tile it deletes for good, all or nothing (the REAL requestCloseGroup + the
//      REAL requestClose)
//   §9 BATCH bl-windows (the backlog push, 2026-11-17), each row with a RED control (the real module's text with ONE line
//      changed — scripts/mutant-copy.mjs):
//      B-b05e the rollback ring is SPREAD OVER TIME — the REAL router restarted over forty days of points, then a phone's
//        burst of 100 shape changes: every recent day and hour keeps its point, the point from before the restart is pinned
//        and named in the dialog (the base kept the first ten ever written + the burst)
//      B-46fc a page that leaves takes its last change — the REAL LayoutManager: a window opened, then pagehide (or the page
//        hidden) inside the debounce ⇒ its save goes at once
//      B-6352 a dismissed resume-all offer has a way back — «Resume all N» in each stopped window's Resume bar while two or
//        more of its conversations stay stopped, the same question, the same paced resume
//      B-54d9 the r4 nits — one abort wait per phone switcher row (the REAL _buildWindowItem), the tile door's search says
//        what the person's status filter hides (the REAL Sidebar), two pins on the heavy chrome suite (its shot order, its
//        own data/bin)
//   §10 r1793 the phone after a window takes a new id (B-1d87: the REAL wm.rekeyWindow under an open list of the REAL
//      _buildWindowItem's rows): the row re-stamped, its waiting dot re-read, a press on it inside that window (the REAL late-focus
//      insideWindow — a row its own tap took off the page too), this tab's notes by id moved (the shown window, the split's pair);
//      a GONE window's row says so and the list is drawn again, a window REBUILT under the same id is revealed — each with its RED
//      (the release's rekeyWindow, followRekey without its re-patch, insideWindow by stamp alone, the release's row tap); it runs
//      after the mutant helpers it builds the REDs with
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { scratchDir, scratchHome, landingWriter, anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LIB = path.join(REPO, 'src/lib');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const J = JSON.stringify;
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : '')); } return !!c; };
const section = async (title, fn) => { console.log('— ' + title); try { await fn(); } catch (e) { ok(false, title + ' — threw', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); } };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
// B-7e49 (lane card-door-in-chat, s1126, 主开发 r4912): A REAL WAIT RUN BY HAND. Every timer this suite arms from here on is
// REGISTERED (still armed on the real clock; the handle is the one its caller keeps). heldWait(ms), where a real wait of ms
// stood, fires BY HAND, in due order, each timer such a wait would have let fire (one a fired callback arms is held and joins
// in ITS due order), then hands every later one back to the real clock with what such a wait would have left of it: the state
// after it is the state after the wait. What stays real: the clock a callback reads (Date.now), setInterval, setImmediate
const realST = globalThis.setTimeout, realCT = globalThis.clearTimeout, timers = new Map(); // handle → { f, a, ms, due, seq, cur }
let timerSeq = 0, holding = null;
const realArm = (h, t, ms) => { t.cur = realST(() => { timers.delete(h); t.f(...t.a); }, ms); if (t.refd === false) t.cur.unref(); }; // an unref'd one stays so
const offClock = (t) => { if (!t.cur) return; t.refd = typeof t.cur.hasRef === 'function' ? t.cur.hasRef() : true; realCT(t.cur); t.cur = null; };
globalThis.setTimeout = (f, ms = 0, ...a) => {
  if (typeof f !== 'function') return realST(f, ms, ...a);
  const t = { f, a, ms: Number(ms) || 0, seq: ++timerSeq, due: (holding ? holding.now : Date.now()) + Math.max(1, Number(ms) || 0), cur: null };
  let h;
  if (holding) { h = realST(() => { }, 0x7fffffff); realCT(h); } // held: a handle of its own, armed on the real clock only if it outlives the wait
  else { h = realST(() => { timers.delete(h); f(...a); }, ms); t.cur = h; }
  timers.set(h, t); return h;
};
globalThis.setTimeout[promisify.custom] = realST[promisify.custom];
globalThis.clearTimeout = (h) => { const t = h != null && timers.get(h); if (!t) return realCT(h); timers.delete(h); if (t.cur) realCT(t.cur); };
const heldWait = async (ms, watch = null) => {
  const end = Date.now() + ms, fired = [], flips = [];
  holding = { now: Date.now() };
  try {
    for (const t of timers.values()) if (t.due <= end) offClock(t); // none of them fires on its own, out of order
    for (;;) {
      await new Promise((r) => setImmediate(r)); // a fired callback's continuations run in their own turn, as after a real timer
      let hk = null, nt = null;
      for (const [h, t] of timers) if (t.due <= end && (!nt || t.due < nt.due || (t.due === nt.due && t.seq < nt.seq))) { hk = h; nt = t; }
      if (!nt) break;
      timers.delete(hk); holding.now = Math.max(holding.now, nt.due);
      const before = watch ? watch() : null;
      nt.f(...nt.a); fired.push(nt.ms);
      if (watch) { const after = watch(); if (after !== before) flips.push({ ms: nt.ms, from: before, to: after }); }
    }
  } finally {
    holding = null;
    for (const [h, t] of timers) { offClock(t); const left = Math.max(1, t.due - end); t.due = Date.now() + left; realArm(h, t, left); }
  }
  return { fired, flips };
};
const REAL = { log: console.log, warn: console.warn }; // every quiet stretch restores THESE (two overlapping ones must never leave the console swapped)

// ── a fake DOM just wide enough for the client modules (the placeholder tile is counted node by node) ──
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const mkEl = (tag = 'div') => {
  const el = { tagName: String(tag).toUpperCase(), style: {}, dataset: {}, children: [], className: '', title: '', _text: '', parent: null, onclick: null,
    classList: { add(c) { el.className += ' ' + c; }, remove() {}, toggle() {}, contains: () => false },
    append(...c) { for (const x of c) { if (x && typeof x === 'object') x.parent = el; el.children.push(x); } }, appendChild(c) { el.append(c); return c; },
    remove() { if (el.parent) el.parent.children = el.parent.children.filter((x) => x !== el); el.removed = true; },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [], contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }) };
  Object.defineProperty(el, 'textContent', { get: () => el._text + el.children.map((c) => (c && c.textContent) || '').join(''), set: (v) => { el._text = String(v); el.children = []; } });
  Object.defineProperty(el, 'innerHTML', { get: () => '', set: () => { el.children = []; } });
  Object.defineProperty(el, 'firstChild', { get: () => el.children[0] });
  return el;
};
let previews = mkEl();
globalThis.document = { createElement: mkEl, getElementById: (id) => (id === 'desktop-previews' ? previews : null), querySelector: () => null, querySelectorAll: () => [], body: mkEl(), documentElement: { style: { getPropertyValue: () => '', setProperty() {} } }, addEventListener() {}, removeEventListener() {}, activeElement: null, hidden: false, visibilityState: 'visible' };
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
globalThis.innerWidth = 1600; globalThis.innerHeight = 1000;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true });
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0); globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
const answers = { '/api/active': { sessions: [] }, '/api/sessions': { sessions: [] } }; // a hub whose every session is stopped, no transcript of them here
const delays = {}; // a read still out (r2 ①: a second door fires while the first one's reads are out)
const asked = []; // every url a client module fetched (r3: the dialog's slot query)
globalThis.fetch = async (url) => { asked.push(String(url)); const k = String(url).split('?')[0]; if (delays[k]) await tick(delays[k]); return { ok: true, json: async () => JSON.parse(J(answers[k] || {})) }; };

// ── the measured shapes, invented words ──
const GB = (i) => ({ left: (i % 4) / 4, top: Math.floor(i / 4) / 3, width: 0.25, height: 1 / 3 });
const NAMES = ['Ledger', 'Tutor', 'Ops desk', 'Coursework', 'Trip planner', 'Van build', 'Butler', 'Colony game', 'Game monitor', 'Cluster admin', 'Quiz maker'];
const CWD = (i) => '/srv/u/proj-' + i;
const CID = (i) => `c0ffee${String(i).padStart(2, '0')}-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`;
const BACK = (i) => (i === 4 || i === 5 ? 'codex' : 'claude');
/** a window the record named before the outage: its conversation, its (now dead) server session, a first-message openSpec name */
const named = (i, o = {}) => ({ winId: 'win-old-' + i, title: `${NAMES[i]} — ${CWD(i)}`, type: 'chat', isMinimized: false, isMaximized: false, gridBounds: GB(i), zIndex: 7000 + i,
  openSpec: { action: 'attachSession', serverId: `sess-${i + 12}-17000`, backend: BACK(i), backendSessionId: CID(i), sessionKey: `${BACK(i)}:${CID(i)}`, name: 'the first message of ' + i, cwd: CWD(i), mode: 'chat', hostId: null },
  backend: BACK(i), backendSessionId: CID(i), ...(BACK(i) === 'claude' ? { claudeSessionId: CID(i) } : {}), serverSessionId: `sess-${i + 12}-17000`, cwd: CWD(i), ...o });
/** the resume-all's new window whose create answered before the capture (named) */
const answered = (i) => ({ ...named(i), winId: 'win-new-' + i, serverSessionId: `sess-${i + 1}-18000`, openSpec: { ...named(i).openSpec, serverId: `sess-${i + 1}-18000` } });
/** the resume-all's new window captured before its create answered: the bare name, no identity, no openSpec */
const bare = (i) => ({ winId: 'win-new-' + i, title: NAMES[i], type: 'chat', isMinimized: false, isMaximized: false, gridBounds: GB(i), zIndex: 7100 + i });
const P_BEFORE = () => NAMES.map((_, i) => named(i));                                         // 个人 before 09:18:22 (eleven, all named)
const P_SENT = () => NAMES.map((_, i) => (i < 4 ? answered(i) : bare(i)));                   // the 09:18:22 write (eleven new ids, seven nameless)
const isNamed = (w) => !!(w && (w.backendSessionId || w.claudeSessionId || w.openSpec?.backendSessionId || w.serverSessionId || w.openSpec?.serverId));
const DESKS = [{ id: 'desk-w', name: '工作' }, { id: 'desk-p', name: '个人' }, { id: 'desk-r', name: '研究' }];
const files = (id, i) => ({ winId: id, title: 'notes-' + i + '.md', type: 'viewer', isMinimized: false, isMaximized: false, gridBounds: GB(i), zIndex: 10 + i, openSpec: { action: 'openFile', path: '/srv/u/notes-' + i + '.md' }, filePath: '/srv/u/notes-' + i + '.md', fileName: 'notes-' + i + '.md' });
const DOC = (p) => ({ desktopMeta: DESKS.map((d) => ({ ...d })), current: null, saved: {}, customGrids: [], desktops: {
  'desk-w': { autoSave: { windows: [0, 1, 2, 3, 4].map((i) => files('w-' + i, i)), grid: null, updatedAt: 1000 } },
  'desk-p': { autoSave: { windows: p, grid: null, updatedAt: 1000 } },
  'desk-r': { autoSave: { windows: [0, 1, 2, 3, 4, 5].map((i) => files('r-' + i, i)), grid: null, updatedAt: 1000 } } } });

// ── the REAL ws-handler on a fake wss (test-desktop-record's harness), layouts.json in memory ──
const WSH_PATH = require.resolve(path.join(REPO, 'src/ws-handler.js'));
const MODEL = path.join(REPO, 'src/lib/desktop-record.js');
const loadHandler = (over = {}) => {
  const DR = require(MODEL), saved = {};
  delete require.cache[WSH_PATH];
  for (const [k, v] of Object.entries(over)) { saved[k] = DR[k]; DR[k] = v; }
  try { return require(WSH_PATH); } finally { Object.assign(DR, saved); delete require.cache[WSH_PATH]; }
};
function hub(WSH, seed, { alive = [] } = {}) {
  let layouts = JSON.parse(J(seed)), writes = 0;
  const logs = [];
  const quietly = async (fn) => { console.warn = (...a) => logs.push(a.map(String).join(' ')); console.log = (...a) => logs.push(a.map(String).join(' ')); try { return await fn(); } finally { console.warn = REAL.warn; console.log = REAL.log; } };
  const ctx = new Proxy({ telemetry: { record() {} }, activeSessionsPayload: () => [], serverNotice: () => {}, activeSessions: new Map(alive.map((sid) => [sid, {}])), WS_OPEN: 1, readLayouts: () => JSON.parse(J(layouts)), writeLayouts: (d) => { writes++; layouts = JSON.parse(J(d)); } }, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) });
  const on = {};
  const wss = { _heartbeatTimer: true, clients: new Set(), on: (ev, fn) => { on[ev] = fn; } };
  WSH.registerWsHandler(wss, ctx);
  const connect = () => {
    const h = {}, frames = [];
    const sock = { readyState: 1, send: (s) => frames.push(JSON.parse(s)), on: (ev, fn) => { h[ev] = fn; } };
    wss.clients.add(sock); console.warn = () => {}; try { on.connection(sock); } finally { console.warn = REAL.warn; }
    return { frames, send: (m) => quietly(() => h.message(J(m))) };
  };
  return { connect, layouts: () => layouts, writes: () => writes, logs };
}
const W0 = () => ({ type: 'layout-sync', desktopId: 'desk-p', state: { windows: P_SENT(), grid: null }, evidence: P_BEFORE().map((w) => ({ id: w.winId, why: 'replaced' })), base: 1000, sentAt: 1, viewport: 'desktop' });

// ── the real client classes over a fake app (test-desktop-record's world, trimmed) ──
const { DesktopManager: DM } = await import(pathToFileURL(path.join(LIB, 'desktop-manager.js')).href);
const { LayoutManager: LM } = await import(pathToFileURL(path.join(LIB, 'layout.js')).href);
function world({ records, active = 'desk-w', extra = {}, Lm = LM } = {}) {
  const sent = [], handlers = [], closed = [], resumed = [], replayed = [];
  const wins = new Map();
  let dm = null, lm = null, seq = 0;
  const mkWin = (id, desk, o = {}) => { const el = mkEl(); el.style.zIndex = '10'; const w = { id, type: 'files', title: id, _desktopId: desk, gridBounds: null, isMinimized: false, isMaximized: false, element: el, content: mkEl(), titleBar: mkEl(), titleSpan: mkEl(), _bornAt: Date.now(), _listenerCtl: new AbortController(), ...o }; wins.set(id, w); return w; };
  const app = {
    ws: { onGlobal: (fn) => handlers.push(fn), onStateChange() {}, connected: true, send: (m) => { const c = JSON.parse(J(m)); sent.push(c); if (c.type === 'layout-sync') setTimeout(() => { for (const h of handlers) h({ type: 'layout-sync-ack', desktopId: c.desktopId || null, sentAt: c.sentAt ?? null, seq: ++seq }); }, 5); }, request: () => () => {}, attachesInFlight: () => 0 },
    settings: { get: () => null, on() {} }, sessions: new Map(), stage: null, isMobile: false,
    wm: { windows: wins, grid: null, zIndex: 100, _restoring: false, activeWindowId: null, setGrid() {}, _reflowWindows() {}, _applyGridBounds() {}, _captureGridBounds(w) { if (!w.gridBounds) w.gridBounds = { left: 0.3, top: 0.3, width: 0.4, height: 0.4 }; }, focusWindow() {}, setWindowHidden(w, r = {}) { if (w && 'desktop' in r) w._hiddenByDesktop = !!r.desktop; },
      toggleMaximize(id) { const w = wins.get(id); if (w) w.isMaximized = !w.isMaximized; }, minimize(id) { const w = wins.get(id); if (w) w.isMinimized = true; }, restore() {}, _notify() {}, _scheduleOverlapUpdate() {}, syncHiddenViews() {},
      createWindow: ({ title, type, syncId }) => mkWin(syncId || ('win-n' + (++seq)), dm.activeDesktopId, { type, title }),
      closeWindow: (id) => { if (!wins.has(id)) return; wins.get(id)._listenerCtl?.abort(); wins.delete(id); closed.push(id); dm.purgeClosedWindow(id); lm.noteClosed?.(id, null); },
      requestClose(id, o = {}) { const w = wins.get(id); if (!w) return false; if (typeof w.onCloseRequest === 'function' && w.onCloseRequest(o) === false) return false; this.closeWindow(id); return true; }, // window.js requestClose's shape
      setTitle(id, t) { const w = wins.get(id); if (w) w.title = t; } },
    themeManager: { current: 'dark', apply() {} }, _fontSize: 14, _fontFamily: 'mono', sidebar: { isOpen: false, _allSessions: [], toggle() {}, getCustomName: () => null },
    updateTaskbar() {}, _checkWelcome() {},
    replayOpenSpec: (spec, winId) => { replayed.push([winId, spec && spec.action]); mkWin(winId, dm.activeDesktopId, { type: spec && /Session$/.test(spec.action) ? 'chat' : 'viewer', _openSpec: spec }); },
    attachSession: (sid, name, cwd, o) => mkWin('att-' + sid, dm.activeDesktopId, { type: 'chat', title: name, _openSpec: { action: 'attachSession', serverId: sid, backendSessionId: o && o.backendSessionId } }),
    viewSession: (sid, cwd, name, o) => mkWin('view-' + sid, dm.activeDesktopId, { type: 'chat', title: `${name} — ${cwd}`, _openSpec: { action: 'viewSession', sessionId: sid, backend: o && o.backend, backendSessionId: (o && o.backendSessionId) || sid, cwd, name } }),
    openEditor: (fp, name) => mkWin('ed-' + fp, dm.activeDesktopId, { type: 'editor', title: name, _filePath: fp, _fileName: name, _openSpec: { action: 'openEditor', path: fp, name } }),
    resumeSession: (...a) => resumed.push(a),
    _snapshotWinBounds: (w) => ({ gridBounds: w.gridBounds, desktopId: w._desktopId }),
    ...extra,
  };
  lm = new Lm(app); app.layoutManager = lm;
  dm = new DM(app); app.desktopManager = dm;
  dm._desktops = DESKS.map((d) => ({ ...d })); dm._activeId = active;
  for (const [d, ws] of Object.entries(records)) { const rec = { windows: ws, grid: null }; dm._setRecord(d, rec); dm.noteWire(d, rec); }
  lm._restoring = false; lm._userDirty = true; lm._lastUserInputAt = Date.now();
  return { app, dm, lm, wins, sent, mkWin, handlers, closed, resumed, replayed, syncs: (d) => sent.filter((m) => m.type === 'layout-sync' && m.desktopId === d) };
}
const tileOf = (w) => (w && w.content && w.content.children[0]) || null;
const wordsOf = (w) => { const t = tileOf(w); return t ? t.children.map((c) => c.textContent) : []; };

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
await section('§1 A WINDOW NEVER LOSES ITS NAME — the 09:18:22 write on the REAL ws-handler', async () => {
  const H = hub(loadHandler(), DOC(P_BEFORE()));
  const S = H.connect();
  await S.send(W0());
  const p = H.layouts().desktops['desk-p'].autoSave.windows;
  const nameless = p.filter((w) => !isNamed(w));
  ok(p.length === 11 && !nameless.length, `§1 个人's eleven new windows are stored NAMED — none nameless (2.369.363: ${7} of 11 nameless; here ${nameless.length})`, nameless.map((w) => w.title));
  const seven = p.filter((w) => !w.openSpec);
  ok(seven.length === 7 && seven.every((w) => { const i = NAMES.indexOf(w.title); return i >= 4 && w.backendSessionId === CID(i) && w.backend === BACK(i) && w.cwd === CWD(i); }), '§1 each of the seven took the conversation of the window it replaced (its id, its harness, its cwd) — matched by the title\'s name, not the openSpec\'s first message', seven.map((w) => [w.title, w.backendSessionId, w.backend]));
  ok(seven.every((w) => !w.serverSessionId && !w.openSpec), '§1 …never the old window\'s server session nor its openSpec (the attach was the old window\'s)', seven.map((w) => [w.serverSessionId, !!w.openSpec]));
  ok(H.logs.some((l) => /7 window\(s\) took the name of the window they replaced/.test(l)), '§1 the journal says it: «7 window(s) took the name of the window they replaced»', H.logs.filter((l) => /layout-sync/.test(l)));
  // two windows of ONE name: the name never guesses — neither is paired, both are left out; the evidence's `by` pairs the one it
  // names, and the other is then the only one left (one-to-one)
  const twins = () => DOC([named(0, { title: 'Twin — ' + CWD(0) }), named(1, { title: 'Twin — ' + CWD(1) }), named(2)]);
  const twinWrite = (evidence, sentAt) => ({ type: 'layout-sync', desktopId: 'desk-p', state: { windows: [{ ...bare(0), title: 'Twin' }, { ...bare(1), title: 'Twin' }, named(2)], grid: null }, evidence, base: 1000, sentAt, viewport: 'desktop' });
  const H2 = hub(loadHandler(), twins()); const S2 = H2.connect();
  await S2.send(twinWrite([{ id: 'win-old-0', why: 'replaced' }, { id: 'win-old-1', why: 'replaced' }], 2));
  const p2 = H2.layouts().desktops['desk-p'].autoSave.windows;
  ok(J(p2.map((w) => w.winId)) === J(['win-old-2']) && H2.logs.some((l) => /2 with no name left out of this write \(Twin · Twin\)/.test(l)), '§1 two windows of ONE name and nothing else to tell them apart: neither is guessed — both left out of THIS write and named in the journal (never stored nameless)', { ids: p2.map((w) => w.winId), log: H2.logs.filter((l) => /layout-sync/.test(l)) });
  const H2b = hub(loadHandler(), twins()); const S2b = H2b.connect();
  await S2b.send(twinWrite([{ id: 'win-old-0', why: 'replaced', by: 'win-new-0' }, { id: 'win-old-1', why: 'replaced' }], 3));
  const p2b = H2b.layouts().desktops['desk-p'].autoSave.windows;
  ok(p2b.find((w) => w.winId === 'win-new-0')?.backendSessionId === CID(0) && p2b.find((w) => w.winId === 'win-new-1')?.backendSessionId === CID(1), '§1 …the evidence\'s `by` pairs the one it names; the other twin is then the only one left (one-to-one)', p2b.map((w) => [w.winId, w.backendSessionId || null]));
  // a nameless newcomer that replaced nothing named (a new session whose create has not answered, an older bundle)
  const H3 = hub(loadHandler(), DOC([named(0)])); const S3 = H3.connect();
  await S3.send({ type: 'layout-sync', desktopId: 'desk-p', state: { windows: [named(0), bare(9)], grid: null }, evidence: [], base: 1000, sentAt: 3, viewport: 'desktop' });
  ok(J(H3.layouts().desktops['desk-p'].autoSave.windows.map((w) => w.winId)) === J(['win-old-0']), '§1 a nameless newcomer that replaced nothing named is not written (the record stays [win-old-0])', H3.layouts().desktops['desk-p'].autoSave.windows.map((w) => w.winId));
  // the record's own nameless entry (the incident's leftovers) is the record's — a write that keeps it keeps it
  const H4 = hub(loadHandler(), DOC([named(0), bare(5)])); const S4 = H4.connect();
  await S4.send({ type: 'layout-sync', desktopId: 'desk-p', state: { windows: [named(0), bare(5)], grid: null }, evidence: [], base: 1000, sentAt: 4, viewport: 'desktop' });
  ok(H4.layouts().desktops['desk-p'].autoSave.windows.length === 2, '§1 a nameless entry the record ALREADY holds stays (a placeholder shows it; only the person\'s close removes it)');
});

await section('§1 PURE keepNames / carryName (src/lib/desktop-record.js)', async () => {
  const DR = require(MODEL);
  ok(typeof DR.keepNames === 'function' && typeof DR.isNameless === 'function' && typeof DR.carryName === 'function', '§1 desktop-record.js exports keepNames / isNameless / carryName');
  const r = DR.keepNames({ prev: P_BEFORE(), next: P_SENT(), evidence: [] });
  ok(r.carried.length === 7 && r.carried.every((c) => c.how === 'name') && !r.withheld.length && r.windows.every(isNamed), '§1 keepNames on the 09:18:22 shape: seven carried by NAME, none withheld, all named', r.carried);
  ok(DR.isNameless(bare(4)) && !DR.isNameless(named(4)) && !DR.isNameless({ ...bare(4), serverSessionId: 'sess-9' }) && !DR.isNameless(files('x', 1)), '§1 isNameless: a session entry with no conversation AND no server session; never a window that is no session');
  const c = DR.carryName(named(6), bare(6));
  ok(c.backendSessionId === CID(6) && c.claudeSessionId === CID(6) && c.cwd === CWD(6) && c.backend === 'claude' && !c.serverSessionId && !c.openSpec && c.winId === 'win-new-6' && c.title === NAMES[6], '§1 carryName copies the conversation (backend, the id, claudeSessionId, cwd) — never the server session, the openSpec, the id or the title', c);
  const prevM = [named(0)], nextM = [bare(0)];
  const m = DR.mergeDesktopRecord({ record: { windows: prevM }, add: nextM, remove: ['win-old-0'], replaced: [['win-new-0', 'win-old-0']] });
  ok(m.windows.length === 1 && m.windows[0].winId === 'win-new-0' && m.windows[0].backendSessionId === CID(0), '§1 mergeDesktopRecord `replaced`: the moved window takes the replaced entry\'s name in the held record', m.windows);
  const frozen = J(P_BEFORE()); DR.keepNames({ prev: P_BEFORE(), next: P_SENT() }); let threw = null;
  try { DR.keepNames({}); DR.keepNames({ prev: 'x', next: [null, 3, { winId: 'a' }] }); } catch (e) { threw = e.message; }
  ok(!threw && J(P_BEFORE()) === frozen, '§1 garbage never throws; inputs never mutated', threw);
});

// ── the REAL session-lifecycle (resumeSession → createSession), its relative imports stubbed (test-attach-dedupe's loader) ──
const esbuild = (await import(pathToFileURL(path.join(REPO, 'node_modules/esbuild/lib/main.js')).href)).default;
async function loadLifecycle() {
  const src = fs.readFileSync(path.join(LIB, 'session-lifecycle.js'), 'utf8');
  const map = {};
  for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';/gm)) { (map[m[2]] = map[m[2]] || new Set()); for (const n of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) map[m[2]].add(n); }
  const special = { t: 'export const t = (s) => s;', stripCwdHostLabel: 'export const stripCwdHostLabel = (c) => c;', attachSlab: "export const attachSlab = () => 'floor';", resumeSpawnPick: "export const resumeSpawnPick = () => ({ value: undefined, origin: 'none' });", uiRow: 'export const uiRow = () => ({});', legacyIdFor: "export const legacyIdFor = (b, id) => ((b || 'claude') === 'claude' ? id : null);", viewIdFor: "export const viewIdFor = (b, id) => 'view-' + id;", terminalOnly: 'export const terminalOnly = () => false;', carriedGeometry: 'export const carriedGeometry = (g) => g;', backendFeatureCaps: 'export const backendFeatureCaps = () => ({});' };
  const STUBS = {};
  for (const [p, names] of Object.entries(map)) STUBS[p] = [...names].map((n) => special[n] || `export const ${n} = function () { return null; };`).join('\n').replace(/export const (ChatView|TerminalSession) = function \(\) \{ return null; \};/g, 'export class $1 {}');
  const r = await esbuild.build({ stdin: { contents: "export { installSessionLifecycle } from './session-lifecycle.js';", resolveDir: LIB, sourcefile: 'entry.js', loader: 'js' }, bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
    plugins: [{ name: 'stubs', setup(b) { b.onResolve({ filter: /^\.\.?\// }, (a) => (a.importer.endsWith('session-lifecycle.js') && STUBS[a.path] ? { path: a.path, namespace: 'stub' } : null)); b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' })); } }] });
  const dir = scratchDir('lsw-lifecycle'), f = path.join(dir, 'lifecycle.mjs');
  fs.writeFileSync(f, r.outputFiles[0].text);
  try { return (await import(pathToFileURL(f).href)).installSessionLifecycle; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** The REAL setup-flows (`_showLayoutHistory`), every relative import stubbed: the modal shell and fetchJson are the test's
 *  (globalThis.__lswShell / __lswFetch), t interpolates, escHtml escapes — the dialog's own code builds its query and selects. */
async function loadFlows() {
  const src = fs.readFileSync(path.join(LIB, 'setup-flows.js'), 'utf8');
  const map = {};
  for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';/gm)) { (map[m[2]] = map[m[2]] || new Set()); for (const n of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) map[m[2]].add(n); }
  const special = { t: "export const t = (s, v) => String(s).replace(/\\{(\\w+)\\}/g, (m, k) => (v && k in v ? String(v[k]) : m));", escHtml: "export const escHtml = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');",
    createModalShell: 'export const createModalShell = (o) => globalThis.__lswShell(o);', fetchJson: 'export const fetchJson = (u, o) => globalThis.__lswFetch(u, o);' };
  const STUBS = {};
  for (const [p, names] of Object.entries(map)) STUBS[p] = [...names].map((n) => special[n] || `export const ${n} = function () { return null; };`).join('\n').replace(/export const (TerminalSession|SignInCard) = function \(\) \{ return null; \};/g, 'export class $1 {}');
  const r = await esbuild.build({ stdin: { contents: "export { installSetupFlows } from './setup-flows.js';", resolveDir: LIB, sourcefile: 'entry.js', loader: 'js' }, bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
    plugins: [{ name: 'stubs', setup(b) { b.onResolve({ filter: /^\.\.?\// }, (a) => (a.importer.endsWith('setup-flows.js') ? { path: a.path, namespace: 'stub' } : null)); b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path] || 'export {};', loader: 'js' })); } }] });
  const dir = scratchDir('lsw-flows'), f = path.join(dir, 'flows.mjs');
  fs.writeFileSync(f, r.outputFiles[0].text);
  try { return (await import(pathToFileURL(f).href)).installSetupFlows; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

await section('§1b THE DOOR — the real resumeSession → createSession over the real desktop / layout managers', async () => {
  const install = await loadLifecycle();
  class Life {} install(Life);
  const proto = Life.prototype;
  // the resume-all of 个人 (not on show — the page shows 工作): the conversation of win-old-6 resumes in a NEW window whose
  // create never answers (a stopped session on a hub that came back half-updated)
  const requests = [];
  const W = world({ records: { 'desk-w': [], 'desk-p': [named(5), named(6)], 'desk-r': [] }, active: 'desk-w', extra: {
    _hideWelcome() {}, _buildTitleMeta: () => ({}), _hostLabel: () => '', _getBackendSessionDefaults: () => ({}), _closeSidebarOnMobile() {},
  } });
  for (const k of ['resumeSession', 'createSession', '_windowPending', '_placeCarried', '_reopenWin', '_reopenedAs', '_attachInRow', '_closeSecondView', '_markResume', '_closeFenced', '_fenceSays', '_winIs', '_pendingResumeWin']) if (proto[k]) W.app[k] = proto[k].bind(W.app);   // stale-pins: kept — _closeSecondView lives in src/lib/session-lifecycle.js (this copies SessionLifecycle's methods); only src/lib/user-todos-actions.js lost the token (the manager design's piece 4)
  W.app.ws.request = (msg) => { requests.push(msg); return () => {}; };
  W.app.sidebar.getSessionConfig = () => ({}); W.app.sidebar._getSessionTasks = () => [];
  W.app.resumeSession(CID(6), CWD(6), NAMES[6], { backend: 'claude', backendSessionId: CID(6), winBounds: { gridBounds: GB(6), desktopId: 'desk-p', winId: 'win-old-6' } });
  const E = [...W.wins.values()].find((w) => w.type === 'chat');
  ok(!!E && requests.some((m) => m.type === 'create' && m.resumeId === CID(6)) && E._desktopId === 'desk-p', '§1b the resume sent its create (never answered) and its window landed on 个人 (resume placement)', { E: E && E.id, desk: E && E._desktopId, req: requests.map((m) => m.type) });
  const cap = W.lm.captureWin(E, E.id);
  ok(cap && cap.backendSessionId === CID(6) && cap.backend === 'claude' && cap.cwd === CWD(6) && !cap.openSpec, '§1b THE WINDOW KNOWS ITS CONVERSATION FROM BIRTH: captured before its create answers it names the conversation (2.369.363: no identity — the title alone)', cap);
  const held = W.dm._savedStates.get('desk-p').windows;
  // lane phone-resume-keeps-layout (LAW 1 — A RESUME RE-OPENS ITS ROW): the resumed window IS win-old-6 — the row's own id, box and name
  ok(held.length === 2 && E.id === 'win-old-6' && held.find((w) => w.winId === 'win-old-6')?.backendSessionId === CID(6) && J(held.find((w) => w.winId === 'win-old-6')?.gridBounds) === J(GB(6)), '§1b 个人\'s held record: the resume re-opens win-old-6 AS ITSELF — its id, its box, NAMED (2.369.381: a new window in its place)', held.map((w) => [w.winId, w.backendSessionId || null]));
  await W.lm._doAutoSave();
  const out = W.syncs('desk-p').at(-1);
  ok(out && out.state.windows.every(isNamed) && out.state.windows.some((w) => w.winId === E.id && w.backendSessionId === CID(6)), '§1b the next autosave sends 个人 with every window named (the resumed one by its conversation)', out && out.state.windows.map((w) => [w.winId, w.backendSessionId || null]));
  ok(out && !out.evidence.some((e) => e.id === 'win-old-6' && ['replaced', 'closed', 'dup'].includes(e.why)), '§1b …and nothing in its evidence retires the row (no \'replaced\' / \'closed\' — the row stands)', out && out.evidence);
  // AT THE WRITER, NOT PER CALLER: a bare window (no birth identity — another door, an older bundle's shape) moved in place of a named entry
  const W2 = world({ records: { 'desk-w': [], 'desk-p': [named(7)], 'desk-r': [] }, active: 'desk-w' });
  const B = W2.mkWin('win-new-7', 'desk-w', { type: 'chat', title: NAMES[7] });
  W2.dm.moveWindowToDesktop(B.id, 'desk-p', { replaces: 'win-old-7' });
  await W2.lm._doAutoSave();
  const o2 = W2.syncs('desk-p').at(-1);
  ok(o2 && o2.state.windows.length === 1 && o2.state.windows[0].winId === 'win-new-7' && o2.state.windows[0].backendSessionId === CID(7), '§1b a BARE window moved in place of a named entry takes its name at the writer (mergeDesktopRecord `replaced`) — 2.369.363 sent it nameless', o2 && o2.state.windows);
  // a nameless newcomer on the desktop on show (the active desktop's resume — its read-only window closed, the new one bare)
  const W3 = world({ records: { 'desk-w': [named(8)], 'desk-p': [], 'desk-r': [] }, active: 'desk-w' });
  W3.mkWin('win-old-8', 'desk-w', { type: 'chat', title: named(8).title, _openSpec: named(8).openSpec });
  W3.app.wm.closeWindow('win-old-8');
  W3.mkWin('win-new-8', 'desk-w', { type: 'chat', title: NAMES[8] });
  await W3.lm._doAutoSave();
  const o3 = W3.syncs('desk-w').at(-1);
  ok(o3 && !o3.state.windows.some((w) => w.winId === 'win-new-8') && o3.evidence.some((e) => e.id === 'win-new-8' && e.why === 'nameless'), '§1b a nameless newcomer on the desktop on show is LEFT OUT of the write and said (evidence \'nameless\') — never saved nameless', o3 && { windows: o3.state.windows.map((w) => w.winId), evidence: o3.evidence });
  W3.wins.get('win-new-8')._conversation = { backend: 'claude', backendSessionId: CID(8), cwd: CWD(8) }; // its name arrives
  W3.lm._userDirty = true; W3.lm._lastUserInputAt = Date.now(); W3.lm._lastSentJson = null;
  await W3.lm._doAutoSave();
  const o4 = W3.syncs('desk-w').at(-1);
  ok(o4 && o4.state.windows.some((w) => w.winId === 'win-new-8' && w.backendSessionId === CID(8)), '§1b …the first write after its name arrives carries it', o4 && o4.state.windows.map((w) => w.winId));
});

await section('§2 UNBUILT IS NOT DROPPED — the 09:19:35 write on the REAL ws-handler; PURE shrinkVerdict', async () => {
  const before = NAMES.map((_, i) => (i < 4 ? answered(i) : bare(i))); // 个人 as 09:18:22 left it on 2.369.363
  const H = hub(loadHandler(), DOC(before)); const S = H.connect();
  await S.send({ type: 'layout-sync', desktopId: 'desk-p', state: { windows: before.slice(0, 4), grid: null }, evidence: before.slice(4).map((w) => ({ id: w.winId, why: 'unbuilt' })), base: 1000, sentAt: 5, viewport: 'desktop' });
  const kept = H.layouts().desktops['desk-p'].autoSave.windows;
  const refused = S.frames.find((f) => f.type === 'layout-sync-refused');
  ok(kept.length === 11 && refused && refused.reason === 'shrink-without-close' && (refused.unexplained || []).length === 7, `§2 个人 11 → 4 with seven 'unbuilt' is REFUSED — the server keeps 11 (2.369.363 wrote 4; here ${kept.length})`, { refused, n: kept.length });
  const warn = H.logs.find((l) => /REFUSED a record of desktop "个人"/.test(l)) || '';
  ok(NAMES.slice(4).every((n) => warn.includes(n)) && /7 stopped \/ unknown session window\(s\) dropped as 'unbuilt'/.test(warn), '§2 the refusal NAMES the seven by title — never a count', warn);
  const { shrinkVerdict } = require(MODEL);
  const ev = (ws, why) => ws.map((w) => ({ id: w.winId, why }));
  const one = shrinkVerdict({ prev: [named(9), named(10)], next: [named(10)], evidence: ev([named(9)], 'unbuilt'), alive: () => false });
  ok(!one.ok && J(one.unbuilt) === J(['win-old-9']), '§2 ONE stopped session window dropped as \'unbuilt\' is refused (any count)', one);
  const dup = shrinkVerdict({ prev: [named(9), named(10)], next: [{ ...named(9), winId: 'w-dup' }, named(10)], evidence: ev([named(9)], 'unbuilt'), alive: () => false });
  ok(dup.ok, '§2 …a DUPLICATE (another entry still shows its session) still leaves', dup);
  ok(shrinkVerdict({ prev: [files('a', 1), files('b', 2), files('c', 3)], next: [], evidence: ev([files('a', 1), files('b', 2), files('c', 3)], 'unbuilt') }).ok, '§2 …a window that is no session stays explained by \'unbuilt\'');
  const live = shrinkVerdict({ prev: [named(9)], next: [], evidence: ev([named(9)], 'unbuilt'), alive: (s) => s === named(9).serverSessionId });
  ok(!live.ok && J(live.live) === J(['win-old-9']) && !(live.unbuilt || []).length, '§2 …a LIVE one is refused as before (the 10-22 rule: `live`)', live);
  ok(shrinkVerdict({ prev: [named(9), named(10)], next: [], evidence: ev([named(9), named(10)], 'closed'), alive: () => false }).ok, '§2 …the person\'s CLOSE of stopped session windows passes');
  // userW inc-mw1ogdno-5jny — the placeholder road vs A DUPLICATE IS EXPLAINED WHEREVER IT IS SHOWN: a stopped conversation's copy on
  // ANOTHER desktop leaves only with the window that still shows it there (`by`, a placeholder's entry of the same session); a 'dup'
  // naming nothing of it is refused as a duplicate claim (`dup`), never taken as 'unbuilt' — the placeholder road keeps the window
  const other = [{ ...named(9), winId: 'w-elsewhere' }];
  const away = shrinkVerdict({ prev: [named(9), named(10)], next: [named(10)], evidence: [{ id: 'win-old-9', why: 'dup', by: 'w-elsewhere' }], alive: () => false, elsewhere: [other] });
  const wrongBy = shrinkVerdict({ prev: [named(9), named(10)], next: [named(10)], evidence: [{ id: 'win-old-9', why: 'dup', by: 'w-nowhere' }], alive: () => false, elsewhere: [other] });
  ok(away.ok && !wrongBy.ok && J(wrongBy.dup) === J(['win-old-9']) && !(wrongBy.unbuilt || []).length, '§2 inc-mw1ogdno-5jny: a STOPPED session\'s copy leaves as a duplicate only when `by` (another desktop\'s placeholder entry of it) shows it; a `by` naming nothing ⇒ refused, named in `dup`', { away, wrongBy });
});

await section('§2 the boot restore of that record on a hub whose sessions are stopped — placeholders, kept past the grace', async () => {
  const rec = NAMES.map((_, i) => (i < 4 ? answered(i) : bare(i)));
  const W = world({ records: { 'desk-w': [], 'desk-p': rec, 'desk-r': [] }, active: 'desk-p' });
  await W.lm.restoreState({ windows: rec });
  const built = rec.filter((w) => W.wins.has(w.winId));
  const stopped = built.map((w) => W.wins.get(w.winId)).filter((w) => tileOf(w)?.dataset?.placeholder === 'stopped');
  const gone = built.map((w) => W.wins.get(w.winId)).filter((w) => tileOf(w)?.dataset?.placeholder === 'unavailable');
  ok(built.length === 11, `§2 all ELEVEN windows are built (2.369.363 built ${0}: none alive, no transcript here — here ${built.length})`, built.map((w) => w.winId));
  ok(stopped.length === 4 && gone.length === 7, `§2 four «Session stopped — click to resume» (a conversation id, no transcript here) + seven «Session unavailable» (nameless) placeholders (${stopped.length} + ${gone.length})`);
  ok(J(wordsOf(stopped[0])) === J([NAMES[0], CWD(0), 'Session stopped — click to resume']) && J(wordsOf(gone[0]).slice(0, 2)) === J([NAMES[4], 'Session unavailable']) && tileOf(stopped[0]).tagName === 'BUTTON' && tileOf(gone[0]).tagName === 'DIV', '§2 a tile says the window\'s NAME, the folder its record holds, and its state; the stopped one is ONE press (a button), the unavailable one a group of doors (§7)', [wordsOf(stopped[0]), wordsOf(gone[0])]);
  W.dm._noteAttempts('desk-p', rec.map((w) => w.winId), { at: Date.now() - 21000 }); // the 20 s grace is long past
  const r = W.dm.recordFor('desk-p');
  ok(r.windows.length === 11 && !W.dm.evidence().some((e) => e.why === 'unbuilt'), '§2 past the grace the record keeps all ELEVEN — no \'unbuilt\' evidence (2.369.363 dropped the seven)', { n: r.windows.length, ev: W.dm.evidence() });
  const strip = (w) => { const o = { ...w }; for (const k of ['gridBounds', 'zIndex', 'isMinimized', 'isMaximized']) delete o[k]; return J(o); };
  ok(rec.every((w) => strip(r.windows.find((x) => x.winId === w.winId)) === strip(w)), '§2 each placeholder\'s capture IS its entry — identity, openSpec, title as the record holds them (the arrangement is the page\'s)', r.windows.filter((x) => strip(x) !== strip(rec.find((w) => w.winId === x.winId))).slice(0, 1).map((x) => [strip(x), strip(rec.find((w) => w.winId === x.winId))]));
  // the press: the conversation resumes IN PLACE
  tileOf(stopped[1]).onclick();
  const call = W.resumed.at(-1);
  ok(call && call[0] === CID(1) && call[1] === CWD(1) && call[2] === NAMES[1] && call[3].backendSessionId === CID(1) && call[3].fromWin === 'win-new-1' && !W.closed.includes('win-new-1'), '§2 the stopped tile\'s press resumes its conversation in its place (its id, cwd, name): the tile is the row — resumeSession re-opens it as itself (`fromWin`; lane phone-resume-keeps-layout r2 N4: the press closed it first and a new id was minted), the press closes nothing itself', call);
  ok(tileOf(gone[1]).onclick == null, '§2 the unavailable tile itself is no press (nothing names a conversation) — its doors are (§7)');
});

await section('§2 the live record\'s door — a placeholder broadcast live, rebuilt in place, closed with its entry', async () => {
  const W = world({ records: { 'desk-w': [], 'desk-p': [], 'desk-r': [] }, active: 'desk-p' });
  const e6 = bare(6), e7 = { ...named(7), openSpec: undefined, winId: 'win-x-7' };
  W.lm._applyRemoteState({ windows: [e6, e7] }, { writer: 'desktop' });
  const held1 = W.lm._restoring === true;
  ok(W.wins.get('win-new-6')?._placeholderOf && W.wins.get('win-x-7')?._placeholderOf && tileOf(W.wins.get('win-x-7'))?.dataset?.placeholder === 'stopped', '§2 another client\'s record with two spec-less session entries ⇒ two placeholders here (2.369.363: nothing — «no spec = can\'t recreate»)', [...W.wins.keys()]);
  const c1 = await heldWait(1100, () => W.lm._restoring); // the apply's cooldown: the old real 1.1 s wait, run by hand (B-7e49)
  W.lm._applyRemoteState({ windows: [e6, { ...e7, openSpec: { ...named(7).openSpec, serverId: 'sess-77' } }] }, { writer: 'desktop' });
  const w7 = W.wins.get('win-x-7');
  const held2 = W.lm._restoring === true;
  ok(w7 && !w7._placeholderOf && w7._openSpec?.serverId === 'sess-77' && W.replayed.some(([id]) => id === 'win-x-7'), '§2 a newer record whose entry has an openSpec (the resume answered on its page) REBUILDS it in place under the same id', { w7: w7 && { ph: !!w7._placeholderOf, spec: w7._openSpec }, replayed: W.replayed });
  const c2 = await heldWait(1100, () => W.lm._restoring);
  W.lm._applyRemoteState({ windows: [{ ...e7, openSpec: { ...named(7).openSpec, serverId: 'sess-77' } }] }, { writer: 'desktop' });
  ok(!W.wins.has('win-new-6'), '§2 a record without the placeholder\'s entry (the owner closed it elsewhere) closes it here', [...W.wins.keys()]);
  const opened = (c) => c.flips.length === 1 && c.flips[0].ms === 1000 && c.flips[0].from === true && c.flips[0].to === false;
  ok(held1 && held2 && opened(c1) && opened(c2), `§2 THE APPLY's COOLDOWN, run by hand where the two real 1.1 s waits stood (B-7e49): the gate HELD right after each apply and OPENED when its own 1000 ms timer fired — every timer the old waits let fire, fired in due order (${c1.fired.join(' / ')} ms; then ${c2.fired.join(' / ')} ms)`, { held1, held2, c1, c2 });
  // the SAME recipe again (it is a placeholder BECAUSE its attach is dead and no transcript is here): it stays one — only a new
  // recipe (an openSpec it lacked, another server session) is built in place (the chrome leg ② caught the first cut rebuilding it)
  const D = world({ records: { 'desk-w': [], 'desk-p': [named(3)], 'desk-r': [] }, active: 'desk-p' });
  await D.lm.restoreState({ windows: [named(3)] });
  const before3 = D.wins.get('win-old-3');
  D.lm._applyRemoteState({ windows: [named(3)] }, { writer: 'desktop' });
  ok(before3?._placeholderOf && D.wins.get('win-old-3') === before3 && D.wins.get('win-old-3')._placeholderOf && !D.replayed.length, '§2 a placeholder whose newer entry carries the SAME (dead) recipe stays the same placeholder — nothing replayed', { replayed: D.replayed });
  // a spec-less entry whose conversation RUNS (another page's resume, recorded before its create answered): attached, never «stopped»
  const L = world({ records: { 'desk-w': [], 'desk-p': [], 'desk-r': [] }, active: 'desk-p' });
  L.app.sidebar._allSessions = [{ webuiId: 'sess-live-9', backendSessionId: CID(9), backend: 'claude', cwd: CWD(9) }];
  L.lm._applyRemoteState({ windows: [{ ...named(9), winId: 'win-r-9', openSpec: undefined, serverSessionId: undefined }] }, { writer: 'desktop' });
  const r9 = L.wins.get('win-r-9');
  ok(r9 && !r9._placeholderOf && r9._openSpec?.action === 'attachSession' && r9._openSpec.serverId === 'sess-live-9' && r9._openSpec.backendSessionId === CID(9), '§2 a spec-less entry whose conversation RUNS now (the sidebar\'s live row) is ATTACHED under its id — never a «stopped» tile for a live session', r9 && { ph: !!r9._placeholderOf, spec: r9._openSpec });
});

await section('§3 A DEAD LOCAL SESSION IS A STOPPED SESSION — the real boot-restore over a scratch data dir', async () => {
  const BRm = require(path.join(REPO, 'src/server/boot-restore.js'));
  const SS = require(path.join(REPO, 'src/session-store.js'));
  const d = scratchDir('lsw-boot');
  const home = scratchHome('lsw-home', fs);
  const bin = path.join(d, 'bin'); fs.mkdirSync(bin, { recursive: true });
  for (const b of ['fuser', 'pgrep']) fs.writeFileSync(path.join(bin, b), '#!/bin/sh\nexit 1\n', { mode: 0o755 }); // «nobody holds it»: every socket is dead
  const SOCK = path.join(d, 'sockets'), META = path.join(d, 'meta'), BUF = path.join(d, 'buffers');
  for (const x of [SOCK, META, BUF]) fs.mkdirSync(x, { recursive: true });
  const env0 = { PATH: process.env.PATH, HOME: process.env.HOME };
  process.env.PATH = bin + ':' + process.env.PATH; process.env.HOME = home;
  try {
    const cwd = '/srv/u/ledger';
    const add = (n, meta) => { const sock = `cw-${n}-${1793300000000 + n}`; fs.writeFileSync(path.join(SOCK, sock), ''); fs.writeFileSync(path.join(META, sock + '.json'), J({ webuiSessionId: 'sess-' + sock.slice(3), createdAt: 1793300000000, ...meta })); return sock; };
    const withT = add(1, { name: 'Ledger', cwd, backend: 'claude', mode: 'chat', claudeSessionId: CID(0), accountId: 'acct-x', taskIds: ['T-1'] });
    const noT = add(2, { name: 'Ghost', cwd, backend: 'claude', mode: 'chat', claudeSessionId: CID(1) });
    const shell = add(3, { name: 'shell', cwd, backend: 'shell', mode: 'terminal' });
    const pdir = path.join(home, '.claude', 'projects', SS.cwdToProjectDir(cwd)); fs.mkdirSync(pdir, { recursive: true });
    fs.writeFileSync(path.join(pdir, CID(0) + '.jsonl'), J({ type: 'user', sessionId: CID(0), cwd, timestamp: '2026-10-30T09:00:00.000Z', message: { role: 'user', content: 'hello' } }) + '\n');
    const lines = [], deleted = [];
    const meta = (s) => { try { return JSON.parse(fs.readFileSync(path.join(META, s + '.json'), 'utf8')); } catch { return {}; } };
    // r2 ③: the boot's loop never walks a transcript store — every harness locate made on the MAIN thread is counted (the
    // transcript worker has its own module instance)
    const CL = require(path.join(REPO, 'src/harnesses')).get('claude');
    const locate0 = CL.store.locate; let mainLocates = 0;
    CL.store.locate = (...a) => { mainLocates++; return locate0(...a); };
    const api = BRm.create({ rootDir: d, PORT: 0, BUFFERS_DIR: BUF, META_DIR: META, SOCKETS_DIR: SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
      activeSessions: new Map(), sessionCounterRef: { value: 0 }, attachToDtach: () => {}, setupSessionPty: () => {},
      readSessionMeta: meta, writeSessionMeta: (s, m) => fs.writeFileSync(path.join(META, s + '.json'), J(m)), deleteSessionMeta: (s) => { deleted.push(s); try { fs.unlinkSync(path.join(META, s + '.json')); } catch {} },
      broadcastToSession: () => {}, broadcastActiveSessions: () => {}, refreshWebuiPids: () => {}, sbNoteServerOp: () => {}, getHosts: () => null, getDialBridge: () => null, note: () => {} });
    console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' '));
    let syncLocates = -1, early = null;
    try {
      await api.probeSockets(); await api.restoreSessions();
      // B-574d: the copy is THE STORE WRITER's job — kept first means on disk OR owed to the writer at this instant, before any answer
      syncLocates = mainLocates; { const cp = path.join(META, noT + '.json.stopped'); early = fs.existsSync(cp) || require(path.join(REPO, 'src/store-writer.js')).storeWriter().owed(cp) !== null; }
      await api.stoppedSettled?.(); // the kept metas' transcript answers (off the loop)
    } finally { console.log = REAL.log; console.warn = REAL.warn; CL.store.locate = locate0; }
    ok(syncLocates === 0 && mainLocates === 0, `§3 ③ the boot walks NO transcript store on its loop — 0 harness locates on the main thread (77dc65619: ${2} — one sync projects scan / rollout walk per dead socket; here ${mainLocates})`);
    ok(deleted.includes(withT) && deleted.includes(noT) && !fs.readdirSync(META).some((f) => f.endsWith('.tmp')), '§3 ④ a kept meta\'s live .json goes through the ONE delete road (deleteSessionMeta — its tombstone stops a straggler writer resurrecting it), the stopped copy written by the store writer (no .tmp left)', { deleted, files: fs.readdirSync(META) });
    ok(early === true, '§3 ③ a conversation\'s meta is kept FIRST — the «no transcript» answer, not the boot\'s loop, deletes it', { early });
    const kept = path.join(META, withT + '.json.stopped');
    const k = fs.existsSync(kept) ? JSON.parse(fs.readFileSync(kept, 'utf8')) : null;
    ok(lines.filter((l) => /✗ Dead socket: cw-/.test(l)).length === 3 && [withT, noT, shell].every((s) => !fs.existsSync(path.join(SOCK, s))), '§3 the three dead sockets are retired (the Dead line, the socket gone)', lines.filter((l) => /Dead|meta/.test(l)));
    ok(k && k.name === 'Ledger' && k.claudeSessionId === CID(0) && k.accountId === 'acct-x' && J(k.taskIds) === J(['T-1']) && typeof k.stoppedAt === 'number' && !fs.existsSync(path.join(META, withT + '.json')), '§3 a claude session whose transcript exists KEEPS its meta as STOPPED (<sock>.json.stopped, stoppedAt; its name, account, groups kept) — out of every live reader\'s *.json scan (2.369.363 deleted it)', { k, json: fs.existsSync(path.join(META, withT + '.json')) });
    ok(!fs.existsSync(path.join(META, noT + '.json')) && !fs.existsSync(path.join(META, noT + '.json.stopped')) && !fs.existsSync(path.join(META, shell + '.json')) && !fs.existsSync(path.join(META, shell + '.json.stopped')), '§3 one with NO transcript (once its harness answered, off the loop), and a shell (at once), are deleted as before', fs.readdirSync(META));
    ok(lines.some((l) => /local session meta kept as stopped \(claude c0ffee00…: its transcript is looked for off the loop\)/.test(l)) && lines.some((l) => new RegExp(noT + ': no transcript — its stopped meta deleted').test(l)), '§3 the journal says which meta was kept, and which one its answer deleted', lines.filter((l) => /↳/.test(l)));
    // what the SIDEBAR shows: the claude store's discovery lists the conversation from its TRANSCRIPT — the meta is not read
    const H = require(path.join(REPO, 'src/harnesses')).get('claude');
    const rows = await H.store.discover({ activeSessions: new Map(), webuiPids: new Map() });
    const row = (rows || []).find((s) => (s.backendSessionId || s.sessionId) === CID(0));
    ok(row && row.status !== 'live', `§3 the sidebar's row for it is the transcript's — a STOPPED row (status ${row && row.status}), the same with the meta kept or deleted; the resume-all offer lists it from the layout + this row`, row && { status: row.status, cwd: row.cwd });
    console.log('    §3 sidebar row: ' + J(row && { status: row.status, name: row.name || row.summary || null, cwd: row.cwd }));
  } finally { process.env.PATH = env0.PATH; process.env.HOME = env0.HOME; fs.rmSync(d, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
});

await section('§4 THE DOOR TO RECOVER — one desktop restored alone (the real persistence router)', async () => {
  const dd = scratchDir('lsw-restore');
  try {
    const p = require(path.join(REPO, 'src/routes/persistence.js'));
    const heard = [];
    p.setup({ writer: landingWriter(), dataDir: dd, wss: { clients: new Set([{ readyState: 1, send: (s) => heard.push(JSON.parse(s)) }]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
    const R = p.router;
    // the 06:50Z point: 个人 TWELVE (eleven named + an editor), 工作 six, 研究 six — as a rollback point on disk
    const editor = { winId: 'win-ed', title: '…/notes/plan.md', type: 'editor', isMinimized: false, isMaximized: false, gridBounds: GB(11), zIndex: 7200, openSpec: { action: 'openEditor', path: '/srv/u/notes/plan.md', name: 'plan.md' }, filePath: '/srv/u/notes/plan.md', fileName: 'plan.md' };
    const point = DOC([...P_BEFORE(), editor]);
    point.desktops['desk-w'].autoSave.windows.push(files('w-5', 5));
    fs.mkdirSync(path.join(dd, 'layout-history'), { recursive: true });
    const id = 'layout-2026-10-30T06-50-53-927Z-1h.json';
    fs.writeFileSync(path.join(dd, 'layout-history', id), J({ at: 1793343053927, summary: { 工作: 6, 个人: 12, 研究: 6 }, totalWindows: 24, change: [['个人', 12, 11]], layouts: point }));
    fs.writeFileSync(path.join(dd, 'layout-history', id.replace(/\.json$/, '.meta.json')), J({ at: 1793343053927, summary: { 工作: 6, 个人: 12, 研究: 6 }, totalWindows: 24, change: [['个人', 12, 11]] }));
    // NOW: 个人 four (the 09:19:35 shape), 工作 five, 研究 six
    const now = DOC(NAMES.slice(0, 4).map((_, i) => answered(i)));
    R.writeLayouts(now); R.flushLayouts?.(); await tick(5);
    const route = R.stack.find((l) => l.route && l.route.path === '/api/layout-history/:id/restore');
    let answer = null;
    await route.route.stack[0].handle({ params: { id }, body: { desktop: '个人' } }, { json: (j) => { answer = j; }, status: () => ({ json: (j) => { answer = j; } }) });
    await tick(5);
    const back = R.readLayouts();
    ok(answer && answer.success && back.desktops['desk-p'].autoSave.windows.length === 12 && J(back.desktops['desk-p'].autoSave.windows.map((w) => w.winId)) === J([...P_BEFORE(), editor].map((w) => w.winId)), '§4 the row\'s 个人 restores ALONE: the point\'s twelve windows', { answer, p: back.desktops['desk-p'].autoSave.windows.length });
    ok(back.desktops['desk-w'].autoSave.windows.length === 5 && back.desktops['desk-r'].autoSave.windows.length === 6 && !back.desktops['desk-w'].autoSave.windows.some((w) => w.winId === 'w-5'), '§4 …工作 and 研究 stay as they are NOW (5 / 6 — the point held 工作 six; 2.369.363 restored every desktop)', { w: back.desktops['desk-w'].autoSave.windows.length, r: back.desktops['desk-r'].autoSave.windows.length });
    const pts = R.listLayoutHistory();
    ok(heard.some((m) => m.type === 'layout-restored') && pts.some((x) => x.writer && x.writer.via === 'restore' && x.writer.desktop === 'desk-p'), '§4 every client is told (layout-restored) and the forced rollback point names the restore and the desktop — undoable', pts.map((x) => x.writer));
    let miss = null;
    await route.route.stack[0].handle({ params: { id }, body: { desktop: 'Nowhere' } }, { json: (j) => { miss = j; }, status: (c) => ({ json: (j) => { miss = { ...j, code: c }; } }) });
    ok(miss && miss.code === 404, '§4 a desktop the point does not hold is a 404, nothing written', miss);
    // the 06:50Z 个人 restored, on a hub whose sessions are all stopped: twelve windows, not 0
    const W = world({ records: { 'desk-w': [], 'desk-p': back.desktops['desk-p'].autoSave.windows, 'desk-r': [] }, active: 'desk-p' });
    await W.lm.restoreState({ windows: back.desktops['desk-p'].autoSave.windows });
    const shown = back.desktops['desk-p'].autoSave.windows.filter((w) => W.wins.has(w.winId)).map((w) => W.wins.get(w.winId));
    ok(shown.length === 12 && shown.filter((w) => w._placeholderOf).length === 11 && shown.some((w) => w.type === 'editor'), `§4 restoring the 06:50Z 个人 on a hub whose sessions are stopped builds TWELVE windows — eleven placeholders + the editor (2.369.363: the editor alone; here ${shown.length})`, shown.map((w) => [w.id, w.type, !!w._placeholderOf]));
  } finally { fs.rmSync(dd, { recursive: true, force: true }); }
  const SF = read('src/lib/setup-flows.js');
  ok(/class="lh-desk" data-id="\$\{escHtml\(e\.id\)\}" data-desk="\$\{escHtml\(n\)\}"/.test(SF) && /body: JSON\.stringify\(\{ desktop: desk, rid: end\.rid \}\)/.test(SF) && /registerMenuItem\(\{ menu: M, parent: 'system', order: 40,[^\n]*Restore a previous layout…/.test(read('src/lib/gear-menu.js')), '§4 the door: ⚙ → System → «Restore a previous layout…» (恢复之前的布局…) lists each point with its desktops — each desktop a button posting { desktop } to its restore (and the rid of the press — lane phone-dock-restore r2)');
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = ['Session stopped — click to resume', 'Session unavailable', 'Press a desktop to restore it alone — your other desktops stay as they are now.', 'Restore only “{desktop}”', 'Restore only “{desktop}” as it was then? Your other desktops stay as they are now; the current layout becomes a rollback point too, so this is undoable.', '“{desktop}” restored — reloading…'];
  ok(keys.every((k) => zh.includes(J(k) + ':') && ja.includes(J(k) + ':')) && zh.includes('"Session stopped — click to resume": "会话已停止 — 点击恢复"') && zh.includes('"Session unavailable": "会话不可用"'), '§4 every new word has a zh AND a ja entry (会话已停止 — 点击恢复 / 会话不可用)', keys.filter((k) => !zh.includes(J(k) + ':') || !ja.includes(J(k) + ':')));
});

await section('§6 r2 ① A REPLAY IS IDEMPOTENT — two replays 50 ms apart build each window once, nothing outside wm.windows', async () => {
  answers['/api/sessions'] = { sessions: [0, 1, 2].map((i) => ({ sessionId: CID(i), backendSessionId: CID(i), backend: 'claude', cwd: CWD(i), name: NAMES[i], status: 'stopped' })) };
  answers['/api/active'] = { sessions: [] };
  const ent = () => [0, 1, 2].map((i) => { const { openSpec, serverSessionId, ...e } = named(i); return e; }); // a carried name's shape: a conversation, no recipe
  const counted = (W) => { const made = []; let n = 0; W.app.viewSession = (sid, cwd, name, o) => { const w = W.mkWin('view-' + (++n), W.dm.activeDesktopId, { type: 'chat', title: `${name} — ${cwd}`, _openSpec: { action: 'viewSession', sessionId: sid, backend: o && o.backend, backendSessionId: sid, cwd, name } }); made.push(w); return w; }; return made; };
  const judge = (W, made) => { const inMap = new Set(W.wins.values()); return { made: made.length, inMap: made.filter((w) => inMap.has(w)).length, orphans: made.filter((w) => !inMap.has(w)).map((w) => w.id), ids: [0, 1, 2].map((i) => W.wins.get('win-old-' + i)?._openSpec?.action || null) }; };
  delays['/api/sessions'] = 150;
  try {
    // the door: _replayMissing (a refusal's reconcile, a switch back) — the second within the first one's reads
    const W = world({ records: { 'desk-w': [], 'desk-p': ent(), 'desk-r': [] }, active: 'desk-p' });
    const made = counted(W);
    const r1 = W.dm._replayMissing('desk-p', W.dm._savedStates.get('desk-p'));
    await tick(50);
    const r2 = W.dm._replayMissing('desk-p', W.dm._savedStates.get('desk-p'));
    await tick(400);
    const j = judge(W, made);
    ok(j.made === 3 && j.inMap === 3 && !j.orphans.length && j.ids.every((a) => a === 'viewSession') && r1 === 3 && r2 === 0, `§6 ① two replays 50 ms apart ⇒ THREE windows, zero orphans; the second leaves the three to the first (77dc65619: six built, three orphaned outside wm.windows)`, { r1, r2, ...j });
    // the restore's own belt: two overlapping restores of the same entries (the door's guard not asked) — an entry built
    // meanwhile by another door is never built again
    const V = world({ records: { 'desk-w': [], 'desk-p': [], 'desk-r': [] }, active: 'desk-p' });
    const made2 = counted(V);
    const a = V.lm.restoreState({ windows: ent() });
    await tick(50);
    const b = V.lm.restoreState({ windows: ent() });
    await Promise.all([a, b]); await tick(20);
    const j2 = judge(V, made2);
    ok(j2.made === 3 && !j2.orphans.length && j2.ids.every((x) => x === 'viewSession'), '§6 ① restoreState\'s belt: two overlapping restores of the same three entries build three windows — the later one skips what the earlier built (77dc65619: six, three orphaned)', j2);
  } finally { delays['/api/sessions'] = 0; answers['/api/sessions'] = { sessions: [] }; }
});

await section('§6 r2 ② THE HOST RIDES WITH THE NAME — {backend, backendSessionId, hostId} as one unit (the CS-separation law)', async () => {
  const DR = require(MODEL);
  answers['/api/sessions'] = { sessions: [] }; answers['/api/active'] = { sessions: [] };
  const old = named(8, { openSpec: { ...named(8).openSpec, hostId: 'host-a' } }); // a REMOTE conversation's entry before the outage
  // born: the resume window, captured before its create answered (session-lifecycle createSession's `_conversation`)
  const W = world({ records: { 'desk-w': [], 'desk-p': [], 'desk-r': [] }, active: 'desk-p' });
  const born = W.mkWin('win-born', 'desk-p', { type: 'chat', title: NAMES[8], _conversation: { backend: 'claude', backendSessionId: CID(8), cwd: CWD(8), hostId: 'host-a' } });
  const cap = W.lm.captureWin(born);
  ok(cap && cap.backendSessionId === CID(8) && cap.hostId === 'host-a' && DR.hostOf(cap) === 'host-a', '§6 ② born: a remote resume\'s window, captured before its create answers, names its conversation WITH its host (77dc65619: no host)', cap && { bsid: cap.backendSessionId, hostId: cap.hostId ?? null });
  // carried: PURE carryName / keepIdentity, and the REAL server write (the 09:18:22 shape, one of the eleven remote)
  const carried = DR.carryName(old, bare(8));
  ok(carried.backendSessionId === CID(8) && carried.hostId === 'host-a' && !carried.openSpec && !carried.serverSessionId && DR.hostOf(carried) === 'host-a', '§6 ② carried: carryName takes the old entry\'s host with its conversation (its recipe\'s hostId as the entry\'s own) — never its openSpec or server session (77dc65619: no host)', carried);
  const same = DR.keepIdentity(carried, { ...bare(8) }), other = DR.keepIdentity(carried, { ...bare(8), backendSessionId: CID(9) });
  ok(same.hostId === 'host-a' && same.backendSessionId === CID(8) && other.hostId === undefined, '§6 ② keepIdentity carries the host WITH the conversation it names — never onto another conversation', { same: same.hostId, other: other.hostId ?? null });
  const seed = P_BEFORE().map((w, i) => (i === 8 ? old : w));
  const H = hub(loadHandler(), DOC(seed)); const S = H.connect();
  await S.send({ ...W0(), state: { windows: P_SENT(), grid: null } });
  const st = H.layouts().desktops['desk-p'].autoSave.windows.find((w) => w.backendSessionId === CID(8) && !w.openSpec);
  ok(st && st.hostId === 'host-a' && DR.hostOf(st) === 'host-a', '§6 ② the server\'s write stores the carried entry WITH its host (the record keeps hostId through the write)', st && { winId: st.winId, hostId: st.hostId ?? null });
  // restored: no local transcript (a remote conversation never stoppedMatches LOCAL discovery) ⇒ viewed ON its host, as the old entry is
  let viewed = null;
  W.app.viewSession = (sid, cwd, name, o) => { viewed = o; return W.mkWin('view-r', 'desk-p', { type: 'chat' }); };
  await W.lm.restoreState({ windows: [carried] });
  ok(viewed && viewed.hostId === 'host-a' && !W.wins.get('win-new-8')?._placeholderOf, '§6 ② restored: the carried entry is viewed read-only ON its host, the old entry\'s road (77dc65619: a LOCAL «stopped» tile)', viewed);
  // a placeholder (a remote apply, no live row): names its host; the press resumes on that host; its capture keeps the host
  const V = world({ records: { 'desk-w': [], 'desk-p': [], 'desk-r': [] }, active: 'desk-p', extra: { _hostLabel: (h) => (h === 'host-a' ? 'gpu-box' : h) } });
  V.lm._applyRemoteState({ windows: [carried] }, { writer: 'desktop' });
  const ph = V.wins.get('win-new-8');
  const words = wordsOf(ph);
  ok(ph?._placeholderOf && tileOf(ph)?.dataset?.host === 'host-a' && words[0] === NAMES[8] && words[1] === 'on gpu-box' && words.at(-1) === 'Session stopped — click to resume', '§6 ② a remote conversation\'s placeholder names its machine — the title, «on <host>» (its own line since r3), «Session stopped — click to resume» (77dc65619: no host)', { words, host: tileOf(ph)?.dataset?.host ?? null });
  const pc = ph && V.lm.captureWin(ph);
  ok(pc && pc.hostId === 'host-a' && pc.backendSessionId === CID(8), '§6 ② the placeholder\'s capture keeps the host (the record keeps it through every write)', pc && { hostId: pc.hostId ?? null });
  tileOf(ph)?.onclick?.();
  const call = V.resumed.at(-1);
  ok(call && call[0] === CID(8) && call[3] && call[3].hostId === 'host-a', '§6 ② the press resumes the conversation ON that host — resumeSession(…, {hostId}) (77dc65619: hostId undefined ⇒ this hub)', call && { cid: call[0], hostId: call[3] && call[3].hostId });
  // a live row's recipe (the conversation runs again on its host): the row's host, never its display cwd «host: /path»
  V.app.sidebar._allSessions = [{ webuiId: 'sess-r8', backend: 'claude', backendSessionId: CID(8), sessionId: CID(8), host: 'host-a', hostName: 'gpu-box', cwd: 'gpu-box: ' + CWD(8), status: 'live' }];
  const spec = V.lm._liveSpecOf(carried), specNoCwd = V.lm._liveSpecOf({ ...carried, cwd: '' });
  const elsewhere = V.lm._liveSpecOf({ ...carried, hostId: 'host-b' });
  ok(spec && spec.serverId === 'sess-r8' && spec.hostId === 'host-a' && spec.cwd === CWD(8) && specNoCwd && specNoCwd.cwd === '' && elsewhere === null, '§6 ② a live row\'s attach recipe keeps the row\'s host and never its display cwd; a row on ANOTHER host is not this entry\'s', { spec, specNoCwd: specNoCwd && specNoCwd.cwd, elsewhere });
});

await section('§7 r3 THE TILE WITH NO PRESS HAS A WAY FORWARD — why, in one line, and three doors', async () => {
  const { placeholderWhy } = await import(pathToFileURL(path.join(LIB, 'layout.js')).href);
  const doorsOf = (w) => { const g = (tileOf(w)?.children || []).find((c) => c.className === 'session-placeholder-doors'); return g ? g.children : []; };
  const lineOf = (w, cls) => (tileOf(w)?.children || []).find((c) => c.className === cls)?.textContent ?? null;
  const rec = NAMES.map((_, i) => (i < 4 ? answered(i) : bare(i)));
  const W = world({ records: { 'desk-w': [], 'desk-p': rec, 'desk-r': [] }, active: 'desk-p' });
  const histCalls = [], listCalls = [], confirms = [];
  W.app._showLayoutHistory = (slot) => { histCalls.push(slot); return null; };
  W.app.sidebar.showSessionsNamed = (q) => listCalls.push(q);
  let answer = false;
  W.lm.confirmRemovePlaceholder = async ({ name }) => { confirms.push(name); return answer; };
  await W.lm.restoreState({ windows: rec });
  const t4 = W.wins.get('win-new-4');
  const d = doorsOf(t4);
  ok(tileOf(t4)?.dataset?.placeholder === 'unavailable' && lineOf(t4, 'session-placeholder-why') === 'This window was saved without its conversation or its folder, so it cannot be reopened from here.', '§7 a nameless entry\'s tile SAYS WHY in one line — saved without its conversation (and its folder: the record holds none) (5e0cb138e: «Session unavailable» alone)', wordsOf(t4));
  ok(d.length === 3 && d.every((b) => b.tagName === 'BUTTON' && typeof b.onclick === 'function') && J(d.map((b) => b.dataset.door)) === J(['rollback', 'sessions', 'remove']) && J(d.map((b) => b.textContent)) === J(['Restore a previous layout…', 'Open the session list', 'Remove']), '§7 …and offers THREE doors, each a button: «Restore a previous layout…» · «Open the session list» · «Remove» (5e0cb138e: none — its only control was the window\'s ✕)', d.map((b) => [b.tagName, b.dataset.door, b.textContent]));
  d[0].onclick({ stopPropagation() {} });
  const slot = histCalls.at(-1);
  ok(slot && slot.desktopId === 'desk-p' && slot.entry?.winId === 'win-new-4' && slot.name === NAMES[4], '§7 the rollback door opens the dialog FOR THIS SLOT (its desktop, its entry, its name)', slot && { desktopId: slot.desktopId, win: slot.entry?.winId, name: slot.name });
  d[1].onclick({ stopPropagation() {} });
  ok(J(listCalls) === J([NAMES[4]]), '§7 the session-list door opens the list searched by the window\'s name', listCalls);
  // the reasons, as the record shows them (PURE placeholderWhy) and as the tile says them
  const gone = { ...bare(5), openSpec: { action: 'attachSession', serverId: 'sess-gone-5', mode: 'chat' } };
  const far = { ...bare(6), hostId: 'host-z', cwd: '/srv/u/far' };
  ok(placeholderWhy(bare(4), null) === 'nameless' && placeholderWhy(gone, null) === 'gone' && placeholderWhy(far, [{ id: 'host-a' }]) === 'host' && placeholderWhy(far, null) === 'nameless' && placeholderWhy(far, [{ id: 'host-z' }]) === 'nameless' && placeholderWhy(named(1), null) === null, '§7 PURE placeholderWhy: nameless · gone (the record names a session of this hub that is gone) · host (its machine is not in the hub\'s machine list — an unread list claims nothing) · null when it names a conversation');
  const V = world({ records: { 'desk-w': [], 'desk-p': [gone, far, { ...bare(7), cwd: CWD(7) }], 'desk-r': [] }, active: 'desk-p', extra: { _hostLabel: (h) => (h === 'host-z' ? 'far-box' : h) } });
  V.app.sidebar._hostsData = { hosts: [{ id: 'host-a', name: 'gpu-box' }] };
  await V.lm.restoreState({ windows: [gone, far, { ...bare(7), cwd: CWD(7) }] });
  ok(lineOf(V.wins.get('win-new-5'), 'session-placeholder-why') === 'The record of its conversation is gone from this hub.' && lineOf(V.wins.get('win-new-6'), 'session-placeholder-why') === 'Its machine “far-box” is not paired with this hub.' && lineOf(V.wins.get('win-new-7'), 'session-placeholder-why') === 'This window was saved without its conversation, so it cannot be reopened from here.', '§7 …each tile says its own: the conversation\'s record gone · its machine «far-box» not paired · saved without its conversation (its folder known)', ['win-new-5', 'win-new-6', 'win-new-7'].map((id) => lineOf(V.wins.get(id), 'session-placeholder-why')));
  ok(lineOf(V.wins.get('win-new-7'), 'session-placeholder-where') === CWD(7) && lineOf(V.wins.get('win-new-6'), 'session-placeholder-host') === 'on far-box' && lineOf(W.wins.get('win-new-0'), 'session-placeholder-where') === CWD(0), '§7 the folder the record holds is shown on BOTH kinds (r3 ③), the machine on its own line');
  // ✕ ⇒ the confirm; cancel keeps the entry
  const ask = (id) => W.app.wm.requestClose(id);
  ok(ask('win-new-4') === false && W.wins.has('win-new-4') && J(confirms) === J([NAMES[4]]), '§7 the ✕ of a nameless tile ASKS first — the window stays while the confirm is up (5e0cb138e: closed at once, the entry gone from the record)', { confirms, has: W.wins.has('win-new-4') });
  await tick(5);
  ok(W.wins.has('win-new-4') && W.dm.recordFor('desk-p').windows.some((w) => w.winId === 'win-new-4') && !W.dm.evidence().some((e) => e.id === 'win-new-4' && e.why === 'closed'), '§7 …cancel KEEPS it: the tile, the entry in the record, no \'closed\' evidence', W.dm.evidence().filter((e) => e.id === 'win-new-4'));
  answer = true; d[2].onclick({ stopPropagation() {} }); await tick(5);
  ok(!W.wins.has('win-new-4') && J(confirms) === J([NAMES[4], NAMES[4]]) && W.dm.evidence().some((e) => e.id === 'win-new-4' && e.why === 'closed') && !W.dm.recordFor('desk-p').windows.some((w) => w.winId === 'win-new-4'), '§7 «Remove» asks the same confirm; yes = the person\'s close (the record drops it as \'closed\', every client closes it)', { confirms, ev: W.dm.evidence().filter((e) => e.id === 'win-new-4') });
  answer = true; ask('win-new-5'); await tick(5);
  ok(!W.wins.has('win-new-5') && confirms.length === 3, '§7 …and the ✕ with a yes closes it');
  const n0 = confirms.length;
  ok(ask('win-new-0') === true && !W.wins.has('win-new-0') && confirms.length === n0, '§7 a STOPPED tile\'s ✕ closes without asking (its conversation stays in the session list)', { left: W.wins.has('win-new-0'), confirms });
  // the confirm's words: deleted for good, and where it still lives
  const L = read('src/lib/layout.js');
  ok(/confirmRemovePlaceholder\(\{ name \}\) \{\n\s*return showConfirmDialog\(\{ title: t\('Remove this window\?'\), message: t\('“\{name\}” is deleted from this desktop’s layout for good\. Only an older rollback point \(Restore a previous layout…\) still holds it\.', \{ name \}\), confirmText: t\('Remove'\), danger: true \}\);/.test(L), '§7 the confirm says the entry is deleted FOR GOOD (and that only an older rollback point still holds it) — the house dialog, danger');
  // a 60-char title + a host: the host is NOT inside the one-line (ellipsized) name
  const long = 'Investigate why the nightly integration build fails on main.'; // 60 chars
  const R = world({ records: { 'desk-w': [], 'desk-p': [], 'desk-r': [] }, active: 'desk-p', extra: { _hostLabel: (h) => (h === 'host-a' ? 'gpu-box' : h) } });
  R.lm._applyRemoteState({ windows: [{ ...named(8), winId: 'win-long', title: long + ' — ' + CWD(8), openSpec: undefined, serverSessionId: undefined, hostId: 'host-a' }, { ...bare(9), winId: 'win-long-u', title: long, hostId: 'host-a' }] }, { writer: 'desktop' });
  const lp = R.wins.get('win-long'), lu = R.wins.get('win-long-u');
  ok(long.length === 60 && [lp, lu].every((w) => lineOf(w, 'session-placeholder-name') === long && lineOf(w, 'session-placeholder-host') === 'on gpu-box') && tileOf(lp).dataset.placeholder === 'stopped' && tileOf(lu).dataset.placeholder === 'unavailable', '§7 a 60-char title + a host ⇒ the host is its OWN line under the title, never inside the ellipsized name — stopped and unavailable alike (5e0cb138e: «<title> · gpu-box» cut by the ellipsis)', [wordsOf(lp), wordsOf(lu)]);
  const css = read('public/style.css');
  ok(/\.session-placeholder-name \{[^}]*text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; \}/.test(css) && /\.session-placeholder > :first-child \{ margin-top: auto; \}\n\.session-placeholder > :last-child \{ margin-bottom: auto; \}/.test(css) && /\.session-placeholder \{[^}]*justify-content: flex-start;[^}]*overflow: auto;/.test(css) && /\.session-placeholder-host \{[^}]*flex-shrink: 0;/.test(css) && /\.agent-btn\.session-placeholder-door \{ min-height: 44px;/.test(css) && /@media \(max-width: 768px\), \(pointer: coarse\) and \(max-width: 1023px\) \{\n  \.session-placeholder-name \{ font-size: 18px; \}\n  \.session-placeholder-host, \.session-placeholder-where, \.session-placeholder-say, \.session-placeholder-why, \.agent-btn\.session-placeholder-door \{ font-size: 16px; \}/.test(css) && !/var\(--bg-secondary/.test(css.slice(css.indexOf('.session-placeholder {'), css.indexOf('.session-placeholder {') + 600)), '§7 the CSS: the name ellipsized and never shrunk away, the tile centred by auto margins (a tall one scrolls from its top), the host its own unshrunk line, doors ≥ 44 px, every word ≥ 16 px on the phone; no --bg-secondary (not a token here)');
});

await section('§7 r3 the rollback door opens the dialog ON the newest point that names this slot (the REAL router)', async () => {
  const DR = require(MODEL);
  ok(typeof DR.namedTwinIn === 'function', '§7 desktop-record.js exports namedTwinIn (PURE)');
  const tw = DR.namedTwinIn;
  ok(tw(P_BEFORE(), bare(4))?.winId === 'win-old-4' && tw(P_BEFORE(), { ...bare(4), winId: 'win-old-4', title: 'renamed' })?.winId === 'win-old-4' && tw(P_SENT(), bare(4)) === null
    && tw([named(0, { title: 'Twin — x' }), named(1, { title: 'Twin — y' })], { ...bare(0), title: 'Twin' }) === null && tw([{ ...named(4), type: 'terminal' }], bare(4)) === null && tw(P_BEFORE(), files('x', 1)) === null && tw('garbage', bare(4)) === null,
  '§7 PURE namedTwinIn: the slot\'s named entry by its id, else by the ONE entry of its name (the title without its cwd tail); a nameless one is no twin; two of one name are never guessed; another type, a window that is no session, garbage ⇒ null');
  const dd = scratchDir('lsw-pick');
  try {
    delete require.cache[require.resolve(path.join(REPO, 'src/routes/persistence.js'))]; // §4 set up another data dir on the cached module
    const p = require(path.join(REPO, 'src/routes/persistence.js'));
    p.setup({ writer: landingWriter(), dataDir: dd, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
    const R = p.router;
    fs.mkdirSync(path.join(dd, 'layout-history'), { recursive: true });
    const put = (id, at, p) => { const doc = DOC(p), sum = { 工作: 5, 个人: p.length, 研究: 6 }; fs.writeFileSync(path.join(dd, 'layout-history', id), J({ at, summary: sum, totalWindows: 11 + p.length, change: null, layouts: doc })); fs.writeFileSync(path.join(dd, 'layout-history', id.replace(/\.json$/, '.meta.json')), J({ at, summary: sum, totalWindows: 11 + p.length, change: null })); };
    const OLD = 'layout-2026-10-30T06-50-53-927Z-1h.json', MID = 'layout-2026-10-30T09-18-22-111Z-2h.json', NEW = 'layout-2026-10-30T09-19-35-222Z-3h.json';
    put(OLD, 1793343053927, P_BEFORE()); // 06:50 — all eleven named
    put(MID, 1793352000000, P_BEFORE().slice(0, 6)); // a point that names some of them (Trip planner = 4, Van build = 5)
    put(NEW, 1793353000000, P_SENT()); // 09:18:22's write — the seven nameless
    const route = R.stack.find((l) => l.route && l.route.path === '/api/layout-history' && l.route.methods.get);
    const call = async (query) => { let out = null; await route.route.stack[0].handle({ query }, { json: (j) => { out = j; } }); return out; };
    // the REAL dialog (its imports stubbed) asks for THIS SLOT and selects what the router answers
    class A {} (await loadFlows())(A);
    const dialog = async (slot) => {
      const made = [], urls = [];
      const body = { _h: '', set innerHTML(v) { this._h = String(v); }, get innerHTML() { return this._h; },
        querySelectorAll(sel) { if (sel !== '.lh-desk') return []; return [...this._h.matchAll(/<button class="lh-desk" data-id="([^"]*)" data-desk="([^"]*)"/g)].map((m) => { const b = { dataset: { id: m[1], desk: m[2] }, cls: [], attrs: {}, focused: false, classList: { add: (c) => b.cls.push(c) }, setAttribute: (k, v) => { b.attrs[k] = v; }, closest: () => ({ classList: { add: (c) => { b.row = c; } } }), scrollIntoView() { b.seen = true; }, focus() { b.focused = true; } }; made.push(b); return b; }); } };
      globalThis.__lswShell = () => ({ body, close() {}, raised: false, ready: Promise.resolve(true), live: () => true });
      globalThis.__lswFetch = async (u) => { urls.push(u); return call(Object.fromEntries(new URL(u, 'http://x').searchParams)); };
      await A.prototype._showLayoutHistory.call(new A(), slot);
      return { urls, html: body._h, picked: made.filter((b) => b.cls.includes('is-picked')) };
    };
    const D1 = await dialog({ desktopId: 'desk-p', entry: bare(4), name: NAMES[4] });
    const q1 = D1.urls[0] ? Object.fromEntries(new URL(D1.urls[0], 'http://x').searchParams) : null;
    ok(q1 && q1.desktop === 'desk-p' && q1.win === 'win-new-4' && q1.type === 'chat' && q1.title === NAMES[4], '§7 the dialog asks the history for THIS SLOT (?desktop=&win=&type=&title=&cwd=&name= — the tile\'s entry)', D1.urls);
    const a = await call(q1 || {});
    ok(a && a.entries.length === 3 && a.pick && a.pick.id === MID && a.pick.desk === '个人', '§7 the router answers the NEWEST point whose 个人 still names a conversation for it (09:18:22\'s own point holds it nameless — skipped)', a && { pick: a.pick, ids: a.entries.map((e) => e.id) });
    const p1 = D1.picked;
    ok(p1.length === 1 && p1[0].dataset.id === MID && p1[0].dataset.desk === '个人' && p1[0].attrs['aria-current'] === 'true' && p1[0].focused && p1[0].row === 'is-picked' && D1.html.includes('Selected: the newest point that still names the conversation of “Trip planner” — press it to restore that desktop as it was then.'), '§7 …and the dialog opens WITH THAT POINT\'S 个人 SELECTED (is-picked, aria-current, focused) and says so (5e0cb138e: no slot — the newest row first, the one that holds the seven nameless)', { picked: p1.map((b) => b.dataset), note: (D1.html.match(/lh-slot">([^<]*)/) || [])[1] });
    const b = await call({ desktop: 'desk-p', win: 'win-new-9', type: 'chat', title: NAMES[9] });
    ok(b && b.pick && b.pick.id === OLD && b.pick.desk === '个人', '§7 …a window the middle point does not hold is found further back (06:50)', b && b.pick);
    const c = await call({ desktop: 'desk-p', win: 'win-new-x', type: 'chat', title: 'Nobody' }), e = await call({ desktop: 'desk-q', win: 'win-new-4', type: 'chat', title: NAMES[4] });
    const bare0 = await call({});
    const D2 = await dialog({ desktopId: 'desk-p', entry: { ...bare(4), winId: 'win-new-x', title: 'Nobody' }, name: 'Nobody' });
    const D3 = await dialog(null);
    ok(c && c.pick === null && e && e.pick === null && bare0 && !('pick' in bare0) && bare0.entries.length === 3 && !D2.picked.length && D2.html.includes('No rollback point names the conversation of “Nobody”.') && D3.urls[0] === '/api/layout-history' && !D3.html.includes('lh-slot'), '§7 …no point names it ⇒ pick null and the dialog SAYS so; another desktop ⇒ null; the bare list (⚙ → System) is as before — no slot, no pick', { c: c && c.pick, e: e && e.pick, bare: bare0 && Object.keys(bare0), d3: D3.urls });
    const SF = read('src/lib/setup-flows.js');
    ok(/const picked = pick \? \[\.\.\.body\.querySelectorAll\('\.lh-desk'\)\]\.find\(\(b\) => b\.dataset\.id === pick\.id && b\.dataset\.desk === pick\.desk\) : null;\n\s*if \(picked\) \{ picked\.classList\.add\('is-picked'\); picked\.setAttribute\('aria-current', 'true'\);/.test(SF), '§7 the dialog SELECTS that point\'s desktop button (is-picked, aria-current, focus) — the chrome heavy sees it');
  } finally { fs.rmSync(dd, { recursive: true, force: true }); }
});

await section('§7 r3 the words have zh + ja', async () => {
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = ['Its machine “{host}” is not paired with this hub.', 'The record of its conversation is gone from this hub.', 'This window was saved without its conversation, so it cannot be reopened from here.', 'This window was saved without its conversation or its folder, so it cannot be reopened from here.', 'Open the session list', 'Remove this window?', '“{name}” is deleted from this desktop’s layout for good. Only an older rollback point (Restore a previous layout…) still holds it.', 'Selected: the newest point that still names the conversation of “{name}” — press it to restore that desktop as it was then.', 'No rollback point names the conversation of “{name}”.', 'on {host}', 'Remove', 'Restore a previous layout…'];
  ok(keys.every((k) => zh.includes(J(k) + ':') && ja.includes(J(k) + ':')) && zh.includes('"Open the session list": "打开会话列表"') && zh.includes('"Remove": "移除"') && zh.includes('"Restore a previous layout…": "恢复之前的布局…"'), '§7 every word of the tile and the dialog has a zh AND a ja entry (恢复之前的布局… / 打开会话列表 / 移除)', keys.filter((k) => !zh.includes(J(k) + ':') || !ja.includes(J(k) + ':')));
});

await section('§8 r4 «Open the session list» opens ALL with the search — the tile\'s REAL door → the REAL Sidebar', async () => {
  const { Sidebar } = await import(pathToFileURL(path.join(LIB, 'sidebar.js')).href);
  const rec = NAMES.map((_, i) => (i < 4 ? answered(i) : bare(i)));
  const W = world({ records: { 'desk-w': [], 'desk-p': rec, 'desk-r': [] }, active: 'desk-p' });
  await W.lm.restoreState({ windows: rec });
  const press = (id, key) => (((tileOf(W.wins.get(id))?.children || []).find((c) => c.className === 'session-placeholder-doors')?.children || []).find((b) => b.dataset.door === key))?.onclick?.({ stopPropagation() {} });
  const input = { value: '' };
  const gid = document.getElementById; document.getElementById = (id) => (id === 'session-filter' ? input : gid(id));
  const now = Date.now(), VAN = NAMES[5]; // «Van build» — win-new-5's entry is nameless
  const mkSb = (rows, filter = ['live', 'tmux', 'external', 'stopped'], view = null) => {
    const cards = [];
    const sb = Object.assign(Object.create(Sidebar.prototype), {
      _activeTab: 'tasks', _statusFilter: new Set(filter), _activeView: view, _allSessions: rows, _backendFilter: new Set(), _hostFilter: new Set(), _agentKindFilter: null, _mobileMode: false,
      isArchived: () => false, el: { classList: { toggle() {} } }, _hostsData: null, handed: null, cards, opened: null,
      _appendKindHint() {}, _ensureHostsData() {}, _wbHealHostSelections() {}, _renderServiceHintRows() {}, _updateTabs() {}, toggle(f) { this.opened = f; }, _renderQuickTabs() {},
      _render() { Sidebar.prototype._renderInner.call(this); },
      _renderWorkbench(list) { this.handed = list.map((x) => x.sessionId); cards.length = 0; for (const x of list) { const c = { _sessionId: x.sessionId, cls: [], scrolled: false, classList: { add: (k) => c.cls.push(k) }, scrollIntoView() { c.scrolled = true; } }; cards.push(c); } },
    });
    sb.listEl = { insertAdjacentHTML() {}, appendChild() {}, querySelectorAll: (sel) => (sel === '.session-item-card' ? cards : []) };
    return sb;
  };
  const LIVE = { sessionId: 'cw-13', status: 'live', name: VAN, cwd: '/srv/u/van', startedAt: now - 60e3 };
  const OTHER = { sessionId: 'old-1', status: 'stopped', name: 'Other thing', cwd: '/srv/u/other', startedAt: now - 3600e3 };
  const OLDVAN = { sessionId: 'old-2', status: 'stopped', name: VAN, cwd: '/srv/u/van', startedAt: now - 7200e3 };
  const TMUXVAN = { sessionId: 'tm-1', status: 'tmux', name: VAN, cwd: '/srv/u/van', startedAt: now - 30e3 };
  try {
    const A = W.app.sidebar = mkSb([LIVE, OTHER]); input.value = '';
    press('win-new-5', 'sessions');
    ok(J(A.handed) === J(['cw-13']) && input.value === VAN && A._activeTab === 'folders' && A._activeView === null && A.opened === true, '§8 a RUNNING conversation of the tile\'s name is SHOWN: the door opens the sessions tab on ALL, the search box holding «Van build», the list opened — the live row handed to the list (23eaffef5: the Stopped view — the live row filtered away, «No running sessions»)', { handed: A.handed, view: A._activeView, q: input.value, tab: A._activeTab });
    ok(A._doorFound === 'cw-13' && A.cards.length === 1 && A.cards[0].cls.includes('door-found') && A.cards[0].scrolled, '§8 …exactly one row ⇒ it is MARKED (door-found) and scrolled to', { found: A._doorFound, cards: A.cards });
    const B = W.app.sidebar = mkSb([TMUXVAN, OTHER]); input.value = '';
    press('win-new-5', 'sessions');
    ok(J(B.handed) === J(['tm-1']) && B._doorFound === 'tm-1', '§8 …the STATUS is not the key — a tmux row of the name is shown and marked the same', { handed: B.handed });
    const C = W.app.sidebar = mkSb([LIVE, OLDVAN, OTHER], ['live'], 'live'); input.value = '';
    press('win-new-5', 'sessions');
    ok(J([...C._statusFilter]) === J(['live']) && C._activeView === null && J(C.handed) === J(['cw-13']), '§8 …the person\'s status filter is THEIRS: a Live-only filter stays Live-only (its stopped namesake is not shown — their filter), a quick view (LIVE) goes back to ALL (23eaffef5: Stopped added to the filter for the page, the button\'s words stale)', { filter: [...C._statusFilter], view: C._activeView, handed: C.handed });
    const D = W.app.sidebar = mkSb([LIVE, OLDVAN, OTHER]); input.value = '';
    press('win-new-5', 'sessions');
    ok(J([...D.handed].sort()) === J(['cw-13', 'old-2']) && D._doorFound === null && D.cards.every((c) => !c.cls.includes('door-found')), '§8 …two rows of the name: both shown, NEITHER marked — the person picks', { handed: D.handed, found: D._doorFound });
    // B-b842 (lane lg-recovery): the «stopped by a limit or overload» pill is a quick narrowing like the quick view — the door turns it
    // off too. PLANT FIRST: with the pill on, the list searched by the name hides both namesakes (no wall stopped either)
    const E = W.app.sidebar = mkSb([LIVE, OLDVAN, OTHER]); E._stoppedOnly = true; E._activeTab = 'folders'; input.value = VAN; E._render();
    const planted = [...(E.handed || ['(no list)'])];
    input.value = ''; press('win-new-5', 'sessions');
    ok(J(planted) === J([]) && E._stoppedOnly === false && J([...E.handed].sort()) === J(['cw-13', 'old-2']), '§8 …the stopped pill is a quick narrowing too: on, it hid both namesakes (the plant); the door turns it off and both are shown', { planted, handed: E.handed, pill: E._stoppedOnly });
  } finally { document.getElementById = gid; }
  const SB = read('src/lib/sidebar.js'), SR = read('src/lib/sidebar-render.js'), LY = read('src/lib/layout.js');
  ok(/if \(this\._doorFound && s\.sessionId === this\._doorFound\) card\.classList\.add\('door-found'\);/.test(SR) && /oninput = \(\) => \{\n\s*this\._doorFound = null;/.test(SB) && /\n    if \(!enabled \|\| filters\.length <= 1\) return;/.test(SB) && /\.session-item-card\.door-found \{/.test(read('public/style.css')), '§8 …the mark is kept across the list\'s re-renders (the ONE card builder) until the search changes; the quick tabs are as the person set them (r3\'s forced row gone)');
  ok(/door\('sessions', t\('Open the session list'\), \(\) => this\.app\.sidebar\?\.showSessionsNamed\?\.\(name\)\)/.test(LY) && !/showStopped/.test(SB + LY), '§8 …the door calls showSessionsNamed; no «showStopped» is left in the tree');
});

await section('§8 r4 a second tile\'s «Restore a previous layout…» draws ITS point — the dialog keyed by the slot', async () => {
  const { reopenVerdict } = await import(pathToFileURL(path.join(LIB, 'form-yield.js')).href);
  const dd = scratchDir('lsw-key');
  try {
    delete require.cache[require.resolve(path.join(REPO, 'src/routes/persistence.js'))];
    const p = require(path.join(REPO, 'src/routes/persistence.js'));
    p.setup({ writer: landingWriter(), dataDir: dd, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
    fs.mkdirSync(path.join(dd, 'layout-history'), { recursive: true });
    const put = (id, at, pp) => { const doc = DOC(pp), sum = { 工作: 5, 个人: pp.length, 研究: 6 }; fs.writeFileSync(path.join(dd, 'layout-history', id), J({ at, summary: sum, totalWindows: 11 + pp.length, change: null, layouts: doc })); fs.writeFileSync(path.join(dd, 'layout-history', id.replace(/\.json$/, '.meta.json')), J({ at, summary: sum, totalWindows: 11 + pp.length, change: null })); };
    const OLD = 'layout-2026-10-30T06-50-53-927Z-1h.json', MID = 'layout-2026-10-30T09-18-22-111Z-2h.json', NEW = 'layout-2026-10-30T09-19-35-222Z-3h.json';
    put(OLD, 1793343053927, P_BEFORE()); put(MID, 1793352000000, P_BEFORE().slice(0, 6)); put(NEW, 1793353000000, P_SENT());
    const route = p.router.stack.find((l) => l.route && l.route.path === '/api/layout-history' && l.route.methods.get);
    const call = async (query) => { let out = null; await route.route.stack[0].handle({ query }, { json: (j) => { out = j; } }); return out; };
    class F {} (await loadFlows())(F);
    // the shell's family at ONE id, decided by the REAL reopenVerdict: the same key ⇒ raised as it was; another ⇒ the open one's
    // door (nothing typed: it closes) and the new one opens
    let open = null; const urls = [];
    const fakeBody = () => { const made = []; return { made, _h: '', set innerHTML(v) { this._h = String(v); }, get innerHTML() { return this._h; },
      querySelectorAll(sel) { if (sel !== '.lh-desk') return []; return [...this._h.matchAll(/<button class="lh-desk" data-id="([^"]*)" data-desk="([^"]*)"/g)].map((m) => { const b = { dataset: { id: m[1], desk: m[2] }, cls: [], attrs: {}, classList: { add: (c) => b.cls.push(c) }, setAttribute: (k, v) => { b.attrs[k] = v; }, closest: () => ({ classList: { add() {} } }), scrollIntoView() {}, focus() {} }; made.push(b); return b; }); } }; };
    globalThis.__lswShell = (o) => {
      const v = reopenVerdict({ open: open ? [{ key: open.key }] : [], nextKey: o.key });
      if (v.verdict === 'raise') { const was = open; return { body: was.body, close() {}, raised: true, ready: Promise.resolve(was), live: () => !was.closed }; }
      if (open) open.closed = true;
      const me = { key: o.key, body: fakeBody(), closed: false }; open = me;
      return { body: me.body, close() { me.closed = true; }, raised: false, ready: Promise.resolve(me), live: () => !me.closed };
    };
    globalThis.__lswFetch = async (u) => { urls.push(u); return call(Object.fromEntries(new URL(u, 'http://x').searchParams)); };
    const shown = () => ({ note: (open.body._h.match(/lh-slot">([^<]*)/) || [])[1] || null, picked: open.body.made.filter((b) => b.cls.includes('is-picked')).map((b) => b.dataset.id + '/' + b.dataset.desk) });
    const door = (i) => F.prototype._showLayoutHistory.call(new F(), { desktopId: 'desk-p', entry: bare(i), name: NAMES[i] });
    await door(4);
    const a = shown();
    await door(9);
    const b = shown();
    ok(J(a.picked) === J([MID + '/个人']) && urls.length === 2 && new URL(urls[1], 'http://x').searchParams.get('win') === 'win-new-9' && J(b.picked) === J([OLD + '/个人']) && /“Cluster admin”/.test(b.note || ''), '§8 tile A\'s door (Trip planner → the 09:18 point), then tile B\'s door while it is open ⇒ the dialog is B\'S: B asked for, B\'s point (06:50) picked, B\'s name said (23eaffef5: the open dialog raised with A\'s selection, B never fetched)', { a, b, urls });
    const n = urls.length; await door(9);
    ok(urls.length === n && J(shown().picked) === J([OLD + '/个人']), '§8 …the SAME slot\'s door again raises its dialog as it was (no second fetch)');
    await F.prototype._showLayoutHistory.call(new F(), null);
    const bareOne = shown(); await door(4);
    ok(bareOne.note === null && !bareOne.picked.length && J(shown().picked) === J([MID + '/个人']) && /“Trip planner”/.test(shown().note || ''), '§8 …a dialog first opened from ⚙ → System (the bare list) is redrawn for the slot when a tile\'s door is pressed', { bareOne, now: shown() });
    ok(/const key = e0 \? `slot:\$\{slot\.desktopId\}:\$\{e0\.winId \|\| e0\.id \|\| ''\}` : null;/.test(read('src/lib/setup-flows.js')) && /if \(!\(await ready\)\) return null;/.test(read('src/lib/setup-flows.js')) && /if \(!live\(\)\) return null;/.test(read('src/lib/setup-flows.js')), '§8 …the key is the slot (desktop + window); a queued dialog waits for its `ready`; a dialog replaced while it fetched draws nothing (`live()`)');
  } finally { fs.rmSync(dd, { recursive: true, force: true }); }
});

await section('§8 r4 a point that holds the slot ITSELF never matches by name (PURE namedTwinIn + the REAL router)', async () => {
  const tw = require(MODEL).namedTwinIn;
  const tile = bare(4);
  const reopened = { type: 'chat', winId: 'win-reopened', title: `${NAMES[4]} — /srv/u/trip`, cwd: '/srv/u/trip', backendSessionId: 'conv-B', isMinimized: false, isMaximized: false, gridBounds: GB(11), zIndex: 9 };
  ok(tw([tile, reopened], tile) === null && tw([reopened], tile)?.winId === 'win-reopened' && tw([{ ...named(4), winId: tile.winId }, reopened], tile)?.backendSessionId === CID(4), '§8 PURE: the probe\'s shape — a point holding the tile (nameless) AND a reopened window of its name ⇒ no twin (the reopened one is ANOTHER window beside it); a point without the slot\'s id still matches by name; the slot named under its own id is itself (23eaffef5: the reopened window)', [tw([tile, reopened], tile)?.winId]);
  const dd = scratchDir('lsw-coexist');
  try {
    delete require.cache[require.resolve(path.join(REPO, 'src/routes/persistence.js'))];
    const p = require(path.join(REPO, 'src/routes/persistence.js'));
    p.setup({ writer: landingWriter(), dataDir: dd, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
    fs.mkdirSync(path.join(dd, 'layout-history'), { recursive: true });
    const put = (id, at, pp) => { const doc = DOC(pp), sum = { 工作: 5, 个人: pp.length, 研究: 6 }; fs.writeFileSync(path.join(dd, 'layout-history', id), J({ at, summary: sum, totalWindows: 11 + pp.length, change: null, layouts: doc })); fs.writeFileSync(path.join(dd, 'layout-history', id.replace(/\.json$/, '.meta.json')), J({ at, summary: sum, totalWindows: 11 + pp.length, change: null })); };
    const OLD = 'layout-2026-10-30T06-50-53-927Z-1h.json', NOW = 'layout-2026-10-30T10-02-00-000Z-4h.json';
    put(OLD, 1793343053927, P_BEFORE());
    put(NOW, 1793356920000, [...P_SENT(), reopened]); // the person reopened «Trip planner» from the list: the newest point holds both
    const route = p.router.stack.find((l) => l.route && l.route.path === '/api/layout-history' && l.route.methods.get);
    let out = null; await route.route.stack[0].handle({ query: { desktop: 'desk-p', win: tile.winId, type: 'chat', title: NAMES[4] } }, { json: (j) => { out = j; } });
    ok(out && out.pick && out.pick.id === OLD && out.pick.desk === '个人', '§8 …the REAL router: the newest point holds the tile beside the reopened window ⇒ skipped; the pick is the 06:50 point that names its conversation (23eaffef5: the newest — restoring it brings the same tile back)', out && out.pick);
  } finally { fs.rmSync(dd, { recursive: true, force: true }); }
});

await section('§8 r4 the phone switcher\'s row of a window that asked first goes when the window closes (the REAL _buildWindowItem)', async () => {
  const { MobileNav } = await import(pathToFileURL(path.join(LIB, 'mobile-nav.js')).href);
  const rec = NAMES.map((_, i) => (i < 4 ? answered(i) : bare(i)));
  const W = world({ records: { 'desk-w': [], 'desk-p': rec, 'desk-r': [] }, active: 'desk-p' });
  await W.lm.restoreState({ windows: rec });
  let yes = null; W.lm.confirmRemovePlaceholder = () => new Promise((r) => { yes = r; });
  let redraws = 0;
  const win = W.wins.get('win-new-4');
  const item = MobileNav.prototype._buildWindowItem.call({ app: W.app }, win, W.app.wm, () => {}, () => { redraws++; });
  const x = item.children.at(-1);
  x.onclick({ stopPropagation() {} });
  ok(W.wins.has('win-new-4') && !item.removed && typeof yes === 'function', '§8 the row\'s ✕ on a nameless tile: the confirm is up, the window and its row stay');
  yes(true); await tick(20);
  ok(!W.wins.has('win-new-4') && redraws === 1, '§8 …«Remove» ⇒ the window closes and the open list REDRAWS without its row (23eaffef5: the row stayed; a tap revealed a window that was gone)', { has: W.wins.has('win-new-4'), redraws });
  const win0 = W.wins.get('win-new-0'), item0 = MobileNav.prototype._buildWindowItem.call({ app: W.app }, win0, W.app.wm, () => {}, () => { redraws++; });
  item0.children.at(-1).onclick({ stopPropagation() {} });
  ok(!W.wins.has('win-new-0') && item0.removed === true, '§8 …a window that closes at once (a stopped tile) loses its row at once, as before');
});

await section('§8 r4 a group close asks ONE question naming the tile it deletes for good — all or nothing (the REAL requestCloseGroup + requestClose)', async () => {
  const TG = await import(pathToFileURL(path.join(LIB, 'tab-group.js')).href);
  const { WindowManager } = await import(pathToFileURL(path.join(LIB, 'window.js')).href);
  const rec = NAMES.map((_, i) => (i < 4 ? answered(i) : bare(i)));
  const W = world({ records: { 'desk-w': [], 'desk-p': rec, 'desk-r': [] }, active: 'desk-p' });
  await W.lm.restoreState({ windows: rec });
  const tileAsks = []; W.lm.confirmRemovePlaceholder = async ({ name }) => { tileAsks.push(name); return true; };
  const G = { windows: W.wins, _app: null, closeWindow: (id) => W.app.wm.closeWindow(id) };
  TG.installTabGroupMixin(G);
  G.requestClose = WindowManager.prototype.requestClose;
  const asked = []; let answer = false;
  G.confirmCloseGroup = async (q) => { asked.push(q); return answer; };
  const group = (ids) => { const chain = { tabs: ids, active: 0 }; for (const id of ids) W.wins.get(id)._tabChain = chain; return chain; };
  group(['win-new-0', 'win-new-4']);
  const no = await G.requestCloseGroup('win-new-0');
  ok(no === false && asked.length === 1 && J(asked[0].gone) === J([NAMES[4]]) && asked[0].names.length === 2 && W.wins.has('win-new-0') && W.wins.has('win-new-4') && !tileAsks.length, '§8 the frame\'s ✕ on [a stopped tile «Ledger», a nameless tile «Trip planner»]: ONE question, naming «Trip planner» as deleted for good; Cancel keeps BOTH (23eaffef5: the question did not say it)', { asked, has: [W.wins.has('win-new-0'), W.wins.has('win-new-4')], tileAsks });
  answer = true;
  const go = await G.requestCloseGroup('win-new-0'); await tick(10);
  ok(go === true && asked.length === 2 && !W.wins.has('win-new-0') && !W.wins.has('win-new-4') && !tileAsks.length, '§8 …the confirm closes BOTH, the tile not asked again — all or nothing (23eaffef5: a second «Remove this window?», and a Cancel there left the tile of a group already answered)', { go, has: [W.wins.has('win-new-0'), W.wins.has('win-new-4')], tileAsks });
  group(['win-new-1', 'win-new-2']); asked.length = 0;
  await G.requestCloseGroup('win-new-1');
  ok(asked.length === 1 && !('gone' in asked[0]) && asked[0].names.length === 2 && !W.wins.has('win-new-1') && !W.wins.has('win-new-2'), '§8 …a group with no such tile asks exactly as before (the same question, nothing named as deleted) — a control', asked);
  ok(W.wins.get('win-new-5').onCloseRequest() === false && tileAsks.length === 1 && W.wins.get('win-new-5').onCloseRequest({ asked: true }) === true, '§8 …a lone nameless tile\'s ✕ still asks its own question; a close the person already answered (`asked`) does not ask again', tileAsks);
  const TGS = read('src/lib/tab-group.js');
  ok(/for \(const tid of doomed\) if \(this\.windows\.has\(tid\)\) this\.requestClose\(tid, \{ asked: true \}\);/.test(TGS) && /t\('“\{name\}” cannot be reopened: closing deletes it from this desktop’s layout for good\. Only an older rollback point \(Restore a previous layout…\) still holds it\.', \{ name: gone\[0\] \}\)/.test(TGS) && /showConfirmDialog\(\{ title: t\('Close \{n\} tabs\?', \{ n \}\), message, items: names,/.test(TGS), '§8 …the group question\'s words: «“Trip planner” cannot be reopened: closing deletes it from this desktop’s layout for good…» above the tab list (the house dialog, danger)');
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = ['“{name}” cannot be reopened: closing deletes it from this desktop’s layout for good. Only an older rollback point (Restore a previous layout…) still holds it.', '{n} of these cannot be reopened ({names}): closing deletes them from this desktop’s layout for good. Only an older rollback point (Restore a previous layout…) still holds them.'];
  ok(keys.every((k) => zh.includes(J(k) + ':') && ja.includes(J(k) + ':')), '§8 …both words have a zh AND a ja entry');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// §9 BATCH bl-windows — a RED control is the REAL module's text with ONE line changed (scripts/mutant-copy.mjs: the copy lives
// in this run's scratch dir, its relative imports reach the real files)
const { mutantCopies } = await import('./mutant-copy.mjs');
const MUT = mutantCopies('lsw-b9', REPO);
const mutantSrc = (rel, find, repl) => { const src = read(rel); if (!src.includes(find)) throw new Error('mutant anchor missing in ' + rel + ': ' + find.slice(0, 120)); return src.replace(find, repl); };
const mutantModule = (rel, find, repl) => MUT.load(rel, mutantSrc(rel, find, repl), 'b9');
const mutantEsm = async (rel, find, repl) => import(pathToFileURL(MUT.write(rel, mutantSrc(rel, find, repl), 'b9', { esm: true })).href);

// §10 (r1793) runs HERE, after the mutant helpers it builds its REDs with (the release's rekeyWindow, row tap, re-patch, insideWindow)
await section('§10 r1793 the phone after a window takes a new id (the REAL rekeyWindow, _buildWindowItem, followRekey, late-focus insideWindow, the split\'s rekey) and a gone window\'s row', async () => {
  const { MobileNav } = await import(pathToFileURL(path.join(LIB, 'mobile-nav.js')).href);
  const { WindowManager } = await import(pathToFileURL(path.join(LIB, 'window.js')).href);
  const LF = await import(pathToFileURL(path.join(LIB, 'late-focus.js')).href);
  const { installPhoneSplit } = await import(pathToFileURL(path.join(LIB, 'phone-split-view.js')).href);
  const FOLLOW = '    this.followIdChange(oldId, newId);   // r1793 / r1958: every open list and the phone\'s notes follow the new id (THE one rule, below)\n';
  const REPATCH = '    if (moved) this._patchSwitcherWaiting();\n';
  const INSTANCE = '  if (item && item._win === win) return true;   // r1793: the phone list\'s row names its window by INSTANCE (a row its tap took off the page, its stamp from before a re-key)\n';
  const GUARD = "    if (!win || !wm.windows.has(win.id)) {\n      showToast(t('That window is no longer open — the list now shows what is open.'), { type: 'info' });\n      if (typeof rerender === 'function') rerender();\n      return false;\n    }\n";
  const WORDS = 'That window is no longer open — the list now shows what is open.';
  const said = () => document.body.textContent.split(WORDS).length - 1;
  // ONE open list on the stand-in page (the switcher the page's own query finds), its row the REAL row builder's; `act` = what
  // happens to the row's window while the list stands: the re-key (B-1d87), gone (closed by any road), rebuilt under the same id
  const openList = async ({ WM = WindowManager, MN = MobileNav, ins = LF.insideWindow, act = 'rekey', patchAfter = false, tapFirst = false } = {}) => {
    const rec = NAMES.map((_, i) => answered(i));
    const W = world({ records: { 'desk-w': [], 'desk-p': rec, 'desk-r': [] }, active: 'desk-p' });
    await W.lm.restoreState({ windows: rec });
    const wm = W.app.wm, win = wm.windows.get('win-new-1');
    win.element.classList.contains = (c) => c === 'window-waiting';   // it waits for the person (its row's dot says so)
    wm.activeWindowId = 'win-new-0';
    const nav = Object.create(MN.prototype); nav.app = W.app; nav._shown = { 'desk-p': 'win-new-1', 'desk-w': 'win-other' };
    const dots = []; nav._waitDot = (el, on) => dots.push([el.dataset.winId, on]);
    const splitCalls = []; nav.split = { offer: () => null, rekey: (x, y) => { splitCalls.push(x, y); return true; } };   // offer: no «Split» beside the row
    let stripSaw = null;   // r2250: the chooser's host as the strip's rebuild (updateTaskbar) finds it
    wm._app = { _mobileNav: nav, updateTaskbar() { stripSaw = chooser._chooser.hostId; }, sessions: new Map() }; wm.followIdChange = WM.prototype.followIdChange;   // window.js's one rule, on the world's wm
    const revealed = []; wm.revealWindow = (id) => { revealed.push(id); return true; };
    let closes = 0, redraws = 0;
    const row = nav._buildWindowItem(win, wm, () => { closes++; }, () => { redraws++; });
    row.closest = (sel) => (sel === '[data-win-id]' ? row : null);   // the row IS its [data-win-id] element (the stand-in has no closest)
    const pop = mkEl(); pop.className = 'mobile-win-switcher'; pop.append(row);
    pop.querySelectorAll = (sel) => (sel === '.mobile-win-row[data-win-id]' ? pop.children.filter((c) => c && c.dataset && c.dataset.winId) : []);
    const q0 = document.querySelector; document.querySelector = (sel) => (sel === '.mobile-win-switcher' ? pop : q0(sel));
    // r1958: the DESK's grouped chooser open for that window as its host, its row stamped with the id (window.js followIdChange reads both)
    const deskRow = mkEl(); deskRow.className = 'overlap-switcher-item'; deskRow.dataset.winId = 'win-new-1';
    const chooser = mkEl(); chooser.className = 'overlap-switcher taskbar-group-chooser'; chooser._chooser = { hostId: 'win-new-1' }; chooser.append(deskRow);
    const qa0 = document.querySelectorAll; document.querySelectorAll = (sel) => (sel === '.mobile-win-switcher [data-win-id], .overlap-switcher [data-win-id]' ? [...pop.children, deskRow].filter((c) => c && c.dataset && c.dataset.winId) : sel === '.taskbar-group-chooser' ? [chooser] : qa0(sel));
    try {
      if (tapFirst) { row.onclick(); pop.children = []; }   // the row's OWN tap first: the list closes, the row leaves the page — then the re-key
      const d0 = dots.length, w0 = said();
      let took = null;
      if (act === 'gone') wm.windows.delete('win-new-1');
      else if (act === 'rebuilt') wm.windows.set('win-new-1', { ...win, element: mkEl() });   // a dead view rebuilt live under the same id
      else took = WM.prototype.rekeyWindow.call(wm, 'win-new-1', 'win-row-taken');
      if (patchAfter) nav._patchSwitcherWaiting();   // the list's next live patch (any waiting change runs it)
      const mine = dots.slice(d0).filter((d) => d[0] === row.dataset.winId);
      const r0 = revealed.length, c0 = closes;
      if (!tapFirst) row.onclick();
      return { strip: stripSaw, took, stamp: row.dataset.winId, dot: mine.length ? mine.at(-1)[1] : null, inside: ins(win, row), winId: win.id, shown: nav._shown['desk-p'], other: nav._shown['desk-w'], split: splitCalls.join(), revealed: revealed.slice(r0).join(), closes: closes - c0, redraws, said: said() - w0, desk: deskRow.dataset.winId, host: chooser._chooser.hostId };
    } finally { document.querySelector = q0; document.querySelectorAll = qa0; }
  };
  const A = await openList();
  ok(A.took === true && A.stamp === 'win-row-taken' && A.winId === 'win-row-taken', '§10 a re-key under the open list RE-STAMPS its row: the row names the new id (wm.rekeyWindow calls the one rule, window.js followIdChange)', A);
  ok(A.desk === 'win-row-taken' && A.host === 'win-row-taken', '§10 r1958 …the DESK\'s open grouped chooser follows too: its row\'s stamp and the chooser\'s host id name the new id (the strip\'s title patch finds it by the host)', A);
  ok(A.strip === 'win-row-taken', '§10 r2250 …and the rule runs BEFORE the strip\'s rebuild: at updateTaskbar the open chooser already names the new host (a group button rebuilt then finds it — its anchor, Esc\'s focus, the outside-press exclusion)', A);
  ok(A.dot === true, '§10 …followRekey re-reads its waiting mark under the new id: the dot stays on', A);
  ok(A.inside === true, '§10 …a press on that row is a press ON that window (late-focus insideWindow: its late focus is not dropped)', A);
  ok(A.shown === 'win-row-taken' && A.other === 'win-other' && A.split === 'win-new-1,win-row-taken', '§10 …this tab\'s notes by id follow: the window on show per desktop moves to the new id (the other desktop\'s untouched), the split is told', A);
  ok(A.closes === 1 && A.revealed === 'win-row-taken' && A.said === 0, '§10 …its tap brings the window under the new id (the tap read the id live — as the release already did)', A);
  const R = await openList({ WM: (await mutantEsm('src/lib/window.js', FOLLOW, '')).WindowManager, patchAfter: true });
  ok(R.took === true && R.stamp === 'win-new-1' && R.dot === false && R.shown === 'win-new-1' && R.split === '' && R.desk === 'win-new-1' && R.host === 'win-new-1', `§10 RED: the release's rekeyWindow (no followIdChange) leaves the old stamps, host and notes — the list's next patch turns the dot off (stamp ${R.stamp} · dot ${R.dot} · shown ${R.shown} · desk ${R.desk})`, R);
  const DRAW = "    if (!this._restoring) this._app?.updateTaskbar?.();   // r2355: the strip after the re-stamps (a group button rebuilt now finds its open chooser by the new host id — r2250)\n";
  // the release's order (r2250's first form): rekeyWindow drew the strip BEFORE the rule, and the rule drew nothing
  const RELORDER = anchored(anchored(read('src/lib/window.js'), DRAW, '', 'the rule draws no strip, as released'), FOLLOW, '    this._app?.updateTaskbar?.();\n' + FOLLOW, 'the strip drawn before the rule, as released');   // stale-pins: kept — the release's order, the RED's own text
  const RO = await openList({ WM: (await import(pathToFileURL(MUT.write('src/lib/window.js', RELORDER, 'b9', { esm: true })).href)).WindowManager });
  ok(RO.took === true && RO.host === 'win-row-taken' && RO.strip === 'win-new-1', `§10 RED: the release's order (the strip rebuilt BEFORE the rule) — at updateTaskbar the chooser still names the old host (${RO.strip}): a group button rebuilt then misses it`, RO);
  { // r2355 (16): the rule draws the strip ITSELF — on both roads (the restore's remap called the rule and drew nothing: a window a
    // restore built after its batch kept a strip tile of its first id) — and never inside a restore's batch (its one _notify draws it)
    const draws = (WMx) => { let n = 0; const st = { _app: { updateTaskbar() { n++; } } }; WMx.prototype.followIdChange.call(st, 'w-x', 'w-y'); const out = n; st._restoring = true; WMx.prototype.followIdChange.call(st, 'w-x', 'w-y'); return { outside: out, inside: n - out }; };
    const D = draws(WindowManager);
    ok(D.outside === 1 && D.inside === 0, '§10 r2355 the rule draws the strip itself — on both roads (rekeyWindow and the restore remap) — and never inside a restore\'s batch (its one _notify draws it at the end)', D);
    const RD2 = draws((await import(pathToFileURL(MUT.write('src/lib/window.js', anchored(read('src/lib/window.js'), DRAW, '', 'the rule as released'), 'b9', { esm: true })).href)).WindowManager);
    ok(RD2.outside === 0, '§10 RED: the release\'s rule (it draws nothing) — the remap road leaves the strip as it was: a tile of the first id', RD2);
  }
  const RP = await openList({ MN: (await mutantEsm('src/lib/mobile-nav.js', REPATCH, '')).MobileNav });
  ok(RP.stamp === 'win-row-taken' && RP.dot === null, `§10 RED: followRekey without its re-patch — the row is re-stamped but its mark is never read under the new id (dot ${RP.dot})`, RP);
  const D = await openList({ tapFirst: true });
  ok(D.took === true && D.stamp === 'win-new-1' && D.inside === true, '§10 a row its own tap took off the page, then the re-key: a press on it is still a press on that window (late-focus knows the row by its window\'s instance)', D);
  const RD = await openList({ tapFirst: true, ins: (await mutantEsm('src/lib/late-focus.js', INSTANCE, '')).insideWindow });
  ok(RD.inside === false, '§10 RED: the release\'s insideWindow (the stamp alone) counts that press as a press elsewhere', RD);
  const G = await openList({ act: 'gone' });
  ok(G.closes === 0 && G.revealed === '' && G.redraws === 1 && G.said === 1, '§10 a row whose window is GONE: its tap says so in words and the list is drawn again (it never closes onto nothing)', G);
  const RG = await openList({ act: 'gone', MN: (await mutantEsm('src/lib/mobile-nav.js', GUARD, '')).MobileNav });
  ok(RG.closes === 1 && RG.said === 0 && RG.redraws === 0, `§10 RED: the release's row tap on a gone window closes the list and says nothing (closes ${RG.closes} · words ${RG.said} · redraws ${RG.redraws})`, RG);
  const B = await openList({ act: 'rebuilt' });
  ok(B.closes === 1 && B.revealed === 'win-new-1' && B.said === 0, '§10 a window REBUILT under the same id (a dead view made live) is that row\'s window: the tap reveals it, no words', B);
  { // the split's own rekey: the pair it saved for the tab names the pane under its new id
    const store2 = new Map([['vibespace.phoneSplit', J({ 'desk-p': ['win-new-1', 'win-new-2'], 'desk-w': ['a', 'b'] })]]);
    const had = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', { value: { getItem: (k) => (store2.has(k) ? store2.get(k) : null), setItem: (k, v) => store2.set(k, String(v)) }, configurable: true, writable: true });
    try {
      const W = world({ records: { 'desk-w': [], 'desk-p': [], 'desk-r': [] }, active: 'desk-p' });
      const S = installPhoneSplit(W.app);
      const hit = S.rekey('win-new-1', 'win-row-taken'), miss = S.rekey('win-not-held', 'x');
      const saved = JSON.parse(store2.get('vibespace.phoneSplit'));
      ok(hit === true && miss === false && saved['desk-p'].join() === 'win-row-taken,win-new-2' && saved['desk-w'].join() === 'a,b', '§10 the split\'s saved pair names a re-keyed pane under its new id (phone-split-view rekey — never ended as «closed»); a window it does not hold changes nothing', { hit, miss, saved });
    } finally { if (had) Object.defineProperty(globalThis, 'sessionStorage', had); else delete globalThis.sessionStorage; }
  }
  const LY = read('src/lib/layout.js'), at = LY.indexOf('      // Remap window ID to saved ID for cross-client sync\n'), blk = at < 0 ? '' : LY.slice(at, LY.indexOf('\n      }\n', at));
  ok(/\n        wm\.followIdChange\?\.\(oldId, winState\.winId\);/.test(blk) && blk.indexOf('wm.windows.set(winState.winId, winInfo);') < blk.indexOf('wm.followIdChange'), '§10 layout.js\'s restore remap — the other road that changes a window\'s id in place — calls the same rule (followIdChange), AFTER the change', blk.slice(0, 240));
  { // r1958 (1): A SPLIT PANE's ✕ AFTER ITS WINDOW's ID CHANGED — the REAL installPhoneSplit painting [A, B]; A re-keyed; A's ✕ pressed
    const SPLIT_X = '          x.addEventListener(\'click\', (e) => { e.stopPropagation(); close(w.id); });\n';
    const paneX = async (S0) => {
      const store2 = new Map([['vibespace.phoneSplit', J({ 'desk-p': ['win-new-1', 'win-new-2'] })]]);
      const had = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
      Object.defineProperty(globalThis, 'sessionStorage', { value: { getItem: (k) => (store2.has(k) ? store2.get(k) : null), setItem: (k, v) => store2.set(k, String(v)) }, configurable: true, writable: true });
      const rec = NAMES.map((_, i) => answered(i));
      const W = world({ records: { 'desk-w': [], 'desk-p': rec, 'desk-r': [] }, active: 'desk-p' });
      await W.lm.restoreState({ windows: rec });
      const wm = W.app.wm, focused = [];
      W.app.isMobile = true; W.app._mobileNav = { _shownBooted: true }; wm.activeWindowId = 'win-new-1'; wm.focusWindow = (id) => focused.push(id);
      const bars = {};
      for (const id of ['win-new-1', 'win-new-2']) {   // each pane's title bar, as the page has one (the stand-in has no :scope queries)
        const el = wm.windows.get(id).element, bar = mkEl(); bars[id] = bar;
        const xOf = () => bar.children.find((c) => c && c.className === 'phone-pane-close') || null;
        el.querySelector = (sel) => (sel === ':scope > .window-titlebar' ? bar : sel === ':scope > .window-titlebar > .phone-pane-close' ? xOf() : null);
        bar.querySelector = (sel) => (sel === ':scope > .phone-pane-close' ? xOf() : null);
      }
      const ws = mkEl(); ws.offsetWidth = 1200;
      const g0 = document.getElementById, ce0 = document.createElement, cl0 = document.documentElement.classList;
      document.getElementById = (id) => (id === 'workspace' ? ws : g0(id));
      document.documentElement.classList = { toggle() {}, add() {}, remove() {}, contains: () => false };
      document.createElement = (tag) => { const el = ce0(tag), ls = {}; el.addEventListener = (type, fn) => { (ls[type] ||= []).push(fn); }; el._fire = (type) => (ls[type] || []).forEach((f) => f({ stopPropagation() {} })); return el; };
      try {
        const S = S0(W.app);
        const v = S.apply(), panes = (S.panes() || []).join();
        wm._app = { _mobileNav: { followRekey: (o, n) => S.rekey(o, n) }, updateTaskbar() {}, sessions: new Map() }; wm.followIdChange = WindowManager.prototype.followIdChange;
        const took = WindowManager.prototype.rekeyWindow.call(wm, 'win-new-1', 'win-pane-taken');
        const x = bars['win-new-1'].children.find((c) => c && c.className === 'phone-pane-close');
        if (x) x._fire('click');
        return { mode: v && v.mode, panes, took, pressed: !!x, focused: focused.join(), after: S.panes() };
      } finally {
        document.getElementById = g0; document.createElement = ce0; if (cl0 === undefined) delete document.documentElement.classList; else document.documentElement.classList = cl0;
        if (had) Object.defineProperty(globalThis, 'sessionStorage', had); else delete globalThis.sessionStorage;
      }
    };
    const P = await paneX(installPhoneSplit);
    ok(P.mode === 'split' && P.panes === 'win-new-1,win-new-2' && P.took === true && P.pressed && P.focused === 'win-new-2' && P.after === null, `§10 r1958 a split pane's ✕ pressed AFTER its window was re-keyed ends the split and shows the OTHER pane (the ✕ reads its pane's id live) — focused «${P.focused}»`, P);
    const RP2 = await paneX((await mutantEsm('src/lib/phone-split-view.js', SPLIT_X, SPLIT_X.replace('close(w.id)', 'close(id)'))).installPhoneSplit);
    ok(RP2.pressed && RP2.focused === '', `§10 RED: the release's ✕ (closing by the id it was drawn with) ends the split but shows nothing new — the closed pane stays on show (focused «${RP2.focused}»)`, RP2);
  }
  { // r1958 (2): WARMTH SWITCHED OFF keeps the phone row's stamp (the row builder's, never warmth's to take away)
    const STRIP = "  for (const el of document.querySelectorAll('.mobile-win-row[data-win-id]')) el.removeAttribute('data-win-id');\n";   // stale-pins: kept — the release's strip, the RED's own text
    const KEEP = "  for (const el of document.querySelectorAll('[data-warmth-tier], [data-warmth-tip]')) { el._warmthKey = null; setMark(el, null, null, ''); }\n";
    const off = async (WC) => {
      const row = mkEl(); row.className = 'mobile-win-row'; row.dataset.winId = 'win-warm';
      const removed = []; row.removeAttribute = (a) => { removed.push(a); delete row.dataset.winId; };
      const qa1 = document.querySelectorAll; document.querySelectorAll = (sel) => (sel === '.mobile-win-row[data-win-id]' ? (row.dataset.winId ? [row] : []) : qa1(sel));
      try {
        const app = { wm: { windows: new Map() }, isMobile: true };
        WC.noteWarmthAnswer(app, { map: {}, serverNow: Date.now(), receivedAt: Date.now() });   // ON (a tick's answer)
        WC.noteWarmthAnswer(app, null);   // OFF (the setting off: the answer says nothing) — every mark cleared once
        return { stamp: row.dataset.winId || null, removed: removed.join() };
      } finally { document.querySelectorAll = qa1; }
    };
    const WC = await import(pathToFileURL(path.join(LIB, 'warmth-chrome.js')).href);
    const O = await off(WC);
    ok(O.stamp === 'win-warm' && O.removed === '', '§10 r1958 warmth switched OFF leaves the phone row\'s data-win-id (the waiting patch, an id change\'s re-stamp and a press\'s «inside» test still find the row)', O);
    const RO = await off(await mutantEsm('src/lib/warmth-chrome.js', KEEP, KEEP + STRIP));
    ok(RO.stamp === null && RO.removed === 'data-win-id', '§10 RED: the release\'s clear (it stripped the stamp) leaves the open list blind to its rows', RO);
  }
  { // r1958 (2): the DESK lists' taps read their window's id live — the grouped chooser's row (tap + right-click), the «+N» row, the ⧉ host row
    const TB = read('src/lib/taskbar.js');
    const taps = [
      ['the grouped chooser row\'s tap', /item\.onclick = \(\) => \{\n\s+app\.wm\.revealWindow\(win\.id\); \/\/ the row names THIS tab[^\n]*\n\s+const session = app\.sessions\.get\(win\.id\);/],
      ['the grouped chooser row\'s right-click', /state\.pin\(\);\s*showWindowContextMenu\(app, win\.id, e\.clientX, e\.clientY,/],
      ['the «+N» row\'s tap', /pop\.remove\(\);\n\s+activateWindow\(app, win\.id\);[^\n]*\n[^\n]*\n\s+requestAnimationFrame\(\(\) => \{ strip\._bringIn = \{ id: win\.id,/],
      ['the ⧉ list\'s host row', /item\.onclick = \(\) => \{\n\s+app\.wm\.revealWindow\(win\.id\);[^\n]*HOST's title/],
      // r2250: the ⧉ row's right-click, the every-desktop and other-desktops rows' taps, the chooser's re-list and close observer
      ['the ⧉ list row\'s right-click', /showWindowContextMenu\(app, win\.id, e\.clientX, e\.clientY, \{ onAction: \(kind\) => \{ if \(!pop\.isConnected\) return;/],
      ['the every-desktop row\'s stamp and tap', /const idOf = \(r\) => winOf\.get\(r\)\?\.id \|\| r\.id;[\s\S]*?item\.dataset\.winId = idOf\(r\);[\s\S]*?goOtherDesk\(app, \{ id: idOf\(r\), deskId: r\.deskId, built: r\.built \}\)/],
      ['the other-desktops row\'s tap', /const w = r\.built \? app\.wm\.windows\.get\(r\.id\) : null;[^\n]*\n\s+item\.onclick = \(\) => \{ pop\.remove\(\); goOtherDesk\(app, w \? \{ \.\.\.r, id: w\.id \} : r\); \};/],
      ['the chooser\'s re-list', /relist\(\) \{\n\s+const live = app\.wm\.windows\.get\(state\.hostId\)\?\._tabChain[^\n]*\n\s+pop\.remove\(\);\n\s+if \(live && live\.tabs\[0\] === state\.hostId /],
      ['the chooser\'s close observer', /if \(_chooserOf\(state\.hostId\)\?\._chooser\.anchor !== state\.anchor\)/],
    ];
    const miss = (src) => taps.filter(([, re]) => !re.test(src)).map(([n]) => n);
    ok(miss(TB).length === 0, '§10 r1958 / r2250 the desk lists\' rows act on their window\'s id read live, off the instance (an id changed in place while the list stood open)', miss(TB));
    const rel = anchored(anchored(TB, 'app.wm.revealWindow(win.id); // the row names THIS tab', 'app.wm.revealWindow(tid); // the row names THIS tab', 'the chooser tap, as released'), 'activateWindow(app, win.id);', 'activateWindow(app, tl.id);', 'the «+N» tap, as released');   // stale-pins: kept — the release's captured ids, the RED's own text
    ok(rel !== TB && miss(rel).includes('the grouped chooser row\'s tap') && miss(rel).includes('the «+N» row\'s tap'), '§10 RED: the release\'s rows (a captured id) fail the check by name', miss(rel));
    const rel2 = anchored(anchored(anchored(anchored(TB, 'showWindowContextMenu(app, win.id, e.clientX, e.clientY, { onAction:', 'showWindowContextMenu(app, id, e.clientX, e.clientY, { onAction:', 'the ⧉ right-click, as released'), 'goOtherDesk(app, { id: idOf(r),', 'goOtherDesk(app, { id: r.id,', 'the every-desktop tap, as released'), 'goOtherDesk(app, w ? { ...r, id: w.id } : r);', 'goOtherDesk(app, r);', 'the other-desktops tap, as released'), 'const live = app.wm.windows.get(state.hostId)?._tabChain', 'const live = app.wm.windows.get(hostId)?._tabChain', 'the re-list, as released');   // stale-pins: kept — the release's captured ids, the RED's own text
    const R2 = ['the ⧉ list row\'s right-click', 'the every-desktop row\'s stamp and tap', 'the other-desktops row\'s tap', 'the chooser\'s re-list'];
    ok(rel2 !== TB && R2.every((n) => miss(rel2).includes(n)), '§10 RED (r2250): the release\'s ⧉ right-click, every-desktop and other-desktops taps and the chooser\'s re-list (a captured id) fail the check by name', miss(rel2));
  }
});
// §11 (主开发 r2355 / r2396): a window id captured EARLIER, read by a LATER act — the three a person is likeliest to press (the page
// bl-phone-ui/idcap/page-r2355.md), each over the REAL code with stand-ins, each with the release's RED
await section('§11 r2355 the window menu left open across a change of id, the phone\'s desktop switch, a reveal across a desktop switch (the REAL windowMenuRows, _showOnDesk, revealWindow)', async () => {
  const { WindowManager } = await import(pathToFileURL(path.join(LIB, 'window.js')).href);
  const { MobileNav } = await import(pathToFileURL(path.join(LIB, 'mobile-nav.js')).href);
  const TB = await import(pathToFileURL(path.join(LIB, 'taskbar.js')).href);
  const { menuItems } = await import(pathToFileURL(path.join(LIB, 'contributions.js')).href);
  const rekey = (wm, a, b) => WindowManager.prototype.rekeyWindow.call(wm, a, b);   // THE road of an id changed in place (B-1d87's adoption)
  // (1) A WINDOW MENU LEFT OPEN ACROSS A CHANGE OF ID: Move, Minimize and Close act on the window, each
  const menu = (rowsOf) => {
    const out = {};
    for (const cmd of ['window.move', 'window.minimizeOrRestore', 'window.close']) {
      const calls = [];
      const win = { id: 'win-m1', type: 'files', title: 'notes.md', isMinimized: false, element: mkEl() };
      const wm = { windows: new Map([['win-m1', win]]), activeWindowId: 'win-m1', followIdChange() {}, startMoveMode: (id) => calls.push(id), witnessGeometry() {}, minimize: (id) => calls.push(id), restore: (id) => calls.push(id), requestClose: (id) => calls.push(id), requestCloseGroup: (id) => calls.push(id) };
      const app = { wm, sessions: new Map(), sidebar: { _allSessions: [] }, isMobile: false };
      wm._app = app;
      const row = (rowsOf(app, win) || []).find((r) => r && r.command === cmd);   // the menu OPEN: its rows drawn
      rekey(wm, 'win-m1', 'win-m1-taken');   // the id changes while it stands open
      if (row) row.action();   // the person's press
      out[cmd] = { row: !!row, acted: calls.join(), on: calls.length > 0 && wm.windows.get(calls[0]) === win };
    }
    return out;
  };
  const M = menu((app) => TB.windowMenuRows(app, 'win-m1'));
  ok(Object.values(M).every((x) => x.row && x.on === true && x.acted === 'win-m1-taken'), '§11 r2355 a window menu left open across a change of id: Move, Minimize and Close each act on the window (taskbar.js windowMenuCtx: the id read off the window held)', M);
  const RM = menu((app, win) => menuItems('window', { app, id: 'win-m1', win, s: null, switchSubmenu: false, closeLabel: '✕ Close', group: false }));   // the release's ctx: { app, id, win, … }, its id a value taken at the open
  ok(Object.values(RM).every((x) => x.row && x.acted === 'win-m1' && x.on === false), '§11 RED: the release\'s ctx (its id a value taken at the open) — Move, Minimize and Close act on an id no window holds: nothing, nothing said', RM);
  // (2) A PHONE'S DESKTOP SWITCH THAT RE-KEYS THE WINDOW IT SHOWED THERE (the switch takes its kept row back): it shows THAT window
  const phoneSwitch = async (MN) => {
    const mk = (id) => ({ id, _desktopId: 'desk-p', _hiddenByDesktop: false, _hiddenByStage: false, element: mkEl() });
    const shownWin = mk('win-s1'), other = mk('win-s2'), focused = [];
    const wm = { windows: new Map([['win-s1', shownWin], ['win-s2', other]]), activeWindowId: 'win-s2', focusWindow(id) { focused.push(id); wm.activeWindowId = id; }, _focusMostRecent() { focused.push('the most recent'); } };
    const dm = { activeDesktopId: 'desk-w', _pendingSwitch: 'desk-p' };
    const nav = Object.create(MN.prototype);
    nav.app = { wm, desktopManager: dm, layoutManager: { _lastUserInputAt: 0 } };
    nav._shown = { 'desk-p': 'win-s1' }; nav.updateTitle = () => {}; nav._seen = () => {}; nav._saveShown = () => {};
    wm._app = { _mobileNav: nav }; wm.followIdChange = WindowManager.prototype.followIdChange;
    nav._showOnDesk('desk-p');   // the switch asked: its desktop not on show yet — the look waits for it (250 ms)
    rekey(wm, 'win-s1', 'win-s1-taken');   // the switch takes its kept row back: the window it showed there takes the row's id
    dm.activeDesktopId = 'desk-p'; dm._pendingSwitch = null;   // the switch lands
    await tick(400);
    return { focused: focused.join(), active: wm.activeWindowId, noted: nav._shown['desk-p'] };
  };
  const S = await phoneSwitch(MobileNav);
  ok(S.active === 'win-s1-taken' && S.focused.split(',')[0] === 'win-s1-taken', '§11 r2355 a phone\'s desktop switch that re-keys the window it showed there shows THAT window (mobile-nav _showOnDesk: the window held, its id read at each look)', S);
  const RS = await phoneSwitch((await mutantEsm('src/lib/mobile-nav.js', '    const wantNow = () => (wantWin ? wantWin.id : firstId);\n', '    const wantNow = () => firstId;\n')).MobileNav);   // stale-pins: kept — the release's: the id taken at the switch
  ok(RS.active === 'win-s2' && !RS.focused.includes('win-s1-taken'), `§11 RED: the release's _showOnDesk (the id taken at the switch) — another window stays in front, not the one it showed there (${RS.active})`, RS);
  // (3) A REVEAL ACROSS A DESKTOP SWITCH THAT RE-KEYS THE WINDOW: it is revealed
  const reveal = async (WMc) => {
    const win = { id: 'win-r1', type: 'files', _desktopId: 'desk-b', isMinimized: false, element: mkEl() };
    let land = null; const focused = [];
    const dm = { activeDesktopId: 'desk-a', desktops: [{ id: 'desk-a', name: 'A' }, { id: 'desk-b', name: 'B' }], switchTo(d) { return new Promise((r) => { land = () => { dm.activeDesktopId = d; r(); }; }); } };
    const wm = Object.create(WMc.prototype);
    Object.assign(wm, { windows: new Map([['win-r1', win]]), activeWindowId: null, _app: { desktopManager: dm }, focusWindow(id) { focused.push(id); }, _bringBack() {}, followIdChange() {} });
    const asked = wm.revealWindow('win-r1');   // a person's reveal of a window on another desktop: its desktop first
    rekey(wm, 'win-r1', 'win-r1-taken');   // the switch takes its kept row back by re-keying it
    land(); await tick(0); await tick(0);
    return { asked, focused: focused.join(), held: wm.windows.get('win-r1-taken') === win };
  };
  const R = await reveal(WindowManager);
  ok(R.asked === true && R.held && R.focused === 'win-r1-taken', '§11 r2355 a reveal across a desktop switch that re-keys the window reveals it (window.js revealWindow: the window held, its id read when the switch lands)', R);
  const NEWTHEN = "      Promise.resolve(go.to === STAGE_ID ? stage.enter() : dm.switchTo(go.to)).then(() => this.revealWindow(win.id, { raise, _switched: true }), () => this.revealWindow(win.id, { raise, _switched: true }));\n";
  const RR = await reveal((await mutantEsm('src/lib/window.js', NEWTHEN, NEWTHEN.replace(/this\.revealWindow\(win\.id,/g, 'this.revealWindow(id,'))).WindowManager);   // stale-pins: kept — the release's: the id taken before the switch
  ok(RR.asked === true && RR.focused === '', `§11 RED: the release's revealWindow (the id taken before the switch) — the switch lands and the window is not revealed (focused: «${RR.focused}»)`, RR);
});
const HOUR = 3600000, DAY = 86400000;
const ringName = (ms, seq) => 'layout-' + new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + seq.toString(36) + '.json';
/** the async prunes have finished: the ring's file count stands still for three looks (≤ 5 s) */
const ringSettle = async (H) => { let last = -1, same = 0; const t0 = Date.now(); while (same < 3 && Date.now() - t0 < 5000) { await tick(30); const n = fs.readdirSync(H).length; same = n === last ? same + 1 : 0; last = n; } };
/** B-b05e's scene on persistence module `P`: a hub restarted NOW over a ring of forty days — the first ten points ever written
 *  (forty days ago), one point at the noon of each day 3…20 days back, one point an hour for the last thirty hours, one at the
 *  start of THIS hour — then a phone's burst of 100 shape changes through writeLayouts (the production read-modify-write). */
async function ringBurst(P, { dialog = false } = {}) {
  const dd = scratchDir('lsw-ring'), H = path.join(dd, 'layout-history');
  try {
    fs.mkdirSync(H, { recursive: true });
    const now = Date.now();
    let seq = 0;
    const put = (ms) => { const id = ringName(ms, seq++), meta = { at: ms, summary: { 个人: 3 }, totalWindows: 3, change: null }; fs.writeFileSync(path.join(dd, 'layout-history', id), J({ ...meta, layouts: DOC(P_BEFORE().slice(0, 3)) })); fs.writeFileSync(path.join(dd, 'layout-history', id.replace(/\.json$/, '.meta.json')), J(meta)); return id; };
    const first = []; for (let i = 0; i < 10; i++) first.push(put(now - 40 * DAY + i * 60000));
    const noons = {}; for (let d = 20; d >= 3; d--) noons[d] = put(Math.floor(now / DAY) * DAY - d * DAY + 12 * HOUR);
    const hourly = {}; for (let h = 30; h >= 1; h--) hourly[h] = put(Math.floor(now / HOUR) * HOUR - h * HOUR + 5 * 60000);
    const thisHour = put(Math.floor(now / HOUR) * HOUR);
    const yesterday = Object.values(hourly).filter((f) => Math.floor(Date.parse(f.slice(7, 17) + 'T00:00:00Z') / DAY) === Math.floor(now / DAY) - 1).sort()[0];
    fs.writeFileSync(path.join(dd, 'layouts.json'), J(DOC(P_BEFORE()))); // the layout as the restart finds it: 个人 eleven
    P.setup({ writer: landingWriter(), dataDir: dd, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
    const R = P.router;
    // the burst's prunes read NO meta (the cure of the batch-4 verdict: the restarts' points are known by their names — data/ may be a network mount)
    // …and the prune is OFF THE LOOP: no synchronous readdir / unlink of the ring (fs.promises)
    const rf = fs.readFileSync, rd = fs.readdirSync, ul = fs.unlinkSync; let metaReads = 0, syncRing = 0;
    fs.readFileSync = function (p, ...a) { if (/\.meta\.json$/.test(String(p))) metaReads++; return rf.call(this, p, ...a); };
    fs.readdirSync = function (p, ...a) { if (/layout-history/.test(String(p))) syncRing++; return rd.call(this, p, ...a); };
    fs.unlinkSync = function (p, ...a) { if (/layout-history/.test(String(p))) syncRing++; return ul.call(this, p, ...a); };
    try { for (let i = 0; i < 100; i++) { const d = R.readLayouts(); d.desktops['desk-p'].autoSave.windows = P_SENT().slice(0, 1 + (i % 9)); R.writeLayouts(d); await new Promise((r) => setImmediate(() => setImmediate(r))); } }
    finally { fs.readFileSync = rf; fs.readdirSync = rd; fs.unlinkSync = ul; }
    await ringSettle(H); R.flushLayouts();
    const left = fs.readdirSync(H).filter((f) => /^layout-.*\.json$/.test(f) && !f.endsWith('.meta.json')).sort();
    const list = R.listLayoutHistory();
    const boot = list.find((e) => e.restart) || null;
    const bootIds = boot ? JSON.parse(fs.readFileSync(path.join(H, boot.id), 'utf8')).layouts.desktops['desk-p'].autoSave.windows.map((w) => w.winId) : null;
    const burst = left.filter((f) => f > thisHour);
    let html = null;
    if (dialog) {
      const route = R.stack.find((l) => l.route && l.route.path === '/api/layout-history' && l.route.methods.get);
      globalThis.__lswShell = () => { const body = { _h: '', set innerHTML(v) { this._h = String(v); }, get innerHTML() { return this._h; }, querySelectorAll: () => [], querySelector: () => null }; html = body; return { body, close() {}, raised: false, ready: Promise.resolve(true), live: () => true }; };
      globalThis.__lswFetch = async (u) => { let out = null; await route.route.stack[0].handle({ query: Object.fromEntries(new URL(u, 'http://x').searchParams) }, { json: (j) => { out = j; } }); return out; };
      class F {} (await loadFlows())(F);
      await F.prototype._showLayoutHistory.call(new F(), null);
      html = html && html._h;
    }
    return { now, end: Date.now(), left, list, boot, bootIds, burst, first, noons, hourly, thisHour, yesterday, html, metaReads, syncRing };
  } finally { fs.rmSync(dd, { recursive: true, force: true }); }
}

await section('§9 B-b05e THE RING IS SPREAD OVER TIME — the REAL router restarted over forty days of points, then a burst of 100', async () => {
  delete require.cache[require.resolve(path.join(REPO, 'src/routes/persistence.js'))];
  const P = require(path.join(REPO, 'src/routes/persistence.js'));
  const r = await ringBurst(P, { dialog: true });
  const has = (f) => r.left.includes(f);
  const days3to13 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((d) => r.noons[d]);
  ok(days3to13.every(has) && !!r.yesterday && has(r.yesterday), '§9 after the burst every recent DAY keeps its point — yesterday\'s first, and each noon 3…13 days back (b06f36e90: all evicted, the ring held the first ten ever written + 30 of the burst)', { missing: days3to13.filter((f) => !has(f)), yesterday: r.yesterday, left: r.left.length });
  const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((h) => r.hourly[h]);
  ok(hours.every(has) && has(r.thisHour), '§9 …and every one of the newest 24 HOURS that hold a point keeps its oldest one (this hour\'s from before the burst, the 23 before it)', hours.filter((f) => !has(f)));
  ok([15, 16, 17, 18, 19, 20].every((d) => !has(r.noons[d])) && r.first.filter(has).length <= 1 && [24, 25, 26, 27, 28, 29, 30].some((h) => !has(r.hourly[h])), '§9 …the older ones leave: days past the newest fourteen, the hours past the newest 24 (unless the first of their day), at most the first of the forty-day-old ten', { first: r.first.filter(has).length, noons: [15, 16, 17, 18, 19, 20].filter((d) => has(r.noons[d])) });
  ok((r.burst.length === 11 || (r.burst.length === 12 && Math.floor(r.end / HOUR) !== Math.floor(r.now / HOUR))) && r.left.length <= 10 + 24 + 14 + 1, `§9 …the burst keeps its newest ten (+ the pinned point); the ring holds at most 10 + 24 + 14 + 1 points (here ${r.left.length}, the burst ${r.burst.length})`, r.burst);
  ok(!!r.boot && J(r.bootIds) === J(P_BEFORE().map((w) => w.winId)) && has(r.boot.id), '§9 THE POINT FROM BEFORE THE RESTART is PINNED: the first point after the boot holds the layout the restart found (个人\'s eleven) and stays through the burst — named `restart` in the list', { boot: r.boot && r.boot.id, ids: r.bootIds });
  ok(r.boot && /\.restart\.json$/.test(r.boot.id) && r.metaReads === 0 && r.syncRing === 0, '§9 …the point carries the mark in its NAME (…restart.json); the burst\'s 100 prunes read NO meta file and make no synchronous readdir / unlink (the verdict\'s cure: the prune off the main loop — data/ may be a network mount)', { id: r.boot && r.boot.id, metaReads: r.metaReads, syncRing: r.syncRing });
  ok(r.list.filter((e) => e.restart).length === 1 && /<div class="lh-sub lh-restart">As it was before the server restarted<\/div>/.test(r.html || '') && (r.html.match(/lh-restart/g) || []).length === 1, '§9 …the dialog (⚙ → System → Restore a previous layout…) says it on that row alone: «As it was before the server restarted»', (r.html || '').slice(0, 300));
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  ok(zh.includes('"As it was before the server restarted": "') && ja.includes('"As it was before the server restarted": "'), '§9 …with a zh AND a ja entry');
  const RK = P.ringKeep;
  const names = []; let s = 0; const T0 = Date.UTC(2026, 9, 1, 0, 0, 0, 0);
  for (let d = 0; d < 30; d++) names.push(ringName(T0 + d * DAY + 9 * HOUR, s++));
  for (let i = 0; i < 500; i++) names.push(ringName(T0 + 30 * DAY + 10 * HOUR + i * 200, s++));
  const k = RK(names, { pinned: names[31] });
  ok(k.size === 35 && names.slice(7, 32).every((f) => k.has(f)) && names.slice(-10).every((f) => k.has(f)) && !k.has(names[6]) && !k.has(names[32]), `§9 PURE ringKeep: thirty days of one point each, then a 500-write burst inside one hour ⇒ the newest ten + the oldest point of each of the newest 24 hours (the burst's first + 23 days) + the pin = 35 (${k.size}); the burst's middle leaves`);
  const kd = RK(names, { hours: 0 });
  ok(kd.size === 10 + 14 && names.slice(17, 31).every((f) => kd.has(f)) && !kd.has(names[16]), `§9 PURE ringKeep, the days alone: the oldest point of each of the fourteen newest days (13 days + the burst's day), the fifteenth gone (${kd.size})`);
  ok(J([...RK(names.slice().reverse())].sort()) === J([...RK(names)].sort()) && RK([]).size === 0, '§9 PURE ringKeep: any input order, an empty ring');
  const ms = Date.UTC(2026, 10, 17, 9, 0, 0, 0), same = Array.from({ length: 12 }, (_, i) => ringName(ms, 30 + i)); // one millisecond: seq u, v … z, 10, 11 … 15
  const ks = RK(same, { hours: 0, days: 0 });
  ok(ks.has(ringName(ms, 36)) && ks.has(ringName(ms, 41)) && !ks.has(ringName(ms, 30)) && !ks.has(ringName(ms, 31)), '§9 PURE ringKeep: inside one millisecond the writer\'s sequence orders (base 36: «10» comes after «z») — the newest ten are seq 32…41, never the name\'s letters', [...ks]);
  const odd = RK([...names.slice(-11), 'layout-backup.json'], { hours: 0, days: 0 });
  ok(!odd.has('layout-backup.json') && odd.size === 10, '§9 PURE ringKeep: a name with no stamp is the OLDEST — it never holds one of the newest ten', [...odd]);
  ok(RK(names, { pinned: [names[2], names[3]], hours: 0, days: 0 }).has(names[2]) && RK(names, { pinned: [names[2], names[3]], hours: 0, days: 0 }).has(names[3]), '§9 PURE ringKeep: `pinned` takes a list (the newest boot points)');
  ok(P.ringSeq(ringName(ms, 46).replace(/\.json$/, '.restart.json')) === 46 && P.ringStampMs(ringName(ms, 3).replace(/\.json$/, '.restart.json')) === ms && J(P.ringSort([ringName(ms + 1, 0).replace(/\.json$/, '.restart.json'), ringName(ms, 5)])) === J([ringName(ms, 5), ringName(ms + 1, 0).replace(/\.json$/, '.restart.json')]), '§9 PURE: a restart\'s point (…Z-<seq>.restart.json) keeps its stamp and its sequence; ringSort orders by time');
  // RED CONTROLS: the base's prune (the first ten + the newest thirty); the pin taken out
  delete require.cache[require.resolve(path.join(REPO, 'src/routes/persistence.js'))];
  const PIN = 'const keep = ringKeep(files, { pinned: boots.slice(-RING_KEEP.boots) });';
  const base = await ringBurst(mutantModule('src/routes/persistence.js', PIN, "if (files.length <= 40) return; const keep = new Set([...files.slice(0, 10), ...files.slice(-30)]);"));
  ok(!base.left.includes(base.yesterday) && [3, 4, 5].every((d) => !base.left.includes(base.noons[d])) && !base.left.includes(base.boot && base.boot.id), '§9 CONTROL: with b06f36e90\'s prune (the oldest ten + the newest thirty) the same burst evicts yesterday, every recent day and the point from before the restart (the legs above go RED)', { left: base.left.length, yesterday: base.left.includes(base.yesterday) });
  const nopin = await ringBurst(mutantModule('src/routes/persistence.js', PIN, 'const keep = ringKeep(files, { pinned: null });'));
  ok(!!nopin.boot === false && nopin.yesterday && nopin.left.includes(nopin.yesterday), '§9 CONTROL: the pin taken out ⇒ the point from before the restart is pushed out by the burst (it is neither its hour\'s nor its day\'s oldest) — the pin leg goes RED', { boot: nopin.boot });
  // A SECOND RESTART AFTER A BAD ONE (the adversarial read): restart 1 finds the good layout, a burst damages it, the person restarts
  // again — the point before restart 1 must stay (one pin moved to restart 2's point, the damaged state, and let the good one go)
  const twice = async (load) => {
    const dd = scratchDir('lsw-ring2'), H = path.join(dd, 'layout-history');
    try {
      fs.mkdirSync(H, { recursive: true });
      const now = Date.now(); let seq = 900;
      const meta = { at: now, summary: { 个人: 3 }, totalWindows: 3, change: null }, early = ringName(Math.floor(now / HOUR) * HOUR, seq++); // earlier THIS hour and day
      fs.writeFileSync(path.join(dd, 'layout-history', early), J({ ...meta, layouts: DOC(P_BEFORE().slice(0, 3)) })); fs.writeFileSync(path.join(dd, 'layout-history', early.replace(/\.json$/, '.meta.json')), J(meta));
      fs.writeFileSync(path.join(dd, 'layouts.json'), J(DOC(P_BEFORE())));
      const boot = async (n) => { const P = load(); P.setup({ writer: landingWriter(), dataDir: dd, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null }); const R = P.router;
        for (let i = 0; i < n; i++) { const d = R.readLayouts(); d.desktops['desk-p'].autoSave.windows = P_SENT().slice(0, 1 + (i % 9)); R.writeLayouts(d); await new Promise((r) => setImmediate(() => setImmediate(r))); }
        await ringSettle(H); R.flushLayouts(); return R; };
      await boot(20); // restart 1, then a burst
      const R2 = await boot(100); // restart 2 (over the damaged layout), then another burst
      const list = R2.listLayoutHistory(), boots = list.filter((e) => e.restart);
      const firstIds = boots.length ? JSON.parse(fs.readFileSync(path.join(H, boots[boots.length - 1].id), 'utf8')).layouts.desktops['desk-p'].autoSave.windows.map((w) => w.winId) : null;
      return { boots: boots.length, firstIds };
    } finally { fs.rmSync(dd, { recursive: true, force: true }); }
  };
  const fresh = () => { delete require.cache[require.resolve(path.join(REPO, 'src/routes/persistence.js'))]; return require(path.join(REPO, 'src/routes/persistence.js')); };
  const t2 = await twice(fresh);
  ok(t2.boots === 2 && J(t2.firstIds) === J(P_BEFORE().map((w) => w.winId)), '§9 …a SECOND restart after a bad one keeps the point from before the FIRST (个人\'s eleven), both named in the dialog (the newest three boot points are pinned)', t2);
  const t2red = await twice(() => mutantModule('src/routes/persistence.js', PIN, 'const keep = ringKeep(files, { pinned: boots.slice(-1) });'));
  const metaRed = await ringBurst(mutantModule('src/routes/persistence.js', "const boots = ringSort(files.filter((f) => f.endsWith('.restart.json'))); // the restarts' points, by NAME — no meta read here", 'const boots = listLayoutHistory().filter((e) => e.restart).map((e) => e.id).reverse();'));
  ok(metaRed.metaReads > 0, `§9 CONTROL: the first cut's road (the restarts' points read off the metas) ⇒ the prunes read meta files (${metaRed.metaReads}) — the no-meta leg goes RED`);
  const syncRed = await ringBurst(mutantModule('src/routes/persistence.js', 'try { names = await fs.promises.readdir(HISTORY_DIR); } catch { return; }', 'try { names = fs.readdirSync(HISTORY_DIR); } catch { return; }'));
  ok(syncRed.syncRing > 0, `§9 CONTROL: the release's synchronous listing in the prune ⇒ sync ring calls on the loop (${syncRed.syncRing}) — the off-the-loop leg goes RED`);
  ok(t2red.boots === 1 && J(t2red.firstIds) !== J(P_BEFORE().map((w) => w.winId)), '§9 CONTROL: one pin only ⇒ the point before the first restart is pushed out by the second burst (the leg above goes RED)', t2red);
  // THE DIALOG'S LABEL IS THE PIN'S OWN RULE (B-b05e cure 3 — the cure-2 verdict: the label read the meta too and took the list's
  // NAME order): four restart points inside one millisecond (seq x, y, z, «10» — base 36: «10» is the newest) and the NEWEST point
  // of all a plain name whose META alone says «restart» (the first form's mark, never on a hub — .409 carried none; newest, so a rule
  // that reads the meta again names it) ⇒ exactly the three the prune pins
  const labels = (load) => {
    const dd = scratchDir('lsw-label'), H = path.join(dd, 'layout-history');
    try {
      fs.mkdirSync(H, { recursive: true });
      const ms = Date.UTC(2026, 10, 17, 9, 0, 0, 0), meta = { at: ms, summary: { 个人: 3 }, totalWindows: 3, change: null };
      const boots = [33, 34, 35, 36].map((q) => ringName(ms, q).replace(/\.json$/, '.restart.json')), legacy = ringName(ms + 1, 7);
      for (const f of [...boots, legacy]) {
        fs.writeFileSync(path.join(dd, 'layout-history', f), J({ ...meta, layouts: DOC(P_BEFORE().slice(0, 3)) }));
        fs.writeFileSync(path.join(dd, 'layout-history', f.replace(/\.json$/, '.meta.json')), J(f === legacy ? { ...meta, restart: true } : meta));
      }
      fs.writeFileSync(path.join(dd, 'layouts.json'), J(DOC(P_BEFORE())));
      const P = load(); P.setup({ writer: landingWriter(), dataDir: dd, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
      const said = P.router.listLayoutHistory().filter((e) => e.restart).map((e) => e.id).sort();
      return { said, pinned: P.ringSort(boots).slice(-P.RING_KEEP.boots).sort(), legacy, oldest: boots[0] };
    } finally { fs.rmSync(dd, { recursive: true, force: true }); }
  };
  const lb = labels(fresh);
  ok(J(lb.said) === J(lb.pinned) && lb.said.length === 3 && !lb.said.includes(lb.oldest) && !lb.said.includes(lb.legacy), '§9 …the dialog says «before the server restarted» of EXACTLY the points the prune pins — the newest three `.restart.json` NAMES in ring order (seq «10» after «z»); a point only its meta marks is not said to be one (B-b05e cure 3)', lb);
  ok(/const bootsNamed = \(files\) => new Set\(ringSort\(files\.filter\(\(f\) => f\.endsWith\('\.restart\.json'\)\)\)\.slice\(-RING_KEEP\.boots\)\);/.test(read('src/routes/persistence.js')) && read('src/routes/persistence.js').includes("const keep = ringKeep(files, { pinned: boots.slice(-RING_KEEP.boots) });"), '§9 …the label and the pin are one expression (ringSort over the `.restart.json` names, the newest RING_KEEP.boots)');
  const lbName = labels(() => mutantModule('src/routes/persistence.js', "const bootsNamed = (files) => new Set(ringSort(files.filter((f) => f.endsWith('.restart.json'))).slice(-RING_KEEP.boots));", "const bootsNamed = (files) => new Set(files.filter((f) => f.endsWith('.restart.json')).sort().reverse().slice(0, RING_KEEP.boots));"));
  ok(lbName.said.includes(lb.oldest) && J(lbName.said) !== J(lbName.pinned), '§9 CONTROL: the label in the NAME order (the cure-2 list order) says «restart» of a point the prune lets go (seq x) and not of the newest (the label leg goes RED)', lbName);
  const lbMeta = labels(() => mutantModule('src/routes/persistence.js', '{ refused: m.refused } : {}), ...(named.has(f) ? { restart: true } : {}), ...(unread', '{ refused: m.refused } : {}), ...(named.has(f) || m.restart ? { restart: true } : {}), ...(unread'));
  ok(lbMeta.said.includes(lbMeta.legacy), '§9 CONTROL: the meta\'s mark read too (the cure-2 label) ⇒ an unpinned point is said to be a restart\'s (the label leg goes RED)', lbMeta);
});

await section('§9 B-46fc A PAGE THAT LEAVES TAKES ITS LAST CHANGE — the REAL LayoutManager: a window opened, the page hidden or left while its save still waits', async () => {
  // the page's own listeners, heard: LayoutManager adds them at construction (pagehide on window, visibilitychange on document)
  const scene = async (Lm, how, { timer = false, gate = null } = {}) => {
    const heard = { win: {}, doc: {} };
    const was = { w: globalThis.addEventListener, d: document.addEventListener, hidden: Object.getOwnPropertyDescriptor(document, 'hidden') };
    globalThis.addEventListener = (ev, fn) => { (heard.win[ev] = heard.win[ev] || []).push(fn); };
    document.addEventListener = (ev, fn) => { (heard.doc[ev] = heard.doc[ev] || []).push(fn); };
    let W;
    try { W = world({ records: { 'desk-w': [files('w-0', 0)], 'desk-p': [], 'desk-r': [] }, active: 'desk-w', Lm }); }
    finally { globalThis.addEventListener = was.w; document.addEventListener = was.d; }
    W.lm._lastSentJson = null;
    if (gate === 'boot') W.lm._restoring = true; // the boot's 5 s (the measured scene: a door tap 1.8 s after the load)
    if (gate === 'switch') W.dm._restoring = true; // a desktop switch's 1 s
    W.mkWin('win-door', 'desk-w', { type: 'chat', title: 'Van build', _openSpec: { action: 'attachSession', serverId: 'sess-door', backendSessionId: CID(5) } }); // the door tap's window
    W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
    W.lm.scheduleAutoSave(); // the debounce (500 ms) — or, under a gate, deferred past it (_deferSave: asked again in 1.1 s)
    await tick(50);
    const before = W.syncs('desk-w').length, deferred = !!W.lm._deferT;
    if (how === 'pagehide') for (const fn of heard.win.pagehide || []) fn({ persisted: false });
    if (how === 'hidden') { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); try { for (const fn of heard.doc.visibilitychange || []) fn({}); } finally { if (was.hidden) Object.defineProperty(document, 'hidden', was.hidden); else delete document.hidden; } }
    const at = W.syncs('desk-w').slice(before);
    const carried = at.some((m) => (m.state.windows || []).some((w) => w.winId === 'win-door'));
    const sent = at.length ? at[0].state.windows : null;
    const gates = [W.lm._restoring, W.dm._restoring], stillDeferred = !!W.lm._deferT;
    if (timer) await tick(gate ? 1200 : 550); // the debounce's / the deferral's own timer
    const after = W.syncs('desk-w').slice(before);
    W.lm._restoring = false; W.dm._restoring = false;
    clearTimeout(W.lm._autoSaveTimer); clearTimeout(W.lm._deferT); W.lm._deferT = null;
    return { before, now: at.length, carried, sent, after: after.length, deferred, stillDeferred, gates, W };
  };
  const ph = await scene(LM, 'pagehide', { timer: true });
  ok(ph.before === 0 && ph.now === 1 && ph.carried, '§9 a window opened, then pagehide 50 ms into the 500 ms debounce ⇒ its save goes AT ONCE, carrying the window (b06f36e90: nothing until the timer — a reload in between showed another conversation)', { before: ph.before, now: ph.now, carried: ph.carried });
  ok(ph.after === 1, '§9 …and the debounce\'s own timer sends no second copy of that save', ph.after);
  const hd = await scene(LM, 'hidden');
  ok(hd.now === 1 && hd.carried, '§9 …the page turning HIDDEN with no gate up does the same', { now: hd.now, carried: hd.carried });
  // NO SAVE IN THE MIDDLE OF A RESTORE (the cure of the batch-4 verdict): under a gate nothing leaves from here, hidden or leaving
  const bt = await scene(LM, 'pagehide', { gate: 'boot', timer: true });
  ok(bt.deferred && bt.now === 0 && bt.after === 0 && J(bt.gates) === J([true, false]) && bt.stillDeferred, '§9 THE BOOT\'s 5 s GATE: the door tap\'s save deferred past it, then the page LEAVES ⇒ NOTHING leaves mid-restore (the gate never lowered, the deferral untouched) — the price, said: that act is lost on a leave inside the gate', { deferred: bt.deferred, now: bt.now, after: bt.after, gates: bt.gates });
  const sw = await scene(LM, 'hidden', { gate: 'switch' });
  ok(sw.deferred && sw.now === 0 && sw.stillDeferred, '§9 …a page turning HIDDEN under a gate (a tab switch, the page lives on) sends nothing — its held save waits for the gate as before', { now: sw.now, stillDeferred: sw.stillDeferred });
  // a deferral that owed only RECIPES sends only them; a deferral that holds a PERSON's act re-arms it (even with a recipe owed elsewhere)
  {
    const owedScene = async (Lm, { user = false } = {}) => {
      const W = world({ records: { 'desk-w': [files('w-0', 0)], 'desk-p': [], 'desk-r': [] }, active: 'desk-w', Lm });
      let recipes = 0; W.lm._saveOwedRecipes = () => { recipes++; }; W.lm._owedDesks = () => new Set(['desk-p']); // a recipe owed on another desktop
      W.lm._userDirty = false; W.lm._lastUserInputAt = Date.now(); W.lm._savedAt = Date.now() - 5000; // an input newer than the last save
      if (user) { W.lm._userDirty = true; W.lm._restoring = true; W.lm._deferSave(); W.lm._restoring = false; W.lm._userDirty = false; } // the 1.1 s kind deferred a person's act; an apply cleared the bit since
      else W.lm._deferT = setTimeout(() => {}, 200); // the owed-recipe loop's deferral (_deferSave's 200 ms kind)
      const n0 = W.syncs('desk-w').length;
      W.lm._flushOnLeave('pagehide');
      const out = { recipes, full: W.syncs('desk-w').length - n0, dirty: W.lm._userDirty };
      clearTimeout(W.lm._deferT); W.lm._deferT = null; clearTimeout(W.lm._autoSaveTimer);
      return out;
    };
    const o = await owedScene(LM), u = await owedScene(LM, { user: true });
    const staleScene = async (Lm) => { const W = world({ records: { 'desk-w': [files('w-0', 0)], 'desk-p': [], 'desk-r': [] }, active: 'desk-w', Lm });
      let recipes = 0; W.lm._saveOwedRecipes = () => { recipes++; }; W.lm._owedDesks = () => new Set(['desk-p']);
      W.lm._userDirty = false; W.lm._lastUserInputAt = Date.now(); W.lm._savedAt = Date.now() - 5000;
      const fired = setTimeout(() => {}, 1); clearTimeout(fired); W.lm._deferUserAt = Date.now() - 2000; W.lm._deferUserT = fired; // a person's deferral that fired on its own; its save never left
      W.lm._deferT = setTimeout(() => {}, 200); // now an owed-recipe deferral is the pending one
      const n0 = W.syncs('desk-w').length; W.lm._flushOnLeave('pagehide');
      const out = { recipes, full: W.syncs('desk-w').length - n0 }; clearTimeout(W.lm._deferT); W.lm._deferT = null; clearTimeout(W.lm._autoSaveTimer); return out; };
    const st = await staleScene(LM);
    ok(st.recipes === 1 && st.full === 0, '§9 …a person\'s stamp left by a deferral that fired on its own does not speak for a LATER owed-recipe deferral: recipes only (cure 2 — the stamp belongs to its timer)', st);
    const { LayoutManager: LMs } = await mutantEsm('src/lib/layout.js', 'deferred && this._deferUserT === this._deferT && this._deferUserAt != null', 'deferred && this._deferUserAt != null'); // stale-pins: kept — the control writes the cure's first form back on purpose
    const st0 = await staleScene(LMs);
    ok(st0.full === 1 && st0.recipes === 0, '§9 CONTROL: the stamp without its timer (the cure\'s first form) re-arms the stale act — a whole save (the leg above goes RED)', st0);
    // …and the stamp ENDS with its timer (cure 3 — the cure-2 verdict's should): the 1.1 s deferral that fires on its own clears it
    const fireScene = (Lm) => { const W = world({ records: { 'desk-w': [files('w-0', 0)], 'desk-p': [], 'desk-r': [] }, active: 'desk-w', Lm });
      const st = globalThis.setTimeout; let cb = null;
      globalThis.setTimeout = (f, ms, ...a) => (ms === 1100 ? (cb = f, st(() => {}, 0)) : st(f, ms, ...a));
      try { W.lm._userDirty = true; W.lm._restoring = true; W.lm._deferSave(); } finally { globalThis.setTimeout = st; }
      W.lm._restoring = false; W.lm.scheduleAutoSave = () => {}; const held = { at: W.lm._deferUserAt != null, t: W.lm._deferUserT === W.lm._deferT && !!W.lm._deferT };
      if (cb) cb();
      return { fired: !!cb, held, at: W.lm._deferUserAt, t: W.lm._deferUserT, deferT: W.lm._deferT }; };
    const fs3 = fireScene(LM);
    ok(fs3.fired && fs3.held.at && fs3.held.t && fs3.at === null && fs3.t === null && fs3.deferT === null, '§9 …the person\'s-deferral stamp ENDS with its own timer: set while the 1.1 s deferral waits, both cleared when it fires (B-46fc cure 3)', fs3);
    const { LayoutManager: LMk } = await mutantEsm('src/lib/layout.js', 'this._deferT = null; this._deferUserAt = null; this._deferUserT = null; // the stamp ends with its own timer (B-46fc cure 3)', 'this._deferT = null;');
    const fs3red = fireScene(LMk);
    ok(fs3red.fired && fs3red.at !== null && fs3red.t !== null, '§9 CONTROL: the cure-2 callback (no clear) leaves the stamp after its timer fired (the leg above goes RED)', fs3red);
    ok(o.recipes === 1 && o.full === 0 && o.dirty === false, '§9 …a deferral that owed only RECIPES sends only them (_doAutoSave\'s own road) — never a whole desktop, the dirty bit never set for it', o);
    ok(u.full === 1, '§9 …a deferral that holds a PERSON\'s act (an apply cleared its dirty bit) re-arms it and the act leaves — also with a recipe owed on another desktop (the verdict\'s reader: `owed` anywhere lost it)', u);
    const { LayoutManager: LMo } = await mutantEsm('src/lib/layout.js', 'const act = this._userDirty || (deferred && this._deferUserT === this._deferT && this._deferUserAt != null && !(this._savedAt > this._deferUserAt));', 'const act = this._userDirty || (deferred && !!this._lastUserInputAt && !(this._savedAt > this._lastUserInputAt));');
    const o0 = await owedScene(LMo);
    ok(o0.recipes === 0 && o0.full === 1, '§9 CONTROL: a re-arm that ignores the deferral\'s kind (the first cut) turns the owed-only deferral into a whole save (the recipes leg goes RED)', o0);
  }
  // nothing due ⇒ nothing sent (no echo of the same record), and nothing said
  {
    const W = world({ records: { 'desk-w': [files('w-0', 0)], 'desk-p': [], 'desk-r': [] }, active: 'desk-w' });
    W.lm._lastSentJson = null; W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
    W.lm.scheduleAutoSave(); await W.lm._doAutoSave(); const n0 = W.syncs('desk-w').length; // the save LEFT (its own timer is moot)
    const asked = W.lm._flushOnLeave('pagehide');
    ok(n0 === 1 && asked === false && W.syncs('desk-w').length === 1, '§9 …a page whose last save already LEFT sends nothing more at pagehide (no echo of the same record)', { n0, asked });
    W.lm.scheduleAutoSave(); W.lm._saveAskedAt = (W.lm._savedAt || 0) + 1; // a save asked after the last one left (due)
    W.lm._pointerDown = true; const drag = W.lm._flushOnLeave('pagehide'); W.lm._pointerDown = false; clearTimeout(W.lm._autoSaveTimer);
    ok(drag === false && W.syncs('desk-w').length === 1, '§9 …a pointer still DOWN (an unfinished drag) sends no snapshot of it, and the flush says it sent nothing', drag);
  }
  // THE TRAIN'S HOSTED RED (2.369.410, test-layout-placeholder-ui ④ — 主开发 13:32Z): a restore's own page — its ordinary save
  // REFUSED as stale (the restore stamped the record after this page's base), the kept record ADOPTED with this page's captures
  // and a save RE-ARMED under the NEW base (desktop-manager onSyncRefused → rearmSave), then the reload the restore armed. The
  // release's reload killed that re-send; B-46fc's flush sent it and the hub took it (the page's captures over the restored
  // record — whether that is what reds ④ is NOT proven: the merge keeps the point's ids; ④ prints its facts). THE LAW (主开发
  // 13:32Z): a page whose reload a restore armed sends NOTHING at its leave — the restored point is the truth.
  const restoreLeave = async (Lm, { armed = true } = {}) => {
    const W = world({ records: { 'desk-w': [files('w-0', 0), files('w-1', 1)], 'desk-p': [], 'desk-r': [] }, active: 'desk-w', Lm });
    W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); // the restore's press: a person's act
    const kept = { windows: [files('w-0', 0), files('w-1', 1), files('w-2', 2)], grid: null, updatedAt: Date.now() + 5000 }; // the point's THREE, stamped after this page's base
    W.dm.onSyncRefused({ type: 'layout-sync-refused', desktopId: 'desk-w', reason: 'stale', state: kept });
    const due = { rearmed: !!W.lm._autoSaveTimer && W.lm._saveAskedAt > (W.lm._savedAt || 0), gate: !!(W.lm._restoring || W.dm._restoring), base: W.dm.stampOf('desk-w') === kept.updatedAt };
    if (armed) W.lm._restoreReload = true; // the restore landed: its reload armed (setup-flows' end / app.js's broadcast — pinned below)
    const n0 = W.syncs('desk-w').length;
    const sent = W.lm._flushOnLeave('pagehide');
    const frames = W.syncs('desk-w').slice(n0);
    clearTimeout(W.lm._autoSaveTimer); clearTimeout(W.lm._deferT);
    return { due, sent, frames: frames.length, ids: frames.length ? frames[0].state.windows.map((w) => w.winId) : null };
  };
  const rl = await restoreLeave(LM);
  ok(rl.due.rearmed && !rl.due.gate && rl.due.base && rl.sent === false && rl.frames === 0, '§9 A RESTORE-ARMED RELOAD SENDS NOTHING AT ITS LEAVE (found reading the 2.369.410 hosted red): the stale save refused, the kept record adopted, a save re-armed under the NEW base (due, no gate up) — the restore landed, the page leaves: no frame', rl);
  const { LayoutManager: LMrr } = await mutantEsm('src/lib/layout.js', '    if (this._restoreArmed()) return false; // a restore armed this page\'s reload: nothing leaves at its leave (_restoreArmed)\n', '');
  const rl0 = await restoreLeave(LMrr);
  ok(rl0.sent === true && rl0.frames === 1, '§9 CONTROL: the train\'s tip as it was (the flag not read) sends the adopted merge at the leave — under the new base the hub takes it (the leg above goes RED)', rl0);
  // …THE SECOND ROAD (主开发 13:50Z): the old document lives on until the reload commits — a refused save RE-ARMED after the
  // restore landed could still leave through the debounce. The same predicate, asked by the re-arm: it arms nothing.
  const rearmScene = async (Lm) => {
    const W = world({ records: { 'desk-w': [files('w-0', 0), files('w-1', 1)], 'desk-p': [], 'desk-r': [] }, active: 'desk-w', Lm });
    W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); W.lm._restoreReload = true; // the restore landed first
    const kept = { windows: [files('w-0', 0), files('w-1', 1), files('w-2', 2)], grid: null, updatedAt: Date.now() + 5000 };
    W.dm.onSyncRefused({ type: 'layout-sync-refused', desktopId: 'desk-w', reason: 'stale', state: kept }); // the page's ordinary save, refused
    const out = { armed: !!W.lm._autoSaveTimer && W.lm._saveAskedAt > (W.lm._savedAt || 0), adopted: W.wins.has('w-2') };
    clearTimeout(W.lm._autoSaveTimer); clearTimeout(W.lm._deferT); return out;
  };
  const ra = await rearmScene(LM);
  ok(ra.armed === false && ra.adopted, '§9 …and a refused save is NOT re-armed once a restore armed the reload (the adopt still shows the kept record) — nothing could leave by the debounce while the old document lives on', ra);
  const { LayoutManager: LMra } = await mutantEsm('src/lib/layout.js', "    if (this._restoreArmed()) return; // a restore armed this page's reload: a refused save is not re-armed (_restoreArmed)\n", '');
  const ra0 = await rearmScene(LMra);
  ok(ra0.armed === true, '§9 CONTROL: the re-arm that does not ask the predicate arms the save (the leg above goes RED)', ra0);
  // THE NEIGHBOUR (主开发's condition 3): a person's REAL change made after the restore landed and before its reload (a window
  // closed in those 800 ms) does not leave at the leave either. NO NEW LOSS: at the release a close in the reload's last 500 ms
  // never reached its debounce, and one before it went by its debounce under the page's OLD base — the hub refused it as stale
  // (the restore stamped the record) and the reload killed its re-send. The person sees the reloaded page show the restored
  // point, that window back. The flag holds only its two roads (the leave, the re-arm): a save the page's own debounce sends
  // still leaves — the hub refuses it as stale, as at the release, and its re-arm then arms nothing.
  {
    const W = world({ records: { 'desk-w': [files('w-0', 0), files('w-1', 1)], 'desk-p': [], 'desk-r': [] }, active: 'desk-w' });
    W.mkWin('w-1', 'desk-w', { type: 'viewer' });
    W.lm._restoreReload = true; // the restore landed, its reload armed
    W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now(); W.app.wm.closeWindow('w-1'); W.lm.scheduleAutoSave(); // the person's close inside the 800 ms
    const due = !!W.lm._autoSaveTimer && W.lm._saveAskedAt > (W.lm._savedAt || 0);
    const n0 = W.syncs('desk-w').length, atLeave = W.lm._flushOnLeave('pagehide'), n1 = W.syncs('desk-w').length;
    W.lm._doAutoSave(); const n2 = W.syncs('desk-w').length; clearTimeout(W.lm._autoSaveTimer);
    ok(due && atLeave === false && n1 === n0 && n2 === n1 + 1, '§9 …a person\'s close made after the restore landed is not sent at the leave (the release lost it too: refused as stale, its re-send killed by the reload — no new loss; the reloaded page shows the restored point) — and the flag holds only its two roads: the debounce\'s own save still leaves', { due, atLeave, n0, n1, n2 });
  }
  // …the flag is SET on exactly two roads, READ by ONE predicate asked at its two roads (the leave, the re-arm), never stored
  {
    const SF = read('src/lib/setup-flows.js'), AP = read('src/lib/app.js'), LJ = read('src/lib/layout.js');
    const writes = [SF, AP].map((x) => (x.match(/this\.layoutManager\._restoreReload = true;/g) || []).length), reads = (LJ.match(/_restoreReload/g) || []).length, asks = (LJ.match(/this\._restoreArmed\(\)/g) || []).length;
    ok(J(writes) === J([2, 1]) && reads === 1 && asks === 2 && /if \(res\?\.code === 'store_unsaved'\) \{ own\.over = true; if \(this\.layoutManager\) this\.layoutManager\._restoreReload = true;[^\n]*setTimeout\(\(\) => location\.reload\(\), 4000\);/.test(SF) && /_restoreArmed\(\) \{ return this\._restoreReload === true; \}/.test(LJ) && /rearmSave\(\) \{\n\s*if \(this\._restoreArmed\(\)\) return;/.test(LJ) && /if \(res\?\.success\) \{ own\.over = true; if \(this\.layoutManager\) this\.layoutManager\._restoreReload = true;/.test(SF) && /this\.layoutManager\._restoreReload = true;[^\n]*\n\s*setTimeout\(\(\) => location\.reload\(\), 900\);/.test(AP) && /_flushOnLeave\(why\) \{\n\s*if \(this\._restoreArmed\(\)\) return false;/.test(LJ) && !/localStorage[^\n]*_restoreReload|_restoreReload[^\n]*localStorage/.test(SF + AP + LJ), '§9 …the flag is SET on exactly three roads (setup-flows: its own restore landed · its own restore whose write the storage refused, B-225b\'s second half · app.js: another device\'s broadcast — each just before its reload) and READ by ONE predicate (_restoreArmed) asked at its two roads — _flushOnLeave\'s and rearmSave\'s first lines; never stored', { writes, reads, asks });
  }
  // RED CONTROLS: the pagehide listener taken out ⇒ the save waits for its timer; the gates lowered (the first cut) ⇒ a save mid-restore
  const { LayoutManager: LM0 } = await mutantEsm('src/lib/layout.js', "    if (typeof window !== 'undefined') window.addEventListener?.('pagehide', () => this._flushOnLeave('pagehide'));\n", '');
  const red = await scene(LM0, 'pagehide', { timer: true });
  ok(red.now === 0 && red.after === 1, '§9 CONTROL: without the pagehide listener the save is NOT sent at pagehide (only by the 500 ms timer, after the page is gone) — the first leg goes RED', { now: red.now, after: red.after });
  const { LayoutManager: LM2 } = await mutantEsm('src/lib/layout.js', '    if (this._restoring || dm?._restoring) return false; // no save in the middle of a restore (above)', '    const was = [this._restoring, dm ? dm._restoring : false]; this._restoring = false; if (dm) dm._restoring = false; setTimeout(() => { this._restoring = was[0]; if (dm) dm._restoring = was[1]; }, 0); // the first cut: the gates lowered');
  const red2 = await scene(LM2, 'pagehide', { gate: 'boot' });
  ok(red2.now === 1, '§9 CONTROL: the first cut (the gates lowered for the leave) sends a save in the middle of the restore — the boot-gate leg goes RED', red2.now);
});

await section('§9 B-6352 A DISMISSED RESUME-ALL OFFER HAS A WAY BACK — the REAL LayoutManager: the door in each of its stopped windows\' Resume bar', async () => {
  const scene = async (Lm) => {
    // 个人 holds the three stopped windows the boot offered (Ledger, Tutor, Ops desk) and a fourth stopped one it did not (Colony game)
    const W = world({ records: { 'desk-w': [], 'desk-p': [named(0), named(1), named(2), named(7)], 'desk-r': [] }, active: 'desk-w', Lm });
    const stopped = [0, 1, 2].map((i) => ({ key: 'claude:' + CID(i) + ':', sessionId: 'sess-' + i, cwd: CWD(i), name: NAMES[i], opts: { backend: 'claude', backendSessionId: CID(i) } }));
    const rows = W.app.sidebar._allSessions = [0, 1, 2, 7].map((i) => ({ backend: 'claude', backendSessionId: CID(i), status: 'stopped' }));
    const asked = [], ran = []; let answer = false, boom = false;
    W.lm.askResumeAll = async (q) => { asked.push(q); return answer; };
    W.lm._resumeAll = async (list) => { ran.push(list.map((d) => d.name)); if (boom) throw new Error('the pacer threw'); for (const d of list) rows.find((r) => r.backendSessionId === d.opts.backendSessionId).status = 'live'; return list.length; }; // the paced door (test-resume-all-paced) — here: the list it is handed
    const bar = () => { const b = mkEl('div'); b.isConnected = true; return b; };
    const barA = bar(), barB = bar(), barC = bar();
    const doorA = W.lm.offerDoor(barA, { backend: 'claude', id: CID(0) }), doorB = W.lm.offerDoor(barB, { backend: 'claude', id: CID(1) }); // two of its windows' Resume bars, built at the boot restore
    const doorC = W.lm.offerDoor(barC, { backend: 'claude', id: CID(7) }); // a stopped window of ANOTHER conversation
    doorA.isConnected = doorB.isConnected = doorC.isConnected = true; // …on the page
    const said = (d) => (d && !d.hidden ? d.textContent : null);
    const before = [said(doorA), said(doorB)];
    await W.lm._offerResumeAll(stopped); // the boot offer, dismissed
    const afterNo = [said(doorA), said(doorB), said(doorC)];
    return { W, stopped, rows, asked, ran, doorA, doorB, doorC, barA, said, before, afterNo, setAnswer: (v) => { answer = v; }, setBoom: (v) => { boom = v; } };
  };
  const s = await scene(LM);
  ok(J(s.before) === J([null, null]) && s.barA.children.includes(s.doorA) && s.doorA.className.includes('chat-resume-btn'), '§9 before the offer is answered the bars carry the door HIDDEN (the offer itself is on screen)', s.before);
  ok(s.asked.length === 1 && J(s.afterNo) === J(['Resume all 3', 'Resume all 3', null]), '§9 the boot offer DISMISSED ⇒ the Resume bar of each of ITS windows says «Resume all 3»; a stopped window of another conversation shows no door (its press would resume others) — b06f36e90: nothing, only a reload asked again', s.afterNo);
  s.rows[0].status = 'live'; s.W.lm.paintOfferDoors(); // the person resumed «Ledger» by its own bar; the sidebar's list says it runs (its merge repaints)
  ok(s.said(s.doorB) === 'Resume all 2' && s.said(s.doorA) === null, '§9 …one resumed by its own bar ⇒ the count follows the list: «Resume all 2» (its own bar shows none — it is no longer one of them)', [s.said(s.doorA), s.said(s.doorB)]);
  s.setAnswer(true);
  await s.doorB.onclick();
  ok(s.asked.length === 2 && s.asked[1].confirmText === 'Resume all 2' && /^2 sessions were interrupted/.test(s.asked[1].message) && s.asked[1].title === 'Resume interrupted sessions?', '§9 the door\'s press asks THE SAME question over the ones still stopped («2 sessions were interrupted…», «Resume all 2»)', s.asked[1]);
  ok(J(s.ran) === J([[NAMES[1], NAMES[2]]]), '§9 …and its yes resumes exactly those through the same paced door (_resumeAll)', s.ran);
  s.W.lm.paintOfferDoors();
  ok(J([s.said(s.doorA), s.said(s.doorB)]) === J([null, null]), '§9 …all running again ⇒ the door hides', [s.said(s.doorA), s.said(s.doorB)]);
  // what no longer counts: a window the person closed, a conversation no row lists (deleted); one left is no bulk
  const t1 = await scene(LM);
  t1.W.dm._setRecord('desk-p', { windows: [named(0), named(1), named(7)], grid: null }); t1.W.lm.paintOfferDoors(); // «Ops desk»'s window closed
  const c1 = t1.said(t1.doorA);
  t1.rows.splice(1, 1); t1.W.lm.paintOfferDoors(); // «Tutor»'s conversation deleted: its row is gone
  ok(c1 === 'Resume all 2' && t1.said(t1.doorA) === null, '§9 …a window the person CLOSED no longer counts («Resume all 2»); a conversation no row lists no longer counts either — one left ⇒ no door', { c1, now: t1.said(t1.doorA) });
  const n0 = t1.asked.length; await t1.doorA.onclick();
  ok(t1.asked.length === n0, '§9 …and the press of a door with one left asks nothing');
  const t3 = await scene(LM);
  let release; t3.W.lm.askResumeAll = (q) => { t3.asked.push(q); return new Promise((r) => { release = r; }); };
  const p1 = t3.doorA.onclick(), p2 = t3.doorB.onclick();
  await tick(5); const open = t3.asked.length; release(false); await p1; await p2;
  ok(open === 2 && t3.said(t3.doorA) === 'Resume all 3', '§9 …two presses while its question is open ask ONE question; dismissed again, the door stays', { open });
  t3.doorA.isConnected = false; t3.W.lm.paintOfferDoors({ judge: true }); // the sidebar's merge
  ok(!t3.W.lm._offerDoors.has(t3.doorA) && t3.W.lm._offerDoors.has(t3.doorB), '§9 …a door whose bar left the page is forgotten');
  const never = async (Lm) => { const t = await scene(Lm); const b = mkEl('div'); const d = t.W.lm.offerDoor(b, { backend: 'claude', id: CID(2) }); d.isConnected = false; const one = t.W.lm._offerDoors.has(d); t.W.lm.paintOfferDoors({ judge: true }); const two = t.W.lm._offerDoors.has(d); t.W.lm.paintOfferDoors({ judge: true }); return { one, two, three: t.W.lm._offerDoors.has(d) }; }; // its bar never on the page (the window closed before the sidebar's merges)
  const nv = await never(LM);
  ok(nv.one && nv.two && !nv.three, '§9 …a door whose bar NEVER stood on the page is dropped at the second of the sidebar\'s repaints that find it off the page — never at its own birth, never by another door\'s (the cure of the batch-4 verdict: it stayed for the page\'s life)', nv);
  const { LayoutManager: LMd } = await mutantEsm('src/lib/layout.js', '{ if (b._shown || b._seenOff) { this._offerDoors.delete(b); continue; }', '{ if (b._shown) { this._offerDoors.delete(b); continue; }'); // stale-pins: kept — the control writes the first cut's rule back on purpose
  ok((await never(LMd)).three === true, '§9 CONTROL: the first cut (only a door seen on the page is dropped) keeps it — the leg above goes RED');
  // cure 2 (the cure's verdict): only the sidebar's merges judge — an offer's own repaints (kept, pressed) never drop a door whose bar is detached
  const detached = async (Lm) => { const t = await scene(Lm); const b = mkEl('div'); const d = t.W.lm.offerDoor(b, { backend: 'claude', id: CID(2) }); d.isConnected = false; t.W.lm._keepOffer(t.stopped); t.W.lm._keepOffer(t.stopped); return t.W.lm._offerDoors.has(d); };
  ok((await detached(LM)) === true, '§9 …an offer\'s own repaints (kept twice) never drop a door whose bar is detached — only the sidebar\'s merges judge (cure 2)');
  const { LayoutManager: LMj } = await mutantEsm('src/lib/layout.js', '      else if (judge) { if (b._shown || b._seenOff)', '      else { if (b._shown || b._seenOff)');
  ok((await detached(LMj)) === false, '§9 CONTROL: every paint judging (the cure\'s first form) drops it after two offer repaints — the leg above goes RED');
  const t4 = await scene(LM); t4.setAnswer(true); t4.setBoom(true);
  let threw = false; try { await t4.doorA.onclick(); } catch { threw = true; }
  ok(threw && t4.said(t4.doorA) === 'Resume all 3', '§9 …a bulk resume that THROWS gives the door back (the list kept in a finally)', { threw, now: t4.said(t4.doorA) });
  // the wiring: chat-view's Resume bar hands its bar and its conversation; the sidebar's merge repaints; the two-button bar keeps the note on its own line
  ok(/bar\.append\(note, btn\);\n\s+this\.app\?\.layoutManager\?\.offerDoor\?\.\(bar, \{ backend: spec\.backend, id: spec\.backendSessionId \}\);/.test(read('src/lib/chat-view.js')) && /_mergeAndRender\(\) \{\n\s+this\._merge\(\);\n\s+this\.app\?\.layoutManager\?\.paintOfferDoors\?\.\(\{ judge: true \}\);/.test(read('src/lib/sidebar.js')), '§9 …wired: chat-view _showResumeBar hands its bar and conversation to offerDoor; Sidebar _mergeAndRender repaints the count');
  ok(/\.chat-resume-all-btn\[hidden\] \{ display: none; \}/.test(read('public/chat.css')) && /\.chat-resume-bar:has\(\.chat-resume-all-btn:not\(\[hidden\]\)\) \.chat-resume-note \{ flex-basis: 100%; \}/.test(read('public/chat.css')), '§9 …a hidden door takes no room; with two buttons the note keeps its own line (a phone\'s 360 px)');
  // RED CONTROL: the dismissal keeps nothing (b06f36e90's `if (!ok) return;`)
  const { LayoutManager: LM1 } = await mutantEsm('src/lib/layout.js', 'if (!ok) { this._keepOffer(stopped); return; }', 'if (!ok) return;');
  const red = await scene(LM1);
  ok(J(red.afterNo) === J([null, null, null]), '§9 CONTROL: a dismissal that keeps nothing ⇒ no door after it (the second leg goes RED)', red.afterNo);
});

await section('§9 B-54d9 the r4 nits — ONE wait per switcher row (N3); the door\'s search says what the status filter hides (N5)', async () => {
  // N3 — the REAL _buildWindowItem: a nameless tile's ✕ cancelled three times, and the switcher opened again, leave ONE live wait on
  // the window — its close redraws the list once (each live wait is one redraw)
  const rows3 = async (MobileNav, { reopen = false } = {}) => {
    const rec = NAMES.map((_, i) => (i < 4 ? answered(i) : bare(i)));
    const W = world({ records: { 'desk-w': [], 'desk-p': rec, 'desk-r': [] }, active: 'desk-p' });
    await W.lm.restoreState({ windows: rec });
    W.lm.confirmRemovePlaceholder = async () => false; // the person cancels each time
    const win = W.wins.get('win-new-4');
    let redraws = 0;
    const build = () => MobileNav.prototype._buildWindowItem.call({ app: W.app }, win, W.app.wm, () => {}, () => { redraws++; });
    const item = build();
    for (let i = 0; i < 3; i++) { item.children.at(-1).onclick({ stopPropagation() {} }); await tick(2); }
    if (reopen) { const again = build(); again.children.at(-1).onclick({ stopPropagation() {} }); await tick(2); } // the list opened again, its ✕ cancelled
    const kept = W.wins.has('win-new-4');
    W.app.wm.closeWindow('win-new-4'); await tick(10); // it closes another way (another page, the group's question)
    return { kept, redraws };
  };
  const { MobileNav } = await import(pathToFileURL(path.join(LIB, 'mobile-nav.js')).href);
  const n3 = await rows3(MobileNav), n3b = await rows3(MobileNav, { reopen: true });
  ok(n3.kept && n3.redraws === 1 && n3b.redraws === 1, '§9 N3 three cancelled ✕ on a tile that asks first — and the switcher opened again — leave ONE wait on the window: its close redraws once (r4: one wait per press)', { n3, n3b });
  const { MobileNav: MN0 } = await mutantEsm('src/lib/mobile-nav.js', "else { win._switcherWait?.abort?.(); const wait = win._switcherWait = new AbortController(); win._listenerCtl?.signal?.addEventListener?.('abort', () => setTimeout(() => rerender?.(), 0), { once: true, signal: wait.signal }); } };", "else win._listenerCtl?.signal?.addEventListener?.('abort', () => setTimeout(() => rerender?.(), 0), { once: true }); };");
  const n3red = await rows3(MN0, { reopen: true });
  ok(n3red.redraws === 4, '§9 N3 CONTROL: the r4 line ⇒ four waits, four redraws (the leg above goes RED)', n3red);
  // N5 — the REAL Sidebar: showSessionsNamed + _renderInner over a list the person narrowed to Live
  const hintOf = async (SidebarCls, filter, query = null, view = undefined, archived = [], { press = false } = {}) => {
    const input = { value: '' };
    const gid = document.getElementById; document.getElementById = (id) => (id === 'session-filter' ? input : gid(id));
    try {
      const now = Date.now(), VAN = NAMES[5];
      const rows = [{ sessionId: 'cw-13', status: 'live', name: VAN, cwd: '/srv/u/van', startedAt: now - 60e3 }, { sessionId: 'old-2', status: 'stopped', name: VAN, cwd: '/srv/u/van', startedAt: now - 7200e3 }, { sessionId: 'old-3', status: 'stopped', name: VAN + ' (2)', cwd: '/srv/u/van', startedAt: now - 9200e3 }, { sessionId: 'old-1', status: 'stopped', name: 'Other thing', cwd: '/srv/u/other', startedAt: now - 3600e3 }];
      const rowsAppended = [];
      const sb = Object.assign(Object.create(SidebarCls.prototype), {
        _activeTab: 'tasks', _statusFilter: new Set(filter), _activeView: null, _allSessions: rows, _backendFilter: new Set(), _hostFilter: new Set(), _agentKindFilter: null, _mobileMode: false,
        isArchived: (x) => archived.includes(x.sessionId), el: { classList: { toggle() {} } }, _hostsData: null, handed: null,
        _appendKindHint() {}, _ensureHostsData() {}, _wbHealHostSelections() {}, _renderServiceHintRows() {}, _updateTabs() {}, toggle() {}, _renderQuickTabs() {},
        _render() { rowsAppended.length = 0; SidebarCls.prototype._renderInner.call(this); },
        // as the REAL one (sidebar-workbench.js, pinned below): the list wiped, then its hints drawn again
        _renderWorkbench(list) { this.handed = list.map((x) => x.sessionId); rowsAppended.length = 0; this._appendKindHint?.(); this._appendStatusHint?.(); },
      });
      sb.listEl = { insertAdjacentHTML() {}, appendChild: (c) => { rowsAppended.push(c); return c; }, querySelectorAll: () => [] };
      sb.showSessionsNamed(VAN);
      const first = rowsAppended.filter((c) => /sidebar-status-hint/.test(c.className)).map((c) => c.textContent);
      if (press) { // the person presses the archived line's door (cure 3)
        const door = rowsAppended.filter((c) => /sidebar-status-hint/.test(c.className)).flatMap((c) => c.children).find((b) => b && b.tagName === 'BUTTON');
        if (!door) return { handed: sb.handed, first, door: null, filter: [...sb._statusFilter] };
        const label = door.textContent; door.onclick();
        return { handed: sb.handed, first, door: label, after: rowsAppended.filter((c) => /sidebar-status-hint/.test(c.className)).map((c) => c.textContent), filter: [...sb._statusFilter] };
      }
      let later = null;
      if (view !== undefined) sb._activeView = view; // the person picks a quick view (LIVE / STOP…) after the door
      if (query != null || view !== undefined) { if (query != null) input.value = query; sb._render(); later = rowsAppended.filter((c) => /sidebar-status-hint/.test(c.className)).map((c) => c.textContent); }
      return { handed: sb.handed, first, later, filter: [...sb._statusFilter] };
    } finally { document.getElementById = gid; }
  };
  const { Sidebar } = await import(pathToFileURL(path.join(LIB, 'sidebar.js')).href);
  const live = await hintOf(Sidebar, ['live'], 'van');
  ok(J(live.handed) === J(['cw-13']) && J(live.first) === J(['2 more matches are hidden by your status filter.']) && J(live.filter) === J(['live']), '§9 N5 the tile door\'s search on a list the person narrowed to Live: the running row shown, and ONE line «2 more matches are hidden by your status filter.» — the filter stays theirs (r4: hidden without a word)', live);
  ok(J(live.later) === J([]), '§9 N5 …the person types another search ⇒ the line goes (it speaks for the door\'s search only)', live.later);
  const all = await hintOf(Sidebar, ['live', 'tmux', 'external', 'stopped']);
  ok(J(all.first) === J([]) && all.handed.length === 3, '§9 N5 …nothing hidden ⇒ no line', all);
  const one = await hintOf(Sidebar, ['live', 'tmux', 'external']);
  ok(J(one.first) === J(['2 more matches are hidden by your status filter.']), '§9 N5 …the same count with Stopped alone left out', one.first);
  const ar = await hintOf(Sidebar, ['live', 'tmux', 'external', 'stopped'], null, undefined, ['old-3']);
  const ar2 = await hintOf(Sidebar, ['live'], null, undefined, ['old-3']);
  ok(J(ar.first) === J(['1 more match is archived. Show archived']) && J(ar2.first) === J(['1 more match is hidden by your status filter.', '1 more match is archived. Show archived']), '§9 N5 …an ARCHIVED match is said as archived (the default filter hides Archived — the person narrowed nothing), its own line beside the filter\'s (the cure of the batch-4 verdict)', { ar: ar.first, ar2: ar2.first });
  ok(['1 more match is archived.', '{n} more matches are archived.', 'Show archived'].every((k) => read('src/lib/i18n-zh.js').includes(J(k) + ': "') && read('src/lib/i18n-ja.js').includes(J(k) + ': "')), '§9 N5 …the archived words (and the door\'s) have a zh AND a ja entry');
  // THE ARCHIVED LINE CARRIES ITS DOOR (cure 3 — the cure-2 verdict: the line named no way to the rows): «Show archived», Locate's own act
  const pr = await hintOf(Sidebar, ['live', 'tmux', 'external', 'stopped'], null, undefined, ['old-3'], { press: true });
  ok(pr.door === 'Show archived' && pr.filter.includes('archived') && pr.handed.includes('old-3') && J(pr.after) === J([]), '§9 N5 …the archived line\'s door «Show archived» turns Archived on in the person\'s status filter (Locate\'s own writes): the archived match is listed and the line goes', pr);
  const { Sidebar: SBd } = await mutantEsm('src/lib/sidebar.js', ", { label: tr('Show archived'), why: 'archived' }); // the default filter hides Archived", '); // the default filter hides Archived');
  const pr0 = await hintOf(SBd, ['live', 'tmux', 'external', 'stopped'], null, undefined, ['old-3'], { press: true });
  ok(pr0.door === null && !pr0.filter.includes('archived'), '§9 N5 CONTROL: the line without its door (the cure-2 line) ⇒ nothing to press, the archived match stays out of reach (the door leg goes RED)', pr0);
  const { Sidebar: SBa } = await mutantEsm('src/lib/sidebar.js', '    this._statusHid = door ? searched - statusLeft - archivedHid : 0;', '    this._statusHid = door ? searched - statusLeft : 0;');
  ok(J((await hintOf(SBa, ['live', 'tmux', 'external', 'stopped'], null, undefined, ['old-3'])).first) === J(['1 more match is hidden by your status filter.', '1 more match is archived. Show archived']), '§9 N5 CONTROL: the first cut\'s count (archived inside the filter\'s) blames the person\'s filter for an archived match — the archived leg goes RED');
  const qv = await hintOf(Sidebar, ['live', 'tmux', 'external', 'stopped'], null, 'live');
  ok(J(qv.later) === J([]), '§9 N5 …rows a QUICK VIEW (LIVE) hides are not worded as the status filter\'s', qv.later);
  ok(/this\.listEl\.innerHTML = '';[\s\S]{0,400}this\._appendKindHint\?\.\(\);[^\n]*\n\s*this\._appendStatusHint\?\.\(\);/.test(read('src/lib/sidebar-workbench.js')) && /this\.listEl\.innerHTML = '';\n\s*this\._appendKindHint\?\.\(\);\n\s*this\._appendStatusHint\?\.\(\);/.test(read('src/lib/sidebar-column.js')), '§9 N5 …the two renders that WIPE the list (the workbench, the column list) draw the line again after the wipe (the adversarial read: drawn once in _renderInner, it was wiped)');
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  ok(['1 more match is hidden by your status filter.', '{n} more matches are hidden by your status filter.'].every((k) => zh.includes(J(k) + ': "') && ja.includes(J(k) + ': "')), '§9 N5 …both words have a zh AND a ja entry');
  const { Sidebar: SB0 } = await mutantEsm('src/lib/sidebar.js', '    this._statusHid = door ? searched - statusLeft - archivedHid : 0;', '    this._statusHid = 0;');
  const red = await hintOf(SB0, ['live']);
  ok(J(red.first) === J([]), '§9 N5 CONTROL: the line taken out ⇒ the narrowed list says nothing (the first N5 leg goes RED)', red.first);
  // N1 + N2 live in the heavy chrome suite (test-layout-placeholder-ui): the second tile's shot no longer stands in for the first;
  // the scratch hub keeps its worktree's own data/bin
  const PU = read('scripts/test-layout-placeholder-ui.mjs');
  ok(PU.indexOf("await P1.shot('dialog-zh')") >= 0 && PU.indexOf("await P1.shot('dialog-zh')") < PU.indexOf("await P1.shot('dialog-second-tile-zh')") && !/execFileSync\('cp', \['-r', path\.join\(repo, 'data', 'bin'\)/.test(PU) && /if \(e !== 'bin'\) fs\.rmSync\(path\.join\(wt, 'data', e\)/.test(PU), '§9 N1/N2 (pins on the heavy chrome suite): «dialog-zh» is shot BEFORE the second tile\'s press; the scratch data/ is wiped except its own data/bin (never copied from the caller\'s tree)');
});

await section('§5 CONTROL — the server\'s keepNames taken out of the handler', async () => {
  const H = hub(loadHandler({ keepNames: ({ next }) => ({ windows: next, carried: [], withheld: [] }) }), DOC(P_BEFORE()));
  const S = H.connect();
  await S.send(W0());
  const n = H.layouts().desktops['desk-p'].autoSave.windows.filter((w) => !isNamed(w)).length;
  ok(n === 7, `§5 without keepNames the 09:18:22 write is stored with seven nameless windows (§1 can go RED: ${n})`);
  ok(/\{ name: 'test-layout-stopped-window', tier: 'fast'/.test(read('scripts/ci.mjs')), '§5 ci.mjs carries test-layout-stopped-window in the fast tier');
});

// B-7e49 (s1126): the cooldown row's RED — it runs after the mutant helpers it builds the copy with (§2 runs before them)
await section('§2 CONTROL (B-7e49): the apply\'s cooldown taken out of a copy — the cooldown row goes RED', async () => {
  const { LayoutManager: LMn } = await mutantEsm('src/lib/layout.js', 'setTimeout(() => { this._restoring = false; }, 1000);', 'this._restoring = false;');
  const W = world({ records: { 'desk-w': [], 'desk-p': [], 'desk-r': [] }, active: 'desk-p', Lm: LMn });
  const s0 = timerSeq;
  W.lm._applyRemoteState({ windows: [bare(6)] }, { writer: 'desktop' });
  const held = W.lm._restoring === true, armed = [...timers.values()].filter((t) => t.seq > s0).map((t) => t.ms);
  ok(!held && !armed.includes(1000), `§2 CONTROL: a copy whose apply clears its gate at once (no cooldown) — the gate is OPEN right after the apply and no 1000 ms timer is armed (${armed.join(' / ') || 'none'}): the cooldown row's «held» and «its own 1000 ms timer» go RED on it`, { held, armed });
});

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
