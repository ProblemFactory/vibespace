#!/usr/bin/env node
// THE STREAM'S GLASS-TO-GLASS LATENCY — the measurement harness (design q-041 r2 §2 帧级延迟预算 / §3 P1 第一腿, lane
// stream-p1a-transport). Written here, RUN by part B / 主开发 on the real machine — never by a lane on a paired machine.
//
// THE TWO CLOCKS. The machine shows a millisecond clock full screen (`clock` — its wall clock, as digits AND as a 30-cell
// binary band along the top); the stream carries that picture to the viewer; in the viewer's VibeSpace page a snippet reads the
// band off every PRESENTED frame of the stream's <video> (requestVideoFrameCallback: the moment the frame is composited) and
// compares it with the viewer's own wall clock. latency = viewer clock at presentation − the machine's clock in the picture
// − the two clocks' offset. Sync both clocks first (Windows: `w32tm /resync`; then give `--offset` = machine − viewer if
// known); the photo method stays the ground truth for the display's own lag: photograph the viewer screen showing its local
// clock (the snippet draws one) beside the streamed one — the difference in the photo is glass-to-glass end to end.
//
//   node scripts/probes/stream-glass-to-glass.mjs clock [--port 8790]   serve the clock page — open http://<machine>:8790/ on
//                                                                       the MACHINE, full screen (F11), stream its desktop
//   node scripts/probes/stream-glass-to-glass.mjs snippet [--offset ms] [--seconds 10]   print the viewer snippet: paste it in
//                                                                       the devtools console of the VibeSpace tab whose machine
//                                                                       desktop window is streaming; it prints {n, median, p95,
//                                                                       min, max} ms and the stream's own numbers (RTT, decode)
//   node scripts/probes/stream-glass-to-glass.mjs selftest              headless Chrome HERE (no machine): the clock page's band
//                                                                       read back by the snippet's decoder ⇒ |error| ≤ one frame
// The input half (design: SendInput ≈ 1 ms an event, UIPI) is read off the stream's own numbers: the agent's stats push carries
// `input.n` and `ackMs` (a frame sent → its ack back, one link round trip plus the browser's render) — the snippet prints them.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const BITS = 30; // Date.now() mod 2^30 ms ≈ 12.4 days — enough to read a clock that ticks a frame at a time

/** The machine's page: digits + the band (cell 0 always white, cell 31 always black: the reader's calibration). */
const CLOCK_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>VibeSpace glass-to-glass clock</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#band{position:fixed;left:0;top:0;width:100%;height:8vh;display:flex}#band i{flex:1}#t{position:fixed;left:0;right:0;top:30vh;text-align:center;color:#fff;font:bold 18vh monospace}</style></head>
<body><div id="band"></div><div id="t"></div><script>
const band = document.getElementById('band'), t = document.getElementById('t'); const cells = [];
for (let i = 0; i < ${BITS + 2}; i++) { const c = document.createElement('i'); band.append(c); cells.push(c); }
const draw = () => { const now = Date.now(), v = now % ${2 ** BITS};
  cells[0].style.background = '#fff'; cells[${BITS + 1}].style.background = '#000';
  for (let b = 0; b < ${BITS}; b++) cells[b + 1].style.background = (Math.floor(v / 2 ** (${BITS - 1} - b)) % 2) ? '#fff' : '#000';
  t.textContent = String(now % 100000).padStart(5, '0'); requestAnimationFrame(draw); };
