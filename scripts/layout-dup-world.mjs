// THE HARNESS of userW inc-mw1ogdno-5jny's two suites (test-layout-dup-storm — fast; test-layout-dup-storm-loop — the real page's
// clock): a fake DOM wide enough for the client modules (every element kept: the toasts are counted from them), the incident's
// shape (scripts/fixtures/layout-dup-triple.json), the REAL ws-handler on a fake wss with layouts in memory, the REAL
// DesktopManager + LayoutManager over a fake app wired to that handler (or to a fake server), the REAL session-lifecycle's
// attachSession (an esbuild bundle, its imports stubbed — test-layout-stopped-window's loader). NOT a test-*.mjs on purpose
// (like scratch.mjs / mutant-copy.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
export const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const LIB = path.join(REPO, 'src/lib');
export const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
export const J = JSON.stringify;
export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
export const REAL = { log: console.log, warn: console.warn };

// ── a fake DOM just wide enough for the client modules; every element made is kept (the toasts are counted from them) ──
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
export const made = [];
export const mkEl = (tag = 'div') => {
  const el = { tagName: String(tag).toUpperCase(), style: {}, dataset: {}, children: [], className: '', title: '', _text: '', parent: null, onclick: null,
    classList: { add(c) { el.className += ' ' + c; }, remove() {}, toggle() {}, contains: () => false },
    append(...c) { for (const x of c) { if (x && typeof x === 'object') x.parent = el; el.children.push(x); } }, appendChild(c) { el.append(c); return c; }, prepend(...c) { el.append(...c); },
    remove() { if (el.parent) el.parent.children = el.parent.children.filter((x) => x !== el); el.removed = true; },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [], contains: (x) => { for (let n = x; n; n = n.parent) if (n === el) return true; return false; }, insertBefore(c) { el.append(c); return c; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }) };
  Object.defineProperty(el, 'textContent', { get: () => el._text + el.children.map((c) => (c && c.textContent) || '').join(''), set: (v) => { el._text = String(v); el.children = []; } });
  Object.defineProperty(el, 'innerHTML', { get: () => '', set: () => { el.children = []; } });
  Object.defineProperty(el, 'firstChild', { get: () => el.children[0] });
  made.push(el);
  return el;
};
const docListeners = []; // the document's listeners (r3): a person's key / pointer press reaches every page's (press)
globalThis.document = { createElement: mkEl, createElementNS: (ns, t) => mkEl(t), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: mkEl('body'), documentElement: { style: { getPropertyValue: () => '', setProperty() {}, removeProperty() {} }, classList: { add() {}, remove() {} } }, addEventListener: (ev, fn) => { docListeners.push([ev, fn]); }, removeEventListener() {}, hidden: false };
/** a person's press (r3 H): `ev` dispatched to the document's listeners — every page in the process hears it (one person, one keyboard) */
export const press = (ev = 'keydown', target = null) => { for (const [e, fn] of docListeners) if (e === ev) fn({ type: ev, isTrusted: true, target }); }; // `target`: where (r6 Q — an act inside a window keeps its front mark)
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
globalThis.innerWidth = 1600; globalThis.innerHeight = 1000;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
/** the warn toasts made since `from` (an index into `made`) — showToast's element, by its class */
export const toasts = (from = 0) => made.slice(from).filter((e) => /^global-toast global-toast-/.test(e.className));
export const toastText = (e) => (e.children.find((c) => c.className === 'global-toast-body') || {}).textContent || '';

// ── the measured SHAPE, invented words ──
export const S = 'sess-7-41000', T = 'sess-9-41000';
export const CID = 'a71a5000-0000-4000-8000-000000000007';
export const GB = (i) => ({ left: (i % 3) / 3, top: Math.floor(i / 3) / 2, width: 1 / 3, height: 0.5 });
export const chat = (id, sid, i, o = {}) => ({ winId: id, title: 'Atlas notes — /srv/u/atlas', type: 'chat', isMinimized: false, isMaximized: false, gridBounds: GB(i), zIndex: 100 + i,
  openSpec: { action: 'attachSession', serverId: sid, name: 'Atlas notes', cwd: '/srv/u/atlas', mode: 'chat', backend: 'claude', backendSessionId: sid === S ? CID : 'b' + CID.slice(1), hostId: null },
  serverSessionId: sid, backend: 'claude', backendSessionId: sid === S ? CID : 'b' + CID.slice(1), cwd: '/srv/u/atlas', ...o });
