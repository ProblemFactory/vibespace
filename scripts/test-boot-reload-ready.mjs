#!/usr/bin/env node
// THE RELOAD WAITS FOR READY, THE SPLASH RECOVERS BY ITSELF (heavy, chrome —
// lane update-reload-ready, B-0ece). A worktree server that boots slowly on
// purpose (VIBESPACE_TEST_BOOT_HOLD_MS — TEST ONLY: a boot step that finishes
// after that many ms, so GET /api/boot says `booting` while it listens):
//   ① a page opened mid-boot says "VibeSpace is starting… (N sessions
//     reconnected)", asks for its layout only once the server is ready, and
//     loads by itself — no reload, no button;
//   ② ⚙ → Update VibeSpace…'s progress (app._runSelfUpdate; /api/self-update
//     + its status answered by CDP Fetch — never a real update) across a REAL
//     restart onto a slow-booting server: the dialog says the server is
//     starting and the page reloads only after the server is ready;
//   ③ GET /api/layouts never answers (CDP Fetch holds it): the splash climbs
//     the retry ladder (a short one via window.__vsBootLadderTest), then shows
//     the reason in words + Reload; one boot-stuck telemetry event lands on
//     the server naming /api/layouts; Reload recovers;
//   ④ patched-copy control: the same judges over a bundle rebuilt with the
//     pre-fix rules (no boot gate, reload on the first answer) go red.
// Run: node scripts/test-boot-reload-ready.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('boot-ready-wt'), PROFILE = scratch('boot-ready-chrome'), FIXTURE = scratch('boot-ready-canonical'), SHOTS = scratch('boot-ready-shots');
fs.mkdirSync(FIXTURE, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true }); // an empty canonical: /api/version never reaches the network
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 800) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
let srv = null;
const srvLog = fs.openSync(path.join(SHOTS, 'server.log'), 'a');
const startServer = (holdMs) => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANGELOG_FIXTURE_DIR: FIXTURE, VIBESPACE_TEST_BOOT_HOLD_MS: String(holdMs) }, stdio: ['ignore', srvLog, srvLog] }); };
const stopServer = async () => { const p = srv; srv = null; if (!p) return; p.kill('SIGKILL'); await new Promise((r) => { if (p.exitCode !== null || p.signalCode) r(); else p.once('exit', r); }); };
const boot = async () => { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/boot`); return r.ok ? await r.json() : null; } catch { return null; } };
const untilBoot = async (pred, ms = 30000) => { const t0 = Date.now(); for (;;) { const b = await boot(); if (b && pred(b)) return b; if (Date.now() - t0 > ms) return b; await sleep(100); } };
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1280,800', '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); } catch { } // whatever the scratch server started ends with it
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [PROFILE, FIXTURE]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

// ── raw CDP (events too: frameNavigated stamps, Fetch.requestPaused) ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
if (!target) { console.error('  ✗ boot: no chrome page'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map(); const navs = []; let onPaused = null;
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) navs.push(Date.now());
  if (m.method === 'Fetch.requestPaused' && onPaused) onPaused(m.params);
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const until = async (expr, { timeout = 15000, step = 100 } = {}) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
const fulfillJson = (requestId, obj) => cdp('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(obj)).toString('base64') }).catch(() => { });
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__vsReadyAt = 0; addEventListener("DOMContentLoaded", () => { const w = () => window.app ? app.ready.then(() => { window.__vsReadyAt = Date.now(); }) : setTimeout(w, 50); w(); });' });
const URL = `http://127.0.0.1:${PORT}/`;
const SPLASH = `(() => { const s = document.getElementById('loading-screen'); return s ? { line: s.querySelector('.boot-line')?.textContent || '', btn: s.querySelector('.boot-reload')?.textContent || '' } : null; })()`;
// the restore's GET /api/layouts = the LAST one asked before app.ready (the custom-grid buttons ask too, off the splash path)
const layoutsAt = `(() => { const ts = performance.getEntriesByType('resource').filter((x) => /\\/api\\/layouts(\\?|$)/.test(x.name)).map((x) => performance.timeOrigin + x.startTime).filter((t) => !window.__vsReadyAt || t <= window.__vsReadyAt); return ts.length ? Math.max(...ts) : 0; })()`;

// ── ① a page opened mid-boot ──
async function legMidBoot(tag) {
  const out = {};
  startServer(6000);
  const b0 = await untilBoot((b) => b.phase === 'booting', 30000);
  out.servedBooting = b0?.phase === 'booting';
  const n0 = navs.length;
  await cdp('Page.navigate', { url: URL });
  out.line = await until(`(${SPLASH})?.line`, { timeout: 5000 });
  out.readyEarly = await evalJs('window.__vsReadyAt || 0');
  await shot(`${tag}-1-mid-boot.png`);
  const b1 = await untilBoot((b) => b.phase === 'ready', 30000);
  out.readyAt = b1?.readyAt;
  out.pageReadyAt = await until('window.__vsReadyAt || 0', { timeout: 20000 });
  out.layoutsAt = await evalJs(layoutsAt);
  await until(`!document.getElementById('loading-screen')`, { timeout: 3000 }); // the 300 ms fade
  out.splash = await evalJs(SPLASH);
  out.navs = navs.length - n0;
  return out;
}
const judgeMidBoot = (o, pfx) => [
  [`${pfx}① the server listens and says booting (the test hold)`, o.servedBooting, o],
  [`${pfx}① the splash says "${o.line}"`, /^VibeSpace is starting… \(\d+ sessions reconnected\)$/.test(o.line || ''), o.line],
  [`${pfx}① the page asks for its layout only once the server is ready (GET /api/layouts ${o.layoutsAt && o.readyAt ? Math.round(o.layoutsAt - o.readyAt) + ' ms after ready' : '?'})`, o.layoutsAt && o.readyAt && o.layoutsAt >= o.readyAt - 50 && !o.readyEarly, o],
  [`${pfx}① …and loads by itself: app.ready ${o.pageReadyAt && o.readyAt ? Math.round(o.pageReadyAt - o.readyAt) + ' ms after ready' : 'never'}, one navigation, the splash gone, no button`, o.pageReadyAt && o.pageReadyAt - o.readyAt < 15000 && o.navs === 1 && o.splash === null, o],
];

// ── ② the update reload waits for ready ──
async function legUpdate(tag) {
  const out = { texts: [] };
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/self-update*' }] });
  onPaused = (p) => {
    if (/\/api\/self-update\/status/.test(p.request.url)) return fulfillJson(p.requestId, { log: 'Pulling the latest code…\nRestarting the service…\n', running: true });
    return fulfillJson(p.requestId, { success: true });
  };
  const n0 = navs.length;
  await evalJs('void app._runSelfUpdate()');
  await sleep(2500);
  await stopServer();
  await sleep(1500);
  startServer(8000);
  const sampler = (async () => { for (let i = 0; i < 200 && navs.length === n0; i++) { try { const t = await evalJs(`document.querySelector('.su-msg')?.textContent || ''`); if (t && out.texts[out.texts.length - 1] !== t) out.texts.push(t); } catch { } await sleep(150); } })();
  const b1 = await untilBoot((b) => b.phase === 'ready', 40000);
  out.readyAt = b1?.readyAt;
  for (let i = 0; i < 100 && navs.length === n0; i++) await sleep(100);
  await sampler;
  out.navAt = navs[n0] || 0;
  out.pageReadyAt = await until('window.__vsReadyAt || 0', { timeout: 20000 });
  await shot(`${tag}-2-after-update.png`);
  await cdp('Fetch.disable'); onPaused = null;
  return out;
}
const judgeUpdate = (o, pfx) => [
  [`${pfx}② the dialog said the server is starting (${o.texts.join(' → ').slice(0, 160)})`, o.texts.some((t) => /^VibeSpace is starting… \(\d+ sessions reconnected\)$/.test(t)), o.texts],
  [`${pfx}② the page reloads only once the new server is ready (${o.navAt && o.readyAt ? Math.round(o.navAt - o.readyAt) + ' ms after ready' : 'no reload'})`, o.navAt && o.readyAt && o.navAt >= o.readyAt, o],
  [`${pfx}② …and the reloaded page loads by itself`, o.pageReadyAt && o.pageReadyAt >= o.navAt, o],
];

// ── ③ a request that never answers ──
async function legHang() {
  const out = { lines: [] };
  const held = [];
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__vsBootLadderTest = { stallMs: 1000, ladder: [1000, 1000, 1000, 1000] };' });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/layouts*' }] });
  onPaused = (p) => { held.push(p.requestId); }; // never answered
  await cdp('Page.navigate', { url: URL });
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) {
    const s = await evalJs(SPLASH).catch(() => null);
    if (s?.line && out.lines[out.lines.length - 1] !== s.line) out.lines.push(s.line);
    if (s?.btn) { out.btn = s.btn; break; }
    await sleep(100);
  }
  out.ms = Date.now() - t0; out.held = held.length;
  await shot('3-gave-up.png');
  await cdp('Fetch.disable'); onPaused = null;
  const n0 = navs.length;
  const c = await evalJs(`(() => { const r = document.querySelector('#loading-screen .boot-reload')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
  if (c) for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: c.x, y: c.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  for (let i = 0; i < 50 && navs.length === n0; i++) await sleep(100);
  out.reloaded = navs.length > n0;
  out.pageReadyAt = await until('window.__vsReadyAt || 0', { timeout: 20000 });
  const dir = path.join(wt, 'data', 'telemetry');
  for (let i = 0; i < 60 && !out.stuck; i++) {
    try { for (const f of fs.readdirSync(dir)) { const hit = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').find((l) => /"boot-stuck"/.test(l)); if (hit) out.stuck = JSON.parse(hit); } } catch { }
    if (!out.stuck) await sleep(250);
  }
  return out;
}

try {
  const m = await legMidBoot('fix');
  for (const [n, c, e] of judgeMidBoot(m, '')) check(n, c, e);
  const u = await legUpdate('fix');
  for (const [n, c, e] of judgeUpdate(u, '')) check(n, c, e);
  const h = await legHang();
  check(`③ the splash climbed the ladder in words (${h.lines.slice(0, 2).join(' | ').slice(0, 160)})`, h.lines.some((l) => /^Waiting for the server \(\/api\/layouts: no answer within 1 s\) — trying again in 1 s$/.test(l)), h.lines);
  check(`③ …then the reason in words + Reload after ${(h.ms / 1000).toFixed(1)} s: "${h.lines[h.lines.length - 1]}"`, h.btn === 'Reload now' && /^The server did not answer \/api\/layouts \(no answer within 1 s\) after 5 tries\.$/.test(h.lines[h.lines.length - 1] || '') && h.held >= 5, h); // five boot tries (+ the custom-grid buttons' own ask, off the splash path)
  check('③ one boot-stuck telemetry event reached the server, naming /api/layouts', h.stuck && /\/api\/layouts: stall after 5 tries/.test(h.stuck.detail || ''), h.stuck);
  check('③ Reload (the request answers again) recovers: the page loads', h.reloaded && h.pageReadyAt > 0, h);

  // ── ④ the patched-copy control: the pre-fix rules, rebuilt into the scratch worktree's bundle ──
  await stopServer();
  const appJs = path.join(wt, 'src/lib/app.js');
  let a = fs.readFileSync(appJs, 'utf8');
  const g1 = 'if (!await awaitBootReady()) return;', g2 = 'const r = await waitServerReady({ ...bootDeps(), onStatus: (b) => setPhase(startingLine(b)), onRetry: (x) => setPhase(retryLine(x)) });';
  const anchored = a.includes(g1) && a.includes(g2);
  a = a.replace(g1, '').replace(g2, 'const r = { ok: true };');
  fs.writeFileSync(appJs, a);
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css --minify --log-level=error`, { cwd: wt, stdio: 'inherit' });
  await cdp('Page.navigate', { url: 'about:blank' });
  const mc = await legMidBoot('control');
  const uc = await legUpdate('control');
  const redM = judgeMidBoot(mc, '').filter(([, c]) => !c).map(([n]) => n), redU = judgeUpdate(uc, '').filter(([, c]) => !c).map(([n]) => n);
  check(`④ control (pre-fix bundle): ① goes red — ${redM.length} judge(s): ${redM.map((n) => n.slice(0, 70)).join(' | ')}`, anchored && redM.some((n) => /only once the server is ready/.test(n)), { anchored, redM, mc });
  check(`④ control (pre-fix bundle): ② goes red — the page reloaded ${uc.navAt && uc.readyAt ? Math.round(uc.readyAt - uc.navAt) + ' ms BEFORE ready' : '?'}`, anchored && redU.some((n) => /reloads only once/.test(n)), { redU, uc });
} catch (e) { failed++; console.error('  ✗ suite crashed: ' + (e.stack || e.message)); }
console.log(`screenshots + server log: ${SHOTS}`);
console.log(failed ? `FAILED (${failed} of ${passed + failed})` : `ALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
