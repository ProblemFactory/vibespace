'use strict';
/**
 * THE PAGE'S OWN VIEWPORT READING — ORCH (lane J, inc-muhgv0fb-9i4u: "接管浏览器
 * 的时候鼠标操作位置不对" — takeover clicks landed at the wrong place).
 *
 * The live view maps a pointer into the page's CSS px (the space CDP Input.*
 * takes). The stream server does not say what that space is: on agent-browser
 * 0.32.0 every frame's metadata and every status carry the CONFIGURED 1280×720
 * (synthesized, timestamp 0), while the page is 1280×577 headless and, headed,
 * whatever the window is (measured 1265×1277, downscaled into a 713×720 JPEG).
 * The only honest reader is the page: CDP `Page.getLayoutMetrics` on the
 * stream's active tab, asked by the SERVER (the raw CDP endpoint never leaves
 * it) — one http GET `/json/list` + one page socket + one command, bounded.
 *
 * `readViewport(cdpUrl, {activeUrl})` → `{ok:true, clientWidth, clientHeight,
 * targetId}` | `{ok:false, error}`; never throws. The PURE half (which target,
 * what the reading means against the picture) is src/browser-stream.js
 * (`pickViewportTarget`, `frameGeometry`).
 * Gate: scripts/test-browser-takeover.mjs (fast — a fake CDP endpoint) +
 * scripts/test-browser-live.mjs ⑤ (heavy — a real chromium).
 * lane S4: `captureFrame` — a FRESH picture of the active tab when the stream
 * sent none after a navigation (scripts/test-browser-fit.mjs, fast — a fake CDP
 * endpoint; scripts/test-browser-live-fit.mjs, heavy — the real rung).
 * lane live-input: `watchCopies` — COPY OUT while the user drives. The user's
 * Ctrl/⌘+C reaches the page as a key (the page copies into the REMOTE clipboard,
 * a web terminal still gets its interrupt); the text it copied is read AT THAT
 * EVENT: a copy/cut listener in an ISOLATED WORLD (`Page.addScriptToEvaluateOnNewDocument`
 * with a per-arm world name + `Page.createIsolatedWorld` for the frames already
 * there) reports the selection through a `Runtime.addBinding` only that world
 * sees — the page's own scripts see neither. Reading at the event keeps the
 * order the stream gives (a selection read beside the stream would race the
 * keys queued before it — measured for text) and covers the page's own "Copy"
 * button (execCommand fires the same event). A password field fires no copy
 * event (Chrome's rule), so nothing of it is ever read. MEASURED on Chromium 151
 * (paragraph, input after Ctrl+A, textarea cut, same-origin iframe, a navigation
 * — the world is re-made on every new document). One persistent page socket per
 * watch; `close()` ends it (the binding and the script die with the session).
 */
const http = require('http');
const { WebSocket } = require('ws');
const S = require('../browser-stream.js');

const READ_MS = 2500;