export const files = (id, i) => ({ winId: id, title: id + '.md', type: 'viewer', isMinimized: false, isMaximized: false, gridBounds: GB(i), zIndex: 10 + i, openSpec: { action: 'openFile', path: '/srv/u/' + id + '.md' }, filePath: '/srv/u/' + id + '.md', fileName: id + '.md' });
export const DESKS = [{ id: 'desk-x', name: 'Desk X' }, { id: 'desk-y', name: 'Desk Y' }, { id: 'desk-v', name: 'Desk V' }];
/** THE TRIPLE (scripts/fixtures/layout-dup-triple.json — the incident's three records, anonymized: ids and words invented, the
 *  structure kept): S under three desktops' records (three window ids); V holds five windows (the journal's «5 → 4») */
const FIXTURE = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/layout-dup-triple.json'), 'utf8'));
export const TRIPLE = () => Object.fromEntries(Object.entries(JSON.parse(J(FIXTURE.desktops))).map(([d, v]) => [d, v.autoSave.windows]));
/** ONE entry: S listed on V only (the census's start — the page boots on X) */
export const SINGLE = () => ({ 'desk-x': [files('x-1', 1), files('x-2', 2)], 'desk-y': [files('y-1', 0), files('y-2', 2)], 'desk-v': [files('v-1', 0), chat('win-v-s', S, 2)] });
export const DOC = (recs) => ({ desktopMeta: DESKS.map((d) => ({ ...d })), current: null, saved: {}, customGrids: [], desktops: Object.fromEntries(Object.entries(recs).map(([d, ws]) => [d, { autoSave: { windows: ws, grid: null, updatedAt: 1000 } }])) });
export const ids = (l) => (l || []).map((w) => w && (w.winId || w.id));
/** the distinct window ids listing S across the records (a move lists ONE id on two records for an instant — one window, never a copy) */
export const sessionIds = (doc, sid = S) => [...new Set(sessionEntries(doc, sid).map((e) => e.split(':')[1]))];
export const sessionEntries = (doc, sid = S) => Object.entries(doc.desktops || {}).flatMap(([d, v]) => ((v && v.autoSave && v.autoSave.windows) || []).filter((w) => w && (w.serverSessionId === sid || (w.openSpec && w.openSpec.serverId === sid))).map((w) => d + ':' + (w.winId || w.id)));

// ── the REAL ws-handler on a fake wss (test-desktop-record's harness), layouts.json in memory ──
export const WSH_PATH = require.resolve(path.join(REPO, 'src/ws-handler.js'));
export const MODEL = path.join(REPO, 'src/lib/desktop-record.js');
export const loadHandler = (over = {}) => {
  const DR = require(MODEL), saved = {};
  delete require.cache[WSH_PATH];
  for (const [k, v] of Object.entries(over)) { saved[k] = DR[k]; DR[k] = v; }
  try { return require(WSH_PATH); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete DR[k]; else DR[k] = saved[k]; } delete require.cache[WSH_PATH]; }
};
/** `file` (r3): layouts.json ON DISK — a hub built later over the same file is a NEW PROCESS over the same data/ (its memory
 *  empty, its sockets new); `seed` null = the file as it is */
