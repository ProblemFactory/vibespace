#!/usr/bin/env node
// LANE S4 — THE LIVE VIEW FITS ITS PANE, ON THE REAL RUNG (heavy). Naive-user
// study 2 (2026-09-26, all three testers): "实况画面只占窗格上面一截" (the picture
// used the top 40–60 % of the pane, black below), "手机上的实况窗口" (390 wide: the
// page at desktop width in a ~260 px strip, a 20 px "Pricing" link, no pinch, no
// auto-open, the only entrance an off-screen chip at x≈403) and a live view that
// "stays blank white while the URL bar shows the new page".
//
// A worktree server (fake claude, its own data/ and HOME), the REAL agent-browser
// 0.38.1 HEADLESS reached only through the keeper (`vibespace-browser` →
// ensureEphemeral), a headless-chrome client as a DESKTOP (1920×1080) and as a
// PHONE (390×844, DPR 3, touch). ZERO vendor calls.
//   ① desktop (1920×1080): the session's chat window open, the first browse ⇒ the live view
//      born beside it (a split, its pane ~700×900); the split pane's picture IS the pane (the frame
//      and the page's own viewport = the canvas ±2 px; a pixel census of the pane:
//      no band). CONTROL: the view stops voting (a hidden report) ⇒ after the
//      grace the page is back at its own 1280×577 and the census measures the
//      band the study saw. A resize re-fits. Verify r1: a DESKTOP SWITCH
//      (visibility:hidden on the window element) makes the view report itself hidden — the page goes
//      back after the grace and is fitted again when the desktop returns.
//   ② the blank picture: frames withheld from the view after a navigation ⇒
//      "Waiting for a picture of the new page…" (dimmed) at 2 s, "No picture…" +
//      Reconnect at 10 s, Reconnect brings the picture back; a hash navigation
//      (no repaint) gets a fresh frame from the bridge and the view never waits.
//   ③ two viewers: a second viewer's larger pane rules (the desktop view
//      letterboxes by the page's aspect — never stretched — and its chip says
//      "Sized for another window"); the desktop view TAKES OVER ⇒ its pane rules;
//      the agent's own `set viewport 800 600` is letterboxed ("Agent's size") and
//      survives a resize until "Fit the page to the window".
//   ④ phone: the conversation's chat on screen, the first browse ⇒ the live view
//      opens FULL SCREEN by itself ("Back to the chat" offered); the page renders
//      at the phone's width; the Pricing link is drawn at its own size and a click
//      on it lands on it; a two-finger pinch zooms the picture in watch mode and a
//      click in takeover maps through the zoom onto the link; a second finger in
//      takeover is refused with a hint; the "Agent browser" chip sits inside the
//      visible status bar at rest and swiped to both ends — CONTROL: the chip
//      unpinned (the pre-fix CSS) is outside the bar at one of them. Verify r1: the same census
//      under zh and ja with DejaVu Sans forced (the Actions runner's fallback font).
// SKIPs with evidence: no chrome / no dtach / no real agent-browser ≥ 0.32 / no
// installed browser. The leg reaps every daemon and browser it started.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const S = require('../src/browser-stream.js');
const FIT = require('../src/browser-fit.js');
const F = require('../src/browser-facts.js');
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await pred()) return true; } catch { } await sleep(every); } try { return !!(await pred()); } catch { return false; } };
const done = () => { console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? ', ' + skipped + ' skipped' : ''})` : `\nALL PASS (${pass}${skipped ? ', ' + skipped + ' skipped' : ''})`); process.exit(fail ? 1 : 0); };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const REAL_AB = (() => { try { const r = F.binaryResolver('agent-browser', process.env); return r ? r() : null; } catch { return null; } })();
let abVer = null; if (REAL_AB) { try { abVer = execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch { } }
const realBrowsers = path.join(os.homedir(), '.agent-browser', 'browsers');
let dtachOk = false; try { execFileSync('which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) { skip('no chrome/chromium for the client'); done(); }
if (!dtachOk) { skip('dtach is not installed — a local session cannot be created here'); done(); }
if (!REAL_AB || !abVer) { skip(`the real agent-browser is not resolvable here (${REAL_AB || 'only the VibeSpace shim / nothing on PATH'})`); done(); }
if (!/\b0\.(3[2-9]|[4-9]\d)\.|\b[1-9]\d*\./.test(abVer)) { skip(`agent-browser ${abVer} is below 0.32 — no stream server`); done(); }
if (!fs.existsSync(realBrowsers)) { skip(`the real agent-browser has no installed browser under ${realBrowsers} (the leg never downloads one)`); done(); }

const ROOT = scratch('browser-live-fit');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const HOME = scratchHome('browser-live-fit-home', fs, ['.claude/projects', '.claude/sessions', '.config', '.vibespace', '.agent-browser']);
fs.symlinkSync(realBrowsers, path.join(HOME, '.agent-browser', 'browsers')); // the INSTALLED browser, read-only use; never a download, never the owner's profiles
fs.writeFileSync(path.join(HOME, '.agent-browser', 'config.json'), JSON.stringify({ headed: false, args: '--no-sandbox,--disable-blink-features=AutomationControlled' }));
const procs = new Set();
let wt = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { endRootedProcesses(ROOT); } catch { }
  try { endRootedProcesses(HOME); } catch { }
  // the REAL daemons + their Chromes: their environ names the scratch HOME / their cwd the worktree (the binary scrubs AGENT_BROWSER_* from Chrome — lane H verify r3)
  for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) { if (Number(d) === process.pid) continue; try { const e = fs.readFileSync(`/proc/${d}/environ`, 'utf8'); const c = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8'); if (e.includes(ROOT + '/') || e.includes(HOME + '/') || e.includes('HOME=' + HOME + '\0') || c.includes(ROOT + '/') || c.includes(HOME + '/')) process.kill(Number(d), 'SIGKILL'); } catch { } }
  if (wt) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore', env: gitEnvFrom(process.env) }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });

// the collector: a white grid page with a "Pricing" link that reports its own viewport, the link's box and every press
const vps = new Map(), clicks = [];
const page = (n) => `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>fit ${n}</title><style>html,body{margin:0;height:100%;overflow:hidden;background:#fff}body{background-image:linear-gradient(#bbb 1px,transparent 1px),linear-gradient(90deg,#bbb 1px,transparent 1px);background-size:50px 50px}#pr{position:absolute;left:20px;top:80px;font:18px sans-serif;padding:6px 10px;background:#eef;color:#224}</style><a id=pr href="#pricing">Pricing</a><script>const N=${JSON.stringify(n)};const rep=(p)=>fetch(p,{cache:'no-store'}).catch(()=>{});const vp=()=>{const r=document.getElementById('pr').getBoundingClientRect();rep('/vp?n='+N+'&w='+innerWidth+'&h='+innerHeight+'&dpr='+devicePixelRatio+'&lx='+r.left+'&ly='+r.top+'&lw='+r.width+'&lh='+r.height);};addEventListener('load',vp);addEventListener('resize',vp);setInterval(vp,1000);addEventListener('mousedown',(e)=>rep('/click?n='+N+'&x='+e.clientX+'&y='+e.clientY+'&t='+(e.target&&e.target.id||'')));</script>`;
const col = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/page') { res.setHeader('Content-Type', 'text/html'); res.end(page(u.searchParams.get('n') || '')); return; }
  const q = (k) => Number(u.searchParams.get(k));
  if (u.pathname === '/vp') vps.set(u.searchParams.get('n'), { w: q('w'), h: q('h'), dpr: q('dpr'), link: { x: q('lx'), y: q('ly'), w: q('lw'), h: q('lh') }, at: Date.now() });
  if (u.pathname === '/click') clicks.push({ n: u.searchParams.get('n'), x: q('x'), y: q('y'), t: u.searchParams.get('t'), at: Date.now() });
  res.statusCode = 204; res.end();
});
const CP = await freePort(); await new Promise((r) => col.listen(CP, '127.0.0.1', r));
process.on('exit', () => { try { col.close(); } catch { } });
const PAGE = (n) => `http://127.0.0.1:${CP}/page?n=${n}`;

