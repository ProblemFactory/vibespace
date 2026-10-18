#!/usr/bin/env node
// THE HDR API ANSWERS OF A HEADLESS BROWSER (lane stream-hdr-probe, leg 1): page.html's hdrFacts() served from a loopback
// server (a secure context: WebCodecs / WebGPU need one), read over raw CDP (Node ≥ 22: a global WebSocket). On the hub:
// three launches, because the answers depend on the flags — `suite` = the chrome suites' own flags (--disable-gpu), `gpu` =
// the GPU process allowed (+ WebGPU), `experimental` = gpu + --enable-experimental-web-platform-features (what is only behind
// a flag today). On a paired machine (`native` = no GPU flag at all): push this file + make-clips's hdr-probe.html and run it
// with the machine's own Node and browser — e.g. Windows: the agent's node.exe, --chrome msedge.exe --bundle hdr-probe.html.
//
//   node scripts/probes/stream-hdr/facts-hub.mjs --clips <make-clips out dir> --out <facts.json> [--chrome <path>] [--only suite]
//     [--bundle <hdr-probe.html>]   serve that one file (clips inlined) instead of page.html + --clips
//     [--shot <dir>]   also open the page WITH its tiles (each variant), wait 8 s, then step (c)/(d) through every decode codec
//                      and (e) through every WebRTC codec — every tile's status line per step + a PNG per variant (the page's
//                      own smoke test; on a real GPU (d)'s line carries its offscreen read-back of the PQ maths)
//     [--steps all|dcodec|rcodec|none] [--settle <ms, 8000>] [--step-ms <ms>] [--no-facts]   cut the tile pass to fit a 30 s remote run
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIPS = arg('--clips', ''), OUT = arg('--out', ''), ONLY = arg('--only', ''), SHOT = arg('--shot', ''), BUNDLE = arg('--bundle', '');
const STEPS = arg('--steps', 'all'), SETTLE = Number(arg('--settle', '8000')), STEP_MS = Number(arg('--step-ms', '0')), NO_FACTS = process.argv.includes('--no-facts');
const CHROME = arg('--chrome', ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p)) || '');
if (!(CLIPS || BUNDLE) || !OUT) { console.error('usage: facts-hub.mjs (--clips <dir> | --bundle <hdr-probe.html>) --out <facts.json>'); process.exit(2); }
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }

const BASE = ['--headless=new', '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=0',
  ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : [])]; // macOS: a fresh profile must never ask the owner's Keychain
const VARIANTS = {
  suite: [...BASE, '--disable-gpu'],
  gpu: [...BASE, '--enable-unsafe-webgpu', '--enable-features=Vulkan'],
  experimental: [...BASE, '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--enable-experimental-web-platform-features'],
  native: BASE, // a paired machine's browser as it ships (run with --only native)
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ivf': 'application/octet-stream', '.hevc': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = u.pathname === '/page.html' ? (BUNDLE || path.join(HERE, 'page.html')) : u.pathname.startsWith('/clips/') && CLIPS ? path.join(CLIPS, path.basename(u.pathname)) : null;
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

async function cdpOf(wsUrl) {
  const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('cdp socket')); });
  let id = 0; const pend = new Map(), subs = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); const p = d.id && pend.get(d.id); if (p) { pend.delete(d.id); d.error ? p.j(new Error(d.error.message)) : p.r(d.result); } else subs.forEach((f) => f(d)); };
  return { send: (method, params = {}, sessionId) => new Promise((r, j) => { const i = ++id; pend.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); }), on: (f) => subs.push(f), close: () => ws.close() };
}

async function run(name, flags) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vs-hdr-${name}-`));
  const chrome = spawn(CHROME, [...flags, `--user-data-dir=${dir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const wsUrl = await new Promise((r, j) => { let buf = ''; const t = setTimeout(() => j(new Error('no DevTools url')), 20000); chrome.stderr.on('data', (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); r(m[1]); } }); });
    const cdp = await cdpOf(wsUrl);
    const version = await cdp.send('Browser.getVersion');
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const logs = []; cdp.on((d) => { if (d.method === 'Runtime.consoleAPICalled' && d.sessionId === sessionId) logs.push(d.params.args.map((a) => a.value ?? a.description).join(' ')); if (d.method === 'Runtime.exceptionThrown') logs.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception || {}).description); });
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/page.html?tiles=0&facts=0` }, sessionId);
    const ev = async (expression, ms = 90000) => { const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: ms }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception || {}).description || '')); return r.result.value; };
    for (let i = 0; i < 100 && !(await ev('typeof window.hdrFacts === "function"').catch(() => false)); i++) await new Promise((r) => setTimeout(r, 100));
    const t0 = Date.now();
    const facts = NO_FACTS ? null : await ev('hdrFacts({ decode: true })');
    const gpu = await cdp.send('SystemInfo.getInfo').catch(() => null);
    let tiles = null;
    if (SHOT) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/page.html?facts=0` }, sessionId);
      await new Promise((r) => setTimeout(r, SETTLE));
      const state = () => ev('JSON.stringify(TILE_STATE)').then(JSON.parse);
      tiles = { initial: await state() };
      const png = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      fs.mkdirSync(SHOT, { recursive: true }); fs.writeFileSync(path.join(SHOT, `tiles-${name}.png`), Buffer.from(png.data, 'base64'));
      for (const [sel, keys, ms] of [['dcodec', ['sC', 'sD'], 4000], ['rcodec', ['sE'], 5000]].filter(([x]) => STEPS === 'all' || STEPS === x)) {
        const opts = await ev(`Array.from(document.getElementById('${sel}').options).map((o) => o.value)`);
        for (const v of opts) {
          await ev(`(() => { const s = document.getElementById('${sel}'); ${keys.map((k) => `TILE_STATE.${k} = ''; document.getElementById('${k}').textContent = '';`).join(' ')} s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); })()`);
          await new Promise((r) => setTimeout(r, STEP_MS || ms));
          const st = await state(); tiles[`${sel}=${v}`] = Object.fromEntries(keys.map((k) => [k, st[k]]));
        }
      }
    }
    cdp.close();
    return { name, flags, chrome: version.product, ms: Date.now() - t0, tiles, gpu: gpu ? { devices: (gpu.gpu.devices || []).map((d) => `${d.vendorString || d.vendorId} ${d.deviceString || d.deviceId}`), featureStatus: gpu.gpu.featureStatus } : null, logs, facts };
  } finally {
    chrome.kill('SIGKILL');
    await new Promise((r) => (chrome.exitCode !== null ? r() : chrome.once('exit', r)));
    for (let i = 0; i < 10; i++) { try { fs.rmSync(dir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 300)); } } // Windows: children still hold files
  }
}

const results = [];
for (const [name, flags] of Object.entries(VARIANTS)) {
  if (ONLY && ONLY !== name) continue;
  try { const r = await run(name, flags); results.push(r); console.log(`✓ ${name}: ${r.chrome} in ${r.ms} ms${r.logs.length ? ` (${r.logs.length} console lines: ${r.logs.slice(0, 3).join(' | ')})` : ''}`); if (r.tiles) console.log(`  tiles: ${JSON.stringify(r.tiles)}`); } catch (e) { results.push({ name, flags, error: String(e.message || e) }); console.log(`✗ ${name}: ${e.message}`); }
}
server.close();
fs.writeFileSync(OUT, JSON.stringify(results, null, 1) + '\n');
console.log(`→ ${OUT}`);