let killDir = null; // the kill case's buffer dir (r5 N: the real end seam runs whole — its file sweeps find nothing here)
const KILL_DIR = () => killDir || (killDir = fs.mkdtempSync(path.join(scratchDir('ldup-kill'), 'b-')));
export function hub(WSH, seed, { alive = [S, T], file = null } = {}) {
  if (file && seed != null) fs.writeFileSync(file, J(seed));
  let layouts = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : JSON.parse(J(seed)), writes = 0, peak = sessionIds(layouts).length; // peak = the most WINDOWS of S (distinct ids) any write left on disk
  const logs = [], tele = [];
  const quietly = async (fn) => { console.warn = (...a) => logs.push(a.map(String).join(' ')); console.log = (...a) => logs.push(a.map(String).join(' ')); try { return await fn(); } finally { console.warn = REAL.warn; console.log = REAL.log; } };
  const sessions = new Map(alive.map((sid) => [sid, { clients: new Map() }])); // each live session's viewers, as the attach case keeps them (`session.clients`)
  const ctx = new Proxy({ telemetry: { record: (e) => tele.push(e) }, activeSessionsPayload: () => [], serverNotice: () => {}, activeSessions: sessions, WS_OPEN: 1, BUFFERS_DIR: KILL_DIR(), broadcastToSession: () => {}, broadcastActiveSessions: () => {}, refreshWebuiPids: () => {}, deleteSessionMeta: () => {}, readLayouts: () => JSON.parse(J(layouts)), writeLayouts: (d) => { writes++; layouts = JSON.parse(J(d)); if (file) fs.writeFileSync(file, J(d)); peak = Math.max(peak, sessionIds(layouts).length); } }, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) });
  const on = {};
  const wss = { _heartbeatTimer: true, clients: new Set(), on: (ev, fn) => { on[ev] = fn; } };
  WSH.registerWsHandler(wss, ctx);
  const connect = (reply = null) => {
    const h = {}, frames = [];
    const sock = { readyState: 1, send: (s) => { const f = JSON.parse(s); frames.push(f); if (reply) setTimeout(() => reply(f), 1); }, on: (ev, fn) => { h[ev] = fn; } };
    wss.clients.add(sock); console.warn = () => {}; try { on.connection(sock); } finally { console.warn = REAL.warn; }
    return { frames, sock, send: (m) => quietly(() => h.message(J(m))), close: () => { console.warn = (...a) => logs.push(a.map(String).join(' ')); console.log = (...a) => logs.push(a.map(String).join(' ')); try { h.close?.(); } finally { console.warn = REAL.warn; console.log = REAL.log; } } }; // synchronous: the caller's next line logs as itself
  };
  /** the attach case's effect (src/ws-handler.js `session.clients.set(ws, …)`): this socket now shows session `sid` */
  const attach = (S0, sid) => { const s = sessions.get(sid); if (s && S0 && S0.sock) s.clients.set(S0.sock, {}); };
  // a socket that CLOSES (r3): the real close handler runs first (it reads which sessions the socket showed), then the attach
  // bookkeeping the real handler keeps per connection is undone here, and the ws library forgets the socket
  const hangUp = (S0) => { if (!S0 || !S0.sock || S0.sock.readyState === 3) return; S0.sock.readyState = 3; S0.close?.(); wss.clients.delete(S0.sock); for (const [, s] of sessions) s.clients.delete(S0.sock); };
  /** a conversation leaves the hub's live-session set (r5 N — a STOP: its CLI exited, session-stdout's exit path; every page keeps
   *  its window as read-only history — the r4 acceptance's q4 drives exactly this as `end`) */
  const end = (sid) => sessions.delete(sid), stop = end;
  /** a conversation is KILLED (r5 N — THE end seam: the real 'kill' case, endSessionBody, on a socket of its own) */
  const kill = async (sid) => { if (!sessions.has(sid)) sessions.set(sid, { clients: new Map() }); const k = connect(); await k.send({ type: 'kill', sessionId: sid }); await new Promise((r) => setTimeout(r, 20)); hangUp(k); return k.frames.find((f) => f.type === 'killed') || null; };
  /** a hub that ADOPTS late (r5 N — after a restart, R6 pipe sessions / readopted keepers join the live-session set seconds later) */
  const adopt = (sid) => { if (!sessions.has(sid)) sessions.set(sid, { clients: new Map() }); };
  return { connect, attach, hangUp, end, stop, kill, adopt, layouts: () => layouts, writes: () => writes, logs, tele, peak: () => peak };
}
export const refusals = (S0) => S0.frames.filter((f) => f.type === 'layout-sync-refused');
export const acks = (S0) => S0.frames.filter((f) => f.type === 'layout-sync-ack');

