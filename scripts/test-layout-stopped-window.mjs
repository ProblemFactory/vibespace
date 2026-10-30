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
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratchDir, scratchHome } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LIB = path.join(REPO, 'src/lib');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const J = JSON.stringify;
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : J(extra)).slice(0, 900) : '')); } return !!c; };
const section = async (title, fn) => { console.log('— ' + title); try { await fn(); } catch (e) { ok(false, title + ' — threw', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); } };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
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
function world({ records, active = 'desk-w', extra = {} } = {}) {
  const sent = [], handlers = [], closed = [], resumed = [], replayed = [];
  const wins = new Map();
  let dm = null, lm = null, seq = 0;
  const mkWin = (id, desk, o = {}) => { const el = mkEl(); el.style.zIndex = '10'; const w = { id, type: 'files', title: id, _desktopId: desk, gridBounds: null, isMinimized: false, isMaximized: false, element: el, content: mkEl(), titleBar: mkEl(), titleSpan: mkEl(), _bornAt: Date.now(), ...o }; wins.set(id, w); return w; };
  const app = {
    ws: { onGlobal: (fn) => handlers.push(fn), onStateChange() {}, connected: true, send: (m) => { const c = JSON.parse(J(m)); sent.push(c); if (c.type === 'layout-sync') setTimeout(() => { for (const h of handlers) h({ type: 'layout-sync-ack', desktopId: c.desktopId || null, sentAt: c.sentAt ?? null, seq: ++seq }); }, 5); }, request: () => () => {}, attachesInFlight: () => 0 },
    settings: { get: () => null, on() {} }, sessions: new Map(), stage: null, isMobile: false,
    wm: { windows: wins, grid: null, zIndex: 100, _restoring: false, activeWindowId: null, setGrid() {}, _reflowWindows() {}, _applyGridBounds() {}, _captureGridBounds(w) { if (!w.gridBounds) w.gridBounds = { left: 0.3, top: 0.3, width: 0.4, height: 0.4 }; }, focusWindow() {}, setWindowHidden(w, r = {}) { if (w && 'desktop' in r) w._hiddenByDesktop = !!r.desktop; },
      toggleMaximize(id) { const w = wins.get(id); if (w) w.isMaximized = !w.isMaximized; }, minimize(id) { const w = wins.get(id); if (w) w.isMinimized = true; }, restore() {}, _notify() {}, _scheduleOverlapUpdate() {}, syncHiddenViews() {},
      createWindow: ({ title, type, syncId }) => mkWin(syncId || ('win-n' + (++seq)), dm.activeDesktopId, { type, title }),
      closeWindow: (id) => { if (!wins.has(id)) return; wins.delete(id); closed.push(id); dm.purgeClosedWindow(id); lm.noteClosed?.(id, null); },
      requestClose(id) { const w = wins.get(id); if (!w) return false; if (typeof w.onCloseRequest === 'function' && w.onCloseRequest() === false) return false; this.closeWindow(id); return true; }, // window.js requestClose's shape
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
  lm = new LM(app); app.layoutManager = lm;
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
  for (const k of ['resumeSession', 'createSession', '_windowPending']) W.app[k] = proto[k].bind(W.app);
  W.app.ws.request = (msg) => { requests.push(msg); return () => {}; };
  W.app.sidebar.getSessionConfig = () => ({}); W.app.sidebar._getSessionTasks = () => [];
  W.app.resumeSession(CID(6), CWD(6), NAMES[6], { backend: 'claude', backendSessionId: CID(6), winBounds: { gridBounds: GB(6), desktopId: 'desk-p', winId: 'win-old-6' } });
  const E = [...W.wins.values()].find((w) => w.type === 'chat');
  ok(!!E && requests.some((m) => m.type === 'create' && m.resumeId === CID(6)) && E._desktopId === 'desk-p', '§1b the resume sent its create (never answered) and its window landed on 个人 (resume placement)', { E: E && E.id, desk: E && E._desktopId, req: requests.map((m) => m.type) });
  const cap = W.lm.captureWin(E, E.id);
  ok(cap && cap.backendSessionId === CID(6) && cap.backend === 'claude' && cap.cwd === CWD(6) && !cap.openSpec, '§1b THE WINDOW KNOWS ITS CONVERSATION FROM BIRTH: captured before its create answers it names the conversation (2.369.363: no identity — the title alone)', cap);
  const held = W.dm._savedStates.get('desk-p').windows;
  ok(held.length === 2 && !held.some((w) => w.winId === 'win-old-6') && held.find((w) => w.winId === E.id)?.backendSessionId === CID(6), '§1b 个人\'s held record: the new window in place of win-old-6, NAMED', held.map((w) => [w.winId, w.backendSessionId || null]));
  await W.lm._doAutoSave();
  const out = W.syncs('desk-p').at(-1);
  ok(out && out.state.windows.every(isNamed) && out.state.windows.some((w) => w.winId === E.id && w.backendSessionId === CID(6)), '§1b the next autosave sends 个人 with every window named (the resumed one by its conversation)', out && out.state.windows.map((w) => [w.winId, w.backendSessionId || null]));
  ok(out && out.evidence.some((e) => e.id === 'win-old-6' && e.why === 'replaced' && e.by === E.id), '§1b …and its evidence says which window replaced which (`by` — the server pairs them)', out && out.evidence);
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
  ok(call && call[0] === CID(1) && call[1] === CWD(1) && call[2] === NAMES[1] && call[3].backendSessionId === CID(1) && call[3].winBounds?.winId === 'win-new-1' && call[3].winBounds?.desktopId === 'desk-p' && W.closed.includes('win-new-1'), '§2 the stopped tile\'s press resumes its conversation in its place (its id, cwd, name, box and desktop); the placeholder closes as the person\'s act', call);
  ok(tileOf(gone[1]).onclick == null, '§2 the unavailable tile itself is no press (nothing names a conversation) — its doors are (§7)');
});

await section('§2 the live record\'s door — a placeholder broadcast live, rebuilt in place, closed with its entry', async () => {
  const W = world({ records: { 'desk-w': [], 'desk-p': [], 'desk-r': [] }, active: 'desk-p' });
  const e6 = bare(6), e7 = { ...named(7), openSpec: undefined, winId: 'win-x-7' };
  W.lm._applyRemoteState({ windows: [e6, e7] }, { writer: 'desktop' });
  ok(W.wins.get('win-new-6')?._placeholderOf && W.wins.get('win-x-7')?._placeholderOf && tileOf(W.wins.get('win-x-7'))?.dataset?.placeholder === 'stopped', '§2 another client\'s record with two spec-less session entries ⇒ two placeholders here (2.369.363: nothing — «no spec = can\'t recreate»)', [...W.wins.keys()]);
  await tick(1100); // the apply's cooldown
  W.lm._applyRemoteState({ windows: [e6, { ...e7, openSpec: { ...named(7).openSpec, serverId: 'sess-77' } }] }, { writer: 'desktop' });
  const w7 = W.wins.get('win-x-7');
  ok(w7 && !w7._placeholderOf && w7._openSpec?.serverId === 'sess-77' && W.replayed.some(([id]) => id === 'win-x-7'), '§2 a newer record whose entry has an openSpec (the resume answered on its page) REBUILDS it in place under the same id', { w7: w7 && { ph: !!w7._placeholderOf, spec: w7._openSpec }, replayed: W.replayed });
  await tick(1100);
  W.lm._applyRemoteState({ windows: [{ ...e7, openSpec: { ...named(7).openSpec, serverId: 'sess-77' } }] }, { writer: 'desktop' });
  ok(!W.wins.has('win-new-6'), '§2 a record without the placeholder\'s entry (the owner closed it elsewhere) closes it here', [...W.wins.keys()]);
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
      syncLocates = mainLocates; early = fs.existsSync(path.join(META, noT + '.json.stopped'));
      await api.stoppedSettled?.(); // the kept metas' transcript answers (off the loop)
    } finally { console.log = REAL.log; console.warn = REAL.warn; CL.store.locate = locate0; }
    ok(syncLocates === 0 && mainLocates === 0, `§3 ③ the boot walks NO transcript store on its loop — 0 harness locates on the main thread (77dc65619: ${2} — one sync projects scan / rollout walk per dead socket; here ${mainLocates})`);
    ok(deleted.includes(withT) && deleted.includes(noT) && !fs.readdirSync(META).some((f) => f.endsWith('.tmp')), '§3 ④ a kept meta\'s live .json goes through the ONE delete road (deleteSessionMeta — its tombstone stops a straggler writer resurrecting it), the stopped copy written tmp + rename (no .tmp left)', { deleted, files: fs.readdirSync(META) });
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
    p.setup({ dataDir: dd, wss: { clients: new Set([{ readyState: 1, send: (s) => heard.push(JSON.parse(s)) }]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
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
  ok(/class="lh-desk" data-id="\$\{escHtml\(e\.id\)\}" data-desk="\$\{escHtml\(n\)\}"/.test(SF) && /body: JSON\.stringify\(\{ desktop: desk \}\)/.test(SF) && /registerMenuItem\(\{ menu: M, parent: 'system', order: 40,[^\n]*Restore a previous layout…/.test(read('src/lib/gear-menu.js')), '§4 the door: ⚙ → System → «Restore a previous layout…» (恢复之前的布局…) lists each point with its desktops — each desktop a button posting { desktop } to its restore');
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
  W.app.sidebar.showStopped = (q) => listCalls.push(q);
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
    p.setup({ dataDir: dd, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
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
      globalThis.__lswShell = () => ({ body, close() {}, raised: false });
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

await section('§7 r3 the session-list door — the REAL Sidebar.showStopped', async () => {
  const { Sidebar } = await import(pathToFileURL(path.join(LIB, 'sidebar.js')).href);
  const input = { value: '' }, calls = [];
  const gid = document.getElementById; document.getElementById = (id) => (id === 'session-filter' ? input : gid(id));
  try {
    const me = { _activeTab: 'tasks', _statusFilter: new Set(['live']), _activeView: null, _updateTabs() { calls.push('tabs'); }, toggle(f) { calls.push('open:' + f); }, _renderQuickTabs() { calls.push('quick'); }, _render() { calls.push('render'); } };
    Sidebar.prototype.showStopped.call(me, NAMES[4]);
    ok(me._activeTab === 'folders' && me._statusFilter.has('stopped') && me._activeView === 'stopped' && input.value === NAMES[4] && calls.includes('open:true') && calls.at(-1) === 'render', '§7 «Open the session list»: the sessions tab, the Stopped view, the search box holding the window\'s name, the list opened (a phone\'s drawer too)', { me: { tab: me._activeTab, view: me._activeView, filter: [...me._statusFilter] }, q: input.value, calls });
    ok(/if \(\(!enabled && !this\._activeView\) \|\| filters\.length <= 1\) return;/.test(read('src/lib/sidebar.js')), '§7 …the narrowed view shows its quick tabs (ALL undoes it) even where the tabs are off');
  } finally { document.getElementById = gid; }
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = ['Its machine “{host}” is not paired with this hub.', 'The record of its conversation is gone from this hub.', 'This window was saved without its conversation, so it cannot be reopened from here.', 'This window was saved without its conversation or its folder, so it cannot be reopened from here.', 'Open the session list', 'Remove this window?', '“{name}” is deleted from this desktop’s layout for good. Only an older rollback point (Restore a previous layout…) still holds it.', 'Selected: the newest point that still names the conversation of “{name}” — press it to restore that desktop as it was then.', 'No rollback point names the conversation of “{name}”.', 'on {host}', 'Remove', 'Restore a previous layout…'];
  ok(keys.every((k) => zh.includes(J(k) + ':') && ja.includes(J(k) + ':')) && zh.includes('"Open the session list": "打开会话列表"') && zh.includes('"Remove": "移除"') && zh.includes('"Restore a previous layout…": "恢复之前的布局…"'), '§7 every word of the tile and the dialog has a zh AND a ja entry (恢复之前的布局… / 打开会话列表 / 移除)', keys.filter((k) => !zh.includes(J(k) + ':') || !ja.includes(J(k) + ':')));
});

await section('§5 CONTROL — the server\'s keepNames taken out of the handler', async () => {
  const H = hub(loadHandler({ keepNames: ({ next }) => ({ windows: next, carried: [], withheld: [] }) }), DOC(P_BEFORE()));
  const S = H.connect();
  await S.send(W0());
  const n = H.layouts().desktops['desk-p'].autoSave.windows.filter((w) => !isNamed(w)).length;
  ok(n === 7, `§5 without keepNames the 09:18:22 write is stored with seven nameless windows (§1 can go RED: ${n})`);
  ok(/\{ name: 'test-layout-stopped-window', tier: 'fast'/.test(read('scripts/ci.mjs')), '§5 ci.mjs carries test-layout-stopped-window in the fast tier');
});

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