function hostPortOf(cdpUrl) {
  try { const u = new URL(String(cdpUrl).replace(/^ws(s?):\/\//, 'http$1://')); return { host: u.hostname, port: Number(u.port) || 80 }; } catch { return null; }
}

function getJson(h, pathname, timeoutMs) {
  return new Promise((resolve) => {
    let done = false; const fin = (r) => { if (!done) { done = true; resolve(r); } };
    try {
      const req = http.get({ host: h.host, port: h.port, path: pathname, timeout: timeoutMs }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { if (body.length < 2 * 1024 * 1024) body += c; });
        res.on('end', () => { let j = null; try { j = JSON.parse(body); } catch { j = null; } fin(res.statusCode === 200 && j ? { ok: true, json: j } : { ok: false, error: `${pathname} answered ${res.statusCode}` }); });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (e) => fin({ ok: false, error: e.message }));
    } catch (e) { fin({ ok: false, error: e.message }); }
  });
}

/** One CDP command over a fresh page socket, bounded; the socket is closed either way. */
function pageCommand(wsUrl, method, params, timeoutMs, WebSocketImpl) {
  return new Promise((resolve) => {
    let done = false, ws = null;
    const fin = (r) => { if (done) return; done = true; clearTimeout(timer); try { ws && ws.close(); } catch { /* */ } resolve(r); };
    const timer = setTimeout(() => { try { ws && ws.terminate(); } catch { /* */ } fin({ ok: false, error: `${method} timed out` }); }, timeoutMs);
    try { ws = new WebSocketImpl(wsUrl, { maxPayload: 16 * 1024 * 1024, handshakeTimeout: timeoutMs }); } catch (e) { fin({ ok: false, error: e.message }); return; }
    ws.on('open', () => { try { ws.send(JSON.stringify({ id: 1, method, params: params || {} })); } catch (e) { fin({ ok: false, error: e.message }); } });
    ws.on('message', (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { return; } if (m && m.id === 1) fin(m.error ? { ok: false, error: String(m.error.message || 'cdp error') } : { ok: true, result: m.result || {} }); });
    ws.on('error', (e) => fin({ ok: false, error: e && e.message }));
    ws.on('close', () => fin({ ok: false, error: 'closed before the answer' }));
  });
}

/** Several CDP commands, IN ORDER, over ONE fresh page socket, bounded as a whole; closed either way.
 *  → { ok:true, results:[…] } | { ok:false, error } (the first error ends it). */
function pageCommands(wsUrl, cmds, timeoutMs, WebSocketImpl) {
  return new Promise((resolve) => {
    let done = false, ws = null, i = 0;
    const results = [];
    const fin = (r) => { if (done) return; done = true; clearTimeout(timer); try { ws && ws.close(); } catch { /* */ } resolve(r); };
    const timer = setTimeout(() => { try { ws && ws.terminate(); } catch { /* */ } fin({ ok: false, error: `${(cmds[i] || {}).method || 'cdp'} timed out` }); }, timeoutMs);
    const next = () => { if (i >= cmds.length) { fin({ ok: true, results }); return; } try { ws.send(JSON.stringify({ id: i + 1, method: cmds[i].method, params: cmds[i].params || {} })); } catch (e) { fin({ ok: false, error: e.message }); } };
    try { ws = new WebSocketImpl(wsUrl, { maxPayload: 64 * 1024 * 1024, handshakeTimeout: timeoutMs }); } catch (e) { fin({ ok: false, error: e.message }); return; }
    ws.on('open', next);
    ws.on('message', (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { return; } if (!m || m.id !== i + 1) return; if (m.error) { fin({ ok: false, error: String(m.error.message || 'cdp error') }); return; } results.push(m.result || {}); i++; next(); });
    ws.on('error', (e) => fin({ ok: false, error: e && e.message }));
    ws.on('close', () => fin({ ok: false, error: 'closed before the answer' }));
  });
}

/** The page target a reading / a capture is about (the stream's ACTIVE tab by url). */
async function targetOf(cdpUrl, activeUrl, timeoutMs) {
  const h = hostPortOf(cdpUrl);
  if (!h) return { ok: false, error: 'no CDP endpoint' };
  const list = await getJson(h, '/json/list', timeoutMs);
  if (!list.ok) return { ok: false, error: list.error };
  const t = S.pickViewportTarget(list.json, { activeUrl });
  return t ? { ok: true, target: t } : { ok: false, error: 'the browser has no page target' };
}
const cssSizeOf = (metrics) => {
  const lv = (metrics && (metrics.cssLayoutViewport || metrics.layoutViewport)) || null;
  const cw = lv ? Number(lv.clientWidth) : 0, ch = lv ? Number(lv.clientHeight) : 0;
  return cw > 0 && ch > 0 ? { clientWidth: cw, clientHeight: ch } : null;
};

/**
 * lane S4 (naive study 2 — the blank picture): A FRESH FRAME of the stream's
 * active tab, asked of the PAGE (the screencast only sends on damage — a hash
 * navigation measured 0 frames on 0.38.1): the layout metrics, then ONE
 * `Page.captureScreenshot` (jpeg, of the visible viewport — the same picture the
 * screencast draws), over one page socket, bounded. → `{ok:true, data (base64
 * jpeg), clientWidth, clientHeight, targetId}` | `{ok:false, error}`; never throws.
 */
async function captureFrame(cdpUrl, { activeUrl = '', quality = 80, timeoutMs = READ_MS, WebSocketImpl = WebSocket } = {}) {
  const t = await targetOf(cdpUrl, activeUrl, timeoutMs);
  if (!t.ok) return { ok: false, error: t.error };
  const r = await pageCommands(t.target.webSocketDebuggerUrl, [
    { method: 'Page.getLayoutMetrics' },
    { method: 'Page.captureScreenshot', params: { format: 'jpeg', quality: Math.max(10, Math.min(100, Math.round(Number(quality) || 80))), fromSurface: true, captureBeyondViewport: false } },
  ], timeoutMs, WebSocketImpl);
  if (!r.ok) return { ok: false, error: r.error };
  const size = cssSizeOf(r.results[0]);
  const data = r.results[1] && typeof r.results[1].data === 'string' ? r.results[1].data : '';
  if (!data) return { ok: false, error: 'the page answered no picture' };
  return { ok: true, data, clientWidth: size ? size.clientWidth : 0, clientHeight: size ? size.clientHeight : 0, targetId: t.target.id || null };
}

async function readViewport(cdpUrl, { activeUrl = '', timeoutMs = READ_MS, WebSocketImpl = WebSocket } = {}) {
  const h = hostPortOf(cdpUrl);
  if (!h) return { ok: false, error: 'no CDP endpoint' };
  const list = await getJson(h, '/json/list', timeoutMs);
  if (!list.ok) return { ok: false, error: list.error };
  const t = S.pickViewportTarget(list.json, { activeUrl });
  if (!t) return { ok: false, error: 'the browser has no page target' };
  const r = await pageCommand(t.webSocketDebuggerUrl, 'Page.getLayoutMetrics', {}, timeoutMs, WebSocketImpl);
  if (!r.ok) return { ok: false, error: r.error };
  const lv = r.result.cssLayoutViewport || r.result.layoutViewport || null;
  const cw = lv ? Number(lv.clientWidth) : 0, ch = lv ? Number(lv.clientHeight) : 0;
  if (!(cw > 0) || !(ch > 0)) return { ok: false, error: 'the page answered no layout viewport' };
  return { ok: true, clientWidth: cw, clientHeight: ch, targetId: t.id || null };
}

/** lane live-input: the text a copy/cut may carry back (a page-wide select-all of a long article is still one copy). */
const COPY_TEXT_MAX = 200000;
/** The isolated world's script: one capture listener per kind; the selection of the focused field (never a password),
 *  else the document selection (through same-origin frames); guarded so a world whose binding is gone throws nothing. */
function copyWatchSource(binding) {
  const b = JSON.stringify(String(binding));
  return `(() => { const B = ${b}; if (window[B + '_armed']) return; window[B + '_armed'] = true;
const pick = (doc) => { let el = doc.activeElement; for (let i = 0; el && el.tagName === 'IFRAME' && i < 8; i++) { try { const d = el.contentDocument; if (!d) return null; doc = d; el = d.activeElement; } catch { return null; } }
  let docSel = ''; try { docSel = String(doc.getSelection ? doc.getSelection() : ''); } catch { docSel = ''; }
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) { if (String(el.type || '').toLowerCase() === 'password') return null; const s = el.selectionStart, e = el.selectionEnd; const inField = typeof s === 'number' && typeof e === 'number' ? String(el.value).slice(s, e) : ''; return inField || docSel; }
  return docSel; };
for (const kind of ['copy', 'cut']) document.addEventListener(kind, () => { try { const f = window[B]; if (typeof f !== 'function') return; const text = pick(document); if (text === null) return; f(JSON.stringify({ kind, text: text.slice(0, ${COPY_TEXT_MAX}), length: text.length })); } catch { } }, true); })()`;
}
/**
 * Watch the page target for copies. `onCopy({kind, text, length})` per copy/cut the page performs; `onEnd(why)` once when
 * the socket ends. → Promise<{ok:true, close, targetId}> | {ok:false, error}; never throws.
 */
async function watchCopies(cdpUrl, { targetId = null, activeUrl = '', onCopy = () => {}, onEnd = () => {}, timeoutMs = READ_MS, WebSocketImpl = WebSocket, nonce = null } = {}) {
  const h = hostPortOf(cdpUrl);
  if (!h) return { ok: false, error: 'no CDP endpoint' };
  const list = await getJson(h, '/json/list', timeoutMs);
  if (!list.ok) return { ok: false, error: list.error };
  const t = S.pickViewportTarget(list.json, { activeUrl, targetId });
  if (!t) return { ok: false, error: 'the browser has no page target' };
  const tag = String(nonce || Math.random().toString(36).slice(2, 10)).replace(/[^A-Za-z0-9]/g, '').slice(0, 16) || 'x';
  const binding = '__vsCopy_' + tag, world = 'vs-copy-' + tag;
  return new Promise((resolve) => {
    let ws = null, id = 0, done = false, ended = false;
    const pend = new Map();
    const fin = (r) => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
    const end = (why) => { if (ended) return; ended = true; for (const f of pend.values()) f({ error: { message: why } }); pend.clear(); try { onEnd(why); } catch { /* the caller's */ } };
    const close = () => { try { ws && ws.close(); } catch { /* */ } end('closed'); };
    const timer = setTimeout(() => { try { ws && ws.terminate(); } catch { /* */ } fin({ ok: false, error: 'the copy watch timed out' }); }, timeoutMs);
    const call = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); try { ws.send(JSON.stringify({ id: i, method, params })); } catch (e) { pend.delete(i); res({ error: { message: e.message } }); } });
    try { ws = new WebSocketImpl(t.webSocketDebuggerUrl, { maxPayload: 16 * 1024 * 1024, handshakeTimeout: timeoutMs }); } catch (e) { fin({ ok: false, error: e.message }); return; }
    ws.on('message', (d) => {
      let m = null; try { m = JSON.parse(String(d)); } catch { return; }
      if (m && m.id && pend.has(m.id)) { const f = pend.get(m.id); pend.delete(m.id); f(m); return; }
      if (m && m.method === 'Runtime.bindingCalled' && m.params && m.params.name === binding) {
        let o = null; try { o = JSON.parse(String(m.params.payload || '')); } catch { o = null; }
        if (o && (o.kind === 'copy' || o.kind === 'cut') && typeof o.text === 'string') { try { onCopy({ kind: o.kind, text: o.text.slice(0, COPY_TEXT_MAX), length: Number(o.length) || o.text.length }); } catch { /* the caller's */ } }
      }
    });
    ws.on('error', (e) => { if (!done) fin({ ok: false, error: e && e.message }); end('error'); });
    ws.on('close', () => { if (!done) fin({ ok: false, error: 'closed before the watch was armed' }); end('closed'); });
    ws.on('open', async () => {
      const src = copyWatchSource(binding);
      const steps = [['Runtime.enable'], ['Page.enable'], ['Runtime.addBinding', { name: binding, executionContextName: world }], ['Page.addScriptToEvaluateOnNewDocument', { source: src, worldName: world, runImmediately: true }]];
      for (const [m, p] of steps) { const r = await call(m, p); if (r.error) { try { ws.close(); } catch { /* */ } fin({ ok: false, error: `${m}: ${r.error.message}` }); return; } }
      // the frames already there: an isolated world each, the script evaluated in it (runImmediately covers new documents)
      const tree = await call('Page.getFrameTree');
      const frames = []; const walk = (n) => { if (!n || !n.frame) return; frames.push(n.frame.id); for (const c of n.childFrames || []) walk(c); };
      walk(tree.result && tree.result.frameTree);
      for (const fid of frames) { const w = await call('Page.createIsolatedWorld', { frameId: fid, worldName: world }); if (w.result && w.result.executionContextId) await call('Runtime.evaluate', { expression: src, contextId: w.result.executionContextId }); }
      fin({ ok: true, close, targetId: t.id || null });
    });
  });
}