const D = path.join(ROOT, 'd'); const BIN = path.join(D, 'bin'); const ENVS = path.join(D, 'envs'); fs.mkdirSync(BIN, { recursive: true }); fs.mkdirSync(ENVS, { recursive: true });
const SID = crypto.randomUUID();
const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: D, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) env > "${ENVS}/$$.env"; sleep 1; printf '%s\\n' '${init}'; exec cat > "${ENVS}/$$.stdin";; esac\necho '2.1.281 (Claude Code)'\n`, { mode: 0o755 });

await (async () => {
  wt = path.join(ROOT, 'wt');
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore', env: gitEnvFrom(process.env) });
  for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const PATHX = `${BIN}:${path.dirname(REAL_AB)}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
  const baseEnv = {}; for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('AGENT_BROWSER_') && k !== 'WAYLAND_DISPLAY' && k !== 'DISPLAY') baseEnv[k] = v;
  Object.assign(baseEnv, { PATH: PATHX, CLAUDE_CMD: path.join(BIN, 'claude'), HOME, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' });
  const PORT = await freePort(), CDP = await freePort();
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env: { ...baseEnv, ...VNC_ENV, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 60000), 'the worktree server booted (the real agent-browser on its PATH, headless config)', journal.slice(-600))) return;
  const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
  const created = [];
  process.on('exit', () => { try { for (const id of created) wsMain.send(JSON.stringify({ type: 'kill', sessionId: id })); } catch { } });
  async function newSession(tag, name) {
    const envBefore = new Set(fs.readdirSync(ENVS));
    const n0 = msgs.filter((m) => m.type === 'created').length;
    wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: D, cols: 80, rows: 24, reqId: 'fit-' + tag, name }));
    await until(() => msgs.filter((m) => m.type === 'created').length > n0, 20000);
    const c = msgs.filter((m) => m.type === 'created').at(-1);
    created.push(c.sessionId);
    await until(() => fs.readdirSync(ENVS).some((f) => !envBefore.has(f) && f.endsWith('.env')), 15000);
    const envFile = fs.readdirSync(ENVS).find((f) => !envBefore.has(f) && f.endsWith('.env'));
    const senv = {}; for (const line of fs.readFileSync(path.join(ENVS, envFile), 'utf8').split('\n')) { const i = line.indexOf('='); if (i > 0) senv[line.slice(0, i)] = line.slice(i + 1); }
    const pairs = Object.fromEntries(Object.entries(senv).filter(([k]) => k.startsWith('AGENT_BROWSER_')));
    const vb = (args, timeout = 120000) => new Promise((resolve) => { execFile(process.execPath, [path.join(wt, 'data/bin/vibespace-browser'), ...args], { env: { ...baseEnv, ...pairs, VIBESPACE_API: senv.VIBESPACE_API, VIBESPACE_SESSION_TOKEN: senv.VIBESPACE_SESSION_TOKEN }, timeout, encoding: 'utf8' }, (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') })); });
    return { sessionId: c.sessionId, name, pairs, vb };
  }
  // ── the client chrome: one browser, a DESKTOP page and (later) a PHONE page ──
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'client')}`, '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
  procs.add(chrome);
  let first = null;
  for (let i = 0; i < 120 && !first; i++) { try { first = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!first) await sleep(250); }
  if (!ok(!!first, 'the client chrome exposed a page target')) return;
  async function attachCdp(target) {
    const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((r) => cdp.on('open', r));
    let seq = 0; const pend = new Map();
    cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw'); return r.result?.result?.value; };
    return { cdp, send, evaluate, close: () => { try { cdp.close(); } catch { } } };
  }
  async function bootApp(C, { width, height, dsf, mobile = false }) {
    await C.send('Page.enable'); await C.send('Runtime.enable');
    await C.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dsf, mobile });
    if (mobile) await C.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await C.send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await C.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const up = await until(() => C.evaluate('!!(window.app && window.app.wm && window.app.sidebar)'), 40000, 250);
    if (up) await C.evaluate('window.app.ready');
    return up;
  }
  /** Pixel census of an element's box: the fraction of DARK pixels (the pane's own background; the page is a white grid). */
  const census = async (C, sel, tag = '') => {
    const r = await C.evaluate(`(() => { const c = ${sel}; const b = c.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
    const shot = await C.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
    if (process.env.VS_FIT_SHOTS && shot.result && shot.result.data) { try { fs.mkdirSync(process.env.VS_FIT_SHOTS, { recursive: true }); fs.writeFileSync(path.join(process.env.VS_FIT_SHOTS, `census-${tag || Date.now()}.png`), Buffer.from(shot.result.data, 'base64')); } catch { } }
    return C.evaluate(`(async () => { const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.result && shot.result.data || '')}; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const W = c.width, H = c.height; const d = x.getImageData(0, 0, W, H).data; let dark = 0, n = 0, lastLight = -1; for (let yy = 0; yy < H; yy += 2) { let rowLight = 0; for (let xx = 0; xx < W; xx += 2) { const i = (yy * W + xx) * 4; const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; if (l < 90) dark++; else rowLight++; } if (rowLight > (W / 2) * 0.9) lastLight = yy; } return { W, H, dark: dark / n, lastLightRow: lastLight }; })()`);
  };
  const liveQ = (C, sid) => (js) => C.evaluate(`(() => { const w = [...window.app.wm.windows.values()].filter((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === ${JSON.stringify(sid)})[0]; const L = w && w._browserLive; ${js} })()`);
  const canvasSel = (sid) => `[...window.app.wm.windows.values()].filter((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === ${JSON.stringify(sid)})[0]._browserLive.el().querySelector('.browser-live-canvas')`;

  // ═══ ① DESKTOP: the split pane's picture IS the pane ═══
  console.log('— ① desktop: the first browse opens the live view beside the chat; the split pane\'s picture IS the pane');
  const Dk = await attachCdp(first);
  if (!ok(await bootApp(Dk, { width: 1920, height: 1080, dsf: 1 }), 'the desktop client booted (1920×1080)')) return;
  const s1 = await newSession('d', 'fit-desktop');
  await Dk.evaluate(`(() => { window.app.attachSession(${JSON.stringify(s1.sessionId)}, 'fit-desktop', ${JSON.stringify(D)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  ok(await until(() => Dk.evaluate(`[...window.app.wm.windows.values()].some((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(s1.sessionId)})`), 15000), 'the conversation\'s chat window is open on the desktop');
  // the chat window 1406×962 inside the workspace (so the split's live pane — its canvas — is ~700×900)
  const sizeHost = async (w, h) => Dk.evaluate(`(() => { const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(s1.sessionId)}); const host = cw._tabChain ? window.app.wm.windows.get(cw._tabChain.tabs[0]) : cw; const el = host.element; host.gridBounds = null; el.style.left = '20px'; el.style.top = '10px'; el.style.width = '${w}px'; el.style.height = '${h}px'; for (const id of (cw._tabChain ? cw._tabChain.tabs : [cw.id])) { const x = window.app.wm.windows.get(id); x && x.onResize && x.onResize(); } return true; })()`);
  await sizeHost(1406, 962);
  const o1 = await s1.vb(['open', PAGE('d1')]);
  if (!o1.ok && /exited early|DevToolsActivePort|crash|exit code|Missing X server/i.test(o1.stderr + o1.stdout)) { skip(`the real chromium did not launch here: ${(o1.stderr || o1.stdout).replace(/\s+/g, ' ').slice(0, 200)}`); return; }
  if (!ok(o1.ok && await until(() => vps.has('d1'), 20000), '`vibespace-browser open` started the conversation\'s own (headless) browser on the grid page', (o1.stderr || o1.stdout).slice(0, 300))) return;
  const L1 = liveQ(Dk, s1.sessionId);
  ok(await until(() => L1('return !!L && L.isBound()'), 8000), 'the live view was BORN beside the chat (a split) — the desktop auto-bind');
  await sizeHost(1406, 962);
  /** Wait until the view's picture equals its canvas (the page is the pane) and return the facts. */
  const fitted = async (L, n, ms = 15000) => {
    let last = null;
    const good = await until(async () => {
      last = await L(`const c = L.el().querySelector('.browser-live-canvas').getBoundingClientRect(); const g = L.geometry(); const s = L.state(); return { cw: Math.round(c.width), ch: Math.round(c.height), picW: g && g.picW, picH: g && g.picH, cssW: g && g.cssW, cssH: g && g.cssH, src: g && g.source, fit: s.fit, chip: s.fitChip };`);
      const v = vps.get(n);
      return last && last.picW && Math.abs(last.picW - last.cw) <= 2 && Math.abs(last.picH - last.ch) <= 2 && v && Math.abs(v.w - last.cw) <= 2 && Math.abs(v.h - last.ch) <= 2;
    }, ms, 150);
    return { good, last, page: vps.get(n) };
  };
  const f1 = await fitted(L1, 'd1');
  ok(f1.good && f1.last.cw >= 690 && f1.last.cw <= 710 && f1.last.ch >= 880 && f1.last.ch <= 920, `the split pane is ${f1.last && f1.last.cw}×${f1.last && f1.last.ch}: the frame is ${f1.last && f1.last.picW}×${f1.last && f1.last.picH} and the page's own viewport ${f1.page && f1.page.w}×${f1.page && f1.page.h} (±2 px) — the picture IS the pane`, JSON.stringify(f1));
  ok(f1.last && f1.last.fit && f1.last.fit.state === 'fitted' && !f1.last.chip, 'the bridge says "fitted" for THIS pane — and a fitted page needs no chip', JSON.stringify(f1.last && f1.last.fit));
  const c1 = await census(Dk, canvasSel(s1.sessionId), 'desktop-fitted');
  ok(c1.dark < 0.01, `PIXEL CENSUS of the ${c1.W}×${c1.H} pane: ${(c1.dark * 100).toFixed(2)} % dark — no band under the page`, JSON.stringify(c1));
  // CONTROL: the view stops voting (a hidden report, its own reports held) ⇒ nobody visible ⇒ after the grace the page is back at its own size — the pre-fix picture
  await L1(`const ws = L.ws(); if (!ws.__s4) { const o = ws.send.bind(ws); ws.send = (d) => { if (window.__s4NoFit && /"type":"fit"/.test(String(d))) return; o(d); }; ws.__s4 = true; } const p = L.state().pane; L.send({ type: 'fit', width: p.width, height: p.height, dpr: 1, visible: false }); window.__s4NoFit = true; return true;`);
  const restored = await until(() => vps.get('d1') && vps.get('d1').w === 1280, FIT.RESTORE_AFTER_MS + 8000, 200);
  await until(() => L1('const g = L.geometry(); return g && g.picW === 1280'), 5000, 150);
  await sleep(500);
  const c0 = await census(Dk, canvasSel(s1.sessionId), 'desktop-control');
  ok(restored && c0.dark > 0.25, `CONTROL: nobody votes ⇒ after the ${FIT.RESTORE_AFTER_MS} ms grace the page is back at its own ${vps.get('d1') && vps.get('d1').w}×${vps.get('d1') && vps.get('d1').h} and the same census measures ${(c0.dark * 100).toFixed(1)} % dark — the band the study saw ("只占窗格上面一截")`, JSON.stringify({ restored, c0, page: vps.get('d1') }));
  await L1('window.__s4NoFit = false; const p = L.state().pane; L.send({ type: "fit", width: p.width, height: p.height, dpr: 1, visible: true }); return true;'); // the view's own report is deduped (it last said "visible" itself) — say it again through its socket
  const f1b = await fitted(L1, 'd1');
  ok(f1b.good, `…the view votes again ⇒ fitted back to ${f1b.last && f1b.last.cw}×${f1b.last && f1b.last.ch}`, JSON.stringify(f1b));
  // a resize re-fits
  await sizeHost(1206, 760);
  const f1c = await fitted(L1, 'd1');
  ok(f1c.good && Math.abs(f1c.last.cw - f1b.last.cw) > 50, `a RESIZE re-fits: the pane is now ${f1c.last && f1c.last.cw}×${f1c.last && f1c.last.ch} and so are the frame and the page (${f1c.page && f1c.page.w}×${f1c.page && f1c.page.h})`, JSON.stringify(f1c));

  // ═══ verify r1: a DESKTOP SWITCH hides the view (visibility:hidden on the window element — no resize, no visibilitychange) ⇒ it stops voting (it kept voting before: the page stayed the hidden pane's size, no restore) ═══
  console.log('— verify r1 (A): a desktop switch hides the view');
  const deskA = await Dk.evaluate('window.app.desktopManager.activeDesktopId');
  const deskB = await Dk.evaluate(`window.app.desktopManager.createDesktop('verify second')`);
  await Dk.evaluate(`window.app.desktopManager.switchTo(${JSON.stringify(deskB)})`);
  const hid = await until(() => L1('const s = L.state(); return !!(s.fitSent && s.fitSent.visible === false);'), 3000, 100);
  const visA = await L1('return { fitSent: L.state().fitSent, onScreen: L.el().querySelector(".browser-live-canvas").checkVisibility({ visibilityProperty: true }), hiddenByDesktop: !![...window.app.wm.windows.values()].find((x) => x._browserLive === L)._hiddenByDesktop };');
  ok(hid, `after a desktop switch the view reports visible:false (${JSON.stringify(visA)})`, JSON.stringify(visA));
  const restoredB = await until(() => vps.get('d1') && vps.get('d1').w === 1280, FIT.RESTORE_AFTER_MS + 8000, 200);
  ok(restoredB, `…and with nobody voting the page is back at its own size after the grace (page ${JSON.stringify(vps.get('d1') && [vps.get('d1').w, vps.get('d1').h])})`);
  await Dk.evaluate(`window.app.desktopManager.switchTo(${JSON.stringify(deskA)})`);
  const f1d = await fitted(L1, 'd1');
  ok(f1d.good, `switching back ⇒ fitted again (${f1d.last && f1d.last.cw}×${f1d.last && f1d.last.ch}, page ${f1d.page && f1d.page.w})`, JSON.stringify(f1d));
  // CONTROL (the pre-fix client): the same view rebuilt WITHOUT the hider observer — MutationObserver absent while it is created,
  // so the guard's false branch IS the pre-fix code — keeps voting from the other desktop: visible stays true, no restore
  const reopenView = (noMO) => Dk.evaluate(`(() => { const sid = ${JSON.stringify(s1.sessionId)}; const L0 = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === sid); const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === sid); const syncId = L0 ? L0.id : 'win-blive-' + sid; if (L0) window.app.wm.closeWindow(L0.id); const hostId = cw._tabChain ? cw._tabChain.tabs[0] : cw.id; const MO = window.MutationObserver; if (${noMO}) window.MutationObserver = undefined; try { window.app.openBrowserLive({ sessionId: sid, syncId, intoChain: { hostId, split: true, side: 'right' } }); } finally { window.MutationObserver = MO; } return true; })()`);
  await reopenView(true);
  const fc = await fitted(L1, 'd1');
  await Dk.evaluate(`window.app.desktopManager.switchTo(${JSON.stringify(deskB)})`);
  await sleep(3000);
  const visC = await L1('return { fitSent: L.state().fitSent, onScreen: L.el().querySelector(".browser-live-canvas").checkVisibility({ visibilityProperty: true }) };');
  await sleep(FIT.RESTORE_AFTER_MS + 2500);
  const pageC = vps.get('d1') && [vps.get('d1').w, vps.get('d1').h];
  ok(fc.good && visC && visC.fitSent && visC.fitSent.visible === true && visC.onScreen === false && pageC && pageC[0] !== 1280, `CONTROL: the view built without the hider observer (the pre-fix client) keeps reporting visible:true from the other desktop (${JSON.stringify(visC)}) and the page is never restored (still ${JSON.stringify(pageC)} after ${FIT.RESTORE_AFTER_MS + 2500} ms)`, JSON.stringify({ fc: fc.good, visC, pageC }));
  await Dk.evaluate(`window.app.desktopManager.switchTo(${JSON.stringify(deskA)})`);
  await reopenView(false);
  const f1e = await fitted(L1, 'd1');
  ok(f1e.good && await L1('return !!L && L.isBound()'), `…the real view back in its split, fitted (${f1e.last && f1e.last.cw}×${f1e.last && f1e.last.ch})`, JSON.stringify(f1e));

  // ═══ ② THE BLANK PICTURE ═══
  console.log('— ② the blank picture: frames withheld after a navigation are said, never shown as the new page');
  await L1(`const ws = L.ws(); const orig = ws.onmessage; ws.onmessage = (ev) => { if (window.__s4Drop && /"type":"frame"/.test(String(ev.data))) return; orig.call(ws, ev); }; return true;`);
  await L1('window.__s4Drop = true; return true;');
  const tNav = Date.now();
  await s1.vb(['open', PAGE('d2')]);
  await until(() => vps.has('d2'), 15000);
  const w1 = await until(() => L1('const s = L.state(); return s.picture === "waiting" && s.pictureStale'), 6000, 100);
  const s2a = await L1('const s = L.state(); return { picture: s.picture, stale: s.pictureStale, text: s.statusText, dim: L.el().classList.contains("picture-stale"), url: s.url };');
  ok(w1 && /Waiting for a picture of the new page/.test(s2a.text) && s2a.dim && /d2/.test(s2a.url), `frames withheld after the agent's navigation: at ~2 s the view says "${s2a.text}" and dims the old picture (the URL says ${s2a.url})`, JSON.stringify(s2a));
  const n1 = await until(() => L1('return L.state().picture === "none"'), FIT.NO_PICTURE_MS + 4000, 200);
  const s2b = await L1('const s = L.state(); const re = L.el().querySelector(".browser-live-reconnect"); return { picture: s.picture, text: s.statusText, reconnect: re && re.style.display !== "none", folded: s.folded };');
  ok(n1 && Date.now() - tNav >= FIT.NO_PICTURE_MS && /No picture of the new page came in 10 s/.test(s2b.text) && s2b.reconnect, `at 10 s: "${s2b.text}" with a Reconnect`, JSON.stringify(s2b));
  await L1('window.__s4Drop = false; L.el().querySelector(".browser-live-reconnect").click(); return true;');
  const back = await until(() => L1('const s = L.state(); return s.connected && s.frames >= 1 && s.picture === "ok" && !L.el().classList.contains("picture-stale")'), 10000, 150);
  ok(back, 'Reconnect ⇒ the picture of the new page, the words gone');
  // a hash navigation (no repaint — measured 0 frames on 0.38.1): the bridge asks for a fresh picture, the view never waits
  const fr0 = await L1('return L.state().frames');
  const tH = Date.now();
  let waited = false;
  await s1.vb(['eval', 'location.hash = "s4-' + Date.now() + '"; 1']);
  const gotFresh = await until(async () => { const s = await L1('const s = L.state(); return { f: s.frames, p: s.picture };'); if (s.p !== 'ok') waited = true; return s.f > fr0; }, 4000, 100);
  ok(gotFresh && !waited, `a hash navigation (no repaint): a fresh frame reached the view within ${Date.now() - tH} ms (the bridge asked the page) — it never said it was waiting`);

  // ═══ ③ TWO VIEWERS, THE HOLDER, THE AGENT'S OWN SIZE ═══
  console.log('— ③ two viewers at different sizes (the largest rules), the holder rules while driving, the agent\'s own size');
  const pane1 = (await fitted(L1, 'd2')).last;
  const nv = new WebSocket(`ws://127.0.0.1:${PORT}${S.STREAM_PATH}?session=${encodeURIComponent(s1.sessionId)}&profile=${encodeURIComponent(S.EPHEMERAL_REF)}`);
  const nvMsgs = []; nv.on('message', (d) => { try { const m = JSON.parse(d); if (m.type !== 'frame') nvMsgs.push(m); } catch { } });
  await new Promise((r) => nv.on('open', r));
  await until(() => nvMsgs.some((m) => m.type === 'hello'), 5000);
  const BIG = { width: 1300, height: 850 };
  nv.send(JSON.stringify({ type: 'fit', ...BIG, dpr: 1, visible: true }));
  const big = await until(() => vps.get('d2') && vps.get('d2').w === BIG.width && vps.get('d2').h === BIG.height, 12000, 150);
  await until(() => L1('const s = L.state(); return s.fitChip && s.fitChip.kind === "other" && L.geometry() && L.geometry().picW === 1300'), 6000, 150);
  const sB = await L1(`const s = L.state(); const d = L.drawn(); return { chip: s.fitChip, drawn: { w: d.width, h: d.height }, fit: s.fit, you: s.you };`);
  ok(big && sB.chip && sB.chip.kind === 'other' && /Sized for another window/.test(sB.chip.text), `a second viewer's LARGER pane (${BIG.width}×${BIG.height}) rules: the page is ${vps.get('d2') && vps.get('d2').w}×${vps.get('d2') && vps.get('d2').h}; this view's chip says "${sB.chip && sB.chip.text}"`, JSON.stringify(sB));
  ok(sB.drawn.w > 0 && Math.abs(sB.drawn.w / sB.drawn.h - BIG.width / BIG.height) < 0.01, `…and this view LETTERBOXES it by the page's own aspect (drawn ${Math.round(sB.drawn.w)}×${Math.round(sB.drawn.h)}) — never stretched`, JSON.stringify(sB.drawn));
  await L1('L.send({ type: "takeover" }); return true;');
  await until(() => L1('return L.state().mode === "takeover" && L.state().mine'), 5000);
  const hold = await until(() => vps.get('d2') && Math.abs(vps.get('d2').w - pane1.cw) <= 2, 12000, 150);
  await until(() => L1('return !L.state().fitChip'), 4000, 150);
  ok(hold && !(await L1('return L.state().fitChip')), `this view TAKES OVER ⇒ the page follows the HOLDER's pane (${vps.get('d2') && vps.get('d2').w}×${vps.get('d2') && vps.get('d2').h}) though the other pane is larger; its chip is gone`, JSON.stringify(vps.get('d2')));
  await L1('L.send({ type: "handback" }); return true;');
  await until(() => vps.get('d2') && vps.get('d2').w === BIG.width, 12000, 150);
  nv.close();
  const alone = await until(() => vps.get('d2') && Math.abs(vps.get('d2').w - pane1.cw) <= 2, 12000, 150);
  ok(alone, 'handed back, the larger viewer leaves ⇒ the page is this pane\'s size again');
  // the agent's own viewport
  await s1.vb(['set', 'viewport', '800', '600']);
  await until(() => vps.get('d2') && vps.get('d2').w === 800, 10000, 150);
  const ag = await until(() => L1('const s = L.state(); return s.fitChip && s.fitChip.kind === "agent"'), 6000, 150);
  const sA = await L1('return L.state().fitChip');
  ok(ag && /800×600/.test(sA.text), `the agent's own \`set viewport 800 600\` is respected: the chip says "${sA && sA.text}"`, JSON.stringify(sA));
  await sizeHost(1306, 820); await sleep(2000);
  ok(vps.get('d2').w === 800 && vps.get('d2').h === 600, `a resize while the agent owns the size changes nothing (the page stays ${vps.get('d2').w}×${vps.get('d2').h}; the view letterboxes)`);
  await L1('L.el().querySelector(".browser-live-fit").click(); return true;');
  const f3 = await fitted(L1, 'd2');
  ok(f3.good && !f3.last.chip, `"Fit the page to the window" (the chip) takes it back: the page is the pane again (${f3.page && f3.page.w}×${f3.page && f3.page.h})`, JSON.stringify(f3));
  // the desktop leaves (its viewers go) before the phone — a visible desktop view would out-vote the phone (the rule, by design)
  await Dk.send('Page.navigate', { url: 'about:blank' });
  await sleep(500);

  // ═══ ④ PHONE ═══
  console.log('— ④ the phone (390×844, DPR 3, touch): auto-open full screen, the page at the phone\'s width, the link, the pinch, the chip');
  const newT = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const Ph = await attachCdp(newT);
  if (!ok(await bootApp(Ph, { width: 390, height: 844, dsf: 3, mobile: true }), 'the phone client booted (390×844, DPR 3, touch)')) return;
  ok(await Ph.evaluate('window.app.isMobile === true'), 'the phone client is the ≤768 px layout (app.isMobile)');
  const s2 = await newSession('p', 'fit-phone a conversation with a long enough name to crowd the bar');
  await Ph.evaluate(`(() => { window.app.attachSession(${JSON.stringify(s2.sessionId)}, ${JSON.stringify(s2.name)}, ${JSON.stringify(D)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  const chatUp = await until(() => Ph.evaluate(`(() => { const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(s2.sessionId)}); return !!cw && window.app.wm.activeWindowId === cw.id; })()`), 15000);
  ok(chatUp, 'the conversation\'s chat is the window on the phone\'s screen');
  const L2 = liveQ(Ph, s2.sessionId);
  const o2 = await s2.vb(['open', PAGE('p1')]);
  ok(o2.ok && await until(() => vps.has('p1'), 20000), 'the agent\'s first browse (the real binary)', (o2.stderr || o2.stdout).slice(0, 300));
  let toast = '', shown = null, tb = null;
  // the live view's own canvas is ON SCREEN and fills the phone's width (in a split chain the pane lives in the host's element)
  const auto = await until(async () => {
    const t = await Ph.evaluate(`[...document.querySelectorAll('.global-toast')].map((x) => x.textContent).join(' | ')`); if (/The agent opened its browser/.test(t)) toast = t;
    if (toast && !tb) tb = await Ph.evaluate(`(() => { const t = [...document.querySelectorAll('.global-toast')].find((x) => /The agent opened its browser/.test(x.textContent)); if (!t) return null; const b = t.querySelector('.global-toast-body').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), toast: Math.round(t.getBoundingClientRect().width) }; })()`);
    shown = await Ph.evaluate(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-live' && x._browserLive && x._browserLive.state().sessionId === ${JSON.stringify(s2.sessionId)}); if (!w) return null; const c = w._browserLive.el().querySelector('.browser-live-canvas'); const r = c.getBoundingClientRect(); return { vis: c.checkVisibility({ visibilityProperty: true }), w: Math.round(r.width), h: Math.round(r.height), chatVis: (() => { const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(s2.sessionId)}); const m = cw && cw.element.querySelector('.chat-message-list'); return !!(m && m.checkVisibility({ visibilityProperty: true })); })() }; })()`);
    return !!(shown && shown.vis && shown.w >= 380 && !shown.chatVis && toast);
  }, 10000, 100);
  // verify r1: ANOTHER conversation's split host (the desktop leg's chat + live view) is on this phone too — it is not displayed
  // (only the active window is), so the active host sits at the workspace top, never pushed below the screen by a sibling
  const stack = await Ph.evaluate(`(() => { const ws = document.getElementById('workspace').getBoundingClientRect(); const wins = [...document.querySelectorAll('#workspace .window')].map((el) => ({ split: el.classList.contains('tab-split'), active: el.classList.contains('window-active'), disp: getComputedStyle(el).display, top: Math.round(el.getBoundingClientRect().top) })); return { wsTop: Math.round(ws.top), wins, shown: wins.filter((w) => w.disp !== 'none').length, splitHosts: wins.filter((w) => w.split).length, activeTop: (wins.find((w) => w.active) || {}).top }; })()`);
  ok(stack.splitHosts >= 2 && stack.shown === 1 && stack.activeTop === stack.wsTop, `two split hosts on the phone (this conversation's and the desktop leg's): only the ACTIVE one is displayed and it sits at the workspace top (${stack.activeTop} = ${stack.wsTop}; ${stack.shown} shown of ${stack.wins.length}) — an inactive split host no longer pushes the active window off the screen`, JSON.stringify(stack));
  // CONTROL: the pre-fix rule (every split host displayed) put back on the phone for one measurement ⇒ more than one host shown and
  // the active one pushed below the workspace top
  const stackCtl = await Ph.evaluate(`(() => { const st = document.createElement('style'); st.id = 's4-presplit'; st.textContent = '@media (max-width: 768px) { .window.tab-split { display: flex !important; } }'; document.head.appendChild(st); const ws = document.getElementById('workspace').getBoundingClientRect(); const wins = [...document.querySelectorAll('#workspace .window')].map((el) => ({ active: el.classList.contains('window-active'), disp: getComputedStyle(el).display, top: Math.round(el.getBoundingClientRect().top) })); st.remove(); return { wsTop: Math.round(ws.top), shown: wins.filter((w) => w.disp !== 'none').length, activeTop: (wins.find((w) => w.active) || {}).top }; })()`);
  ok(stackCtl.shown >= 2 && stackCtl.activeTop > stackCtl.wsTop, `CONTROL: the pre-fix rule displays ${stackCtl.shown} windows and pushes the active one to y = ${stackCtl.activeTop} (the workspace top is ${stackCtl.wsTop}) — the second conversation's live view off the screen`, JSON.stringify(stackCtl));
  ok(auto && /Back to the chat/.test(toast), `the live view OPENED BY ITSELF on the first browse, full screen (${shown && shown.w}×${shown && shown.h}, the chat behind it) — the toast: "${toast.slice(0, 110)}"`, JSON.stringify({ auto, toast, shown }));
  const f4 = await fitted(L2, 'p1', 20000);
  ok(f4.good && f4.last.cw >= 380 && f4.last.cw <= 390, `the page renders at the PHONE's width: the pane ${f4.last && f4.last.cw}×${f4.last && f4.last.ch}, the page ${f4.page && f4.page.w}×${f4.page && f4.page.h} (the study: 1280 wide in a 260 px strip)`, JSON.stringify(f4));
  ok(tb && tb.w >= 150, `the auto-open toast is legible on the phone (its words ${tb ? tb.w + '×' + tb.h : 'never measured'} px in a ${tb && tb.toast} px toast — a left:50% stack squeezed them into one word per line)`, JSON.stringify(tb));
  // the toast is transient chrome over the picture, not the picture: cleared before the census
  await Ph.evaluate(`(() => { for (const t of document.querySelectorAll('.global-toast')) t.remove(); return true; })()`);
  const c4 = await census(Ph, canvasSel(s2.sessionId), 'phone');
  ok(c4.dark < 0.01, `pixel census of the phone's pane: ${(c4.dark * 100).toFixed(2)} % dark — the picture fills it`, JSON.stringify(c4));
  // the link, drawn at its own size
  const link = vps.get('p1').link;
  const dr = await L2('const d = L.drawn(); const g = L.geometry(); return { left: d.left, top: d.top, width: d.width, height: d.height, cssW: g.cssW, cssH: g.cssH };');
  const k = dr.width / dr.cssW;
  const lw = link.w * k;
  ok(lw >= 40 && Math.abs(k - 1) < 0.02, `the "Pricing" link is drawn ${lw.toFixed(0)} px wide on the phone (the page ${link.w.toFixed(0)} px × ${k.toFixed(3)}) — the study measured 20 px`, JSON.stringify({ link, dr }));
  const clickAt = async (C, x, y) => { await C.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await C.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await C.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
  await L2('L.send({ type: "takeover" }); return true;');
  await until(() => L2('return L.state().mode === "takeover" && L.state().mine'), 5000);
  const before = clicks.length;
  await clickAt(Ph, dr.left + (link.x + link.w / 2) * k, dr.top + (link.y + link.h / 2) * k);
  await until(() => clicks.length > before, 4000, 50);
  const cl = clicks.slice(before).find((c) => c.n === 'p1');
  ok(cl && cl.t === 'pr', `a click on the drawn link reaches the LINK on the page (${cl ? `(${cl.x},${cl.y}) on "${cl.t}"` : 'nothing'})`, JSON.stringify(clicks.slice(before)));
  // a second finger while driving is refused with a hint
  const pt = (x, y, id) => ({ x, y, id, radiusX: 2, radiusY: 2, force: 1 });
  await Ph.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(150, 400, 1)] });
  await Ph.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(150, 400, 1), pt(250, 400, 2)] });
  await Ph.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  const hint = await Ph.evaluate(`[...document.querySelectorAll('.global-toast')].map((x) => x.textContent).join(' | ')`);
  ok(/Pinch-zoom works while you watch/.test(hint) && (await L2('return L.state().zoom.s')) === 1, 'in takeover a second finger is refused with a hint (no zoom)', hint.slice(0, 200));
  await L2('L.send({ type: "handback" }); return true;');
  await until(() => L2('return L.state().mode === "watch"'), 5000);
  // the pinch in watch mode
  const cr = await L2('const c = L.el().querySelector(".browser-live-canvas").getBoundingClientRect(); return { left: c.left, top: c.top, width: c.width, height: c.height };');
  // a VERTICAL pinch just below the link (the content under the fingers' midpoint stays under it — the link stays in view)
  const cx = dr.left + (link.x + link.w / 2) * k, cy = dr.top + (link.y + link.h / 2) * k + 30;
  await Ph.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(cx, cy - 30, 1)] });
  await Ph.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(cx, cy - 30, 1), pt(cx, cy + 30, 2)] });
  for (let i = 1; i <= 5; i++) { await Ph.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(cx, cy - 30 - 6 * i, 1), pt(cx, cy + 30 + 6 * i, 2)] }); await sleep(30); }
  await Ph.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  const z = await L2('const d = L.drawn(); return { zoom: L.state().zoom, drawnW: d.width };');
  ok(z.zoom.s > 1.8 && z.zoom.s < 2.2 && z.drawnW > dr.width * 1.8, `a two-finger PINCH in watch mode zooms the picture ×${z.zoom.s.toFixed(2)} (drawn ${Math.round(z.drawnW)} px wide)`, JSON.stringify(z));
  // a click in takeover maps THROUGH the zoom onto the link
  await L2('L.send({ type: "takeover" }); return true;');
  await until(() => L2('return L.state().mode === "takeover" && L.state().mine'), 5000);
  const dz = await L2('const d = L.drawn(); const g = L.geometry(); return { left: d.left, top: d.top, width: d.width, cssW: g.cssW };');
  const kz = dz.width / dz.cssW;
  const lx = dz.left + (link.x + link.w / 2) * kz, ly = dz.top + (link.y + link.h / 2) * kz;
  const inView = lx > cr.left && lx < cr.left + cr.width && ly > cr.top && ly < cr.top + cr.height;
  const b2 = clicks.length;
  if (inView) await clickAt(Ph, lx, ly);
  await until(() => clicks.length > b2, 4000, 50);
  const cl2 = clicks.slice(b2).find((c) => c.n === 'p1');
  ok(inView && cl2 && cl2.t === 'pr' && Math.abs(cl2.x - (link.x + link.w / 2)) <= 3, `under the ×${kz.toFixed(2)} zoom a click where the link is DRAWN lands on the link (${cl2 ? `(${cl2.x},${cl2.y})` : 'nothing'} vs its centre ${(link.x + link.w / 2).toFixed(0)},${(link.y + link.h / 2).toFixed(0)}) — taps map through the transform`, JSON.stringify({ inView, lx, ly, cr, cl2 }));
  await L2('L.send({ type: "handback" }); L.setZoom({ s: 1, tx: 0, ty: 0 }); return true;');
  // the chip, inside the visible bar
  await Ph.evaluate(`(() => { const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(s2.sessionId)}); window.app.goToWinId(cw.id); return true; })()`);
  const barQ = `const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(s2.sessionId)}); const bar = cw && cw.element.querySelector('.chat-status-bar'); const chip = bar && bar.querySelector('.chat-status-browser');`;
  const hasChip = await until(() => Ph.evaluate(`(() => { ${barQ} return !!chip && chip.getBoundingClientRect().width > 0; })()`), 15000, 200);
  const chipAt = (scroll) => Ph.evaluate(`(async () => { ${barQ} bar.scrollLeft = ${scroll === 'end' ? 'bar.scrollWidth' : scroll === 'mid' ? 'bar.scrollWidth / 2' : '0'}; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const b = bar.getBoundingClientRect(), c = chip.getBoundingClientRect(); return { bar: [Math.round(b.left), Math.round(b.right)], chip: [Math.round(c.left), Math.round(c.right)], inside: c.left >= b.left - 1 && c.right <= b.right + 1 && c.width > 20, overflow: bar.scrollWidth - bar.clientWidth, text: chip.textContent.trim().slice(0, 60) }; })()`);
  if (ok(hasChip, 'the phone\'s chat status bar carries the "Agent browser" chip')) {
    const at = { rest: await chipAt(0), mid: await chipAt('mid'), end: await chipAt('end') };
    ok(at.rest.overflow > 0, `the bar really overflows the phone (${at.rest.overflow} px to swipe) — the shape the chip went off-screen in`, JSON.stringify(at.rest));
    ok(at.rest.inside && at.mid.inside && at.end.inside, `the "Agent browser" chip stays INSIDE the visible bar at rest ${JSON.stringify(at.rest.chip)}, mid-swipe ${JSON.stringify(at.mid.chip)} and swiped to the end ${JSON.stringify(at.end.chip)} (the bar ${JSON.stringify(at.rest.bar)})`, JSON.stringify(at));
    // CONTROL: the pre-fix CSS (the chip unpinned) ⇒ outside the bar at one end
    await Ph.evaluate(`(() => { const s = document.createElement('style'); s.id = 's4-unpin'; s.textContent = '.chat-status-bar > .chat-status-browser { position: static !important; max-width: none !important; }'; document.head.appendChild(s); return true; })()`);
    const ctl = { rest: await chipAt(0), end: await chipAt('end') };
    await Ph.evaluate(`(() => { document.getElementById('s4-unpin').remove(); return true; })()`);
    ok(!ctl.rest.inside || !ctl.end.inside, `CONTROL: the chip unpinned (the pre-fix CSS) is outside the visible bar at ${!ctl.rest.inside ? `rest ${JSON.stringify(ctl.rest.chip)} — the study's x≈403 of 390` : `the swiped end ${JSON.stringify(ctl.end.chip)}`}`, JSON.stringify(ctl));
  }
  // ═══ verify r1: the chip census under zh / ja with DejaVu Sans forced (the .185 pattern — the runner's fallback font) ═══
  console.log('— verify r1 (D): the chip under zh / ja, DejaVu Sans forced');
  await Ph.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'body, .chat-status-bar, .chat-status-bar * { font-family: "DejaVu Sans" !important; }'; document.head.appendChild(st); });` });
  for (const lang of ['zh', 'ja']) {
    await Ph.evaluate(`(() => { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); return 1; })()`);
    if (!ok(await bootApp(Ph, { width: 390, height: 844, dsf: 3, mobile: true }), `${lang}: the phone client rebooted`)) continue;
    await Ph.evaluate(`(() => { window.app.attachSession(${JSON.stringify(s2.sessionId)}, ${JSON.stringify(s2.name)}, ${JSON.stringify(D)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
    await sleep(800);
    await Ph.evaluate(`(() => { const cw = [...window.app.wm.windows.values()].find((x) => x.type === 'chat' && window.app.sessions.get(x.id) && window.app.sessions.get(x.id).sessionId === ${JSON.stringify(s2.sessionId)}); if (cw) window.app.goToWinId(cw.id); return true; })()`);
    const has = await until(() => Ph.evaluate(`(() => { ${barQ} return !!chip && chip.getBoundingClientRect().width > 0; })()`), 20000, 200);
    if (!ok(has, `${lang}: the "Agent browser" chip is in the bar`)) continue;
    const font = await Ph.evaluate(`(() => { ${barQ} return getComputedStyle(chip).fontFamily; })()`);
    const at = { rest: await chipAt(0), mid: await chipAt('mid'), end: await chipAt('end') };
    ok(at.rest.inside && at.mid.inside && at.end.inside, `${lang} (font ${font}, overflow ${at.rest.overflow}): the chip stays inside the bar at rest ${JSON.stringify(at.rest.chip)}, mid ${JSON.stringify(at.mid.chip)}, end ${JSON.stringify(at.end.chip)} — "${at.rest.text}"`, JSON.stringify(at));
  }
  // cleanup of this leg's browsers: the sessions' own `close`, then the reaper by evidence
  await s1.vb(['close'], 30000).catch(() => { });
  await s2.vb(['close'], 30000).catch(() => { });
  Dk.close(); Ph.close();
  try { for (const id of created) wsMain.send(JSON.stringify({ type: 'kill', sessionId: id })); } catch { }
  await sleep(1200);
  try { wsMain.close(); } catch { }
})().catch((e) => ok(false, 'the real-rung leg threw', e && (e.stack || e.message)));

done();