// ── the real client classes over a fake app (test-layout-stopped-window's world), the socket wired to a hub or a fake server ──
export const RealDM = (await import(pathToFileURL(path.join(LIB, 'desktop-manager.js')).href)).DesktopManager;
export const RealLM = (await import(pathToFileURL(path.join(LIB, 'layout.js')).href)).LayoutManager;
let minted = 0;
export function world({ records, active = 'desk-x', DM = RealDM, LM = RealLM, H = null, refuseAll = null, extra = {}, attachMs = 500 } = {}) {
  const sent = [], handlers = [], closed = [], ops = [], stateFns = [], queued = [];
  const wins = new Map();
  let dm = null, lm = null, seq = 0, sock = null;
  const mkWin = (id, desk, o = {}) => { if (H && sock && o._openSpec && o._openSpec.action === 'attachSession') H.attach(sock, o._openSpec.serverId); const el = mkEl(); el.style.zIndex = '10'; const w = { id, type: 'viewer', title: id, _desktopId: desk, gridBounds: null, isMinimized: false, isMaximized: false, element: el, content: mkEl(), titleBar: mkEl(), titleSpan: mkEl(), _bornAt: Date.now(), _listenerCtl: new AbortController(), _attached: true, ...o }; wins.set(id, w); return w; };
  // an attach in flight (r7 — ws.js: `_attachInFlight` set at the attach frame, cleared at its answer; `attachesInFlight` prunes
  // entries ≥ 15 s): the window attachSession made answers 'attached' `attachMs` later — only then is it in `sessions`
  const inFlight = new Map();
  const toPage = (f) => { for (const h of handlers) h(f); };
  if (H) sock = H.connect(toPage);
  const app = {
    ws: { onGlobal: (fn) => handlers.push(fn), onStateChange: (fn) => stateFns.push(fn), connected: true, _attachInFlight: inFlight,
      request: (m) => {
        if (!(m && m.type === 'attach' && m.sessionId)) return () => {};
        const sid = String(m.sessionId); inFlight.set(sid, Date.now());
        const tm = setTimeout(() => { inFlight.delete(sid); for (const w of wins.values()) if (w._openSpec && String(w._openSpec.serverId) === sid) w._attached = true; }, attachMs);
        return () => clearTimeout(tm);
      },
      attachesInFlight: (now = Date.now()) => { let n = 0; for (const [sid, t] of inFlight) { if (now - t < 15000) n++; else inFlight.delete(sid); } return n; },
      send: (m) => {
        const c = JSON.parse(J(m)); sent.push(c);
        if (c.type !== 'layout-sync') return;
        if (sock && sock.sock.readyState !== 1) { queued.push(c); return; } // ws.js: a send while down waits in `pending` for the next socket
        if (sock) { sock.send(c); return; }
        const keep = refuseAll ? refuseAll(c) : null; // the fake server's verdict: a record to keep ⇒ refused, nothing ⇒ acked
        if (keep) { setTimeout(() => toPage({ type: 'layout-sync-refused', desktopId: c.desktopId, reason: 'shrink-without-close', unexplained: [], arrived: [], state: keep, sentAt: c.sentAt ?? null }), 2); return; }
        setTimeout(() => toPage({ type: 'layout-sync-ack', desktopId: c.desktopId || null, sentAt: c.sentAt ?? null, seq: ++seq, updatedAt: Date.now() }), 2);
      } },
    settings: { get: () => null, on() {} }, stage: null, isMobile: false,
    wm: { windows: wins, grid: null, zIndex: 100, _restoring: false, activeWindowId: null, setGrid() {}, _reflowWindows() {}, _applyGridBounds() {}, _captureGridBounds(w) { if (!w.gridBounds) w.gridBounds = { left: 0.3, top: 0.3, width: 0.4, height: 0.4 }; }, focusWindow() {}, setWindowHidden(w, r = {}) { if (w && 'desktop' in r) w._hiddenByDesktop = !!r.desktop; },
      toggleMaximize() {}, minimize() {}, restore() {}, _notify() {}, _scheduleOverlapUpdate() {}, syncHiddenViews() {},
      revealWindow: (id, o = {}) => { const w = wins.get(id); ops.push(['reveal', id, !!o.replay]); if (w && w._desktopId !== dm.activeDesktopId) dm.switchTo(w._desktopId); if (w && !o.replay) { if (w._tabChain) w._tabChain.active = w._tabChain.tabs.indexOf(id); app.wm.activeWindowId = id; } return !!w; }, // window.js's rule: the person named it ⇒ its own tab, in front
      createWindow: ({ title, type, syncId, openSpec }) => { const w = mkWin(syncId || ('win-n' + (++minted)), dm.activeDesktopId, { type, title, _openSpec: openSpec, _attached: !(openSpec && openSpec.action === 'attachSession') }); lm.onWindowCreated?.(w); return w; }, // attachSession's window: attaching until its answer
      // tab-group's restoreTabChain (the shown tab = tabs[active]) and _detachFromChain, wide enough for the chain road
      restoreTabChain: (tabs, active = 0, o = {}) => { const chain = { tabs: tabs.map(String), active: Number(active) || 0, layout: o.layout || 'tabs', order: (o.order || tabs).map(String) }; for (const id of chain.tabs) { const w = wins.get(id); if (w) w._tabChain = chain; } ops.push(['chain', chain.tabs.join(','), chain.active]); app.wm.activeWindowId = chain.tabs[chain.active]; return chain; },
      _detachFromChain: (chain, id) => { const i = chain.tabs.indexOf(id); if (i >= 0) chain.tabs.splice(i, 1); const w = wins.get(id); if (w) w._tabChain = null; }, // a window id is unique across pages (the real one is random)
      closeWindow: (id) => { if (!wins.has(id)) return; wins.delete(id); closed.push(id); dm.purgeClosedWindow(id); lm.noteClosed?.(id, null); },
      setTitle(id, t) { const w = wins.get(id); if (w) w.title = t; } },
    themeManager: { current: 'dark', apply() {} }, _fontSize: 14, _fontFamily: 'mono', sidebar: { isOpen: false, _allSessions: [], toggle() {}, getCustomName: () => null },
    updateTaskbar() {}, _checkWelcome() {},
    // the real app's replay of a session window is attachSession's: a session this page already shows builds NOTHING (its shortcut)
    replayOpenSpec: (spec, winId) => {
      if (spec && spec.action === 'attachSession') { if (app.attachSession) return app.attachSession(spec.serverId, spec.name, spec.cwd, { mode: spec.mode, syncId: winId, backend: spec.backend, backendSessionId: spec.backendSessionId }); if ([...wins.values()].some((w) => w._openSpec && w._openSpec.serverId === spec.serverId)) return null; const c = mkWin(winId, dm.activeDesktopId, { type: 'chat', title: spec.name, _openSpec: spec }); lm.onWindowCreated?.(c); return c; }
      const v = mkWin(winId, dm.activeDesktopId, { type: 'viewer', _openSpec: spec }); lm.onWindowCreated?.(v); return v; // the real createWindow tells the layout manager (pending chains reconcile)
    },
    ...extra,
  };
  // `sessions` = the ATTACHED windows (r7 S — the acceptance's edit: the real app fills it at 'attached'; this getter counted every
  // built session window as attached at once, and the open's road through a window still attaching was invisible to the suite)
  Object.defineProperty(app, 'sessions', { get: () => new Map([...wins.values()].filter((w) => w._attached && w._openSpec && w._openSpec.action === 'attachSession').map((w) => [w.id, { sessionId: w._openSpec.serverId, focus() {} }])) });
  lm = new LM(app); app.layoutManager = lm;
  dm = new DM(app); app.desktopManager = dm;
  dm._desktops = DESKS.map((d) => ({ ...d })); dm._activeId = active;
  for (const [d, ws] of Object.entries(records)) { const rec = { windows: ws, grid: null, updatedAt: 1000 }; dm._setRecord(d, rec); dm.noteWire(d, rec); dm.noteStamp(d, 1000); }
  for (const w of records[active] || []) mkWin(w.winId, active, { type: w.type, title: w.title, gridBounds: w.gridBounds, _openSpec: w.openSpec });
  lm._restoring = false; lm._userDirty = true; lm._lastUserInputAt = Date.now();
  const act = () => { lm._userDirty = true; lm._lastUserInputAt = Date.now(); lm.scheduleAutoSave(); }; // a person's input that schedules a save
  const state = (up) => { app.ws.connected = up; for (const fn of stateFns) fn(up); };
  /** the page's socket drops (r3): the hub's close handler runs; the page notices (layout.js's onStateChange(false)) */
  const hangUp = () => { if (!H || !sock) return; H.hangUp(sock); state(false); };
  /** the page comes back on a NEW socket to `H2` (the same hub, or a new process): ws.js's order — the open, the state handlers
   *  (layout.js re-reads /api/layouts 250 ms later), the sends queued while down; every session window it shows re-attaches */
  const reconnect = (H2 = H) => {
    H = H2; sock = H2.connect(toPage);
    for (const w of wins.values()) if (w._openSpec && w._openSpec.action === 'attachSession') H2.attach(sock, w._openSpec.serverId);
    globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(J(H2.layouts())) });
    if (!lm._connects) lm._connects = 1; // the page's first connect was before this world began
    state(true);
    for (const c of queued.splice(0)) sock.send(c);
  };
  return { app, dm, lm, wins, sent, mkWin, handlers, closed, ops, act, hangUp, reconnect, sock: () => sock, syncs: (d) => sent.filter((m) => m.type === 'layout-sync' && (!d || m.desktopId === d)) };
}
/** a switch, settled (the switch holds `_restoring` 1 s; its replay's timers 500 ms) */
export const switchTo = async (W, d) => { await W.dm.switchTo(d); await tick(1150); };