/**
 * BROWSE YOURSELF (verify r1, H6): every page target of the browser with its OPENER — CDP `Target.getTargets` over the
 * keeper browser's own (browser-level) endpoint, one socket, one command, bounded. The keeper derives the user's own tabs
 * from it (src/browser-human.js humanTabSet: his tab + what it opened). → `{ok:true, targets:[{targetId, type, openerId,
 * url}]}` | `{ok:false, error}`; never throws.
 */
async function browserTargets(cdpUrl, { timeoutMs = READ_MS, WebSocketImpl = WebSocket } = {}) {
  if (!cdpUrl) return { ok: false, error: 'no CDP endpoint' };
  const r = await pageCommand(String(cdpUrl), 'Target.getTargets', {}, timeoutMs, WebSocketImpl);
  if (!r.ok) return { ok: false, error: r.error };
  const infos = r.result && Array.isArray(r.result.targetInfos) ? r.result.targetInfos : [];
  // lane browser-resume: + each page's title (the kept tab list a conversation's browser gives back after it stops)
  return { ok: true, targets: infos.map((t) => ({ targetId: String(t.targetId || ''), type: String(t.type || ''), openerId: t.openerId ? String(t.openerId) : null, url: String(t.url || ''), title: String(t.title || '') })) };
}

/**
 * lane browser-windows (U1): A WINDOW OF ITS OWN — `Target.createTarget` with the PURE `windowCreateParams` (`newWindow:
 * true, focus:false`) over the keeper browser's own (browser-level) endpoint, one socket, one command, bounded; the new
 * tab's window read back (`Browser.getWindowForTarget`) on the same socket so the caller can say where it landed.
 * MEASURED (src/browser-windows.js WINDOWS_PROOF): Chrome names no window in a create — a plain one lands in the last
 * focused window, often another holder's; a new window's tab renders at 60 fps, focused or not.
 * → `{ok:true, targetId, windowId}` | `{ok:false, error}`; never throws.
 */
