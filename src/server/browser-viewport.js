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

module.exports = { readViewport, READ_MS };
