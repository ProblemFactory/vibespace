#!/usr/bin/env node
// B-d03a — the three browser faces: SHOOT + PIXEL-VERIFY the mockups.
// Headless Chrome over raw CDP (the dbg-comm-directions.mjs shape; `ws` from
// node_modules; a per-run scratch user-data-dir; zero vendor calls; file://
// URLs — the mockups are standalone). For each direction × (desktop zh,
// desktop en, desktop ja, phone zh) it writes <name>.png beside the HTML and <name>.json
// with the measured [data-face] boxes and the pixel verdict per box:
//   painted = ≥ 30 light pixels (text/icon) AND ≥ 4 distinct colours inside
//   the box — a face that did not render is a flat patch of workspace.
// A built-in NEGATIVE CONTROL runs the same check on an empty patch of the
// workspace and must FAIL, or the run is refused (a check that cannot go red
// proves nothing). Exit 1 on any face missing / unpainted / control green.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const { freePort, scratch } = await import(pathToFileURL(path.join(repo, 'scripts', 'scratch.mjs')).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium on this box'); process.exit(0); }
const CDP_PORT = await freePort();
const chromeDir = scratch('browser-faces-chrome');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--force-device-scale-factor=1',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1200,800', '--hide-scrollbars', '--allow-file-access-from-files', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(chromeDir, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

const WebSocket = require('ws');
async function newPage() {
  const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const evaljs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result?.result?.value;
  };
  return {
    metrics: (w, h, m) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!m }),
    open: async (url) => { await cdp('Page.navigate', { url }); for (let i = 0; i < 60; i++) { try { if (await evaljs('document.body && document.body.dataset.ready === "1"')) break; } catch {} await sleep(100); } await sleep(200); },
    evaljs,
    shot: async (file) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); if (!r.result?.data) throw new Error('no screenshot'); const buf = Buffer.from(r.result.data, 'base64'); fs.writeFileSync(file, buf); return buf; },
    close: () => { try { ws.close(); } catch {} },
  };
}

// ── a minimal PNG reader (8-bit RGB/RGBA, non-interlaced — what Chrome emits) ──
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let off = 8, w = 0, h = 0, ctype = 0, depth = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8); const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; if (data[12] !== 0) throw new Error('interlaced png'); }
    else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (depth !== 8 || (ctype !== 6 && ctype !== 2)) throw new Error(`unsupported png depth/ctype ${depth}/${ctype}`);
  const bpp = ctype === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[dst + i - bpp] : 0, b = y > 0 ? px[dst - stride + i] : 0, c = (y > 0 && i >= bpp) ? px[dst - stride + i - bpp] : 0, x = raw[src + i];
      let v;
      if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)); }
      px[dst + i] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
function boxStats(img, box) {
  let light = 0; const colours = new Set(); let n = 0;
  const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y), x1 = Math.min(img.w, box.x + box.w), y1 = Math.min(img.h, box.y + box.h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.w + x) * img.bpp, r = img.px[i], g = img.px[i + 1], b = img.px[i + 2]; n++;
    if (Math.max(r, g, b) >= 170) light++;
    if (colours.size < 64) colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
  }
  return { pixels: n, light, colours: colours.size, painted: light >= 30 && colours.size >= 4 };
}

const MEASURE = `(function(){ const out=[]; for (const el of document.querySelectorAll('[data-face]')) { const b=el.getBoundingClientRect(); const cs=getComputedStyle(el); if (!b.width || !b.height || cs.display==='none' || cs.visibility==='hidden') continue; out.push({ face: el.dataset.face, text: (el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,60), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }); } return { viewport: { w: innerWidth, h: innerHeight }, faces: out }; })()`;
// the expected VISIBLE [data-face] entries per direction × view (the count the task names: 3 cards / 3 entries / 2 entries)
const EXPECT = { a: { desktop: ['hub-entry', 'web', 'agent', 'app'], phone: ['web', 'agent', 'app'] }, b: { desktop: ['web', 'app', 'agent'], phone: ['web-phone', 'app-phone', 'agent-phone'] }, c: { desktop: ['app', 'agent'], phone: ['app-phone', 'agent-phone'] } };
const RUNS = [['desktop-zh', 1200, 800, ''], ['desktop-en', 1200, 800, 'lang=en'], ['desktop-ja', 1200, 800, 'lang=ja'], ['phone-zh', 390, 844, 'view=phone']];
const page = await newPage();
let failures = 0; const summary = [];
for (const dir of ['a', 'b', 'c']) {
  for (const [name, w, h, q] of RUNS) {
    const view = name.startsWith('phone') ? 'phone' : 'desktop';
    await page.metrics(w, h, view === 'phone');
    await page.open(pathToFileURL(path.join(here, `direction-${dir}.html`)).href + (q ? `?${q}` : ''));
    const m = await page.evaljs(MEASURE);
    const png = await page.shot(path.join(here, `direction-${dir}-${name}.png`));
    const img = decodePng(png);
    const rows = m.faces.map((f) => ({ ...f, ...boxStats(img, f) }));
    const got = rows.map((r) => r.face), want = EXPECT[dir][view];
    const missing = want.filter((f) => !got.includes(f)), extra = got.filter((f) => !want.includes(f)), unpainted = rows.filter((r) => !r.painted).map((r) => r.face);
    // negative control: the same check over an empty patch of the workspace must FAIL
    const ctl = boxStats(img, view === 'phone' ? { x: 200, y: 700, w: 60, h: 40 } : { x: 1100, y: 640, w: 60, h: 40 });
    const ok = !missing.length && !extra.length && !unpainted.length && !ctl.painted;
    if (!ok) failures++;
    const rec = { dir, name, viewport: m.viewport, png: `direction-${dir}-${name}.png`, expected: want, faces: rows, control: ctl, verdict: ok ? 'ok' : { missing, extra, unpainted, controlPainted: ctl.painted } };
    fs.writeFileSync(path.join(here, `direction-${dir}-${name}.json`), JSON.stringify(rec, null, 1));
    summary.push(rec);
    console.log(`${ok ? 'ok ' : 'RED'} direction-${dir} ${name} faces=${rows.map((r) => `${r.face}(${r.light}L/${r.colours}c)`).join(' ')} control=${ctl.light}L/${ctl.colours}c${ok ? '' : ' ' + JSON.stringify(rec.verdict)}`);
  }
}
page.close();
fs.writeFileSync(path.join(here, 'index.json'), JSON.stringify(summary.map((s) => ({ dir: s.dir, name: s.name, png: s.png, verdict: s.verdict, faces: s.faces.map((f) => ({ face: f.face, box: [f.x, f.y, f.w, f.h], light: f.light, colours: f.colours })) })), null, 1));
console.log(failures ? `FAIL ${failures} run(s)` : `PASS ${summary.length} runs, every face painted, every control unpainted`);
process.exit(failures ? 1 : 0);