async function openWindow(cdpUrl, { url = 'about:blank', timeoutMs = READ_MS, WebSocketImpl = WebSocket } = {}) {
  if (!cdpUrl) return { ok: false, error: 'no CDP endpoint' };
  const W = require('../browser-windows.js');
  const c = await pageCommand(String(cdpUrl), 'Target.createTarget', W.windowCreateParams(url), timeoutMs, WebSocketImpl);
  if (!c.ok) return { ok: false, error: c.error };
  const targetId = c.result && typeof c.result.targetId === 'string' ? c.result.targetId : null;
  if (!targetId) return { ok: false, error: 'the browser answered no target id' };
  const w = await pageCommand(String(cdpUrl), 'Browser.getWindowForTarget', { targetId }, timeoutMs, WebSocketImpl);
  return { ok: true, targetId, windowId: w.ok && w.result ? W.windowIdOf(w.result.windowId) : null }; // verify r3 ⑥: the ONE reader of a window id
}
/** The window a target lives in (`Browser.getWindowForTarget`), or null. Bounded, never throws. */
async function windowOf(cdpUrl, targetId, { timeoutMs = READ_MS, WebSocketImpl = WebSocket } = {}) {
  if (!cdpUrl || !targetId) return null;
  const w = await pageCommand(String(cdpUrl), 'Browser.getWindowForTarget', { targetId: String(targetId) }, timeoutMs, WebSocketImpl);
  return w.ok && w.result ? require('../browser-windows.js').windowIdOf(w.result.windowId) : null; // verify r3 ⑥: the ONE reader of a window id
}

/**
 * lane site-reset-windows: NAVIGATE a tab VibeSpace opened, waiting for NOTHING the page does after — `Page.navigate` on the
 * tab's own socket answers at the navigation's commit (the binary's own `tab new <url>` waits for nothing: 0.38.1, lane
 * site-reset verify r2). A server slower than `answerMs` is `pending`: the socket stays open until the answer (≤ `holdMs`), so
 * its close never cuts the navigation. → {ok:true, pending?, errorText?} | {ok:false, code?, error} (no page socket: the
 * caller falls back to the binary's `open`).
 */
function navigateTarget(cdpUrl, targetId, url, { answerMs = READ_MS, holdMs = 30000, WebSocketImpl = WebSocket } = {}) {
  const u = pageUrlOf(cdpUrl, targetId);
  if (!u || !url) return Promise.resolve({ ok: false, code: 'no_page', error: 'no page socket for that tab' });
  return new Promise((resolve) => {
    let told = false, ws = null, wait = null;
    const tell = (r) => { if (!told) { told = true; resolve(r); } };
    const end = () => { clearTimeout(wait); clearTimeout(hold); try { ws && ws.close(); } catch { /* */ } };
    const hold = setTimeout(() => { tell({ ok: false, error: 'Page.navigate timed out' }); try { ws && ws.terminate(); } catch { /* */ } }, Math.max(answerMs, holdMs));
    if (hold.unref) hold.unref();
    try { ws = new WebSocketImpl(u, { maxPayload: 1024 * 1024, handshakeTimeout: answerMs }); } catch (e) { end(); tell({ ok: false, error: e.message }); return; }
    ws.on('open', () => { try { ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: String(url) } })); wait = setTimeout(() => tell({ ok: true, pending: true }), answerMs); } catch (e) { end(); tell({ ok: false, error: e.message }); } });
    ws.on('message', (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { return; } if (!m || m.id !== 1) return; end(); tell(m.error ? { ok: false, error: String(m.error.message || 'cdp error') } : { ok: true, errorText: (m.result && m.result.errorText) || null }); });
    ws.on('error', (e) => { end(); tell({ ok: false, error: e && e.message }); });
    ws.on('close', () => { end(); tell({ ok: false, error: 'closed before the answer' }); });
  });
}
/** The page endpoint of ONE target on the browser `cdpUrl` names (the keeper's own — never a viewer's). */
function pageUrlOf(cdpUrl, targetId) {
  const h = hostPortOf(cdpUrl);
  return h && /^[0-9A-Fa-f]{16,64}$/.test(String(targetId || '')) ? `ws://${h.host}:${h.port}/devtools/page/${String(targetId)}` : null;
}
/** lane browser-windows (U3/U0b): ONE fresh picture of a NAMED tab (`Page.captureScreenshot` — measured fresh on a hidden
 *  tab in ~30 ms), the frame record's shape. → {ok, data, clientWidth, clientHeight, targetId} | {ok:false, error}. */
