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

module.exports = { readViewport, captureFrame, watchCopies, copyWatchSource, browserTargets, COPY_TEXT_MAX, READ_MS };