const esbuild = (await import(pathToFileURL(path.join(REPO, 'node_modules/esbuild/lib/main.js')).href)).default;
let lifecycleLoads = 0;
export async function loadLifecycle(src = fs.readFileSync(path.join(LIB, 'session-lifecycle.js'), 'utf8')) {
  const map = {};
  for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';/gm)) { (map[m[2]] = map[m[2]] || new Set()); for (const n of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) map[m[2]].add(n); }
  const special = { t: 'export const t = (s) => s;', stripCwdHostLabel: 'export const stripCwdHostLabel = (c) => c;', attachSlab: "export const attachSlab = () => 'floor';", resumeSpawnPick: "export const resumeSpawnPick = () => ({ value: undefined, origin: 'none' });", uiRow: 'export const uiRow = () => ({});', legacyIdFor: "export const legacyIdFor = (b, id) => ((b || 'claude') === 'claude' ? id : null);", viewIdFor: "export const viewIdFor = (b, id) => 'view-' + id;", terminalOnly: 'export const terminalOnly = () => false;', carriedGeometry: 'export const carriedGeometry = (g) => g;', backendFeatureCaps: 'export const backendFeatureCaps = () => ({});' };
  const STUBS = {};
  for (const [p, names] of Object.entries(map)) STUBS[p] = [...names].map((n) => special[n] || `export const ${n} = function () { return null; };`).join('\n').replace(/export const (ChatView|TerminalSession) = function \(\) \{ return null; \};/g, 'export class $1 {}');
  const r = await esbuild.build({ stdin: { contents: src, resolveDir: LIB, sourcefile: 'session-lifecycle.js', loader: 'js' }, bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
    plugins: [{ name: 'stubs', setup(b) { b.onResolve({ filter: /^\.\.?\// }, (a) => (STUBS[a.path] ? { path: a.path, namespace: 'stub' } : null)); b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' })); } }] });
  const dir = scratchDir('ldup-lifecycle'), f = path.join(dir, `lifecycle-${++lifecycleLoads}.mjs`); // a fresh URL per load: ESM caches by URL (a mutant's bundle under the same name was the real one)
  fs.writeFileSync(f, r.outputFiles[0].text);
  try { return (await import(pathToFileURL(f).href)).installSessionLifecycle; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
/** a page (the real classes + the REAL attachSession) over the hub's CURRENT layouts, booted on `active` */
export function pageOn(H, install, active, { DM = RealDM, LM = RealLM, attachMs = 500 } = {}) {
  class Life {} install(Life);
  const proto = Life.prototype;
  const doc = H.layouts();
  const records = Object.fromEntries(Object.entries(doc.desktops).map(([d, v]) => [d, v.autoSave.windows]));
  const W = world({ records, active, H, DM, LM, attachMs, extra: { _hideWelcome() {}, _buildTitleMeta: () => ({}), _hostLabel: () => '', _closeSidebarOnMobile() {} } });
  for (const k of ['attachSession', '_focusExistingSession', '_focusPendingAttach', '_windowPending']) if (proto[k]) W.app[k] = proto[k].bind(W.app);
  return W;
}