async function captureTarget(cdpUrl, targetId, { quality = 70, timeoutMs = READ_MS, WebSocketImpl = WebSocket } = {}) {
  const u = pageUrlOf(cdpUrl, targetId);
  if (!u) return { ok: false, error: 'no such tab' };
  const r = await pageCommands(u, [
    { method: 'Page.getLayoutMetrics' },
    { method: 'Page.captureScreenshot', params: { format: 'jpeg', quality: Math.max(10, Math.min(100, Math.round(Number(quality) || 70))), fromSurface: true, captureBeyondViewport: false } },
  ], timeoutMs, WebSocketImpl);
  if (!r.ok) return { ok: false, error: r.error };
  const size = cssSizeOf(r.results[0]);
  const data = r.results[1] && typeof r.results[1].data === 'string' ? r.results[1].data : '';
  return data ? { ok: true, data, clientWidth: size ? size.clientWidth : 0, clientHeight: size ? size.clientHeight : 0, targetId: String(targetId) } : { ok: false, error: 'the page answered no picture' };
}
/** lane browser-windows (U0b): is a NAMED tab painting — `document.visibilityState` asked of the page. → {ok, visibility}. */
async function visibilityOf(cdpUrl, targetId, { timeoutMs = READ_MS, WebSocketImpl = WebSocket } = {}) {
  const u = pageUrlOf(cdpUrl, targetId);
  if (!u) return { ok: false, error: 'no such tab' };
  const r = await pageCommand(u, 'Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }, timeoutMs, WebSocketImpl);
  const v = r.ok && r.result && r.result.result ? r.result.result.value : null;
  return r.ok && typeof v === 'string' ? { ok: true, visibility: v } : { ok: false, error: r.error || 'no answer' };
}
/**
 * lane browser-windows (U3): WATCH A TAB the session is not on — one persistent page socket: the screencast while it paints
 * (measured: a window's foreground tab, focused or not, 60 fps), and once it stayed silent `firstFrameMs` (a background
 * tab paints nothing — measured 0 fps) a capture every `pollMs` (≤ 2 fps) instead, back to the screencast at its first
 * frame. `onFrame({data, metadata})` in the stream's own frame shape, `onMode('screencast'|'polling')`, `onEnd(why)` once.
 * → {ok:true, close} | {ok:false, error}; never throws.
 */
async function watchTarget(cdpUrl, targetId, { onFrame = () => {}, onMode = () => {}, onEnd = () => {}, maxWidth = 1600, maxHeight = 1600, firstFrameMs = 1000, pollMs = 500, timeoutMs = READ_MS, WebSocketImpl = WebSocket } = {}) {
  const u = pageUrlOf(cdpUrl, targetId);
  if (!u) return { ok: false, error: 'no such tab' };
  let ws = null; try { ws = new WebSocketImpl(u, { maxPayload: 64 * 1024 * 1024, handshakeTimeout: timeoutMs }); } catch (e) { return { ok: false, error: e.message }; }
  const opened = await new Promise((resolve) => { const t = setTimeout(() => resolve(false), timeoutMs); ws.once('open', () => { clearTimeout(t); resolve(true); }); ws.once('error', () => { clearTimeout(t); resolve(false); }); });
  if (!opened) { try { ws.terminate(); } catch { /* */ } return { ok: false, error: 'the tab could not be reached' }; }
  let id = 100, ended = false, mode = 'screencast', lastFrameAt = 0, pollTimer = null, busy = false;
  const startedAt = Date.now();
  const waiting = new Map();
  const call = (method, params = {}) => new Promise((resolve) => { const i = ++id; waiting.set(i, resolve); try { ws.send(JSON.stringify({ id: i, method, params })); } catch { waiting.delete(i); resolve({ error: { message: 'closed' } }); } setTimeout(() => { if (waiting.has(i)) { waiting.delete(i); resolve({ error: { message: `${method} timed out` } }); } }, timeoutMs); });
  const end = (why) => { if (ended) return; ended = true; if (pollTimer) clearInterval(pollTimer); try { ws.close(); } catch { /* */ } try { onEnd(why); } catch { /* */ } };
  const setMode = (m) => { if (m === mode) return; mode = m; try { onMode(m); } catch { /* */ } };
  ws.on('message', (d) => {
    let m = null; try { m = JSON.parse(String(d)); } catch { return; }
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    if (m.method === 'Page.screencastFrame' && m.params) {
      try { ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } })); } catch { /* */ }
      lastFrameAt = Date.now(); setMode('screencast');
      try { onFrame({ data: m.params.data, metadata: m.params.metadata || {} }); } catch { /* */ }
    } else if (m.method === 'Inspector.detached' || m.method === 'Inspector.targetCrashed') end('the tab is gone');
  });
  ws.on('close', () => end('the tab is gone'));
  ws.on('error', () => end('the tab is gone'));
  await call('Page.enable');
  const sc = await call('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth, maxHeight, everyNthFrame: 1 });
  if (sc && sc.error) { end('the tab refused a screencast'); return { ok: false, error: String(sc.error.message || 'no screencast') }; }
  const W = require('../browser-windows.js');
  pollTimer = setInterval(async () => {
    if (ended || busy) return;
    const v = W.watchModeVerdict({ framesSeen: lastFrameAt && Date.now() - lastFrameAt < firstFrameMs ? 1 : 0, waitedMs: Date.now() - Math.max(startedAt, lastFrameAt), firstFrameMs });
    if (v.mode !== 'polling') return;
    setMode('polling');
    busy = true;
    const r = await call('Page.captureScreenshot', { format: 'jpeg', quality: 70, fromSurface: true, captureBeyondViewport: false });
    const lm = await call('Page.getLayoutMetrics');
    busy = false;
    const size = cssSizeOf(lm && lm.result);
    if (!ended && r && r.result && typeof r.result.data === 'string') { try { onFrame({ data: r.result.data, metadata: { deviceWidth: size ? size.clientWidth : 0, deviceHeight: size ? size.clientHeight : 0, pageScaleFactor: 1, offsetTop: 0, scrollOffsetX: 0, scrollOffsetY: 0, timestamp: Date.now(), polled: true } }); } catch { /* */ } }
  }, Math.max(100, Math.round(Number(pollMs) || 500)));
  if (pollTimer.unref) pollTimer.unref();
  return { ok: true, close: () => { if (!ended) { try { ws.send(JSON.stringify({ id: ++id, method: 'Page.stopScreencast' })); } catch { /* */ } } end('closed'); }, mode: () => mode };
}