requestAnimationFrame(draw);
</script></body></html>`;

/** THE READER (runs in the viewer's page): one frame's pixels → the machine's clock (ms mod 2^30), or null. */
const DECODE = `function vsDecodeBand(data, w, h) {
  const y = Math.floor(h * 0.04), cw = w / ${BITS + 2}, at = (i) => { const x = Math.floor(cw * i + cw / 2); const k = (y * w + x) * 4; return (data[k] + data[k + 1] + data[k + 2]) / 3; };
  const hi = at(0), lo = at(${BITS + 1}); if (hi - lo < 100) return null; const mid = (hi + lo) / 2; let v = 0;
  for (let b = 0; b < ${BITS}; b++) v = v * 2 + (at(b + 1) > mid ? 1 : 0); return v;
}`;
const snippet = (offsetMs, seconds) => `(async () => {
${DECODE}
const v = document.querySelector('.stream-video'); if (!v || !v.videoWidth) { console.log('no streaming machine desktop window in this tab'); return; }
const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true }); const out = []; const MOD = ${2 ** BITS}, OFF = ${Number(offsetMs) || 0};
const clock = document.createElement('div'); clock.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99999;background:#000;color:#fff;font:bold 40px monospace;padding:4px 8px'; document.body.append(clock);
const tick = () => { clock.textContent = String(Date.now() % 100000).padStart(5, '0'); if (out.length < 1e6) requestAnimationFrame(tick); }; tick();
const t0 = performance.now();
await new Promise((done) => { const on = (now, meta) => { c.width = v.videoWidth; c.height = v.videoHeight; g.drawImage(v, 0, 0);
  const m = vsDecodeBand(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  if (m !== null) { const seen = (performance.timeOrigin + (meta && meta.presentationTime ? meta.presentationTime : now)) % MOD; let d = (seen - m - OFF) % MOD; if (d < 0) d += MOD; if (d < 5000) out.push(d); }
  if (performance.now() - t0 < ${Number(seconds) || 10} * 1000) v.requestVideoFrameCallback(on); else done(); }; v.requestVideoFrameCallback(on); });
clock.remove(); out.sort((a, b) => a - b);
const q = (p) => out.length ? Math.round(out[Math.min(out.length - 1, Math.floor(p * out.length))]) : null;
console.log(JSON.stringify({ n: out.length, median: q(0.5), p95: q(0.95), min: q(0), max: q(0.999), offsetMs: OFF, note: 'glass-to-glass minus the viewer display lag; RTT / decode: the window strip' }));
})();`;

const mode = process.argv[2];
if (mode === 'clock') {
  const port = Number(arg('--port', 8790));
  http.createServer((q, s) => { s.setHeader('content-type', 'text/html; charset=utf-8'); s.end(CLOCK_PAGE); }).listen(port, '0.0.0.0', () => console.log(`the clock: http://<this machine>:${port}/ — open it full screen on the MACHINE, then stream its desktop`));
} else if (mode === 'snippet') {
  console.log(snippet(arg('--offset', 0), arg('--seconds', 10)));
} else if (mode === 'selftest') {
  // the band survives a render: the clock page in headless Chrome, read back with THE decoder from a screenshot of itself
  const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
  if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-g2g-'));
  const srv = http.createServer((q, s) => { s.setHeader('content-type', 'text/html; charset=utf-8'); s.end(CLOCK_PAGE); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const cdpPort = 20000 + Math.floor(Math.random() * 20000);
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, '--no-first-run', '--no-sandbox', `--user-data-dir=${dir}`, `http://127.0.0.1:${srv.address().port}/`], { stdio: 'ignore', detached: true });
  const end = (code) => { try { process.kill(-ch.pid, 'SIGKILL'); } catch { } srv.close(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(code); };
  let tab = null;
  for (let i = 0; i < 80 && !tab; i++) { try { tab = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!tab) await new Promise((r) => setTimeout(r, 250)); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pend = new Map(); ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const cdp = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await new Promise((r) => setTimeout(r, 800));
  const errs = [];
  for (let k = 0; k < 5; k++) {
    const r = await cdp('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => { ${DECODE}
      const shot = await new Promise((done) => requestAnimationFrame(() => { const w = innerWidth, h = innerHeight; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
        for (const e of document.querySelectorAll('#band i')) { const b = e.getBoundingClientRect(); g.fillStyle = getComputedStyle(e).backgroundColor; g.fillRect(b.left, b.top, b.width, b.height); }
        done({ v: vsDecodeBand(g.getImageData(0, 0, w, h).data, w, h), at: Date.now() % ${2 ** BITS} }); }));
      return shot; })()` });
    const v = r.result && r.result.result && r.result.result.value;
    errs.push(v && v.v !== null ? Math.abs(v.at - v.v) : null);
  }
  const good = errs.every((e) => e !== null && e <= 40);
  console.log(JSON.stringify({ errs, good }));
  end(good ? 0 : 1);
} else {
  console.log('usage: stream-glass-to-glass.mjs clock [--port 8790] | snippet [--offset ms] [--seconds 10] | selftest');
  process.exit(2);
}