/** Close one target over the browser-level endpoint (a window VibeSpace made that no session could be bound to). */
async function closeTarget(cdpUrl, targetId, { timeoutMs = READ_MS, WebSocketImpl = WebSocket } = {}) {
  if (!cdpUrl || !targetId) return { ok: false, error: 'no target' };
  const r = await pageCommand(String(cdpUrl), 'Target.closeTarget', { targetId: String(targetId) }, timeoutMs, WebSocketImpl);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Several CDP commands over ONE fresh page socket where each step may read the previous answers (`steps[i](results)` →
 *  {method, params} | null to stop), bounded as a whole; closed either way. → {ok:true, results} | {ok:false, error}. */
function pageSteps(wsUrl, steps, timeoutMs, WebSocketImpl) {
  return new Promise((resolve) => {
    let done = false, ws = null, i = 0;
    const results = [];
    const fin = (r) => { if (done) return; done = true; clearTimeout(timer); try { ws && ws.close(); } catch { /* */ } resolve(r); };
    const timer = setTimeout(() => { try { ws && ws.terminate(); } catch { /* */ } fin({ ok: false, error: `${results.length ? 'step ' + (results.length + 1) : 'cdp'} timed out` }); }, timeoutMs);
    const next = () => { if (i >= steps.length) { fin({ ok: true, results }); return; } let c = null; try { c = steps[i](results); } catch (e) { fin({ ok: false, error: e.message }); return; } if (!c) { fin({ ok: true, results }); return; } try { ws.send(JSON.stringify({ id: i + 1, method: c.method, params: c.params || {} })); } catch (e) { fin({ ok: false, error: e.message }); } };
    try { ws = new WebSocketImpl(wsUrl, { maxPayload: 16 * 1024 * 1024, handshakeTimeout: timeoutMs }); } catch (e) { fin({ ok: false, error: e.message }); return; }
    ws.on('open', next);
    ws.on('message', (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { return; } if (!m || m.id !== i + 1) return; if (m.error) { fin({ ok: false, error: String(m.error.message || 'cdp error') }); return; } results.push(m.result || {}); i++; next(); });
    ws.on('error', (e) => fin({ ok: false, error: e && e.message }));
    ws.on('close', () => fin({ ok: false, error: 'closed before the answer' }));
  });
}
/**
 * lane browser-windows (T2 ⑧, ONE WINDOW PER HOLDER): open a LATER tab IN the holder's EXISTING window. CDP names no
 * window in `Target.createTarget` (measured on Chrome 154) and `Target.activateTarget`/`Page.bringToFront` then a plain
 * create is NOT reliable in headless (state-dependent — measure-browser-windows + verify-r1 measure-place vs measure-coloc);
 * the ONE reliable primitive is the opener rule — a page's `window.open` lands in its OPENER's window (measured 100% in
 * headless AND the hidden window). So the keeper opens the new tab by running `window.open('about:blank')` from a page
 * already in the holder's window (`anchorTargetId`), finds the tab Chrome opened (its `openerId` is the anchor), and
 * VERIFIES its window with `Browser.getWindowForTarget`: a tab that landed elsewhere is closed and refused `window_mismatch`
 * (the caller re-anchors or opens one new window). The session is then bound to the tab and navigates itself, exactly as
 * the first-tab path does. → {ok:true, targetId, windowId} | {ok:false, code, error}; never throws.
 *
 * verify r2 (T2 ①, MEASURED on Chrome 154 headless + hidden, scripts under the lane's notes — measure-opener2-r2.mjs): the
 * act runs in an ISOLATED WORLD of the anchor's frame (`Page.createIsolatedWorld`, the native `window.open` — a site that
 * overrides `window.open` HIJACKED the main-world act: its code ran, no tab opened; a strict CSP blocks neither) and with
 * `noopener` (the new page never reaches the anchor through `window.opener`; Chrome still reports `openerId`, so ownership
 * holds — measured). A dialog open on the anchor, a crashed anchor and a navigating one time the act out (the window
 * still answers `getWindowForTarget`): the keeper's next rung is `openTabByActivate`. An anchor CLOSED while the act was
 * in flight leaves the tab with its opener cleared: a new page in the wanted window is then accepted as ours (anchorGone).
 */
const OPENER_WORLD = 'vibespace-opener';
async function openTabInWindow(cdpUrl, { anchorTargetId, windowId = null, timeoutMs = READ_MS, probeMs = require('../browser-windows.js').ANCHOR_PROBE_MS, WebSocketImpl = WebSocket } = {}) {
  const u = pageUrlOf(cdpUrl, anchorTargetId);
  if (!u) return { ok: false, code: 'no_anchor', error: 'no anchor tab in the holder\'s window' };
  const before = await browserTargets(cdpUrl, { timeoutMs, WebSocketImpl });
  const had = new Set(before.ok ? before.targets.map((t) => String(t.targetId).toUpperCase()) : []);
  const anc = String(anchorTargetId).toUpperCase();
  // verify r3 (MEASURED): an anchor holding a dialog, crashed or navigating answers NOTHING — four of them cost the ladder
  // 10 s before rung 2 landed in 150 ms. The anchor is PROBED first on a short budget (a healthy page answers ~5 ms); one that
  // does not answer is `anchor_unresponsive` at once and the ladder moves on
  const W = require('../browser-windows.js');
  const wantWin = W.windowIdOf(windowId); // verify r3 ⑥: the one reader — every comparison below is against a number or null, never Number(null)
  const probe = await pageCommand(u, 'Page.getFrameTree', {}, probeMs, WebSocketImpl);
  if (!probe.ok) return { ok: false, code: /timed out/.test(String(probe.error || '')) ? 'anchor_unresponsive' : 'open_failed', error: /timed out/.test(String(probe.error || '')) ? `the anchor did not answer in ${probeMs} ms (a dialog, a crash, a navigation)` : probe.error };
  const fid = probe.result && probe.result.frameTree && probe.result.frameTree.frame ? probe.result.frameTree.frame.id : null;
  if (!fid) return { ok: false, code: 'open_failed', error: 'the anchor has no frame' };
  const r = await pageSteps(u, [
    () => ({ method: 'Page.createIsolatedWorld', params: { frameId: fid, worldName: OPENER_WORLD } }),
    (rs) => { const ctx = rs[0] && rs[0].executionContextId; return ctx ? { method: 'Runtime.evaluate', params: { expression: "window.open('about:blank', '_blank', 'noopener'); 'ok'", contextId: ctx, userGesture: true, awaitPromise: false, returnByValue: true } } : null; },
  ], timeoutMs, WebSocketImpl);
  if (!r.ok) return { ok: false, code: 'open_failed', error: r.error };
  if (r.results.length < 2) return { ok: false, code: 'open_failed', error: 'the anchor gave no isolated world' };
  let made = null, anchorGone = false;
  for (let i = 0; i < 30 && !made; i++) {
    const now = await browserTargets(cdpUrl, { timeoutMs, WebSocketImpl });
    if (now.ok) {
      anchorGone = !now.targets.some((t) => String(t.targetId).toUpperCase() === anc);
      const fresh = now.targets.filter((t) => String(t.type) === 'page' && !had.has(String(t.targetId).toUpperCase()));
      made = fresh.find((t) => String(t.openerId || '').toUpperCase() === anc) || null;
      // the anchor closed while the act was in flight: Chrome clears the opener of the tab it still opened — a new page in the
      // wanted window with no opener is ours (measured: closed-during ⇒ a tab in the window, openerId gone)
      if (!made && anchorGone && wantWin != null) for (const t of fresh.filter((x) => !x.openerId)) { const w = await windowOf(cdpUrl, t.targetId, { timeoutMs, WebSocketImpl }); if (w != null && w === wantWin) { made = t; break; } }
    }
    if (!made) await _sleep(50);
  }
  if (!made) return { ok: false, code: 'no_new_tab', error: anchorGone ? 'the anchor tab closed before it opened a tab' : 'the page opened no tab (a blocked window.open)' };
  const w = await windowOf(cdpUrl, made.targetId, { timeoutMs, WebSocketImpl });
  if (wantWin != null && w != null && w !== wantWin) {
    try { await closeTarget(cdpUrl, made.targetId, { timeoutMs, WebSocketImpl }); } catch { /* the next start ends it */ }
    return { ok: false, code: 'window_mismatch', error: `the tab opened in window ${w}, not the holder's window ${wantWin}` };
  }
  return { ok: true, targetId: String(made.targetId).toUpperCase(), windowId: w, rung: 'opener' };
}
/**
 * verify r2 T1 — RUNG 2 of a later tab, BROWSER-SIDE (no page script): `Target.activateTarget` of a tab in the holder's
 * window, then a plain `Target.createTarget` (Chrome places it in the last focused window), VERIFIED with
 * `Browser.getWindowForTarget` — elsewhere ⇒ closed + `window_mismatch`, never a stray. MEASURED (Chrome 154, headless +
 * hidden): lands with a dialog open on the anchor, a crashed anchor and a navigating one (4/4 each mode) — the states that
 * time the page act out. The r1 measurement found activate-then-create state-dependent across many windows, which is why
 * it is the SECOND rung and verified, never the first.
 * verify r3 T2 ① (MEASURED, ≥ 30 trials per mode — OPENER_PROOF.rung2Raced / rung2Chain / rung2Breaker): raced by ANOTHER
 * holder's activation the create landed in that holder's window 29/30 (headless) / 20/30 (hidden) and, in headless, kept
 * doing so for good once a stray had been closed there. So: `tries` (RUNG2_TRIES), each after THE WINDOW-STATE CYCLE
 * (`breaker` — the keeper's `rung2Plan`: off on a real display), activate, create with NO gap, verify; a stray is closed
 * at once and COUNTED in `leaks` ({window, livedMs, try}) — the keeper journals and counts them. The keeper runs rung 2
 * under one serial lock per browser (two holders' cycles must not interleave).
 * → {ok:true, targetId, windowId, rung:'activate', tries, leaks} | {ok:false, code, error, leaks, tries}.
 */
async function openTabByActivate(cdpUrl, { anchorTargetId, windowId = null, timeoutMs = READ_MS, WebSocketImpl = WebSocket, tries = require('../browser-windows.js').RUNG2_TRIES, breaker = true } = {}) {
  if (!cdpUrl || !anchorTargetId) return { ok: false, code: 'no_anchor', error: 'no anchor tab in the holder\'s window' };
  const W = require('../browser-windows.js');
  const wantWin = W.windowIdOf(windowId);
  const n = Math.max(1, Math.min(10, Number(tries) || 1));
  const leaks = []; let last = null;
  for (let t = 1; t <= n; t++) {
    // verify r3 T2 ① (MEASURED, Chrome 154): THE WINDOW-STATE CYCLE — in headless the window a plain create lands in follows
    // window-STATE changes only (a lost race + the stray's close left every later activate + create in the OTHER holder's
    // window, for good); `Browser.setWindowBounds` minimized → normal (7 ms) re-establishes this window, and the hidden
    // window needs the cycle AND the activation. Never on a real display (the keeper's plan: the user would see it).
    if (breaker && wantWin != null) {
      const m = await pageCommand(String(cdpUrl), 'Browser.setWindowBounds', { windowId: wantWin, bounds: { windowState: 'minimized' } }, timeoutMs, WebSocketImpl);
      if (m.ok) await pageCommand(String(cdpUrl), 'Browser.setWindowBounds', { windowId: wantWin, bounds: { windowState: 'normal' } }, timeoutMs, WebSocketImpl);
      else return { ok: false, code: 'open_failed', error: `the holder's window ${wantWin} answered no state change (${m.error}) — gone?`, leaks, tries: t };
    }
    const a = await pageCommand(String(cdpUrl), 'Target.activateTarget', { targetId: String(anchorTargetId) }, timeoutMs, WebSocketImpl);
    if (!a.ok) return { ok: false, code: 'open_failed', error: a.error, leaks, tries: t };
    // no gap: the 100 ms between activate and create WAS the exposure (another holder's activation inside it won 29/30)
    const t0 = Date.now();
    // verify r4 T2 ③ (MEASURED 30/30 per mode): a BACKGROUND create — a stray that lost the race never takes the other holder's
    // foreground (a foreground one hid that holder's page and, closed, left its LAST tab in front); the keeper's bind brings the
    // holder's own tab forward in its window; lands as often as the foreground create (W.RUNG2_CREATE)
    const c = await pageCommand(String(cdpUrl), 'Target.createTarget', { ...W.RUNG2_CREATE }, timeoutMs, WebSocketImpl);
    const targetId = c.ok && c.result && typeof c.result.targetId === 'string' ? c.result.targetId : null;
    if (!targetId) return { ok: false, code: 'open_failed', error: c.ok ? 'the browser answered no target id' : c.error, leaks, tries: t };
    const w = await windowOf(cdpUrl, targetId, { timeoutMs, WebSocketImpl });
    if (wantWin == null || (w != null && w === wantWin)) return { ok: true, targetId: String(targetId).toUpperCase(), windowId: w, rung: 'activate', tries: t, leaks };
    // elsewhere — closed AT ONCE (it lived in another holder's window for the read's duration), counted, the next try after the cycle
    try { await closeTarget(cdpUrl, targetId, { timeoutMs, WebSocketImpl }); } catch { /* the next start ends it */ }
    leaks.push({ window: w, livedMs: Date.now() - t0, try: t });
    last = w;
  }
  return { ok: false, code: 'window_mismatch', error: `the tab opened in window ${last == null ? '(unknown)' : last}, not the holder's window ${wantWin} — ${n} tr${n === 1 ? 'y' : 'ies'}, every stray closed at once`, leaks, tries: n };
}

module.exports = { readViewport, captureFrame, watchCopies, copyWatchSource, browserTargets, openWindow, windowOf, closeTarget, openTabInWindow, openTabByActivate, navigateTarget, OPENER_WORLD, captureTarget, visibilityOf, watchTarget, pageUrlOf, COPY_TEXT_MAX, READ_MS };
